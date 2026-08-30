import { ref, watch } from 'vue'

// Lê em voz alta a resposta do agente assim que ela termina, usando Piper TTS
// (@mintplex-labs/piper-tts-web) — roda inteiramente no renderer via ONNX/WASM,
// sem custo de API e sem precisar de um binário nativo empacotado (diferente
// do whisper.cpp usado pro ditado): o modelo de voz é baixado sob demanda de
// Hugging Face na primeira síntese e fica em cache no OPFS do próprio app.
//
// A inferência em si roda dentro de um Worker dedicado (src/workers/ttsWorker.js)
// em vez de na thread principal — mesmo com numThreads: 1, ela é pesada o
// bastante pra travar a UI inteira por vários segundos a cada resposta
// (reproduzido na prática: canvas e terminal congelavam durante a síntese).
// Um Worker paga esse custo sem bloquear o resto do app.
//
// O catálogo de vozes do Piper só tem duas em português brasileiro, e ambas
// são masculinas (não existe voz feminina pt_BR nesse conjunto de modelos) —
// por isso as opções abaixo são só essas duas, sem seletor de gênero.
export const AVAILABLE_VOICES = [
  { id: 'pt_BR-faber-medium', label: 'Faber (qualidade melhor, ~63MB)' },
  { id: 'pt_BR-edresson-low', label: 'Edresson (mais leve, ~20MB)' }
]

const STORAGE_KEY = 'dux-tts-voice-id'
const storedVoiceId = localStorage.getItem(STORAGE_KEY)
const initialVoiceId = AVAILABLE_VOICES.some((v) => v.id === storedVoiceId)
  ? storedVoiceId
  : AVAILABLE_VOICES[0].id

export const selectedVoiceId = ref(initialVoiceId)
watch(selectedVoiceId, (id) => localStorage.setItem(STORAGE_KEY, id))

export const isSpeaking = ref(false)
export const isDownloadingVoice = ref(false)
// Desativado por padrão: mesmo isolada num Worker, a inferência é pesada e
// múltiplos terminais reabrindo ao mesmo tempo podem enfileirar várias
// sínteses seguidas — até isso ficar mais leve, é opt-in nas configurações.
export const ttsEnabled = ref(false)
export const lastError = ref(null)

// piper-tts-web@1.0.5 tem um bug conhecido: se o WASM interno de fonemização
// falhar ao inicializar, ele chama printErr() de dentro de um callback do
// módulo Emscripten — fora da stack da Promise que o envolve — então o
// "throw" ali dentro nunca vira uma rejeição de verdade, e a Promise de
// predict() fica pendurada pra sempre (nenhum erro chega no catch). Um
// timeout aqui é a única forma de não deixar speak() travado silenciosamente
// pra sempre quando isso acontece.
const PREDICT_TIMEOUT_MS = 25_000

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} não respondeu em ${ms}ms`)), ms))
  ])
}

let ttsModule = null
async function getTtsModule() {
  if (!ttsModule) ttsModule = await import('@mintplex-labs/piper-tts-web')
  return ttsModule
}

let worker = null
let nextRequestId = 0
const pendingRequests = new Map()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('../workers/ttsWorker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (event) => {
    const { id, ok, wavBlob, error } = event.data
    const pending = pendingRequests.get(id)
    if (!pending) return
    pendingRequests.delete(id)
    if (ok) pending.resolve(wavBlob)
    else pending.reject(new Error(error))
  }
  worker.onerror = (event) => {
    for (const pending of pendingRequests.values()) pending.reject(new Error(event.message || 'ttsWorker error'))
    pendingRequests.clear()
  }
  return worker
}

function predictInWorker(voiceId, text) {
  const id = ++nextRequestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    getWorker().postMessage({ id, voiceId, text })
  })
}

let currentAudio = null

// CSI genérico: ESC [ seguido de bytes de parâmetro (0–9 ; : < = > ?), bytes
// intermediários (espaço a /) e um byte final (@ a ~). Cobre tanto sequências
// simples (cor, negrito) quanto de modo privado como "\x1b[?25l" (esconder
// cursor) e "\x1b[?25h" (mostrar cursor) — muito usadas pelo Claude Code CLI
// pra animar o spinner — que um regex só com dígitos/ponto-e-vírgula antes da
// letra final deixava passar, sobrando como "25l"/"25h" literal na fala.
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;:<=>?]*[ -/]*[@-~]/g, '')
}

// O buffer bruto do PTY carrega toda a UI de caixas do Claude Code (bordas
// desenhadas com caracteres de box-drawing, indicador "✳ Pensando...", o
// prompt "> " de volta, markdown cru) — nada disso deve ser lido em voz alta.
// Esta limpeza é heurística, não um parser real da UI: cobre o caso comum de
// uma resposta em prosa, sem tentar acertar tabelas/diffs/blocos de código.
const BOX_DRAWING_RE = /[│─┌┐└┘├┤┬┴┼╭╮╰╯━┃┏┓┗┛●]/g
const MARKDOWN_SYMBOLS_RE = /[*_`#>~]/g
// Linhas de status/chrome da UI do Claude Code CLI, não conteúdo da resposta:
// "✳ Brewed for 1s · done 9:33 PM" (linha de progresso enquanto processa),
// "auto mode on (shift+tab to cycle) · for ..." (rodapé fixo do prompt), e um
// prompt vazio "> " sozinho na linha. Todas continuam aparecendo mesmo depois
// da resposta terminar, então sobrevivem até o corte por silêncio junto com o
// texto real — sem filtrar isso, o TTS lia a UI inteira, não só a resposta.
const SPINNER_LINE_RE = /^\s*[✳✶✻✽*]\s.*$/gm
const STATUS_LINE_RE = /^\s*[✳✶✻✽*]?\s*\S+\s+for\s+\d+[a-z]*\s*[·•]\s*done\s+\d{1,2}:\d{2}\s*[AP]M\s*$/gim
const FOOTER_LINE_RE = /^\s*(auto mode|plan mode|bypass permissions)\b.*$/gim
const EMPTY_PROMPT_LINE_RE = /^\s*[>❯]\s*$/gm

function cleanTextForSpeech(rawChunk) {
  let text = stripAnsi(rawChunk)
  text = text.replace(SPINNER_LINE_RE, '')
  text = text.replace(STATUS_LINE_RE, '')
  text = text.replace(FOOTER_LINE_RE, '')
  text = text.replace(EMPTY_PROMPT_LINE_RE, '')
  text = text.replace(BOX_DRAWING_RE, ' ')
  text = text.replace(MARKDOWN_SYMBOLS_RE, '')
  text = text.replace(/[ \t]+/g, ' ')
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
  return text.trim()
}

// Blocos de código/tabelas/diffs soam sem sentido em voz alta e costumam ter
// muita pontuação/símbolos por caractere de texto real — se o bloco limpo
// ainda tem uma proporção alta disso, é sinal de que não é prosa e é melhor
// pular o TTS a tentar ler tudo errado.
function looksLikeProse(text) {
  if (!text || text.length < 2) return false
  const symbolCount = (text.match(/[{}[\]<>|=;:/\\]/g) || []).length
  return symbolCount / text.length < 0.12
}

// forceSpeak pula o gate de ttsEnabled e a heurística "parece prosa" — usado
// pelo botão "Testar voz" das configurações, que fala uma frase literal fixa
// e precisa funcionar mesmo com a leitura automática desativada (é assim que
// dá pra ouvir a voz antes de decidir se quer ativar).
//
// A TtsSession do Piper (dentro do Worker) é um singleton por Worker — com
// vários terminais abertos ao mesmo tempo (comum: workspace salvo reabrindo
// várias sessões), cada um dispara sua própria detecção de silêncio e podia
// chamar speak() de forma concorrente. Esta fila serializa: só uma síntese de
// cada vez, as demais esperam a atual terminar antes de começar.
let speakQueue = Promise.resolve()

export function speak(rawChunk, options = {}) {
  speakQueue = speakQueue.then(() => speakOne(rawChunk, options)).catch(() => {})
  return speakQueue
}

async function speakOne(rawChunk, { forceSpeak = false } = {}) {
  if (!ttsEnabled.value && !forceSpeak) return

  const text = forceSpeak ? rawChunk : cleanTextForSpeech(rawChunk)
  if (!forceSpeak && !looksLikeProse(text)) {
    console.debug('[tts] chunk descartado (não parece prosa)', { cleanedText: text.slice(0, 300) })
    return
  }
  console.debug('[tts] falando:', text.slice(0, 300))
  lastError.value = null

  try {
    const voiceId = selectedVoiceId.value
    const tts = await getTtsModule()
    const alreadyStored = (await tts.stored()).includes(voiceId)
    isDownloadingVoice.value = !alreadyStored

    const wavBlob = await withTimeout(predictInWorker(voiceId, text), PREDICT_TIMEOUT_MS, 'Piper predict()')
    isDownloadingVoice.value = false

    currentAudio?.pause()
    currentAudio = new Audio(URL.createObjectURL(wavBlob))
    isSpeaking.value = true
    currentAudio.onended = () => {
      isSpeaking.value = false
    }
    currentAudio.onerror = () => {
      isSpeaking.value = false
      lastError.value = 'Falha ao reproduzir áudio'
    }
    await currentAudio.play()
  } catch (err) {
    isDownloadingVoice.value = false
    isSpeaking.value = false
    lastError.value = err.message
    console.error('[tts] speech synthesis failed', err)
  }
}

export function stopSpeaking() {
  currentAudio?.pause()
  isSpeaking.value = false
}

export function toggleTts() {
  ttsEnabled.value = !ttsEnabled.value
  if (!ttsEnabled.value) stopSpeaking()
}
