<template>
  <VueFlow
    class="fleet-canvas"
    v-model:nodes="workspace.nodes"
    v-model:edges="workspace.edges"
    :default-viewport="{ x: 0, y: 0, zoom: 1 }"
    :min-zoom="0.25"
    :max-zoom="2"
    :default-edge-options="{ type: edgeStyle }"
    :snap-to-grid="snapEnabled"
    :snap-grid="[SNAP_GRID_SIZE, SNAP_GRID_SIZE]"
    connection-mode="loose"
    @node-click="handleNodeClick"
    @dragover="handleDragOver"
    @drop="handleDrop"
    @connect="handleConnect"
    @edges-change="handleEdgesChange"
    @mousemove="handlePaneMouseMove"
  >
    <Background :gap="16" :color="dotColor" :variant="canvasVariant" />
    <Panel v-if="workspace.nodes.length === 0" position="top-left" class="empty-state-panel">
      <button class="empty-state" @click="openAddNodeModal">
        <svg viewBox="0 0 20 20" width="20" height="20">
          <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <span>Adicione um node para começar</span>
      </button>
    </Panel>
    <Panel position="bottom-center" class="bottom-toolbar-stack">
      <VoiceInputBadge />
      <ZoomControls />
    </Panel>

    <DuxSearch v-if="isActiveWorkspace" :workspace="workspace" />

    <template #node-wsl-claude-terminal="nodeProps">
      <WslClaudeTerminalNode v-bind="nodeProps" />
    </template>
    <template #node-claude-terminal="nodeProps">
      <WslClaudeTerminalNode v-bind="nodeProps" />
    </template>
    <template #node-codex-terminal="nodeProps">
      <WslClaudeTerminalNode v-bind="nodeProps" />
    </template>
    <template #node-notes="nodeProps">
      <NotesNode v-bind="nodeProps" />
    </template>
    <template #node-browser="nodeProps">
      <BrowserNode v-bind="nodeProps" />
    </template>
    <template #node-ollama="nodeProps">
      <OllamaNode v-bind="nodeProps" />
    </template>
    <template #node-git="nodeProps">
      <GitNode v-bind="nodeProps" />
    </template>
    <template #node-image="nodeProps">
      <ImageNode v-bind="nodeProps" />
    </template>
    <template #node-http="nodeProps">
      <HttpNode v-bind="nodeProps" />
    </template>
    <template #node-pomodoro="nodeProps">
      <PomodoroNode v-bind="nodeProps" />
    </template>

    <template #edge-default="edgeProps">
      <CustomEdge v-bind="edgeProps" />
    </template>
    <template #edge-smoothstep="edgeProps">
      <CustomEdge v-bind="edgeProps" />
    </template>
    <template #edge-step="edgeProps">
      <CustomEdge v-bind="edgeProps" />
    </template>
    <template #edge-straight="edgeProps">
      <CustomEdge v-bind="edgeProps" />
    </template>

    <template v-if="isRoomConnected && isActiveWorkspace">
      <RemoteCursor
        v-for="cursor in visibleRemoteCursors"
        :key="cursor.userId"
        :x="cursor.x"
        :y="cursor.y"
        :name="cursor.name"
        :color="cursor.color"
      />
      <div
        v-for="ghost in visibleGhostNodes"
        :key="ghost.id"
        class="ghost-node"
        :style="{ transform: `translate(${ghost.position.x}px, ${ghost.position.y}px)`, borderColor: ghost.color }"
      >
        <span class="ghost-node-owner" :style="{ background: ghost.color }">{{ ghost.ownerName }}</span>
        <span class="ghost-node-label">{{ ghost.label }}</span>
      </div>
    </template>
  </VueFlow>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { VueFlow, Panel, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import ZoomControls from './ZoomControls.vue'
import VoiceInputBadge from './VoiceInputBadge.vue'
import CustomEdge from './CustomEdge.vue'
import RemoteCursor from './RemoteCursor.vue'
import WslClaudeTerminalNode from './WslClaudeTerminalNode.vue'
import NotesNode from './NotesNode.vue'
import BrowserNode from './BrowserNode.vue'
import OllamaNode from './OllamaNode.vue'
import GitNode from './GitNode.vue'
import ImageNode from './ImageNode.vue'
import HttpNode from './HttpNode.vue'
import PomodoroNode from './PomodoroNode.vue'
import { theme, canvasVariant, edgeStyle, snapEnabled, SNAP_GRID_SIZE } from '../store/themeStore'
import { onNodeClicked, addNode, openAddNodeModal, activeWorkspaceId, setActiveTerminal, openSearch } from '../store/flowStore'
import DuxSearch from './DuxSearch.vue'
import { nodeTypeRegistry } from '../nodeTypes/registry'
import { linkAgents, unlinkAgents, linkNoteToAgent, unlinkNoteFromAgent } from '../lib/bridgeClient'
import { isRoomConnected, remoteCursors, remoteNodesByUser, sendCursorPosition, broadcastNodeSnapshot } from '../store/roomStore'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const TERMINAL_TYPES = ['wsl-claude-terminal', 'claude-terminal', 'codex-terminal']
const NOTE_TYPE = 'notes'

const props = defineProps({
  workspace: { type: Object, required: true }
})

const {
  project,
  vueFlowRef,
  findNode,
  getNodes,
  getSelectedNodes,
  addSelectedNodes,
  removeSelectedNodes,
  addEdges
} = useVueFlow()

const dotColor = computed(() => (theme.value === 'light' ? '#c4c4cc' : '#55555e'))

const isActiveWorkspace = computed(() => props.workspace.id === activeWorkspaceId.value)

const visibleRemoteCursors = computed(() =>
  Object.entries(remoteCursors.value).map(([userId, cursor]) => ({ userId, ...cursor }))
)

// Nodes de outros usuários da room, renderizados como camada somente-leitura
// por cima do canvas — nunca gravados em workspace.nodes (ver roomStore.js).
const visibleGhostNodes = computed(() => {
  const ghosts = []
  for (const remote of Object.values(remoteNodesByUser.value)) {
    for (const node of remote.nodes) {
      ghosts.push({
        id: `${remote.name}-${node.id}`,
        position: node.position,
        label: node.label,
        color: remote.color,
        ownerName: remote.name
      })
    }
  }
  return ghosts
})

function handlePaneMouseMove(event) {
  if (!isRoomConnected.value || !isActiveWorkspace.value || !vueFlowRef.value) return
  const bounds = vueFlowRef.value.getBoundingClientRect()
  const flowPos = project({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
  sendCursorPosition(flowPos.x, flowPos.y)
}

// Sinaliza os próprios nodes pros demais membros da room enquanto este
// workspace estiver ativo — debounced pra não disparar um whisper a cada
// tecla digitada num node de texto.
let nodeSnapshotTimer = null
watch(
  () => props.workspace.nodes,
  (nodes) => {
    if (!isRoomConnected.value || !isActiveWorkspace.value) return
    clearTimeout(nodeSnapshotTimer)
    nodeSnapshotTimer = setTimeout(() => broadcastNodeSnapshot(nodes), 1000)
  },
  { deep: true }
)

// default-edge-options só se aplica a edges novas (o vue-flow mantém o type
// já existente numa edge persistida) — pra trocar o estilo já em uso, precisa
// reescrever o type de cada edge do workspace explicitamente.
watch(edgeStyle, (style) => {
  for (const edge of props.workspace.edges) {
    edge.type = style
  }
})

function handleNodeClick({ node }) {
  const hasSettings = Boolean(nodeTypeRegistry[node.type]?.settingsComponent)
  onNodeClicked(node.id, hasSettings)
  if (TERMINAL_TYPES.includes(node.type)) setActiveTerminal(node.id)
}

function isTerminalNode(id) {
  return TERMINAL_TYPES.includes(findNode(id)?.type)
}

// dado um par (source, target) de uma edge nota<->terminal, em qualquer
// ordem, retorna { terminalId, notePath } — ou null se o par não for esse caso
function noteAgentPair(sourceId, targetId) {
  const sourceNode = findNode(sourceId)
  const targetNode = findNode(targetId)
  if (sourceNode?.type === NOTE_TYPE && isTerminalNode(targetId)) {
    return { terminalId: targetId, notePath: sourceNode.data.path }
  }
  if (targetNode?.type === NOTE_TYPE && isTerminalNode(sourceId)) {
    return { terminalId: sourceId, notePath: targetNode.data.path }
  }
  return null
}

function handleConnect(connection) {
  addEdges([connection])
  if (isTerminalNode(connection.source) && isTerminalNode(connection.target)) {
    linkAgents(connection.source, connection.target)
    return
  }
  const pair = noteAgentPair(connection.source, connection.target)
  if (pair) linkNoteToAgent(pair.terminalId, pair.notePath)
}

// Vue Flow só reporta edges removidas (drag pra fora, tecla delete, etc.) por
// aqui — não existe um evento "disconnect" dedicado
function handleEdgesChange(changes) {
  for (const change of changes) {
    if (change.type !== 'remove') continue
    const edge = props.workspace.edges.find((e) => e.id === change.id)
    if (!edge) continue
    if (isTerminalNode(edge.source) && isTerminalNode(edge.target)) {
      unlinkAgents(edge.source, edge.target)
      continue
    }
    const pair = noteAgentPair(edge.source, edge.target)
    if (pair) unlinkNoteFromAgent(pair.terminalId, pair.notePath)
  }
}

function handleDragOver(event) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

async function handleDrop(event) {
  event.preventDefault()
  const type = event.dataTransfer.getData('application/dux-node-type')
  const entry = nodeTypeRegistry[type]
  if (!entry || !vueFlowRef.value) return

  const bounds = vueFlowRef.value.getBoundingClientRect()
  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  })

  // await funciona tanto pra createData síncrono (pomodoro) quanto
  // assíncrono (notes: precisa perguntar ao bridge o path do arquivo criado
  // em ~/.dux/notes/ antes do node existir) — null sinaliza falha (ex: bridge
  // não conseguiu criar o arquivo), nesse caso não cria o node
  const data = await entry.createData()
  if (!data) return
  addNode(type, data, position, entry.defaultZIndex ?? 0)
}

function selectNextNode() {
  const nodes = getNodes.value
  if (!nodes.length) return
  const selected = getSelectedNodes.value
  const currentIndex = selected.length ? nodes.findIndex((n) => n.id === selected[0].id) : -1
  const nextNode = nodes[(currentIndex + 1) % nodes.length]
  removeSelectedNodes(selected)
  addSelectedNodes([nextNode])
}

// só o workspace ativo reage — como cada workspace tem seu próprio FleetCanvas
// montado em paralelo, sem essa checagem o atalho dispararia em todos de uma vez
function onKeydown(event) {
  if (props.workspace.id !== activeWorkspaceId.value) return

  if (event.ctrlKey && event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    selectNextNode()
  } else if (event.ctrlKey && event.key.toLowerCase() === 'p') {
    // captura antes do xterm.js pra abrir mesmo com o terminal focado, mesmo
    // padrão do Ctrl+N em AddNodeModal.vue
    event.preventDefault()
    event.stopPropagation()
    openSearch()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, { capture: true }))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, { capture: true })
  clearTimeout(nodeSnapshotTimer)
})
</script>

<style scoped>
.fleet-canvas {
  width: 100%;
  height: 100%;
  background: var(--color-bg-app);
}

.empty-state-panel {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.bottom-toolbar-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.ghost-node {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1.5px dashed;
  border-radius: 8px;
  background: var(--color-bg-surface-alt);
  opacity: 0.55;
  pointer-events: none;
  will-change: transform;
}

.ghost-node-owner {
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}

.ghost-node-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 28px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 12px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  pointer-events: auto;
}

.empty-state:hover {
  color: var(--color-text-primary);
  border-color: var(--color-text-tertiary);
  background: var(--color-hover);
}
</style>
