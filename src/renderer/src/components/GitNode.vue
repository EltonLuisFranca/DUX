<template>
  <NodeShell
    :id="id"
    :data="data"
    :selected="selected"
    :resize="{ minWidth: 320, minHeight: 220, defaultWidth: 420, defaultHeight: 320 }"
    :title="data.name"
    :meta="repoLabel"
    :status="statusColor"
    accent="#22c55e"
  >
    <template #icon>
      <svg viewBox="0 0 20 20" width="12" height="12" v-html="GIT_ICON"></svg>
    </template>
    <template #headerMeta>
      <span v-if="branch" class="branch-chip" :class="{ compact: nodeStyleVariant === 'compact' }" :title="branchTitle">
        <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="5" cy="3.5" r="1.5" />
          <circle cx="5" cy="12.5" r="1.5" />
          <circle cx="11.5" cy="5.5" r="1.5" />
          <path d="M5 5v6M11.5 7c0 2.5-2 3-6.5 3.5" />
        </svg>
        <span class="branch-name">{{ branch }}</span>
        <span v-if="ahead" class="branch-sync">↑{{ ahead }}</span>
        <span v-if="behind" class="branch-sync">↓{{ behind }}</span>
      </span>
    </template>
    <template #headerActions>
      <span v-if="totals.added || totals.deleted" class="diffstat header-diffstat" title="Linhas alteradas no total">
        <span class="diff-add">+{{ totals.added }}</span>
        <span class="diff-del">−{{ totals.deleted }}</span>
      </span>
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
          <span v-if="file.added !== undefined" class="diffstat">
            <span v-if="file.added" class="diff-add">+{{ file.added }}</span>
            <span v-if="file.deleted" class="diff-del">−{{ file.deleted }}</span>
          </span>
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
import { nodeStyleVariant } from '../store/themeStore'

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
// commits à frente/atrás do remoto (null = branch sem upstream)
const ahead = ref(null)
const behind = ref(null)
const totals = ref({ added: 0, deleted: 0 })
const branchTitle = computed(() => {
  const parts = [`Branch: ${branch.value}`]
  if (ahead.value === null) parts.push('sem branch remota')
  else {
    if (ahead.value) parts.push(`${ahead.value} commit(s) pra enviar`)
    if (behind.value) parts.push(`${behind.value} commit(s) pra baixar`)
    if (!ahead.value && !behind.value) parts.push('em dia com o remoto')
  }
  return parts.join(' · ')
})
// só a última pasta do repositório (o caminho inteiro não cabe no header)
const repoLabel = computed(() => String(props.data.path || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '')
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
    ahead.value = null
    behind.value = null
    totals.value = { added: 0, deleted: 0 }
    return
  }

  errorMessage.value = ''
  status.value = 'online'
  branch.value = result.branch
  ahead.value = result.ahead ?? null
  behind.value = result.behind ?? null
  totals.value = result.totals || { added: 0, deleted: 0 }
  files.value = result.files
  diffText.value = result.diff
}

watch(
  () => props.data.path,
  () => refresh()
)

onMounted(() => {
  refresh()
  // pula o ciclo se a consulta anterior ainda não voltou (repo lento no /mnt/c)
  pollTimer = setInterval(() => {
    if (!loading.value) refresh()
  }, POLL_INTERVAL_MS)
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
  color: var(--color-accent);
}

.file-status.unmerged {
  background: rgba(236, 72, 153, 0.15);
  color: #ec4899;
}

.file-path {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* +N −M (por arquivo e total no header) */
.diffstat {
  display: inline-flex;
  gap: 6px;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.header-diffstat {
  margin-left: auto;
}

.diff-add {
  color: #22c55e;
}

.diff-del {
  color: #ef4444;
}

/* mesmo chip de branch do header dos terminais (WslClaudeTerminalNode) */
.branch-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 160px;
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

.branch-sync {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
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
