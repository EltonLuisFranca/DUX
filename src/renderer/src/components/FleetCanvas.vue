<template>
  <VueFlow
    class="fleet-canvas"
    v-model:nodes="workspace.nodes"
    v-model:edges="workspace.edges"
    :default-viewport="{ x: 0, y: 0, zoom: 1 }"
    :min-zoom="0.25"
    :max-zoom="2"
    :default-edge-options="{ type: edgeStyle }"
    connection-mode="loose"
    @node-click="handleNodeClick"
    @dragover="handleDragOver"
    @drop="handleDrop"
    @connect="handleConnect"
    @edges-change="handleEdgesChange"
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
    <Panel position="bottom-center">
      <ZoomControls />
    </Panel>

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
  </VueFlow>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { VueFlow, Panel, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import ZoomControls from './ZoomControls.vue'
import WslClaudeTerminalNode from './WslClaudeTerminalNode.vue'
import NotesNode from './NotesNode.vue'
import BrowserNode from './BrowserNode.vue'
import OllamaNode from './OllamaNode.vue'
import { theme, canvasVariant, edgeStyle } from '../store/themeStore'
import { onNodeClicked, addNode, openAddNodeModal, activeWorkspaceId } from '../store/flowStore'
import { nodeTypeRegistry } from '../nodeTypes/registry'
import { linkAgents, unlinkAgents } from '../lib/bridgeClient'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const TERMINAL_TYPES = ['wsl-claude-terminal', 'claude-terminal', 'codex-terminal']

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
}

function isTerminalNode(id) {
  return TERMINAL_TYPES.includes(findNode(id)?.type)
}

function handleConnect(connection) {
  addEdges([connection])
  if (!isTerminalNode(connection.source) || !isTerminalNode(connection.target)) return
  linkAgents(connection.source, connection.target)
}

// Vue Flow só reporta edges removidas (drag pra fora, tecla delete, etc.) por
// aqui — não existe um evento "disconnect" dedicado
function handleEdgesChange(changes) {
  for (const change of changes) {
    if (change.type !== 'remove') continue
    const edge = props.workspace.edges.find((e) => e.id === change.id)
    if (edge && isTerminalNode(edge.source) && isTerminalNode(edge.target)) {
      unlinkAgents(edge.source, edge.target)
    }
  }
}

function handleDragOver(event) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

function handleDrop(event) {
  event.preventDefault()
  const type = event.dataTransfer.getData('application/dux-node-type')
  const entry = nodeTypeRegistry[type]
  if (!entry || !vueFlowRef.value) return

  const bounds = vueFlowRef.value.getBoundingClientRect()
  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  })

  addNode(type, entry.createData(), position, entry.defaultZIndex ?? 0)
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
  if (event.ctrlKey && event.key === 'Tab' && props.workspace.id === activeWorkspaceId.value) {
    event.preventDefault()
    event.stopPropagation()
    selectNextNode()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, { capture: true }))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, { capture: true }))
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
