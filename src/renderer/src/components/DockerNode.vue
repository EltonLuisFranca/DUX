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
      <div v-else class="container-list">
        <div v-for="group in groupedContainers" :key="group.project || '__ungrouped__'" class="container-group">
          <button
            v-if="group.project"
            type="button"
            class="group-header nodrag"
            @click="toggleGroup(group.project)"
          >
            <svg
              class="group-chevron"
              :class="{ collapsed: isGroupCollapsed(group.project) }"
              viewBox="0 0 16 16"
              width="10"
              height="10"
            >
              <path
                d="M5 3l5 5-5 5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <svg class="group-icon" viewBox="0 0 16 16" width="12" height="12">
              <path
                d="M1.5 4.5a1 1 0 0 1 1-1h3.4l1.1 1.4h6.5a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
            </svg>
            <span class="group-name">{{ group.project }}</span>
            <span class="group-count">{{ group.containers.length }}</span>
          </button>

          <ul
            v-show="!group.project || !isGroupCollapsed(group.project)"
            class="container-sublist"
            :class="{ 'container-sublist-grouped': group.project }"
          >
            <li v-for="c in group.containers" :key="c.ID" class="container-row">
              <div class="container-main" @click="openLogs(c)">
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
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="logsContainer" class="logs-modal-backdrop" @mousedown.self="closeLogs">
          <div class="logs-modal nodrag nowheel nopan">
            <div class="logs-modal-header">
              <span class="container-state" :class="stateClass(logsContainer.State)" />
              <div class="logs-modal-title-group">
                <span class="logs-modal-title">{{ logsContainer.Names }}</span>
                <span class="logs-modal-subtitle">{{ logsContainer.Image }} · {{ logsContainer.Status }}</span>
              </div>

              <div class="logs-modal-header-actions">
                <button
                  v-if="logsContainer.State !== 'running'"
                  class="header-btn"
                  title="Start"
                  :disabled="actionLoadingId === logsContainer.ID"
                  @click="runAction(logsContainer, 'start')"
                >
                  <PlayIcon />
                </button>
                <template v-else>
                  <button
                    class="header-btn"
                    title="Restart"
                    :disabled="actionLoadingId === logsContainer.ID"
                    @click="runAction(logsContainer, 'restart')"
                  >
                    <RestartIcon />
                  </button>
                  <button
                    class="header-btn"
                    title="Stop"
                    :disabled="actionLoadingId === logsContainer.ID"
                    @click="runAction(logsContainer, 'stop')"
                  >
                    <StopIcon />
                  </button>
                </template>
                <button class="header-btn" title="Fechar (Esc)" @click="closeLogs">
                  <svg viewBox="0 0 16 16" width="16" height="16">
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="logs-modal-toolbar">
              <input v-model="logsSearch" type="text" class="logs-search" placeholder="Filtrar log..." />
              <button
                class="toolbar-btn"
                :class="{ active: logsAutoRefresh }"
                title="Atualizar automaticamente a cada 3s"
                @click="toggleLogsAutoRefresh"
              >
                <svg viewBox="0 0 16 16" width="12" height="12">
                  <path
                    d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                Live
              </button>
              <button
                class="toolbar-btn"
                :class="{ active: logsAutoScroll }"
                title="Manter rolagem no final"
                @click="logsAutoScroll = !logsAutoScroll"
              >
                Auto-scroll
              </button>
              <button class="toolbar-btn" title="Copiar log para a área de transferência" @click="copyLogs">
                <CheckIcon v-if="logsCopied" />
                <CopyIcon v-else />
                Copiar
              </button>
              <button class="toolbar-btn" title="Limpar log exibido" @click="clearLogsView">Limpar</button>
            </div>

            <pre ref="logsBodyRef" class="logs-modal-body" @scroll="onLogsScroll">{{
              logsLoading ? 'carregando...' : logsError || filteredLogsText || '(sem saída)'
            }}</pre>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import PlayIcon from './icons/PlayIcon.vue'
import StopIcon from './icons/StopIcon.vue'
import RestartIcon from './icons/RestartIcon.vue'
import CopyIcon from './icons/CopyIcon.vue'
import CheckIcon from './icons/CheckIcon.vue'
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

function stateClass(state) {
  if (state === 'running') return 'running'
  if (state === 'restarting') return 'warn'
  return 'stopped'
}

// Labels do `docker ps --format {{json .}}` vêm como uma única string
// "chave=valor,chave=valor,...", sem parsing pronto do CLI.
function parseComposeProject(labels) {
  if (!labels) return null
  for (const pair of labels.split(',')) {
    const idx = pair.indexOf('=')
    if (idx === -1) continue
    if (pair.slice(0, idx) === 'com.docker.compose.project') {
      return pair.slice(idx + 1)
    }
  }
  return null
}

const groupedContainers = computed(() => {
  const groups = new Map()
  const ungrouped = []
  for (const c of containers.value) {
    const project = parseComposeProject(c.Labels)
    if (project) {
      if (!groups.has(project)) groups.set(project, [])
      groups.get(project).push(c)
    } else {
      ungrouped.push(c)
    }
  }
  const result = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([project, items]) => ({ project, containers: items }))
  if (ungrouped.length) result.push({ project: null, containers: ungrouped })
  return result
})

const collapsedGroups = ref(new Set())

function isGroupCollapsed(project) {
  return collapsedGroups.value.has(project)
}

function toggleGroup(project) {
  const next = new Set(collapsedGroups.value)
  if (next.has(project)) next.delete(project)
  else next.add(project)
  collapsedGroups.value = next
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

const LOGS_AUTO_REFRESH_MS = 3_000

const logsContainerId = ref(null)
const logsContainer = computed(() => containers.value.find((c) => c.ID === logsContainerId.value) || null)
const logsText = ref('')
const logsLoading = ref(false)
const logsError = ref('')
const logsSearch = ref('')
const logsAutoRefresh = ref(false)
const logsAutoScroll = ref(true)
const logsCopied = ref(false)
const logsBodyRef = ref(null)
let logsRefreshTimer = null
let logsCopiedTimeout = null

const filteredLogsText = computed(() => {
  if (!logsSearch.value.trim()) return logsText.value
  const term = logsSearch.value.toLowerCase()
  return logsText.value
    .split('\n')
    .filter((line) => line.toLowerCase().includes(term))
    .join('\n')
})

function openLogs(container) {
  logsContainerId.value = container.ID
  logsSearch.value = ''
  logsAutoScroll.value = true
  fetchLogs()
}

function closeLogs() {
  logsContainerId.value = null
  logsText.value = ''
  logsError.value = ''
  logsAutoRefresh.value = false
  stopLogsAutoRefresh()
}

async function fetchLogs({ silent = false } = {}) {
  if (!logsContainerId.value) return
  const containerId = logsContainerId.value
  if (!silent) logsLoading.value = true
  const result = await fetchDockerLogs(containerId, { tail: 200, host: props.data.host })
  if (!silent) logsLoading.value = false
  // o modal pode ter sido fechado (ou trocado de container) enquanto a busca estava em andamento
  if (logsContainerId.value !== containerId) return
  logsText.value = result.ok ? result.logs : ''
  logsError.value = result.ok ? '' : result.error || 'Não foi possível ler os logs.'
  if (logsAutoScroll.value) scrollLogsToBottom()
}

function scrollLogsToBottom() {
  nextTick(() => {
    if (logsBodyRef.value) logsBodyRef.value.scrollTop = logsBodyRef.value.scrollHeight
  })
}

function onLogsScroll() {
  if (!logsBodyRef.value) return
  const el = logsBodyRef.value
  logsAutoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}

function toggleLogsAutoRefresh() {
  logsAutoRefresh.value = !logsAutoRefresh.value
  if (logsAutoRefresh.value) startLogsAutoRefresh()
  else stopLogsAutoRefresh()
}

function startLogsAutoRefresh() {
  stopLogsAutoRefresh()
  logsRefreshTimer = setInterval(() => fetchLogs({ silent: true }), LOGS_AUTO_REFRESH_MS)
}

function stopLogsAutoRefresh() {
  if (logsRefreshTimer) {
    clearInterval(logsRefreshTimer)
    logsRefreshTimer = null
  }
}

function clearLogsView() {
  logsText.value = ''
}

async function copyLogs() {
  try {
    await navigator.clipboard.writeText(filteredLogsText.value)
    logsCopied.value = true
    clearTimeout(logsCopiedTimeout)
    logsCopiedTimeout = setTimeout(() => {
      logsCopied.value = false
    }, 1500)
  } catch (err) {
    console.error('[docker-node] copy failed', err)
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && logsContainerId.value) closeLogs()
}

// se o container some da lista (ex: removido) enquanto o modal está aberto, fecha sozinho
watch(logsContainer, (val, oldVal) => {
  if (!val && oldVal && logsContainerId.value) closeLogs()
})

watch(
  () => props.data.host,
  () => refresh()
)

onMounted(() => {
  refresh()
  pollTimer = setInterval(refresh, POLL_INTERVAL_MS)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
  stopLogsAutoRefresh()
  clearTimeout(logsCopiedTimeout)
  window.removeEventListener('keydown', onKeydown)
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
  padding: 6px;
}

.container-group + .container-group {
  margin-top: 2px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 11.5px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.group-header:hover {
  background: var(--color-hover);
}

.group-chevron {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  transition: transform 0.12s ease;
}

.group-chevron.collapsed {
  transform: rotate(-90deg);
}

.group-icon {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.group-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-count {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 500;
  font-family: 'Menlo', Consolas, monospace;
}

.container-sublist {
  list-style: none;
  margin: 0;
  padding: 0;
}

.container-sublist-grouped .container-main {
  padding-left: 22px;
}

.container-sublist-grouped .container-actions {
  padding-left: 36px;
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

.logs-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.logs-modal {
  display: flex;
  flex-direction: column;
  width: 720px;
  max-width: calc(100vw - 32px);
  height: 560px;
  max-height: calc(100vh - 64px);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 16px 48px var(--color-shadow);
  cursor: default;
}

.logs-modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: 44px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--color-border);
}

.logs-modal-title-group {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.logs-modal-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logs-modal-subtitle {
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logs-modal-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.logs-modal-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
}

.logs-search {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 11.5px;
}

.logs-search:focus {
  outline: none;
  border-color: var(--selected-color, #3b82f6);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.toolbar-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.toolbar-btn.active {
  background: var(--selected-color, #3b82f6);
  color: #fff;
}

.logs-modal-body {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 14px;
  overflow: auto;
  background: var(--color-bg-app);
  color: var(--color-text-secondary);
  font-size: 11.5px;
  font-family: 'Menlo', Consolas, monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 0 0 9px 9px;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.15s ease;
}

.modal-fade-enter-active .logs-modal,
.modal-fade-leave-active .logs-modal {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .logs-modal,
.modal-fade-leave-to .logs-modal {
  opacity: 0;
  transform: scale(0.96) translateY(6px);
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
