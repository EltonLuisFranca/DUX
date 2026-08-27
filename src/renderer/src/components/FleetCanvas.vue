<template>
  <VueFlow
    class="fleet-canvas"
    v-model:nodes="workspace.nodes"
    v-model:edges="workspace.edges"
    :default-viewport="{ x: 0, y: 0, zoom: 1 }"
    :min-zoom="0.25"
    :max-zoom="2"
    @node-click="handleNodeClick"
  >
    <Background :gap="16" :color="dotColor" />
    <Panel position="bottom-center">
      <ZoomControls />
    </Panel>

    <template #node-wsl-claude-terminal="nodeProps">
      <WslClaudeTerminalNode v-bind="nodeProps" />
    </template>
  </VueFlow>
</template>

<script setup>
import { computed } from 'vue'
import { VueFlow, Panel } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import ZoomControls from './ZoomControls.vue'
import WslClaudeTerminalNode from './WslClaudeTerminalNode.vue'
import { theme } from '../store/themeStore'
import { onNodeClicked } from '../store/flowStore'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

defineProps({
  workspace: { type: Object, required: true }
})

const dotColor = computed(() => (theme.value === 'light' ? '#c4c4cc' : '#55555e'))

function handleNodeClick({ node }) {
  onNodeClicked(node.id)
}
</script>

<style scoped>
.fleet-canvas {
  width: 100%;
  height: 100%;
  background: var(--color-bg-app);
}
</style>
