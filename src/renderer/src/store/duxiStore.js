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
import { speak, isSpeaking, stopSpeaking } from './ttsStore'
import { streamChat } from '../lib/ollamaClient'
import { DEFAULT_DUXI_SYSTEM_PROMPT } from '../lib/duxiPrompt'
import { DUXI_TOOLS, executeDuxiTool } from '../lib/duxiTools'

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
  messages: []
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
  const listening = duxiState.value === 'passive' || duxiState.value === 'active'
  if (!listening) return
  if (!levels.slice(-6).some((l) => l > 0.05)) return
  if (!hearingVoice.value && duxiState.value === 'passive') {
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

watch(duxiState, (s) => {
  if (s !== 'passive' && s !== 'active') {
    clearTimeout(voiceHoldTimer)
    hearingVoice.value = false
  }
  if (s === 'off') duxiEngaged.value = false
  else if (s !== 'passive') duxiEngaged.value = true
})

// "Engajada": a conversa começou (primeira fala captada). A barra cresce e
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
// - compact: só o robô, pequeno (desligada, ou ligada esperando a 1ª fala)
// - focus: engajada, ainda sem texto — barra grande, robô grande no meio
// - text: tem texto da troca — mesma barra grande, robô no canto e o texto ao
//   lado (ou, desligada, só a mensagem de erro ao lado do robô pequeno)
export const duxiPhase = computed(() => {
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
  try {
    // startRecording ignora a chamada em silêncio se o mic já estiver
    // gravando pra outro destino (ex: ditado de terminal pela barra de baixo)
    // — aí a Duxi ficava "ouvindo" mas a transcrição ia pra outro lugar
    if (isRecording.value) cancelRecording()
    await startRecording(DUXI_VOICE_ID)
    duxiState.value = 'passive'
  } catch (err) {
    console.error('[duxi] falha ao acessar microfone', err)
    errorText.value = 'Não foi possível acessar o microfone.'
    duxiState.value = 'off'
  }
}

function disableListening() {
  abortController?.abort()
  abortController = null
  stopSpeaking()
  cancelRecording()
  duxiState.value = 'off'
  commandBuffer = ''
}

function handleVoiceSignal(pending) {
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
  abortController = new AbortController()

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
          replyText.value = fullText
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
        let outcome = await executeDuxiTool(call.name, retryArgs)
        // `while` (não só um retry): uma tool pode ter mais de um parâmetro
        // ambíguo (ex: board E agente) — cada rodada resolve um, a próxima
        // chamada pode acusar ambiguidade de novo pro parâmetro seguinte
        while (outcome.type === 'ambiguous') {
          const choiceId = await askDuxiChoice(outcome.candidates)
          retryArgs = { ...retryArgs, [outcome.retryKey]: choiceId }
          outcome = await executeDuxiTool(call.name, retryArgs)
        }
        apiMessages = [...apiMessages, { role: 'tool', name: call.name, content: outcome.content, toolCallId: call.id }]
      }

      if (iteration === MAX_TOOL_ITERATIONS - 1) {
        errorText.value = 'Tentei algumas ações mas não consegui terminar a resposta.'
      }
    }

    cfg.messages = [...baseHistory, { role: 'assistant', content: fullText }].slice(-MAX_HISTORY)
    replyText.value = fullText.trim()
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

  if (!errorText.value && fullText.trim() && (cfg.voiceOutputEnabled ?? true)) {
    duxiState.value = 'speaking'
    await speak(fullText.trim(), { forceSpeak: true })
    await waitForSpeechEnd()
  }

  if (duxiState.value === 'off') return // desativou enquanto falava
  duxiState.value = 'passive'
  startRecording(DUXI_VOICE_ID).catch(() => {})
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

// --- "batidas" na barra -------------------------------------------------------
// Cada clique no cinza da barra aberta dá uma batida no robô (tranco + olhos
// fechando, ver DuxiBot). Na 3ª batida seguida ele fica tonto por 4s
// (olhos em espiral girando, efeitos vermelhos). Cliques espaçados demais
// (> HIT_STREAK_MS) recomeçam a contagem. Timestamps em performance.now().
const HIT_STREAK_MS = 3000
const DIZZY_MS = 4000
export const duxiLastHitAt = ref(0)
export const duxiDizzyUntil = ref(0)
let hitCount = 0

export function hitDuxi() {
  const now = performance.now()
  if (now - duxiLastHitAt.value > HIT_STREAK_MS) hitCount = 0
  duxiLastHitAt.value = now
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
