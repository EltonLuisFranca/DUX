import { computed, ref, watch } from 'vue'
import { workspaces, activeWorkspaceId } from './flowStore'
import {
  pendingVoiceInput,
  consumePendingVoiceInput,
  startRecording,
  cancelRecording,
  waveLevels,
  isRecording
} from './voiceStore'
import { speak, isSpeaking, stopSpeaking, getCurrentAudioTime, getCurrentAudioDuration } from './ttsStore'
import { streamChat } from '../lib/ollamaClient'
import { DEFAULT_DUXI_SYSTEM_PROMPT } from '../lib/duxiPrompt'
import { DUXI_TOOLS, executeDuxiTool } from '../lib/duxiTools'
import { platform } from '../lib/platform'

// limite de idas-e-voltas modelo<->tool numa mesma pergunta — como em
// OllamaNode.vue, evita loop infinito se o modelo insistir em chamar tools
// sem nunca fechar com uma resposta de texto final
const MAX_TOOL_ITERATIONS = 4

// Duxi: assistente de voz único e global, que vive na barra do topo (ver
// DuxiBot.vue). Era Merlin (node do canvas, config em node.data), depois
// Themis (ainda singleton, mas config em localStorage) — a barra existe uma
// vez por workspace, então a lógica da conversa mora aqui (singleton), senão
// cada workspace teria uma Duxi própria disputando o mesmo microfone. O
// componente só desenha o rosto e o texto a partir deste estado.

const STORAGE_KEY = 'dux-duxi'
const LEGACY_STORAGE_KEY = 'dux-themis'
// só as últimas N mensagens (user+assistant) vão pro modelo — conversa de voz
// é troca curta, sem isso o prompt cresce sem limite a cada pergunta.
const MAX_HISTORY = 16
const MAX_LOG = 200
// id fixo usado pra rotear a transcrição do voiceStore (que foi feito pra
// terminais e identifica o destino por id) de volta pra cá
const DUXI_VOICE_ID = 'duxi'
const MERLIN_NODE_TYPE = 'merlin'

const DEFAULT_CONFIG = {
  host: 'http://localhost:11434',
  token: '',
  model: '',
  api: undefined,
  systemPrompt: '',
  voiceOutputEnabled: true,
  lipSyncEnabled: true,
  wakeWordEnabled: platform.duxiDefaults.wakeWordEnabled,
  messages: [],
  // histórico só pra exibir (ícone de histórico na barra) — bem mais longo
  // que `messages`, que é o contexto mandado pro modelo (MAX_HISTORY)
  log: []
}

// config antiga pode estar sob a chave 'dux-themis' (nome anterior) — lida só
// na primeira carga; daí em diante a gravação já vai só pra chave nova.
function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// config ainda mais antiga vinha de um node Merlin no canvas — aproveita a do
// primeiro que existir, uma vez só (depois disso a config salva aqui é a verdade)
function configFromLegacyNode() {
  for (const ws of workspaces.value) {
    const node = ws.nodes.find((n) => n.type === MERLIN_NODE_TYPE)
    if (!node) continue
    const d = node.data || {}
    return {
      host: d.host,
      token: d.token,
      model: d.model,
      api: d.api,
      systemPrompt: d.systemPrompt,
      voiceOutputEnabled: d.voiceOutputEnabled,
      lipSyncEnabled: d.lipSyncEnabled,
      messages: d.messages
    }
  }
  return null
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined))
}

export const duxiConfig = ref({
  ...DEFAULT_CONFIG,
  ...stripUndefined(loadStoredConfig() ?? configFromLegacyNode())
})

// config salva antes do histórico existir: começa ele com o contexto que já
// havia, pra não abrir vazio
if (!duxiConfig.value.log?.length && duxiConfig.value.messages?.length) {
  duxiConfig.value.log = duxiConfig.value.messages.filter((m) => m.role === 'user' || m.role === 'assistant')
}

watch(
  duxiConfig,
  (cfg) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  },
  { deep: true, immediate: true }
)

// a gravação acima (immediate) já populou a chave nova a partir da antiga,
// se foi o caso — pode remover a antiga pra não deixar duas cópias divergindo
localStorage.removeItem(LEGACY_STORAGE_KEY)

export function updateDuxiConfig(patch) {
  Object.assign(duxiConfig.value, patch)
}

export function clearDuxiConversation() {
  duxiConfig.value.messages = []
  duxiConfig.value.log = []
  userText.value = ''
  replyText.value = ''
  errorText.value = ''
}

// Duxi não é mais um tipo de node: tira qualquer node 'merlin' (e edges
// ligadas a ele) de todos os workspaces. Roda no boot e de novo quando a
// quantidade de nodes muda — cobre workspaces que chegam depois pela sync
// remota ainda com o node antigo salvo.
function purgeLegacyMerlinNodes() {
  for (const ws of workspaces.value) {
    const ids = new Set(ws.nodes.filter((n) => n.type === MERLIN_NODE_TYPE).map((n) => n.id))
    if (!ids.size) continue
    ws.nodes = ws.nodes.filter((n) => !ids.has(n.id))
    ws.edges = (ws.edges || []).filter((e) => !ids.has(e.source) && !ids.has(e.target))
  }
}
purgeLegacyMerlinNodes()
watch(() => workspaces.value.map((ws) => ws.nodes.length).join(','), purgeLegacyMerlinNodes)

// --- estado da conversa ------------------------------------------------------

// off: mic desligado. passive: ouvindo, esperando a primeira fala (sem wake
// word — qualquer fala já vira o início do pedido). active: capturando o
// pedido. thinking: esperando o modelo. speaking: tocando a resposta (mic
// desligado nesse meio tempo, pra não se ouvir).
export const duxiState = ref('off')
export const userText = ref('') // o que ela entendeu que o usuário falou
export const replyText = ref('') // resposta dela (streaming)
export const errorText = ref('')
// histórico aberto: a área de texto da barra mostra a conversa inteira
// (duxiConfig.log), com scroll, no lugar da última troca
export const duxiHistoryOpen = ref(false)

export function toggleDuxiHistory() {
  duxiHistoryOpen.value = !duxiHistoryOpen.value
}

// digitação: campo de texto na barra (ícone de teclado) pra mandar pedidos
// sem microfone — abre sozinho quando o mic falha ao ativar
export const duxiTypingOpen = ref(false)
export const duxiMicUnavailable = ref(false)

export function toggleDuxiTyping() {
  duxiTypingOpen.value = !duxiTypingOpen.value
}

let commandBuffer = ''
let abortController = null
// usuário mandou parar a resposta (botão ■ do campo de digitação)
let stopRequested = false

// Detecta que o usuário começou a falar direto pelo nível do microfone, sem
// esperar a transcrição (que chega 1-2s depois, ao fim do trecho) — é isso
// que deixa o rosto reagir (degradê laranja, barra crescendo) no instante
// em que a fala começa. O voiceStore já zera os níveis abaixo do limiar de
// silêncio do VAD, então qualquer valor > 0 nos blocos recentes é voz.
// Segura um pouco depois do último som pra não piscar entre palavras.
const VOICE_HOLD_MS = 1200
export const hearingVoice = ref(false)
let voiceHoldTimer = null

watch(waveLevels, (levels) => {
  const listening = duxiState.value === 'passive' || duxiState.value === 'active'
  if (!listening) return
  if (!levels.slice(-6).some((l) => l > 0.05)) return
  if (!hearingVoice.value && duxiState.value === 'passive') {
    // começou um pedido novo: some a troca anterior da barra (e o histórico,
    // pra mostrar o pedido que está chegando)
    duxiHistoryOpen.value = false
    userText.value = ''
    replyText.value = ''
    errorText.value = ''
  }
  hearingVoice.value = true
  clearTimeout(voiceHoldTimer)
  voiceHoldTimer = setTimeout(() => {
    hearingVoice.value = false
  }, VOICE_HOLD_MS)
})

watch(duxiState, (s) => {
  if (s !== 'passive' && s !== 'active') {
    clearTimeout(voiceHoldTimer)
    hearingVoice.value = false
  }
  if (s === 'off') {
    duxiEngaged.value = false
    duxiHistoryOpen.value = false
    duxiTypingOpen.value = false
  }
  else if (s !== 'passive') duxiEngaged.value = true
})

// "Engajada": foi ativada (clique ou "Duxi") ou captou fala. A barra cresce e
// fica grande até o usuário desativar a Duxi no clique — parar de falar,
// ela pensar ou responder não encolhe de volta.
export const duxiEngaged = ref(false)
watch(hearingVoice, (hearing) => {
  if (hearing) duxiEngaged.value = true
})

// Escolha pendente (ambiguidade de tool): quando uma tool como read_note
// encontra mais de um candidato (ex: 2 notas no workspace) sem um nome que
// desempate, o loop de tool-calling em submitQuery pausa aqui e mostra botões
// (ver DuxiBot.vue, .line-options) em vez de deixar o modelo "perguntar" em
// voz — o usuário clica, chooseDuxiOption resolve a Promise que o loop está
// esperando, e a ação roda de verdade com a escolha já feita.
export const pendingChoice = ref(null) // { options: [{id,label}] } | null
let resolveChoice = null

function askDuxiChoice(candidates) {
  return new Promise((resolve) => {
    resolveChoice = resolve
    pendingChoice.value = { options: candidates.map((c) => ({ id: c.id, label: c.label })) }
  })
}

export function chooseDuxiOption(id) {
  if (!pendingChoice.value) return
  pendingChoice.value = null
  resolveChoice?.(id)
  resolveChoice = null
}

// Layout da barra do topo:
// - compact: só o robô, pequeno (desligada)
// - focus: engajada, ainda sem texto — barra grande, robô grande no meio
// - text: tem texto da troca — mesma barra grande, robô no canto e o texto ao
//   lado (ou, desligada, só a mensagem de erro ao lado do robô pequeno)
export const duxiPhase = computed(() => {
  if ((duxiHistoryOpen.value || duxiTypingOpen.value) && duxiEngaged.value) return 'text'
  const hasText = Boolean(userText.value || replyText.value || errorText.value || pendingChoice.value)
  if (hasText && (duxiEngaged.value || errorText.value)) return 'text'
  if (duxiEngaged.value) return 'focus'
  return 'compact'
})

export async function toggleDuxiMic() {
  if (duxiState.value === 'off') {
    await enableListening()
  } else {
    disableListening()
  }
}

async function enableListening() {
  errorText.value = ''
  userText.value = ''
  replyText.value = ''
  commandBuffer = ''
  await sleepListenPromise
  try {
    // startRecording ignora a chamada em silêncio se o mic já estiver
    // gravando pra outro destino (ex: gravação anterior que não foi encerrada)
    // — aí a Duxi ficava "ouvindo" mas a transcrição ia pra outro lugar
    if (isRecording.value) cancelRecording()
    await startRecording(DUXI_VOICE_ID)
    duxiMicUnavailable.value = false
  } catch (err) {
    // sem mic a Duxi ainda funciona digitando: abre a barra já no campo de texto
    console.error('[duxi] falha ao acessar microfone', err)
    duxiMicUnavailable.value = true
    duxiTypingOpen.value = true
  }
  duxiState.value = 'passive'
  duxiGreetAt.value = performance.now()
  duxiEngaged.value = true // abre a barra grande já no clique, sem esperar a 1ª fala
}

// interrompe a resposta em andamento: corta o streaming do modelo se ainda
// estiver pensando, ou a fala se já estiver respondendo
export function stopDuxiReply() {
  if (duxiState.value !== 'thinking' && duxiState.value !== 'speaking') return
  stopRequested = true
  abortController?.abort()
  stopSpeaking()
}

// pedido digitado: mesmo caminho de um pedido falado (submitQuery), só que
// sem passar pelo microfone
export function submitDuxiText(text) {
  const query = text.trim()
  if (!query) return false
  if (duxiState.value === 'thinking' || duxiState.value === 'speaking') return false
  commandBuffer = ''
  // mic desliga antes de chamar o modelo, como no pedido falado — senão a
  // própria voz da Duxi respondendo seria captada
  cancelRecording()
  duxiHistoryOpen.value = false
  submitQuery(query)
  return true
}

function disableListening() {
  abortController?.abort()
  abortController = null
  stopSpeaking()
  cancelRecording()
  duxiState.value = 'off'
  commandBuffer = ''
  startSleepListening()
}

// --- ativar/desativar pela voz ---------------------------------------------
// Desligada (state 'off'), se wakeWordEnabled, o mic continua aberto pra
// Duxi em modo "dormindo": cada trecho transcrito só é olhado em busca do
// nome dela — nada vai pro modelo nem aparece na barra. Falar "Duxi" acorda
// (se vier um pedido junto, "Duxi, cria uma tarefa...", ele já vale); falar
// "descansar Duxi" com ela ativa volta a dormir.
//
// O whisper não conhece a palavra e escreve do jeito que ouve — Duxi, Dúxi,
// Ducsi, Duchi, Dushi, Duki, Duque... — então a busca é por som, não exata.
const WAKE_WORD_RE = /\bd[uo](?:x|cs|ks|ch|sh|k|qu)[iey]\b/
const SLEEP_WORD_RE = /\bdescans\w*/

// minúsculo e sem acento, caractere a caractere — mantém o mesmo tamanho do
// texto original, então um índice achado aqui vale pra cortar o original
function normalizeSpeech(text) {
  return text
    .split('')
    .map((c) => c.normalize('NFD')[0].toLowerCase()[0])
    .join('')
}

function isSleepCommand(text) {
  const norm = normalizeSpeech(text)
  if (!SLEEP_WORD_RE.test(norm)) return false
  // "descansar Duxi" / "pode descansar" — curto, pra não desligar no meio de
  // um pedido que só menciona a palavra ("anota que preciso descansar mais")
  const words = norm.split(/\s+/).filter(Boolean)
  return WAKE_WORD_RE.test(norm) || words.length <= 3
}

// startRecording é async e só marca isRecording no fim — guardar a promise
// evita abrir o mic duas vezes (ex: clique pra ativar enquanto ele ainda
// estava abrindo pra dormir)
let sleepListenPromise = null

function startSleepListening() {
  if (!duxiConfig.value.wakeWordEnabled || duxiState.value !== 'off') return
  if (isRecording.value || sleepListenPromise) return
  sleepListenPromise = startRecording(DUXI_VOICE_ID)
    .catch((err) => console.error('[duxi] falha ao abrir microfone pra ouvir o nome', err))
    .finally(() => {
      sleepListenPromise = null
      // desativou a opção enquanto o mic abria
      if (duxiState.value === 'off' && !duxiConfig.value.wakeWordEnabled) cancelRecording()
    })
}

function stopSleepListening() {
  if (duxiState.value === 'off') cancelRecording()
}

watch(
  () => duxiConfig.value.wakeWordEnabled,
  (enabled) => (enabled ? startSleepListening() : stopSleepListening())
)
startSleepListening()

function wakeUp(text) {
  errorText.value = ''
  userText.value = ''
  replyText.value = ''
  commandBuffer = ''
  duxiState.value = 'passive'
  duxiGreetAt.value = performance.now()
  duxiEngaged.value = true // barra cresce: sinal visual de que ouviu o nome
  // o que veio depois do nome no mesmo trecho já é o começo do pedido
  const match = normalizeSpeech(text).match(WAKE_WORD_RE)
  const rest = text
    .slice(match.index + match[0].length)
    .replace(/^[\s,.!?:;-]+/, '')
  if (/[\p{L}\p{N}]/u.test(rest)) handleVoiceSignal({ text: rest })
}

function handleVoiceSignal(pending) {
  if (duxiState.value === 'off') {
    if (pending.text && WAKE_WORD_RE.test(normalizeSpeech(pending.text))) wakeUp(pending.text)
    return
  }

  if (pending.text && (duxiState.value === 'passive' || duxiState.value === 'active') && isSleepCommand(pending.text)) {
    disableListening()
    return
  }

  if (duxiState.value === 'passive') {
    if (pending.text) {
      duxiState.value = 'active'
      commandBuffer = pending.text
      userText.value = pending.text.trim()
      replyText.value = ''
      errorText.value = ''
    }
    return
  }

  if (duxiState.value === 'active') {
    if (pending.text) {
      commandBuffer += pending.text
      userText.value = commandBuffer.trim()
    }
    if (pending.sendEnter) {
      const query = commandBuffer.trim()
      commandBuffer = ''
      // mic desliga já aqui, antes de chamar o modelo — evita captar a
      // própria voz da Duxi quando a resposta for falada
      cancelRecording()
      if (query) {
        submitQuery(query)
      } else {
        // pausa longa sem ter dito nada de fato — volta a ouvir em standby
        duxiState.value = 'passive'
        startRecording(DUXI_VOICE_ID).catch(() => {})
      }
    }
  }
}

// mensagens guardadas no formato normalizado ({ role:'assistant', tool_calls:
// [{id,name,arguments}] } / { role:'tool', name, content, toolCallId }, ver
// duxiTools.js) -> formato nativo que cada backend espera no request. Cópia
// enxuta (sem o caso de imagens, a Duxi só fala) de toApiMessages em
// OllamaNode.vue:154-191.
function toApiMessages(messages, api) {
  return messages.map((msg) => {
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const tool_calls =
        api === 'openwebui'
          ? msg.tool_calls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.arguments || {}) }
            }))
          : msg.tool_calls.map((c) => ({ function: { name: c.name, arguments: c.arguments || {} } }))
      return { role: 'assistant', content: msg.content, tool_calls }
    }
    if (msg.role === 'tool') {
      return api === 'openwebui'
        ? { role: 'tool', tool_call_id: msg.toolCallId, content: msg.content }
        : { role: 'tool', tool_name: msg.name, content: msg.content }
    }
    return msg
  })
}

// O prompt já proíbe emoji e markdown, mas modelo pequeno às vezes manda
// mesmo assim (principalmente resumindo resultado de web_search: lista com
// "- **Título**" e links) — e o TTS lê "asterisco", URL letra por letra, o
// nome do emoji. Limpa na marra, e o mesmo texto vai pra bolha e pra fala.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200d\ufe0f\u20e3]/gu

function cleanReply(text) {
  return (
    text
      .replace(EMOJI, '')
      .replace(/```[a-z]*\n?/gi, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [texto](url) -> texto
      .replace(/https?:\/\/\S+|www\.\S+/g, '')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, '') // marcador de item de lista
      .replace(/[*`~#]/g, '')
      .replace(/(^|\s)_+|_+(?=\s|[.,!?:;]|$)/g, '$1')
      // item de lista que veio emendado na mesma linha ("... links. - Chosic lista ...")
      .replace(/([.!?:;])\s+[-–—•]\s+/g, '$1 ')
      // cada linha vira uma frase (a bolha e a fala juntam tudo num parágrafo)
      .replace(/([^\s.!?:;,])[ \t]*\n+/g, '$1. ')
      .replace(/\s*\n+\s*/g, ' ')
      .replace(/\(\s*\)/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([.,!?:;])/g, '$1')
      .trim()
  )
}

// Com a voz ligada, a resposta só aparece quando o áudio começa e vai sendo
// revelada no ritmo dele (proporcional ao tempo tocado, cortando em fim de
// palavra) — mostrar no streaming fazia o texto chegar segundos antes da
// fala, já que a síntese só começa com a resposta completa.
function revealWithSpeech(text) {
  return new Promise((resolve) => {
    const tick = () => {
      if (!isSpeaking.value || duxiState.value !== 'speaking') {
        resolve()
        return
      }
      const duration = getCurrentAudioDuration()
      const ratio = duration > 0 ? Math.min(1, getCurrentAudioTime() / duration) : 0
      // um pouco à frente do áudio: ler acompanhando é mais natural que
      // ver a palavra só depois de ouvi-la
      const cut = Math.min(text.length, Math.ceil(text.length * ratio) + 12)
      const nextSpace = text.indexOf(' ', cut)
      replyText.value = nextSpace === -1 ? text : text.slice(0, nextSpace)
      requestAnimationFrame(tick)
    }
    tick()
  })
}

async function submitQuery(query) {
  duxiState.value = 'thinking'
  errorText.value = ''
  userText.value = query
  replyText.value = ''

  const cfg = duxiConfig.value
  const systemPrompt = cfg.systemPrompt || DEFAULT_DUXI_SYSTEM_PROMPT
  // turno persistido (localStorage) — nunca inclui tool_calls/tool: essas só
  // existem na variável local apiMessages abaixo, descartada ao fim da
  // função. Evita de vez o corte de MAX_HISTORY cair no meio de uma
  // sequência assistant-com-tool_calls -> tool e mandar pro Ollama uma
  // mensagem 'tool' órfã (sem o assistant que a precede).
  const baseHistory = [...(cfg.messages || []), { role: 'user', content: query }]
  cfg.messages = baseHistory.slice(-MAX_HISTORY)

  // se o usuário trocar de workspace enquanto a Duxi está pensando, aborta em
  // vez de seguir operando tools no workspace errado silenciosamente
  const startedWorkspaceId = activeWorkspaceId.value

  let apiMessages = [{ role: 'system', content: systemPrompt }, ...baseHistory]
  let toolsUnsupported = Boolean(cfg.toolsUnsupported)
  let fullText = ''
  const speakReply = cfg.voiceOutputEnabled ?? true
  abortController = new AbortController()
  stopRequested = false

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      if (activeWorkspaceId.value !== startedWorkspaceId) {
        errorText.value = 'Você trocou de workspace enquanto eu pensava — tenta de novo.'
        fullText = ''
        break
      }

      fullText = ''
      let toolCalls = null
      const result = await streamChat({
        host: (cfg.host || DEFAULT_CONFIG.host).replace(/\/+$/, ''),
        token: cfg.token,
        model: cfg.model,
        api: cfg.api,
        messages: toApiMessages(apiMessages, cfg.api),
        tools: toolsUnsupported ? undefined : DUXI_TOOLS,
        signal: abortController.signal,
        onToken: (chunk) => {
          fullText += chunk
          if (!speakReply) replyText.value = cleanReply(fullText)
        },
        onToolCalls: (calls) => {
          toolCalls = calls
        }
      })

      if (result.toolsUnsupported) {
        toolsUnsupported = true
        cfg.toolsUnsupported = true
        console.warn('[duxi] backend/modelo não suporta tool calling — Duxi não vai ver os nodes nesta conversa')
      }

      if (!toolCalls?.length) break

      // zera o texto parcial que porventura veio antes da decisão de chamar
      // uma tool (alguns modelos emitem "Deixa eu ver..." antes do
      // tool_calls) — senão fica piscando um texto incompleto na bolha
      replyText.value = ''
      apiMessages = [...apiMessages, { role: 'assistant', content: fullText, tool_calls: toolCalls }]

      for (const call of toolCalls) {
        let retryArgs = call.arguments || {}
        reactToolStart(call.name)
        let outcome = await executeDuxiTool(call.name, retryArgs)
        // `while` (não só um retry): uma tool pode ter mais de um parâmetro
        // ambíguo (ex: board E agente) — cada rodada resolve um, a próxima
        // chamada pode acusar ambiguidade de novo pro parâmetro seguinte
        while (outcome.type === 'ambiguous') {
          const choiceId = await askDuxiChoice(outcome.candidates)
          retryArgs = { ...retryArgs, [outcome.retryKey]: choiceId }
          outcome = await executeDuxiTool(call.name, retryArgs)
        }
        reactToolEnd(call.name, outcome)
        apiMessages = [...apiMessages, { role: 'tool', name: call.name, content: outcome.content, toolCallId: call.id }]
      }

      if (iteration === MAX_TOOL_ITERATIONS - 1) {
        errorText.value = 'Tentei algumas ações mas não consegui terminar a resposta.'
      }
    }

    fullText = cleanReply(fullText)
    cfg.messages = [...baseHistory, { role: 'assistant', content: fullText }].slice(-MAX_HISTORY)
    if (fullText) {
      cfg.log = [...(cfg.log || []), { role: 'user', content: query }, { role: 'assistant', content: fullText }].slice(-MAX_LOG)
    }
    if (!speakReply) replyText.value = fullText
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[duxi] falha ao conversar com o modelo', err)
      errorText.value = cfg.model
        ? `Erro ao conectar com ${cfg.host}. O Ollama está rodando?`
        : 'Nenhum modelo escolhido — clique com o botão direito na Duxi para configurar.'
    }
  } finally {
    abortController = null
  }

  if (duxiState.value === 'off') return // desativou enquanto pensava

  // parado no meio do streaming: fica o que já tinha chegado, sem falar
  if (stopRequested && fullText && !replyText.value) replyText.value = `${cleanReply(fullText)} …`

  if (!errorText.value && fullText && speakReply && !stopRequested) {
    duxiState.value = 'speaking'
    await speak(fullText, { forceSpeak: true })
    // parou enquanto a voz ainda era sintetizada: o áudio começou depois do
    // stopSpeaking() e precisa ser cortado agora
    if (stopRequested) stopSpeaking()
    await revealWithSpeech(fullText)
    // fim do áudio, falha no TTS ou fala interrompida: texto inteiro na tela
    if (duxiState.value !== 'off') replyText.value = fullText
    await waitForSpeechEnd()
  }

  if (duxiState.value === 'off') return // desativou enquanto falava
  duxiState.value = 'passive'
  if (!duxiMicUnavailable.value) startRecording(DUXI_VOICE_ID).catch(() => {})
}

function waitForSpeechEnd() {
  if (!isSpeaking.value) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = watch(isSpeaking, (speaking) => {
      if (!speaking) {
        stop()
        resolve()
      }
    })
  })
}

// flush 'sync': o voiceStore às vezes atribui o texto do último trecho e o
// sinal de Enter um logo atrás do outro, no mesmo tick — com o flush padrão
// ('pre') o watcher só via o valor final (o Enter), o texto se perdia e o
// pedido era descartado como vazio. Síncrono, cada atribuição chega aqui.
watch(
  pendingVoiceInput,
  (pending) => {
    if (!pending || pending.terminalId !== DUXI_VOICE_ID) return
    console.log('[duxi] voz recebida', { state: duxiState.value, text: pending.text, enter: !!pending.sendEnter })
    handleVoiceSignal(pending)
    consumePendingVoiceInput()
  },
  { flush: 'sync' }
)

// erro mostrado na barra (falha do modelo, mic, etc.) = cara de erro
watch(errorText, (text) => {
  if (text) react('error')
})

// cartão concluído por um agente (taskState vira 'done') em qualquer board de
// qualquer workspace = comemoração. A primeira leitura só registra o que já
// estava concluído, pra não comemorar tudo de novo ao abrir o app.
function doneCardIds() {
  const ids = []
  for (const ws of workspaces.value) {
    for (const node of ws.nodes) {
      if (node.type !== 'duxban') continue
      for (const col of node.data?.columns || []) {
        for (const card of col.cards || []) if (card.taskState === 'done') ids.push(card.id)
      }
    }
  }
  return ids
}
let knownDoneCards = null
watch(
  () => doneCardIds().join(','),
  (joined) => {
    const ids = joined ? joined.split(',') : []
    if (knownDoneCards && ids.some((id) => !knownDoneCards.has(id))) react('celebrate')
    knownDoneCards = new Set(ids)
  },
  { immediate: true }
)

// --- "batidas" na barra -------------------------------------------------------
// Cada clique no cinza da barra aberta dá uma batida no robô (tranco + olhos
// fechando, ver DuxiBot). Na 3ª batida seguida ele fica tonto por 4s
// (olhos em espiral girando, efeitos vermelhos). Cliques espaçados demais
// (> HIT_STREAK_MS) recomeçam a contagem. Timestamps em performance.now().
const HIT_STREAK_MS = 3000
const DIZZY_MS = 4000
// cada batida a mais com ela já tonta soma impacto (0..1): o rosto vai
// ficando mais vermelho e o tranco mais forte — ver rageAmount em DuxiBot
const RAGE_PER_HIT = 0.2
export const duxiLastHitAt = ref(0)
// momento em que foi ativada (clique ou "Duxi") — dispara o tchauzinho com as
// mãos em DuxiBot (performance.now(), 0 = nunca)
export const duxiGreetAt = ref(0)

// --- reações ao que acontece no app -------------------------------------------
// DuxiBot desenha a cara/gesto de cada uma enquanto `now < until`:
// - celebrate: um agente concluiu um cartão do DuxBan (olhos de estrela,
//   pulinho, confete)
// - error: o modelo ou uma tool falhou (olhos em X, gota de suor)
// - search: web_search/fetch_url rodando (lupa passando na frente dos olhos)
// - write: escrevendo nota / mexendo em cartão (mãozinha com lápis)
// A pergunta ambígua (cabeça inclinada, "?") não passa por aqui: DuxiBot lê
// direto o pendingChoice.
export const duxiReaction = ref(null) // { type, at, until } — performance.now()
const REACTION_MS = { celebrate: 2600, error: 2600, search: 1600, write: 1800 }
const TOOL_REACTION = {
  web_search: 'search',
  fetch_url: 'search',
  write_note: 'write',
  create_duxban_card: 'write',
  move_duxban_card: 'write',
  assign_duxban_card: 'write',
  add_duxban_comment: 'write'
}

function react(type, ms = REACTION_MS[type]) {
  const now = performance.now()
  duxiReaction.value = { type, at: now, until: now + ms }
}

// tool começou: a reação fica até ela terminar (until infinito); ao terminar,
// ainda dura o mínimo da reação, pra uma tool instantânea não só piscar
function reactToolStart(name) {
  const type = TOOL_REACTION[name]
  if (type) react(type, Infinity)
}

function reactToolEnd(name, outcome) {
  const r = duxiReaction.value
  if (outcome?.content?.startsWith?.('Erro')) {
    react('error')
    return
  }
  if (!r || r.type !== TOOL_REACTION[name]) return
  const now = performance.now()
  duxiReaction.value = { ...r, until: Math.max(r.at + REACTION_MS[r.type], now + 300) }
}
export const duxiDizzyUntil = ref(0)
export const duxiRage = ref(0)
let hitCount = 0

export function hitDuxi() {
  const now = performance.now()
  if (now - duxiLastHitAt.value > HIT_STREAK_MS) hitCount = 0
  duxiLastHitAt.value = now
  if (now < duxiDizzyUntil.value) {
    duxiRage.value = Math.min(1, duxiRage.value + RAGE_PER_HIT)
    duxiDizzyUntil.value = now + DIZZY_MS // apanhando de novo: continua tonta
    return
  }
  duxiRage.value = 0
  hitCount += 1
  if (hitCount >= 3) {
    hitCount = 0
    duxiDizzyUntil.value = now + DIZZY_MS
  }
}

// Este módulo tem estado vivo (máquina de estados, watchers no microfone) —
// em hot-reload o Vite re-executaria ele por baixo do app aberto e ficariam
// duas cópias: a antiga continuava processando a voz e a nova (lida pela UI)
// presa em 'passive'. Recarrega a página inteira quando ele mudar.
if (import.meta.hot) import.meta.hot.decline()
