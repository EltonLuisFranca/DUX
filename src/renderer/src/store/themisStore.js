import { computed, ref, watch } from 'vue'
import { workspaces } from './flowStore'
import {
  pendingVoiceInput,
  consumePendingVoiceInput,
  startRecording,
  cancelRecording,
  waveLevels,
  isRecording
} from './voiceStore'
import { speak, isSpeaking, stopSpeaking } from './ttsStore'
import { streamChat } from '../lib/ollamaClient'
import { DEFAULT_MERLIN_SYSTEM_PROMPT } from '../lib/merlinPrompt'

// Themis: assistente de voz único e global, que vive na barra do topo (ver
// ThemisBot.vue). Antes era um node do canvas (MerlinNode) com a config em
// node.data — mas a barra existe uma vez por workspace, então a lógica da
// conversa mora aqui (singleton), senão cada workspace teria uma Themis
// própria disputando o mesmo microfone. O componente só desenha o rosto e
// o texto a partir deste estado.

const STORAGE_KEY = 'dux-themis'
// só as últimas N mensagens (user+assistant) vão pro modelo — conversa de voz
// é troca curta, sem isso o prompt cresce sem limite a cada pergunta.
const MAX_HISTORY = 16
// id fixo usado pra rotear a transcrição do voiceStore (que foi feito pra
// terminais e identifica o destino por id) de volta pra cá
const THEMIS_VOICE_ID = 'themis'
const MERLIN_NODE_TYPE = 'merlin'

const DEFAULT_CONFIG = {
  host: 'http://localhost:11434',
  token: '',
  model: '',
  api: undefined,
  systemPrompt: '',
  voiceOutputEnabled: true,
  lipSyncEnabled: true,
  messages: []
}

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// config antiga vinha de um node Themis no canvas — aproveita a do primeiro
// que existir, uma vez só (depois disso a config salva aqui é a verdade)
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

export const themisConfig = ref({
  ...DEFAULT_CONFIG,
  ...stripUndefined(loadStoredConfig() ?? configFromLegacyNode())
})

watch(
  themisConfig,
  (cfg) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  },
  { deep: true, immediate: true }
)

export function updateThemisConfig(patch) {
  Object.assign(themisConfig.value, patch)
}

export function clearThemisConversation() {
  themisConfig.value.messages = []
  userText.value = ''
  replyText.value = ''
  errorText.value = ''
}

// Themis não é mais um tipo de node: tira qualquer node 'merlin' (e edges
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
export const themisState = ref('off')
export const userText = ref('') // o que ela entendeu que o usuário falou
export const replyText = ref('') // resposta dela (streaming)
export const errorText = ref('')

let commandBuffer = ''
let abortController = null

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
  const listening = themisState.value === 'passive' || themisState.value === 'active'
  if (!listening) return
  if (!levels.slice(-6).some((l) => l > 0.05)) return
  if (!hearingVoice.value && themisState.value === 'passive') {
    // começou um pedido novo: some a troca anterior da barra
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

watch(themisState, (s) => {
  if (s !== 'passive' && s !== 'active') {
    clearTimeout(voiceHoldTimer)
    hearingVoice.value = false
  }
  if (s === 'off') themisEngaged.value = false
  else if (s !== 'passive') themisEngaged.value = true
})

// "Engajada": a conversa começou (primeira fala captada). A barra cresce e
// fica grande até o usuário desativar a Themis no clique — parar de falar,
// ela pensar ou responder não encolhe de volta.
export const themisEngaged = ref(false)
watch(hearingVoice, (hearing) => {
  if (hearing) themisEngaged.value = true
})

// Layout da barra do topo:
// - compact: só o robô, pequeno (desligada, ou ligada esperando a 1ª fala)
// - focus: engajada, ainda sem texto — barra grande, robô grande no meio
// - text: tem texto da troca — mesma barra grande, robô no canto e o texto ao
//   lado (ou, desligada, só a mensagem de erro ao lado do robô pequeno)
export const themisPhase = computed(() => {
  const hasText = Boolean(userText.value || replyText.value || errorText.value)
  if (hasText && (themisEngaged.value || errorText.value)) return 'text'
  if (themisEngaged.value) return 'focus'
  return 'compact'
})

export async function toggleThemisMic() {
  if (themisState.value === 'off') {
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
  try {
    // startRecording ignora a chamada em silêncio se o mic já estiver
    // gravando pra outro destino (ex: ditado de terminal pela barra de baixo)
    // — aí a Themis ficava "ouvindo" mas a transcrição ia pra outro lugar
    if (isRecording.value) cancelRecording()
    await startRecording(THEMIS_VOICE_ID)
    themisState.value = 'passive'
  } catch (err) {
    console.error('[themis] falha ao acessar microfone', err)
    errorText.value = 'Não foi possível acessar o microfone.'
    themisState.value = 'off'
  }
}

function disableListening() {
  abortController?.abort()
  abortController = null
  stopSpeaking()
  cancelRecording()
  themisState.value = 'off'
  commandBuffer = ''
}

function handleVoiceSignal(pending) {
  if (themisState.value === 'passive') {
    if (pending.text) {
      themisState.value = 'active'
      commandBuffer = pending.text
      userText.value = pending.text.trim()
      replyText.value = ''
      errorText.value = ''
    }
    return
  }

  if (themisState.value === 'active') {
    if (pending.text) {
      commandBuffer += pending.text
      userText.value = commandBuffer.trim()
    }
    if (pending.sendEnter) {
      const query = commandBuffer.trim()
      commandBuffer = ''
      // mic desliga já aqui, antes de chamar o modelo — evita captar a
      // própria voz da Themis quando a resposta for falada
      cancelRecording()
      if (query) {
        submitQuery(query)
      } else {
        // pausa longa sem ter dito nada de fato — volta a ouvir em standby
        themisState.value = 'passive'
        startRecording(THEMIS_VOICE_ID).catch(() => {})
      }
    }
  }
}

async function submitQuery(query) {
  themisState.value = 'thinking'
  errorText.value = ''
  userText.value = query
  replyText.value = ''

  const cfg = themisConfig.value
  const systemPrompt = cfg.systemPrompt || DEFAULT_MERLIN_SYSTEM_PROMPT
  const history = [...(cfg.messages || []), { role: 'user', content: query }]
  cfg.messages = history.slice(-MAX_HISTORY)

  abortController = new AbortController()
  let fullText = ''
  try {
    await streamChat({
      host: (cfg.host || DEFAULT_CONFIG.host).replace(/\/+$/, ''),
      token: cfg.token,
      model: cfg.model,
      api: cfg.api,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      signal: abortController.signal,
      onToken: (chunk) => {
        fullText += chunk
        replyText.value = fullText
      }
    })
    cfg.messages = [...history, { role: 'assistant', content: fullText }].slice(-MAX_HISTORY)
    replyText.value = fullText.trim()
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[themis] falha ao conversar com o modelo', err)
      errorText.value = cfg.model
        ? `Erro ao conectar com ${cfg.host}. O Ollama está rodando?`
        : 'Nenhum modelo escolhido — clique com o botão direito na Themis para configurar.'
    }
  } finally {
    abortController = null
  }

  if (themisState.value === 'off') return // desativou enquanto pensava

  if (fullText.trim() && (cfg.voiceOutputEnabled ?? true)) {
    themisState.value = 'speaking'
    await speak(fullText.trim(), { forceSpeak: true })
    await waitForSpeechEnd()
  }

  if (themisState.value === 'off') return // desativou enquanto falava
  themisState.value = 'passive'
  startRecording(THEMIS_VOICE_ID).catch(() => {})
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
    if (!pending || pending.terminalId !== THEMIS_VOICE_ID) return
    console.log('[themis] voz recebida', { state: themisState.value, text: pending.text, enter: !!pending.sendEnter })
    handleVoiceSignal(pending)
    consumePendingVoiceInput()
  },
  { flush: 'sync' }
)

// --- "batidas" na barra -------------------------------------------------------
// Cada clique no cinza da barra aberta dá uma batida no robô (tranco + olhos
// fechando, ver ThemisBot). Na 3ª batida seguida ele fica tonto por 4s
// (olhos em espiral girando, efeitos vermelhos). Cliques espaçados demais
// (> HIT_STREAK_MS) recomeçam a contagem. Timestamps em performance.now().
const HIT_STREAK_MS = 3000
const DIZZY_MS = 4000
export const themisLastHitAt = ref(0)
export const themisDizzyUntil = ref(0)
let hitCount = 0

export function hitThemis() {
  const now = performance.now()
  if (now - themisLastHitAt.value > HIT_STREAK_MS) hitCount = 0
  themisLastHitAt.value = now
  hitCount += 1
  if (hitCount >= 3) {
    hitCount = 0
    themisDizzyUntil.value = now + DIZZY_MS
  }
}

// Este módulo tem estado vivo (máquina de estados, watchers no microfone) —
// em hot-reload o Vite re-executaria ele por baixo do app aberto e ficariam
// duas cópias: a antiga continuava processando a voz e a nova (lida pela UI)
// presa em 'passive'. Recarrega a página inteira quando ele mudar.
if (import.meta.hot) import.meta.hot.decline()
