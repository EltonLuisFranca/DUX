<template>
  <div
    class="git-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <Handle id="left" type="target" :position="Position.Left" class="git-handle" />
    <Handle id="right" type="source" :position="Position.Right" class="git-handle" />

    <div class="git-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="status" />
      <span class="git-title">{{ data.name }}</span>
      <span class="git-branch" v-if="branch">{{ branch }}</span>
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
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
      </button>
    </div>

    <div class="git-body nodrag nowheel nopan">
      <div v-if="errorMessage" class="git-empty">{{ errorMessage }}</div>
      <div v-else-if="!loading && files.length === 0" class="git-empty">Working tree limpa.</div>
      <ul v-else class="file-list">
        <li
          v-for="file in files"
          :key="file.file"
          class="file-row"
          :class="{ active: selectedFile === file.file }"
          @click="selectedFile = selectedFile === file.file ? null : file.file"
        >
          <span class="file-status" :class="file.status">{{ statusLabel(file.status) }}</span>
          <span class="file-path">{{ file.file }}</span>
        </li>
      </ul>

      <pre v-if="selectedDiff" class="diff-view">{{ selectedDiff }}</pre>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path
          d="M13 3L3 13M13 8.5L8.5 13M13 13.5L13.5 13"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'
import { fetchGitStatus } from '../lib/bridgeClient'

const MIN_NODE_WIDTH = 320
const MIN_NODE_HEIGHT = 220
const POLL_INTERVAL_MS = 15_000

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { viewport } = useVueFlow()

const nodeWidth = ref(props.data.width || 420)
const nodeHeight = ref(props.data.height || 320)
const status = ref('connecting')
const branch = ref('')
const files = ref([])
const diffText = ref('')
const errorMessage = ref('')
const loading = ref(false)
const selectedFile = ref(null)

const STATUS_LABELS = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  unmerged: 'U',
  untracked: '?',
  unknown: '·'
}

function statusLabel(status) {
  return STATUS_LABELS[status] || '·'
}

// git diff HEAD já traz o diff de todos os arquivos concatenado — filtra pelo
// bloco do arquivo selecionado em vez de pedir um diff por arquivo ao bridge.
const selectedDiff = computed(() => {
  if (!selectedFile.value || !diffText.value) return ''
  const blocks = diffText.value.split(/(?=^diff --git )/m)
  const block = blocks.find((b) => b.includes(` b/${selectedFile.value}`))
  return block || ''
})

let pollTimer = null

async function refresh() {
  if (!props.data.path) {
    errorMessage.value = 'Nenhum diretório configurado.'
    status.value = 'offline'
    return
  }

  loading.value = true
  const result = await fetchGitStatus(props.data.path)
  loading.value = false

  if (!result.valid) {
    errorMessage.value = result.error || 'Não foi possível ler o repositório.'
    status.value = 'offline'
    files.value = []
    diffText.value = ''
    branch.value = ''
    return
  }

  errorMessage.value = ''
  status.value = 'online'
  branch.value = result.branch
  files.value = result.files
  diffText.value = result.diff
}

watch(
  () => props.data.path,
  () => refresh()
)

let resizeStartX = 0
let resizeStartY = 0
let resizeStartW = 0
let resizeStartH = 0

function startResize(event) {
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  resizeStartW = nodeWidth.value
  resizeStartH = nodeHeight.value
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', stopResize)
  event.preventDefault()
  event.stopPropagation()
}

function onResizeMove(event) {
  const zoom = viewport.value.zoom || 1
  const dx = (event.clientX - resizeStartX) / zoom
  const dy = (event.clientY - resizeStartY) / zoom
  nodeWidth.value = Math.max(MIN_NODE_WIDTH, Math.round(resizeStartW + dx))
  nodeHeight.value = Math.max(MIN_NODE_HEIGHT, Math.round(resizeStartH + dy))
}

function stopResize() {
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
  updateNodeData(props.id, { width: nodeWidth.value, height: nodeHeight.value })
}

onMounted(() => {
  refresh()
  pollTimer = setInterval(refresh, POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
})
</script>

<style scoped>
.git-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.git-node.selected {
  border-color: var(--selected-color);
}

.git-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
}

.git-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: 34px;
  padding: 0 10px;
  background: var(--color-bg-surface-alt);
  border-bottom: 1px solid var(--color-border);
  cursor: grab;
}

.git-header:active {
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

.git-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.git-branch {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-bg-surface);
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  font-family: 'Menlo', Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
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

.git-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.git-empty {
  padding: 16px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  text-align: center;
}

.file-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  flex-shrink: 0;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.file-row:hover {
  background: var(--color-hover);
}

.file-row.active {
  background: var(--color-hover);
}

.file-status {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  font-family: 'Menlo', Consolas, monospace;
}

.file-status.modified {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
}

.file-status.added,
.file-status.untracked {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.file-status.deleted {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.file-status.renamed,
.file-status.copied {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.file-status.unmerged {
  background: rgba(236, 72, 153, 0.15);
  color: #ec4899;
}

.file-path {
  font-size: 12px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.diff-view {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-app);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-family: 'Menlo', Consolas, monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
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

.git-node:hover .resize-handle {
  opacity: 1;
}
</style>
