<template>
  <NodeShell
    :id="id"
    :data="data"
    :selected="selected"
    :resize="{ minWidth: 320, minHeight: 220, defaultWidth: 420, defaultHeight: 320 }"
    :title="data.name"
    :meta="branch"
    :status="statusColor"
  >
    <template #icon>
      <svg viewBox="0 0 20 20" width="12" height="12" v-html="GIT_ICON"></svg>
    </template>
    <template #headerActions>
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
    </template>

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

  </NodeShell>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import NodeShell from './NodeShell.vue'
import { GIT_ICON } from '../nodeTypes/nodeIcons'
import { updateNodeData } from '../store/flowStore'
import { fetchGitStatus } from '../lib/bridgeClient'

const POLL_INTERVAL_MS = 15_000

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const status = ref('connecting')
const STATUS_COLORS = { online: '#22c55e', offline: '#ef4444' }
const statusColor = computed(() => STATUS_COLORS[status.value] || 'var(--color-text-tertiary)')
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

onMounted(() => {
  refresh()
  pollTimer = setInterval(refresh, POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
})
</script>

<style scoped>
:deep(.shell-header) {
  cursor: grab;
}

:deep(.shell-header:active) {
  cursor: grabbing;
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

</style>
