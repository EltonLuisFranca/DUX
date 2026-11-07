<template>
  <NodeShell
    :id="id"
    :data="data"
    :selected="selected"
    :resize="{ minWidth: 320, minHeight: 220, defaultWidth: 480, defaultHeight: 344 }"
    :title="data.name"
    :meta="cwdLabel"
    :status="statusColor"
    :status-label="statusLabel"
    :status-tone="statusTone"
    :status-pulse="status === 'connecting' || workActive || !!currentApproval"
    :accent="isClaudeNode ? 'var(--color-accent)' : ''"
  >
    <template #icon>
      <svg viewBox="0 0 20 20" width="12" height="12" v-html="TERMINAL_ICON"></svg>
    </template>
    <template #headerMeta>
      <span
        v-if="gitBranch"
        class="branch-chip"
        :class="{ compact: nodeStyleVariant === 'compact' }"
        :title="`Branch: ${gitBranch}`"
      >
        <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="5" cy="3.5" r="1.5" />
          <circle cx="5" cy="12.5" r="1.5" />
          <circle cx="11.5" cy="5.5" r="1.5" />
          <path d="M5 5v6M11.5 7c0 2.5-2 3-6.5 3.5" />
        </svg>
        <span class="branch-name">{{ gitBranch }}</span>
      </span>
    </template>
    <template #headerActions>
      <ClaudeProfileChip v-if="isClaudeNode" :profile-id="data.claudeProfileId" @change="switchProfile" />
      <span v-if="connectedPeers.length" class="peer-count" :title="connectedPeers.map((a) => a.name).join(', ')">
        {{ connectedPeers.length }} agente{{ connectedPeers.length === 1 ? '' : 's' }}
      </span>
    </template>

    <div
      v-if="usagePercent !== null"
      class="usage-badge nodrag"
      :class="usageLevel"
      :style="{ top: nodeStyleVariant === 'compact' ? '30px' : '50px' }"
      :title="usageTooltip"
    >
      {{ usagePercent }}%
    </div>
    <div ref="termEl" class="agent-term nodrag nowheel nopan"></div>

    <!-- Cartão "Aguardando você": pedido de permissão do Claude (hook) ou
         decisão pedida pelo agente (tool dux_request_approval), ver
         bridge/approvals.js. Um por vez; os seguintes esperam na fila. -->
    <Transition name="approval-pop">
      <div v-if="currentApproval" :key="currentApproval.id" class="approval-card nodrag nowheel nopan">
        <div class="approval-head">
          <span class="approval-dot" />
          <span class="approval-label">Aguardando você</span>
          <span v-if="pendingApprovals.length > 1" class="approval-queue">+{{ pendingApprovals.length - 1 }}</span>
        </div>
        <div class="approval-title">{{ currentApproval.title }}</div>
        <pre v-if="currentApproval.detail" class="approval-detail">{{ currentApproval.detail }}</pre>
        <div class="approval-actions">
          <button
            v-for="opt in currentApproval.options"
            :key="opt.id"
            class="approval-btn"
            :class="opt.tone ? `tone-${opt.tone}` : ''"
            @click="answerApproval(currentApproval.id, opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </Transition>
  </NodeShell>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import NodeShell from './NodeShell.vue'
import ClaudeProfileChip from './ClaudeProfileChip.vue'
import { TERMINAL_ICON } from '../nodeTypes/nodeIcons'
import { FitAddon } from '@xterm/addon-fit'
import { useVueFlow } from '@vue-flow/core'
import '@xterm/xterm/css/xterm.css'
import { updateNodeData, activeTerminalId, AGENT_TERMINAL_TYPES } from '../store/flowStore'
import { theme, XTERM_THEMES, nodeStyleVariant } from '../store/themeStore'
import { linkAgents, linkNoteToAgent } from '../lib/bridgeClient'
import {
  serializeBoard,
  addCard,
  moveCard,
  finishTask,
  assignCard,
  addTag,
  renameTag,
  recolorTag,
  removeTag,
  addCardTag,
  removeCardTag,
  addComment,
  resendPendingDispatch
} from '../lib/duxbanOps'
import { speak, ttsEnabled } from '../store/ttsStore'
import { playNotificationSound } from '../store/notificationSoundStore'
import { resolveClaudeProfile } from '../store/claudeProfilesStore'
import { setAgentStatus, clearAgentStatus } from '../store/agentStatusStore'

const props = defineProps({
  id: { type: String, required: true },
  type: { type: String, default: '' },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

// Só os terminais de Claude Code têm perfil de conta (CLAUDE_CONFIG_DIR, ver
// bridge/claudeProfiles.js) — Codex e shells puros ignoram o campo.
const isClaudeNode = computed(() => props.type === 'wsl-claude-terminal' || props.type === 'claude-terminal')

function switchProfile(profileId) {
  updateNodeData(props.id, { claudeProfileId: profileId })
}

const { getConnectedEdges, findNode } = useVueFlow()

// Outros terminais de agente ligados a este por edge — mesmo mecanismo do
// badge "N agentes" do DuxBan (DuxBanNode.vue): deriva das edges em vez de
// guardar estado à parte, então some/aparece sozinho ao ligar/desligar.
const connectedPeers = computed(() => {
  const list = []
  for (const edge of getConnectedEdges(props.id)) {
    const otherId = edge.source === props.id ? edge.target : edge.source
    const otherNode = findNode(otherId)
    if (otherNode && AGENT_TERMINAL_TYPES.includes(otherNode.type)) {
      list.push({ id: otherId, name: otherNode.data.name || otherId })
    }
  }
  return list
})

const termEl = ref(null)
const status = ref('connecting')
const gitBranch = ref(null)

// Só a última pasta: o caminho inteiro (/mnt/c/Users/...) não cabe no header.
// "~" e "~/x" ficam como estão. É o diretório em que o terminal abriu; um cd
// feito dentro de um shell não muda o rótulo (a branch, sim, acompanha).
const cwdLabel = computed(() => {
  const cwd = String(props.data.cwd || '').replace(/[\\/]+$/, '')
  if (!cwd || cwd === '~') return cwd
  const name = cwd.split(/[\\/]/).pop()
  return cwd.startsWith('~/') ? `~/${name}` : name
})

const STATUS_COLORS = { online: '#28c840', connecting: '#febc2e', offline: '#ff5f57' }
const statusColor = computed(() => STATUS_COLORS[status.value] || '#6b7280')

// "Trabalhando" de verdade: deriva da mesma heurística do som de notificação
// (ver onPtyDataForNotification). Arma no Enter (workStartedAt), aparece
// quando o agente começa a produzir saída e some ~1,2s depois que ele
// silencia. workNow tica de 1 em 1s só enquanto está ativo, pro cronômetro.
const workActive = ref(false)
const workNow = ref(0)
let workStartedAt = 0
let workTimer = null

const workElapsed = computed(() => {
  const s = Math.max(0, Math.floor((workNow.value - workStartedAt) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

function startWorkTimer() {
  if (workTimer) return
  workNow.value = Date.now()
  workTimer = setInterval(() => {
    workNow.value = Date.now()
  }, 1000)
}

function stopWorkTimer() {
  clearInterval(workTimer)
  workTimer = null
}

// Pedidos "Aguardando você" pendentes (ver template e bridge/approvals.js).
// O primeiro aparece no cartão; a resposta volta pela mesma conexão ws.
const pendingApprovals = ref([])
const currentApproval = computed(() => pendingApprovals.value[0] || null)

function answerApproval(id, choice) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'approvalAnswer', id, choice }))
  pendingApprovals.value = pendingApprovals.value.filter((a) => a.id !== id)
}

// Pill de status no header: "Trabalhando · M:SS" enquanto o agente responde;
// senão, só aparece quando precisa de atenção (conectando/offline). Online
// ocioso fica com o dot discreto (statusLabel vazio).
const statusLabel = computed(() => {
  if (currentApproval.value) return 'Aguardando você'
  if (workActive.value) return `Trabalhando · ${workElapsed.value}`
  if (status.value === 'connecting') return 'Conectando…'
  if (status.value === 'offline') return 'Offline'
  return ''
})
// publica o estado pro rodapé (AgentStatusBar) contar trabalhando/aguardando —
// só terminais de agente: um shell comum rodando um comando não é "agente
// trabalhando"
watch(
  [workActive, status, currentApproval, () => props.data.name],
  () => {
    if (!AGENT_TERMINAL_TYPES.includes(props.type)) return
    const state = currentApproval.value
      ? 'waiting'
      : workActive.value
        ? 'working'
        : status.value === 'online'
          ? 'idle'
          : status.value
    setAgentStatus(props.id, { state, name: props.data.name })
  },
  { immediate: true }
)

const statusTone = computed(() => {
  if (currentApproval.value) return 'waiting'
  if (workActive.value) return 'working'
  if (status.value === 'connecting') return 'waiting'
  if (status.value === 'offline') return 'error'
  return 'ok'
})

// % da janela de contexto do Claude Code em uso nesta sessão, calculado pelo
// bridge (claudeUsage.js) a partir do transcript da sessão em
// ~/.claude/projects — null enquanto não chega nenhuma leitura ainda (node
// que não é Claude Code, sessão recém-aberta sem nenhuma resposta ainda etc).
const usagePercent = ref(null)
const usageTokens = ref(null)
const usageWindow = ref(null)

const usageLevel = computed(() => {
  if (usagePercent.value >= 90) return 'danger'
  if (usagePercent.value >= 70) return 'warn'
  return ''
})

const usageTooltip = computed(() => {
  if (usagePercent.value === null) return ''
  const tokens = usageTokens.value ?? 0
  const window = usageWindow.value ?? 0
  return `Contexto usado: ${usagePercent.value}% (~${Math.round(tokens / 1000)}k de ${Math.round(window / 1000)}k tokens)`
})

let term = null
let fitAddon = null
let ws = null
let resizeObserver = null
let retryTimer = null
let stopThemeWatch = null
let stopCwdWatch = null
let stopNameWatch = null
let stopProfileWatch = null
let renameDebounceTimer = null

// Não existe hoje nenhum sinal explícito de "o agente terminou de responder"
// pra conversas normais (só existe pro dux_ask, via marcador que o próprio
// agente escreve a pedido) — a mesma heurística de silêncio usada lá serve
// aqui: acumula tudo que o PTY emitiu desde a última tecla/input do usuário
// e, quando o terminal fica um tempo sem novo output, considera a resposta
// "pronta" e manda pro TTS. Falsos positivos (respostas com pausas longas
// cortadas cedo) são aceitáveis; o texto ainda vai continuar na tela.
const TTS_SILENCE_MS = 1200
let ttsBuffer = ''
let ttsSilenceTimer = null

function resetTtsCapture() {
  ttsBuffer = ''
  clearTimeout(ttsSilenceTimer)
  ttsSilenceTimer = null
}

// Escopo restrito de propósito: só o terminal selecionado (activeTerminalId)
// — sem isso, TODO terminal aberto acumulava e lia sua própria saída,
// misturando resposta de um agente que nem estava em foco (ex: outro terminal
// imprimindo "92% do limite usado" no meio da leitura da resposta certa). A
// checagem só vale pra ABRIR uma captura nova (buffer vazio) — uma vez
// iniciada, continua até o silêncio real mesmo que o foco mude no meio da
// resposta chegando, pra não cortar a fala pela metade.
function onPtyDataForTts(chunk) {
  const isNewCapture = ttsBuffer === ''
  if (isNewCapture && props.id !== activeTerminalId.value) return
  ttsBuffer += chunk
  clearTimeout(ttsSilenceTimer)
  ttsSilenceTimer = setTimeout(() => {
    const chunkToSpeak = ttsBuffer
    ttsBuffer = ''
    if (chunkToSpeak.trim()) speak(chunkToSpeak)
  }, TTS_SILENCE_MS)
}

// Som de notificação: mesma heurística de silêncio do TTS, mas sem o escopo
// de ditado/foco — qualquer terminal serve. Só passa a "escutar" depois que o
// usuário manda um Enter (armNotificationCapture), pra não disparar em saída
// que não é resposta a nada (ls, prompt redesenhado, etc). Uma vez armado,
// dispara no primeiro silêncio de TTS_SILENCE_MS e desarma de novo.
let notifyHasOutput = false
let notifySilenceTimer = null
let notifyAwaitingResponse = false

function onPtyDataForNotification(chunk) {
  if (!notifyAwaitingResponse) return
  if (!chunk.trim()) return
  notifyHasOutput = true
  // primeira saída depois do Enter = agente começou a trabalhar
  if (!workActive.value) {
    workActive.value = true
    startWorkTimer()
  }
  clearTimeout(notifySilenceTimer)
  notifySilenceTimer = setTimeout(() => {
    if (notifyHasOutput && !ttsEnabled.value) playNotificationSound()
    notifyHasOutput = false
    notifyAwaitingResponse = false
    workActive.value = false
    stopWorkTimer()
  }, TTS_SILENCE_MS)
}

function armNotificationCapture() {
  notifyAwaitingResponse = true
  workStartedAt = Date.now()
}

function resetNotificationCapture() {
  notifyHasOutput = false
  notifyAwaitingResponse = false
  workActive.value = false
  stopWorkTimer()
  clearTimeout(notifySilenceTimer)
  notifySilenceTimer = null
}
function sendResize() {
  if (!term || !ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
}

function connect() {
  status.value = 'connecting'
  gitBranch.value = null
  ws = new WebSocket('ws://127.0.0.1:4577')

  ws.onopen = () => {
    fitAddon.fit()
    ws.send(
      JSON.stringify({
        type: 'start',
        sessionId: props.id,
        name: props.data.name,
        cwd: props.data.cwd,
        command: props.data.command,
        claudeProfileId: props.data.claudeProfileId || null,
        cols: term.cols,
        rows: term.rows
      })
    )
    status.value = 'online'
    relinkExistingEdges()
    resendPendingDuxbanTask()
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.type === 'data') {
      term.write(msg.data)
      onPtyDataForTts(msg.data)
      onPtyDataForNotification(msg.data)
    } else if (msg.type === 'exit') {
      status.value = 'offline'
      term.write(`\r\n\r\n[sessão encerrada — código ${msg.exitCode}]\r\n`)
      resetUsage()
    } else if (msg.type === 'error') {
      status.value = 'offline'
      term.write(`\r\n\r\n[erro: ${msg.message}]\r\n`)
      resetUsage()
    } else if (msg.type === 'approvalRequest') {
      pendingApprovals.value.push(msg)
      // som de atenção mesmo com TTS ligado: o agente está parado esperando
      playNotificationSound()
    } else if (msg.type === 'approvalClosed') {
      pendingApprovals.value = pendingApprovals.value.filter((a) => a.id !== msg.id)
    } else if (msg.type === 'duxbanRequest') {
      handleDuxbanRequest(msg)
    } else if (msg.type === 'claudeUsage') {
      usagePercent.value = msg.percent
      usageTokens.value = msg.contextTokens
      usageWindow.value = msg.contextWindow
    } else if (msg.type === 'gitBranch') {
      gitBranch.value = msg.branch
    }
  }

  ws.onclose = () => {
    status.value = 'offline'
    resetUsage()
    // o bridge libera os pedidos pendentes quando a conexão cai
    // (approvals.unregisterSession) — o cartão não tem mais quem responder
    pendingApprovals.value = []
    retryTimer = setTimeout(connect, 1500)
  }

  ws.onerror = () => {
    ws?.close()
  }
}

function disconnect() {
  clearTimeout(retryTimer)
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
}

function resetUsage() {
  usagePercent.value = null
  usageTokens.value = null
  usageWindow.value = null
}

// avisa o bridge sobre as conexões já existentes deste node no canvas (ex: um
// workspace salvo que reabre com edges entre terminais) — ao criar uma edge
// nova pelo canvas isso já é feito via evento @connect no FleetCanvas, mas
// edges que já existiam antes de qualquer terminal conectar não disparam esse
// evento, então cada lado da edge reafirma o link sozinho ao abrir sua sessão
// Board DuxBan conectado a este terminal (se houver) — as tools dux_kanban_*
// (bridge/mcp-server.mjs -> duxbanLink.request -> duxbanRequest aqui) só
// enxergam o primeiro board ligado; múltiplos boards no mesmo terminal não
// são endereçáveis por enquanto.
function findConnectedDuxbanNode() {
  for (const edge of getConnectedEdges(props.id)) {
    const otherId = edge.source === props.id ? edge.target : edge.source
    const otherNode = findNode(otherId)
    if (otherNode?.type === 'duxban') return otherNode
  }
  return null
}

// nodeId -> nome de exibição, pra dux_kanban_list não expor uuid interno de
// outros agentes conectados ao mesmo board
function agentNamesForBoard(duxbanNode) {
  const names = {}
  for (const edge of getConnectedEdges(duxbanNode.id)) {
    const otherId = edge.source === duxbanNode.id ? edge.target : edge.source
    if (otherId === duxbanNode.id) continue
    const otherNode = findNode(otherId)
    if (otherNode) names[otherId] = otherNode.data.name || otherId
  }
  return names
}

// Resolve um nome de agente (dux_kanban_assign_card) pra um nodeId, só entre
// os agentes de fato conectados ao board — mesmo universo que
// agentNamesForBoard já expõe em dux_kanban_list, então um agent_name que
// veio de lá sempre bate. Match exato primeiro (mesmo critério de
// agentLink.ask, que é case-sensitive); cai pro primeiro match
// case-insensitive só como fallback tolerante.
function resolveAgentNodeId(duxbanNode, agentName) {
  const name = String(agentName || '').trim()
  if (!name) return { nodeId: null, found: true }
  let looseMatch = null
  for (const edge of getConnectedEdges(duxbanNode.id)) {
    const otherId = edge.source === duxbanNode.id ? edge.target : edge.source
    if (otherId === duxbanNode.id) continue
    const otherNode = findNode(otherId)
    if (!otherNode) continue
    const otherName = otherNode.data.name || otherId
    if (otherName === name) return { nodeId: otherId, found: true }
    if (!looseMatch && otherName.toLowerCase() === name.toLowerCase()) looseMatch = otherId
  }
  if (looseMatch) return { nodeId: looseMatch, found: true }
  return { nodeId: null, found: false }
}

// Chega pela mesma conexão ws persistente do terminal (duxbanLink.request,
// no bridge, escreve nela diretamente) — o board mora aqui no renderer, o
// bridge só faz a ida-e-volta. Resposta sempre volta como duxbanResponse,
// mesmo em erro (card/ação inválida), pra não deixar a tool travada esperando.
function handleDuxbanRequest(msg) {
  const reply = (result, error) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'duxbanResponse', requestId: msg.requestId, result, error }))
    }
  }

  const board = findConnectedDuxbanNode()
  if (!board) return reply(null, 'nenhum board DuxBan conectado a este terminal')

  try {
    if (msg.action === 'list') {
      reply(serializeBoard(board.data, agentNamesForBoard(board), props.id))
    } else if (msg.action === 'create_card') {
      const card = addCard(board.data, msg.payload?.column, msg.payload?.text, {
        description: msg.payload?.description,
        images: msg.payload?.images
      })
      reply({ ok: true, card_id: card.id, images_attached: card.images.length || undefined })
    } else if (msg.action === 'move_card') {
      const card = moveCard(board.data, msg.payload?.cardId, msg.payload?.column)
      reply({ ok: true, card_id: card.id })
    } else if (msg.action === 'finish_task') {
      const card = finishTask(board.data, msg.payload?.cardId, props.id)
      reply({ ok: true, card_id: card.id })
    } else if (msg.action === 'assign_card') {
      const { nodeId, found } = resolveAgentNodeId(board, msg.payload?.agentName)
      if (!found) {
        reply(null, `agente não encontrado ou não conectado a este board: "${msg.payload?.agentName}"`)
      } else {
        assignCard(board.data, msg.payload?.cardId, nodeId)
        reply({ ok: true, card_id: msg.payload?.cardId })
      }
    } else if (msg.action === 'create_tag') {
      const tag = addTag(board.data, msg.payload?.name, msg.payload?.color)
      reply({ ok: true, tag_id: tag.id, name: tag.name, color: tag.color })
    } else if (msg.action === 'rename_tag') {
      renameTag(board.data, msg.payload?.tagId, msg.payload?.name)
      reply({ ok: true, tag_id: msg.payload?.tagId })
    } else if (msg.action === 'recolor_tag') {
      recolorTag(board.data, msg.payload?.tagId, msg.payload?.color)
      reply({ ok: true, tag_id: msg.payload?.tagId })
    } else if (msg.action === 'remove_tag') {
      removeTag(board.data, msg.payload?.tagId)
      reply({ ok: true, tag_id: msg.payload?.tagId })
    } else if (msg.action === 'add_card_tag') {
      addCardTag(board.data, msg.payload?.cardId, msg.payload?.tagId)
      reply({ ok: true, card_id: msg.payload?.cardId, tag_id: msg.payload?.tagId })
    } else if (msg.action === 'remove_card_tag') {
      removeCardTag(board.data, msg.payload?.cardId, msg.payload?.tagId)
      reply({ ok: true, card_id: msg.payload?.cardId, tag_id: msg.payload?.tagId })
    } else if (msg.action === 'add_comment') {
      const comment = addComment(board.data, msg.payload?.cardId, msg.payload?.text, props.data.name, msg.payload?.images)
      reply({
        ok: true,
        card_id: msg.payload?.cardId,
        comment_id: comment?.id,
        images_attached: comment?.images?.length || undefined
      })
    } else {
      reply(null, `ação desconhecida: ${msg.action}`)
    }
  } catch (err) {
    reply(null, err.message)
  }
}

function relinkExistingEdges() {
  for (const edge of getConnectedEdges(props.id)) {
    const otherId = edge.source === props.id ? edge.target : edge.source
    const otherNode = findNode(otherId)
    if (otherNode?.type === 'notes') {
      linkNoteToAgent(props.id, otherNode.data.path)
    } else {
      linkAgents(props.id, otherId)
    }
  }
}

// Catch-up de dispatch do DuxBan (ver resendPendingDispatch em duxbanOps.js e
// o fix em bridge/duxbanLink.js::pushTask) — roda em toda (re)conexão, não só
// na primeira, porque a sessão no bridge (onde pushTask checa se o terminal
// está disponível) também é recriada do zero a cada reconexão. Idempotente:
// não faz nada se este terminal não tiver um dispatch 'active' pendente.
function resendPendingDuxbanTask() {
  const board = findConnectedDuxbanNode()
  if (board) resendPendingDispatch(board.data, props.id)
}

onMounted(async () => {
  term = new Terminal({
    convertEol: true,
    fontSize: 13,
    fontFamily: 'Menlo, Consolas, monospace',
    theme: XTERM_THEMES[theme.value]
  })
  stopThemeWatch = watch(theme, (t) => {
    if (term) term.options.theme = XTERM_THEMES[t]
  })
  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(termEl.value)

  // Ctrl+C sem seleção precisa continuar mandando SIGINT pro processo (xterm
  // já faz isso sozinho). Com seleção, tanto Ctrl+C quanto Ctrl+Shift+C viram
  // "copiar" — senão não tem nenhum jeito de copiar texto do terminal.
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true
    const isCKey = event.key === 'c' || event.key === 'C'
    if (isCKey && (event.ctrlKey || event.metaKey) && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection()).catch(() => {})
      return false
    }
    return true
  })

  // espera a fonte carregar e o layout assentar antes do primeiro fit,
  // senão a medição de altura da célula fica errada e corta a última linha
  await document.fonts.ready
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  fitAddon.fit()

  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }))
    }
    // Enter confirma uma pergunta nova — descarta o que tinha acumulado até
    // aqui (a resposta anterior, se ainda não tiver disparado o TTS) pra não
    // misturar duas respostas diferentes num único trecho falado.
    if (data.includes('\r')) {
      resetTtsCapture()
      resetNotificationCapture()
      armNotificationCapture()
    }
  })

  term.onResize(sendResize)

  resizeObserver = new ResizeObserver(() => fitAddon?.fit())
  resizeObserver.observe(termEl.value)

  connect()

  stopNameWatch = watch(
    () => props.data.name,
    (name) => {
      clearTimeout(renameDebounceTimer)
      renameDebounceTimer = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'rename', sessionId: props.id, name }))
        }
      }, 500)
    }
  )

  stopCwdWatch = watch(
    () => props.data.cwd,
    () => {
      disconnect()
      term.clear()
      term.write('[reiniciando sessão no novo diretório...]\r\n')
      resetUsage()
      connect()
    }
  )

  // mesma ideia do cwd: a conta é fixada quando o pty nasce (env
  // CLAUDE_CONFIG_DIR), então trocar o perfil = reabrir a sessão
  stopProfileWatch = watch(
    () => props.data.claudeProfileId,
    (profileId) => {
      if (!isClaudeNode.value) return
      disconnect()
      term.clear()
      const name = resolveClaudeProfile(profileId)?.name
      term.write(`[reiniciando sessão na conta ${name ? `"${name}"` : 'padrão'}...]\r\n`)
      resetUsage()
      connect()
    }
  )
})

onBeforeUnmount(() => {
  clearAgentStatus(props.id)
  resizeObserver?.disconnect()
  clearTimeout(renameDebounceTimer)
  resetTtsCapture()
  resetNotificationCapture()
  stopThemeWatch?.()
  stopCwdWatch?.()
  stopNameWatch?.()
  stopProfileWatch?.()
  disconnect()
  term?.dispose()
})
</script>

<style scoped>
/* handles do terminal têm comportamento diferente do padrão compartilhado
   (NodeShell): ficam invisíveis em repouso e só aparecem no hover/durante um
   arraste de conexão, com feedback de cor (amarelo enquanto arrasta, verde
   quando o alvo é válido) — sinal importante o bastante aqui (é o principal
   jeito de ligar dois agentes) pra valer a pena o :deep() em vez de herdar o
   estilo genérico dos outros node types. */
:deep(.shell-handle) {
  width: 10px;
  height: 10px;
  background: var(--color-bg-surface);
  border: 2px solid var(--color-text-tertiary);
  opacity: 0;
  transition: opacity 0.12s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

:deep(.node-shell:hover .shell-handle),
:deep(.shell-handle.connected),
:deep(.shell-handle.vue-flow__handle-connecting),
:deep(.shell-handle.vue-flow__handle-valid) {
  opacity: 1;
}

:deep(.shell-handle.connected) {
  background: var(--color-accent);
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 25%, transparent);
}

:deep(.shell-handle.vue-flow__handle-connecting) {
  background: #febc2e;
  border-color: #febc2e;
}

:deep(.shell-handle.vue-flow__handle-valid) {
  background: #28c840;
  border-color: #28c840;
}

/* branch longa encolhe com reticências (nome inteiro no title) antes de
   empurrar o status e os chips da direita pra fora do header */
.branch-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 140px;
  height: 18px;
  padding: 0 6px;
  border-radius: 5px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
}

.branch-chip svg {
  flex-shrink: 0;
}

.branch-chip.compact {
  height: 15px;
  padding: 0 4px;
  font-size: 9px;
}

.branch-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peer-count {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.usage-badge {
  position: absolute;
  right: 8px;
  z-index: 5;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  border: 1px solid var(--color-border);
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
  pointer-events: auto;
  cursor: default;
  user-select: none;
}

.usage-badge.warn {
  color: #d97706;
  border-color: #d97706;
}

.usage-badge.danger {
  color: #ef4444;
  border-color: #ef4444;
}

.agent-term {
  flex: 1;
  min-height: 0;
  padding: 6px;
  overflow: hidden;
}

/* cartão "Aguardando você" por cima da parte de baixo do terminal */
.approval-card {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 70%;
  padding: 10px 12px 12px;
  border: 1px solid color-mix(in srgb, var(--color-status-waiting) 55%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-status-waiting) 8%, var(--color-bg-surface));
  box-shadow: 0 10px 30px var(--color-shadow);
}

.approval-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.approval-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-status-waiting);
  animation: approval-pulse 1.4s ease-in-out infinite;
}

@keyframes approval-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-status-waiting) 60%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4px transparent;
  }
}

.approval-label {
  color: var(--color-status-waiting);
  font-size: 11px;
  font-weight: 700;
}

.approval-queue {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.approval-title {
  color: var(--color-text-primary);
  font-size: 12.5px;
  font-weight: 600;
}

.approval-detail {
  min-height: 0;
  max-height: 140px;
  margin: 0;
  padding: 6px 8px;
  overflow: auto;
  border-radius: 6px;
  background: var(--color-bg-app);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.approval-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.approval-btn {
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.approval-btn:hover {
  background: var(--color-hover);
}

.approval-btn.tone-primary {
  border-color: var(--color-status-waiting);
  background: var(--color-status-waiting);
  color: #1a1206;
}

.approval-btn.tone-primary:hover {
  filter: brightness(1.08);
}

.approval-btn.tone-danger {
  color: var(--color-status-error);
}

.approval-pop-enter-active,
.approval-pop-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.approval-pop-enter-from,
.approval-pop-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
