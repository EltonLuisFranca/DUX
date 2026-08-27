<template>
  <VueFlow
    class="fleet-canvas"
    v-model:nodes="nodes"
    v-model:edges="edges"
    :default-viewport="{ zoom: 1 }"
    :min-zoom="0.25"
    :max-zoom="2"
    fit-view-on-init
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
import { nodes, edges } from '../store/flowStore'
import { theme } from '../store/themeStore'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const dotColor = computed(() => (theme.value === 'light' ? '#c4c4cc' : '#55555e'))
</script>

<style scoped>
.fleet-canvas {
  width: 100%;
  height: 100%;
  background: var(--color-bg-app);
}
</style>
