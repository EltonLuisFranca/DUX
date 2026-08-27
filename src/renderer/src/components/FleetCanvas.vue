<template>
  <VueFlow
    class="fleet-canvas"
    v-model:nodes="workspace.nodes"
    v-model:edges="workspace.edges"
    :default-viewport="{ x: 0, y: 0, zoom: 1 }"
    :min-zoom="0.25"
    :max-zoom="2"
    @node-click="handleNodeClick"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <Background :gap="16" :color="dotColor" />
    <Panel position="bottom-center">
      <ZoomControls />
    </Panel>

    <template #node-wsl-claude-terminal="nodeProps">
      <WslClaudeTerminalNode v-bind="nodeProps" />
    </template>
    <template #node-notes="nodeProps">
      <NotesNode v-bind="nodeProps" />
    </template>
  </VueFlow>
</template>

<script setup>
import { computed } from 'vue'
import { VueFlow, Panel, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import ZoomControls from './ZoomControls.vue'
import WslClaudeTerminalNode from './WslClaudeTerminalNode.vue'
import NotesNode from './NotesNode.vue'
import { theme } from '../store/themeStore'
import { onNodeClicked, addNode } from '../store/flowStore'
import { nodeTypeRegistry } from '../nodeTypes/registry'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

defineProps({
  workspace: { type: Object, required: true }
})

const { project, vueFlowRef } = useVueFlow()

const dotColor = computed(() => (theme.value === 'light' ? '#c4c4cc' : '#55555e'))

function handleNodeClick({ node }) {
  const hasSettings = Boolean(nodeTypeRegistry[node.type]?.settingsComponent)
  onNodeClicked(node.id, hasSettings)
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
</script>

<style scoped>
.fleet-canvas {
  width: 100%;
  height: 100%;
  background: var(--color-bg-app);
}
</style>
