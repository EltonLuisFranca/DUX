<template>
  <div
    class="docker-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="docker-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="docker-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="docker-handle"
      :class="{ connected: isBottomConnected }"
    />

    <div class="docker-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="status" />
      <span class="docker-title">{{ data.name }}</span>
      <span class="docker-count" v-if="!errorMessage && containers.length">{{ containers.length }}</span>
      <button class="header-btn nodrag" title="Atualizar" @click="refresh">
        <svg viewBox="0 0 16 16" width="13" height="13" :class="{ spinning: loading }">
          <path
            d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button class="header-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <GearIcon />
      </button>
    </div>

    <div class="docker-body nodrag nowheel nopan">
      <div v-if="errorMessage" class="docker-empty">{{ errorMessage }}</div>
      <div v-else-if="!loading && containers.length === 0" class="docker-empty">Nenhum container encontrado.</div>
      <ul v-else class="container-list">
        <li v-for="c in containers" :key="c.ID" class="container-row">
          <div class="container-main" @click="toggleLogs(c)">
            <span class="container-state" :class="stateClass(c.State)" />
            <div class="container-info">
              <span class="container-name">{{ c.Names }}</span>
              <span class="container-meta">{{ c.Image }} · {{ c.Status }}</span>
            </div>
          </div>

          <div class="container-actions">
            <button
              v-if="c.State !== 'running'"
              class="action-btn nodrag"
              title="Start"
              :disabled="actionLoadingId === c.ID"
              @click="runAction(c, 'start')"
            >
              <PlayIcon />
            </button>
            <template v-else>
              <button
                class="action-btn nodrag"
                title="Restart"
                :disabled="actionLoadingId === c.ID"
                @click="runAction(c, 'restart')"
              >
                <RestartIcon />
              </button>
              <button
                class="action-btn nodrag"
                title="Stop"
                :disabled="actionLoadingId === c.ID"
                @click="runAction(c, 'stop')"
              >
                <StopIcon />
              </button>
            </template>
          </div>

          <pre v-if="expandedId === c.ID" class="logs-view">{{ logsLoading ? 'carregando...' : logsText }}</pre>
        </li>
      </ul>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import PlayIcon from './icons/PlayIcon.vue'
import StopIcon from './icons/StopIcon.vue'
import RestartIcon from './icons/RestartIcon.vue'
import NodeToolbar from './NodeToolbar.vue'
import { toggleNodeSettings } from '../store/flowStore'
import { fetchDockerContainers, runDockerAction, fetchDockerLogs } from '../lib/bridgeClient'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'

const POLL_INTERVAL_MS = 15_000

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')
const isBottomConnected = isHandleConnected('bottom')

const { nodeWidth, nodeHeight, startResize } = useNodeResize(props, {
  minWidth: 320,
  minHeight: 220,
  defaultWidth: 420,
  defaultHeight: 320
})

const status = ref('connecting')
const containers = ref([])
const errorMessage = ref('')
const loading = ref(false)
const actionLoadingId = ref(null)
const expandedId = ref(null)
const logsText = ref('')
const logsLoading = ref(false)

function stateClass(state) {
  if (state === 'running') return 'running'
  if (state === 'restarting') return 'warn'
  return 'stopped'
}

let pollTimer = null

async function refresh() {
  loading.value = true
  const result = await fetchDockerContainers(props.data.host)
  loading.value = false

  if (!result.valid) {
    errorMessage.value = result.error || 'Não foi possível falar com o docker.'
    status.value = 'offline'
    containers.value = []
    return
  }

  errorMessage.value = ''
  status.value = 'online'
  containers.value = result.containers || []
}

async function runAction(container, action) {
  actionLoadingId.value = container.ID
  const result = await runDockerAction(container.ID, action, props.data.host)
  actionLoadingId.value = null
  if (!result.ok) {
    errorMessage.value = result.error || `Falha ao executar "${action}".`
  }
  await refresh()
}

async function toggleLogs(container) {
  if (expandedId.value === container.ID) {
    expandedId.value = null
    return
  }
  expandedId.value = container.ID
  logsLoading.value = true
  const result = await fetchDockerLogs(container.ID, { tail: 200, host: props.data.host })
  logsLoading.value = false
  logsText.value = result.ok ? result.logs : result.error || 'Não foi possível ler os logs.'
}

watch(
  () => props.data.host,
  () => refresh()
)

onMounted(() => {
  refresh()
  pollTimer = setInterval(refresh, POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
})
</script>

<style scoped>
.docker-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.docker-node.selected {
  border-color: var(--selected-color);
}

.docker-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.docker-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.docker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: 34px;
  padding: 0 10px;
  background: var(--color-bg-surface-alt);
  border-bottom: 1px solid var(--color-border);
  border-radius: 9px 9px 0 0;
  cursor: grab;
}

.docker-header:active {
  cursor: grabbing;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
  flex-shrink: 0;
}

.status-dot.online {
  background: #22c55e;
}

.status-dot.offline {
  background: #ef4444;
}

.docker-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.docker-count {
  flex: 1;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-bg-surface);
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  font-family: 'Menlo', Consolas, monospace;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.header-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.spinning {
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.docker-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  border-radius: 0 0 9px 9px;
}

.docker-empty {
  padding: 16px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  text-align: center;
}

.container-list {
  list-style: none;
  margin: 0;
  padding: 6px;
}

.container-row {
  border-radius: 6px;
  padding: 2px;
}

.container-row:hover {
  background: var(--color-hover);
}

.container-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  cursor: pointer;
}

.container-state {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
}

.container-state.running {
  background: #22c55e;
}

.container-state.stopped {
  background: var(--color-text-tertiary);
}

.container-state.warn {
  background: #eab308;
}

.container-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.container-name {
  font-size: 12px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.container-meta {
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.container-actions {
  display: flex;
  gap: 4px;
  padding: 0 6px 4px 22px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.action-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.logs-view {
  margin: 4px 6px 6px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-bg-app);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-family: 'Menlo', Consolas, monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
  overflow-y: auto;
}

.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 3px;
  box-sizing: border-box;
  color: var(--color-text-tertiary);
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.docker-node:hover .resize-handle {
  opacity: 1;
}
</style>
