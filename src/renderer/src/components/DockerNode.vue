<template>
  <NodeShell
    :id="id"
    :data="data"
    :selected="selected"
    :resize="{
      minWidth: 320,
      minHeight: 220,
      defaultWidth: 420,
      defaultHeight: 320
    }"
    :title="data.name"
    :meta="headerMeta"
    :status="statusColor"
    :status-pulse="status === 'connecting'"
  >
    <template #icon>
      <svg viewBox="0 0 20 20" width="12" height="12" v-html="DOCKER_ICON"></svg>
    </template>
    <template #headerActions>
      <button class="header-btn nodrag" title="Atualizar" :disabled="loading" @click="refresh">
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

    <div class="docker-body nodrag nowheel nopan">
      <!-- erro de conexão com o docker (daemon parado, host inalcançável…) -->
      <div v-if="errorMessage" class="docker-state">
        <svg class="docker-state-icon error" viewBox="0 0 24 24" width="22" height="22">
          <path
            d="M12 3.5 2.5 20h19L12 3.5zM12 10v4.5M12 17.2v.3"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="docker-state-title">Docker indisponível</span>
        <code class="docker-state-detail">{{ errorMessage }}</code>
        <span v-if="data.host" class="docker-state-hint">host: {{ data.host }}</span>
        <button class="state-btn" :disabled="loading" @click="refresh">
          {{ loading ? 'Tentando...' : 'Tentar de novo' }}
        </button>
      </div>

      <!-- primeira carga: skeleton em vez de corpo vazio -->
      <div v-else-if="!hasLoaded" class="skeleton-list">
        <div v-for="n in 4" :key="n" class="skeleton-row">
          <span class="skeleton-dot" />
          <div class="skeleton-lines">
            <span class="skeleton-line" :style="{ width: 40 + ((n * 17) % 35) + '%' }" />
            <span class="skeleton-line short" />
          </div>
        </div>
      </div>

      <div v-else-if="containers.length === 0" class="docker-state">
        <svg class="docker-state-icon" viewBox="0 0 20 20" width="22" height="22" v-html="DOCKER_ICON"></svg>
        <span class="docker-state-title">Nenhum container</span>
        <span class="docker-state-hint">Rode um <code>docker run</code> ou <code>docker compose up</code>.</span>
      </div>

      <template v-else>
        <div class="docker-toolbar">
          <div class="search-wrap">
            <svg class="search-icon" viewBox="0 0 16 16" width="11" height="11">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <input
              v-model="search"
              type="text"
              class="search-input"
              placeholder="Buscar container, imagem, projeto..."
              @keydown.esc="search = ''"
            />
            <button v-if="search" class="search-clear" title="Limpar busca" @click="search = ''">
              <svg viewBox="0 0 16 16" width="9" height="9">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <div class="segmented">
            <button
              v-for="opt in FILTER_OPTIONS"
              :key="opt.value"
              class="segment"
              :class="{ active: stateFilter === opt.value }"
              :title="opt.title"
              @click="setStateFilter(opt.value)"
            >
              <span v-if="opt.dot" class="segment-dot" :class="opt.dot" />
              {{ opt.label }}
              <span class="segment-count">{{ counts[opt.value] }}</span>
            </button>
          </div>
        </div>

        <Transition name="banner">
          <div v-if="actionError" class="action-error">
            <span class="action-error-text">
              <strong>{{ actionError.title }}</strong> {{ actionError.message }}
            </span>
            <button class="action-error-close" title="Dispensar" @click="dismissActionError">
              <svg viewBox="0 0 16 16" width="9" height="9">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        </Transition>

        <div v-if="groupedContainers.length === 0" class="docker-state compact">
          <span class="docker-state-hint">Nada corresponde ao filtro.</span>
          <button class="state-btn" @click="resetFilters">Limpar filtros</button>
        </div>

        <div v-else class="container-list">
          <div v-for="group in groupedContainers" :key="group.project || '__ungrouped__'" class="container-group">
            <div v-if="group.project" class="group-header" @click="toggleGroup(group.project)">
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
              <span class="group-name">{{ group.project }}</span>
              <span
                class="group-count"
                :class="{
                  partial: group.running > 0 && group.running < group.total
                }"
              >
                <span class="group-count-dot" :class="group.running ? 'running' : 'stopped'" />
                {{ group.running }}/{{ group.total }}
              </span>
              <div class="group-actions" @click.stop>
                <button
                  v-if="group.running < group.total"
                  class="action-btn"
                  title="Iniciar todos do projeto"
                  :disabled="isGroupPending(group)"
                  @click="runGroupAction(group, 'start')"
                >
                  <PlayIcon />
                </button>
                <button
                  v-if="group.running > 0"
                  class="action-btn"
                  title="Reiniciar todos do projeto"
                  :disabled="isGroupPending(group)"
                  @click="runGroupAction(group, 'restart')"
                >
                  <RestartIcon />
                </button>
                <button
                  v-if="group.running > 0"
                  class="action-btn danger"
                  title="Parar todos do projeto"
                  :disabled="isGroupPending(group)"
                  @click="runGroupAction(group, 'stop')"
                >
                  <StopIcon />
                </button>
              </div>
            </div>

            <ul
              v-show="!group.project || !isGroupCollapsed(group.project)"
              class="container-sublist"
              :class="{ 'container-sublist-grouped': group.project }"
            >
              <li
                v-for="c in group.containers"
                :key="c.ID"
                class="container-row"
                :class="{
                  pending: pendingActions[c.ID],
                  dimmed: !isRunningLike(c.State)
                }"
                title="Ver logs"
                @click="openLogs(c)"
              >
                <span
                  class="container-state"
                  :class="[
                    stateClass(c.State),
                    {
                      pulsing: pendingActions[c.ID] || c.State === 'restarting'
                    }
                  ]"
                />
                <div class="container-info">
                  <span class="container-name">{{ displayName(c, group.project) }}</span>
                  <span class="container-meta">
                    <template v-if="pendingActions[c.ID]">{{ PENDING_LABELS[pendingActions[c.ID]] }}</template>
                    <template v-else>{{ shortImage(c.Image) }} · {{ c.Status }}</template>
                  </span>
                </div>

                <div v-if="publishedPorts(c).length" class="container-ports">
                  <button
                    v-for="p in publishedPorts(c).slice(0, 2)"
                    :key="p.host"
                    class="port-chip"
                    :title="`Copiar localhost:${p.host} (→ ${p.container}/${p.proto})`"
                    @click.stop="copyPort(p.host)"
                  >
                    {{ copiedPort === p.host ? 'copiado' : ':' + p.host }}
                  </button>
                  <span v-if="publishedPorts(c).length > 2" class="port-more" :title="portsTitle(c)">
                    +{{ publishedPorts(c).length - 2 }}
                  </span>
                </div>

                <div class="container-actions" @click.stop>
                  <span v-if="pendingActions[c.ID]" class="row-spinner" />
                  <template v-else-if="!isRunningLike(c.State)">
                    <button class="action-btn" title="Iniciar" @click="runAction(c, 'start')">
                      <PlayIcon />
                    </button>
                  </template>
                  <template v-else>
                    <button class="action-btn" title="Reiniciar" @click="runAction(c, 'restart')">
                      <RestartIcon />
                    </button>
                    <button class="action-btn danger" title="Parar" @click="runAction(c, 'stop')">
                      <StopIcon />
                    </button>
                  </template>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </template>
    </div>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="logsContainer" class="logs-modal-backdrop" @mousedown.self="closeLogs">
          <div class="logs-modal nodrag nowheel nopan">
            <div class="logs-modal-header">
              <span
                class="container-state"
                :class="[stateClass(logsContainer.State), { pulsing: pendingActions[logsContainer.ID] }]"
              />
              <div class="logs-modal-title-group">
                <span class="logs-modal-title">{{ logsContainer.Names }}</span>
                <span class="logs-modal-subtitle">
                  <template v-if="pendingActions[logsContainer.ID]">
                    {{ PENDING_LABELS[pendingActions[logsContainer.ID]] }}
                  </template>
                  <template v-else>{{ logsContainer.Image }} · {{ logsContainer.Status }}</template>
                </span>
              </div>

              <div class="logs-modal-header-actions">
                <template v-if="!isRunningLike(logsContainer.State)">
                  <button
                    class="modal-action-btn"
                    :disabled="!!pendingActions[logsContainer.ID]"
                    @click="runAction(logsContainer, 'start')"
                  >
                    <PlayIcon /> Iniciar
                  </button>
                </template>
                <template v-else>
                  <button
                    class="modal-action-btn"
                    :disabled="!!pendingActions[logsContainer.ID]"
                    @click="runAction(logsContainer, 'restart')"
                  >
                    <RestartIcon /> Reiniciar
                  </button>
                  <button
                    class="modal-action-btn danger"
                    :disabled="!!pendingActions[logsContainer.ID]"
                    @click="runAction(logsContainer, 'stop')"
                  >
                    <StopIcon /> Parar
                  </button>
                </template>
                <span class="header-divider" />
                <button class="header-btn" title="Fechar (Esc)" @click="closeLogs">
                  <svg viewBox="0 0 16 16" width="14" height="14">
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="logs-modal-toolbar">
              <div class="search-wrap logs-search-wrap">
                <svg class="search-icon" viewBox="0 0 16 16" width="11" height="11">
                  <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
                  <path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
                <input
                  ref="logsSearchRef"
                  v-model="logsSearch"
                  type="text"
                  class="search-input"
                  placeholder="Filtrar log... (Ctrl+F)"
                  @keydown.esc.stop="onLogsSearchEsc"
                />
                <span v-if="logsSearch.trim()" class="search-count">{{ logLines.length }}</span>
              </div>
              <select
                v-model.number="logsTail"
                class="toolbar-select"
                title="Quantidade de linhas"
                @change="fetchLogs()"
              >
                <option v-for="t in TAIL_OPTIONS" :key="t" :value="t">{{ t }} linhas</option>
              </select>
              <button
                class="toolbar-btn"
                :class="{ active: logsAutoRefresh }"
                title="Atualizar automaticamente a cada 3s"
                @click="toggleLogsAutoRefresh"
              >
                <span class="live-dot" :class="{ on: logsAutoRefresh }" />
                Live
              </button>
              <button
                class="toolbar-btn icon-only"
                :class="{ active: logsWrap }"
                title="Quebrar linhas longas"
                @click="logsWrap = !logsWrap"
              >
                <svg viewBox="0 0 16 16" width="12" height="12">
                  <path
                    d="M2 4h12M2 8h9.5a2 2 0 0 1 0 4H8m0 0 1.5-1.5M8 12l1.5 1.5M2 12h3"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <button class="toolbar-btn icon-only" title="Copiar log visível" @click="copyLogs">
                <CheckIcon v-if="logsCopied" />
                <CopyIcon v-else />
              </button>
              <button class="toolbar-btn icon-only" title="Limpar log exibido" @click="clearLogsView">
                <svg viewBox="0 0 16 16" width="12" height="12">
                  <path
                    d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div class="logs-body-wrap">
              <div ref="logsBodyRef" class="logs-modal-body" :class="{ nowrap: !logsWrap }" @scroll="onLogsScroll">
                <div v-if="logsLoading && !logsText" class="logs-placeholder">carregando...</div>
                <div v-else-if="logsError" class="logs-placeholder error">
                  {{ logsError }}
                </div>
                <div v-else-if="!logLines.length" class="logs-placeholder">
                  {{ logsSearch.trim() ? 'nenhuma linha corresponde ao filtro' : '(sem saída)' }}
                </div>
                <template v-else>
                  <div v-for="(line, i) in logLines" :key="i" class="log-line" :class="line.level">
                    <template v-for="(part, j) in line.parts" :key="j">
                      <mark v-if="part.match">{{ part.text }}</mark>
                      <template v-else>{{ part.text }}</template>
                    </template>
                  </div>
                </template>
              </div>
              <Transition name="banner">
                <button v-if="!logsAutoScroll && logLines.length" class="jump-bottom" @click="jumpToBottom">
                  <svg viewBox="0 0 16 16" width="11" height="11">
                    <path
                      d="M8 3v10M4 9l4 4 4-4"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  Ir para o final
                </button>
              </Transition>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </NodeShell>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import NodeShell from './NodeShell.vue'
import { DOCKER_ICON } from '../nodeTypes/nodeIcons'
import PlayIcon from './icons/PlayIcon.vue'
import StopIcon from './icons/StopIcon.vue'
import RestartIcon from './icons/RestartIcon.vue'
import CopyIcon from './icons/CopyIcon.vue'
import CheckIcon from './icons/CheckIcon.vue'
import { fetchDockerContainers, runDockerAction, fetchDockerLogs } from '../lib/bridgeClient'
import { updateNodeData } from '../store/flowStore'

const POLL_INTERVAL_MS = 15_000

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const FILTER_OPTIONS = [
  { value: 'all', label: 'Todos', title: 'Todos os containers' },
  {
    value: 'running',
    label: 'Ativos',
    dot: 'running',
    title: 'Rodando ou reiniciando'
  },
  {
    value: 'stopped',
    label: 'Parados',
    dot: 'stopped',
    title: 'Parados, criados ou mortos'
  }
]

const PENDING_LABELS = {
  start: 'iniciando...',
  stop: 'parando...',
  restart: 'reiniciando...'
}

const ACTION_LABELS = { start: 'iniciar', stop: 'parar', restart: 'reiniciar' }

const status = ref('connecting')
const STATUS_COLORS = { online: '#22c55e', offline: '#ef4444' }
const statusColor = computed(() => STATUS_COLORS[status.value] || 'var(--color-text-tertiary)')
const containers = ref([])
const errorMessage = ref('')
const loading = ref(false)
const hasLoaded = ref(false)
// { [containerId]: 'start' | 'stop' | 'restart' } — permite várias ações em
// paralelo (ex: "parar todos" de um projeto compose) com feedback por linha
const pendingActions = ref({})
const actionError = ref(null)
const search = ref('')
const copiedPort = ref(null)
let actionErrorTimeout = null
let copiedPortTimeout = null

function isRunningLike(state) {
  return state === 'running' || state === 'restarting'
}

function stateClass(state) {
  if (state === 'running') return 'running'
  if (state === 'restarting') return 'warn'
  if (state === 'dead') return 'dead'
  return 'stopped'
}

const stateFilter = computed(() => props.data.stateFilter || 'all')

function setStateFilter(value) {
  updateNodeData(props.id, { stateFilter: value })
}

function resetFilters() {
  search.value = ''
  setStateFilter('all')
}

const counts = computed(() => {
  const running = containers.value.filter((c) => isRunningLike(c.State)).length
  return {
    all: containers.value.length,
    running,
    stopped: containers.value.length - running
  }
})

const headerMeta = computed(() => {
  if (errorMessage.value || !containers.value.length) return ''
  return `${counts.value.running}/${counts.value.all} ativos`
})

// Labels do `docker ps --format {{json .}}` vêm como uma única string
// "chave=valor,chave=valor,...", sem parsing pronto do CLI.
function parseLabel(labels, key) {
  if (!labels) return null
  for (const pair of labels.split(',')) {
    const idx = pair.indexOf('=')
    if (idx === -1) continue
    if (pair.slice(0, idx) === key) return pair.slice(idx + 1)
  }
  return null
}

// "0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp, 6379/tcp" → só as portas
// publicadas no host, sem repetir a mesma porta pra IPv4 e IPv6
function publishedPorts(c) {
  if (!c.Ports) return []
  const seen = new Map()
  for (const m of c.Ports.matchAll(/:(\d+)->(\d+)\/(\w+)/g)) {
    if (!seen.has(m[1])) seen.set(m[1], { host: m[1], container: m[2], proto: m[3] })
  }
  return [...seen.values()]
}

function portsTitle(c) {
  return publishedPorts(c)
    .map((p) => `:${p.host} → ${p.container}/${p.proto}`)
    .join('\n')
}

async function copyPort(port) {
  try {
    await navigator.clipboard.writeText(`localhost:${port}`)
    copiedPort.value = port
    clearTimeout(copiedPortTimeout)
    copiedPortTimeout = setTimeout(() => (copiedPort.value = null), 1200)
  } catch (err) {
    console.error('[docker-node] copy port failed', err)
  }
}

// dentro de um grupo compose o nome repete o projeto (ex: "meuapp-db-1"),
// então mostra só o serviço quando a label existir
function displayName(c, project) {
  if (!project) return c.Names
  return parseLabel(c.Labels, 'com.docker.compose.service') || c.Names
}

function shortImage(image) {
  if (!image) return ''
  if (/^sha256:/.test(image)) return image.slice(7, 19)
  return image.split('/').pop()
}

function matchesSearch(c, project) {
  const term = search.value.trim().toLowerCase()
  if (!term) return true
  return [c.Names, c.Image, project, c.Ports].some((v) => v && v.toLowerCase().includes(term))
}

function matchesState(c) {
  if (stateFilter.value === 'running') return isRunningLike(c.State)
  if (stateFilter.value === 'stopped') return !isRunningLike(c.State)
  return true
}

function byStateThenName(a, b) {
  const ra = isRunningLike(a.State) ? 0 : 1
  const rb = isRunningLike(b.State) ? 0 : 1
  return ra - rb || a.Names.localeCompare(b.Names)
}

const groupedContainers = computed(() => {
  const groups = new Map()
  for (const c of containers.value) {
    const project = parseLabel(c.Labels, 'com.docker.compose.project')
    const key = project || ''
    if (!groups.has(key)) groups.set(key, { project, all: [] })
    groups.get(key).all.push(c)
  }

  const result = []
  for (const { project, all } of groups.values()) {
    const visible = all.filter((c) => matchesState(c) && matchesSearch(c, project)).sort(byStateThenName)
    if (!visible.length) continue
    result.push({
      project,
      containers: visible,
      // contagem/ações do grupo valem pro projeto inteiro, não só o filtrado
      all,
      total: all.length,
      running: all.filter((c) => isRunningLike(c.State)).length
    })
  }

  return result.sort((a, b) => {
    if (!a.project) return 1
    if (!b.project) return -1
    return a.project.localeCompare(b.project)
  })
})

const collapsedGroups = computed(() => new Set(props.data.collapsedGroups || []))

function isGroupCollapsed(project) {
  // com busca ativa, expande tudo pra não esconder o que foi encontrado
  if (search.value.trim()) return false
  return collapsedGroups.value.has(project)
}

function toggleGroup(project) {
  const next = new Set(collapsedGroups.value)
  if (next.has(project)) next.delete(project)
  else next.add(project)
  updateNodeData(props.id, { collapsedGroups: [...next] })
}

let pollTimer = null

async function refresh() {
  loading.value = true
  const result = await fetchDockerContainers(props.data.host)
  loading.value = false
  hasLoaded.value = true

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

function setPending(ids, action) {
  const next = { ...pendingActions.value }
  for (const id of ids) {
    if (action) next[id] = action
    else delete next[id]
  }
  pendingActions.value = next
}

function showActionError(title, message) {
  actionError.value = { title, message }
  clearTimeout(actionErrorTimeout)
  actionErrorTimeout = setTimeout(dismissActionError, 8000)
}

function dismissActionError() {
  actionError.value = null
  clearTimeout(actionErrorTimeout)
}

async function runAction(container, action) {
  if (pendingActions.value[container.ID]) return
  setPending([container.ID], action)
  const result = await runDockerAction(container.ID, action, props.data.host)
  await refresh()
  setPending([container.ID], null)
  if (!result.ok) {
    showActionError(`Falha ao ${ACTION_LABELS[action]} ${container.Names}:`, result.error || 'erro desconhecido')
  }
}

function isGroupPending(group) {
  return group.all.some((c) => pendingActions.value[c.ID])
}

async function runGroupAction(group, action) {
  const targets = group.all.filter((c) => (action === 'start' ? !isRunningLike(c.State) : isRunningLike(c.State)))
  if (!targets.length) return
  const ids = targets.map((c) => c.ID)
  setPending(ids, action)
  const results = await Promise.all(targets.map((c) => runDockerAction(c.ID, action, props.data.host)))
  await refresh()
  setPending(ids, null)
  const failed = targets.filter((_, i) => !results[i].ok)
  if (failed.length) {
    showActionError(
      `Falha ao ${ACTION_LABELS[action]} ${failed.length} de ${targets.length} em ${group.project}:`,
      failed.map((c) => c.Names).join(', ')
    )
  }
}

// ---------------- logs ----------------

const LOGS_AUTO_REFRESH_MS = 3_000
const TAIL_OPTIONS = [200, 1000, 5000]
// docker logs devolve os códigos de cor ANSI crus do processo — sem isso o
// modal fica cheio de "[32m" no meio do texto
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g // eslint-disable-line no-control-regex
const ERROR_RE = /\b(error|err|fatal|panic|exception|critical|failed)\b/i
const WARN_RE = /\b(warn|warning)\b/i

const logsContainerId = ref(null)
const logsContainer = computed(() => containers.value.find((c) => c.ID === logsContainerId.value) || null)
const logsText = ref('')
const logsLoading = ref(false)
const logsError = ref('')
const logsSearch = ref('')
const logsTail = ref(200)
const logsAutoRefresh = ref(false)
const logsAutoScroll = ref(true)
const logsWrap = ref(true)
const logsCopied = ref(false)
const logsBodyRef = ref(null)
const logsSearchRef = ref(null)
let logsRefreshTimer = null
let logsCopiedTimeout = null

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const logLines = computed(() => {
  if (!logsText.value) return []
  const term = logsSearch.value.trim()
  const lines = logsText.value.replace(/\n$/, '').split('\n')
  const filtered = term ? lines.filter((l) => l.toLowerCase().includes(term.toLowerCase())) : lines
  const splitRe = term ? new RegExp(`(${escapeRegExp(term)})`, 'gi') : null
  return filtered.map((text) => ({
    level: ERROR_RE.test(text) ? 'error' : WARN_RE.test(text) ? 'warn' : '',
    parts: splitRe
      ? text
          .split(splitRe)
          .filter(Boolean)
          .map((t) => ({
            text: t,
            match: t.toLowerCase() === term.toLowerCase()
          }))
      : [{ text, match: false }]
  }))
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
  const result = await fetchDockerLogs(containerId, {
    tail: logsTail.value,
    host: props.data.host
  })
  if (!silent) logsLoading.value = false
  // o modal pode ter sido fechado (ou trocado de container) enquanto a busca estava em andamento
  if (logsContainerId.value !== containerId) return
  logsText.value = result.ok ? result.logs.replace(ANSI_RE, '') : ''
  logsError.value = result.ok ? '' : result.error || 'Não foi possível ler os logs.'
  if (logsAutoScroll.value) scrollLogsToBottom()
}

function scrollLogsToBottom() {
  nextTick(() => {
    if (logsBodyRef.value) logsBodyRef.value.scrollTop = logsBodyRef.value.scrollHeight
  })
}

function jumpToBottom() {
  logsAutoScroll.value = true
  scrollLogsToBottom()
}

function onLogsScroll() {
  if (!logsBodyRef.value) return
  const el = logsBodyRef.value
  logsAutoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}

function onLogsSearchEsc() {
  if (logsSearch.value) logsSearch.value = ''
  else closeLogs()
}

function toggleLogsAutoRefresh() {
  logsAutoRefresh.value = !logsAutoRefresh.value
  if (logsAutoRefresh.value) {
    logsAutoScroll.value = true
    fetchLogs({ silent: true })
    startLogsAutoRefresh()
  } else stopLogsAutoRefresh()
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
    await navigator.clipboard.writeText(logLines.value.map((l) => l.parts.map((p) => p.text).join('')).join('\n'))
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
  if (!logsContainerId.value) return
  if (e.key === 'Escape') closeLogs()
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    logsSearchRef.value?.focus()
    logsSearchRef.value?.select()
  }
}

// filtrar muda a altura do conteúdo — mantém colado no final se estava
watch(logsSearch, () => {
  if (logsAutoScroll.value) scrollLogsToBottom()
})

// se o container some da lista (ex: removido) enquanto o modal está aberto, fecha sozinho
watch(logsContainer, (val, oldVal) => {
  if (!val && oldVal && logsContainerId.value) closeLogs()
})

watch(
  () => props.data.host,
  () => {
    hasLoaded.value = false
    status.value = 'connecting'
    refresh()
  }
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
  clearTimeout(actionErrorTimeout)
  clearTimeout(copiedPortTimeout)
  window.removeEventListener('keydown', onKeydown)
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

.header-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.header-btn:disabled {
  cursor: default;
}

.spinning {
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.docker-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* ---- estados vazios / erro ---- */
.docker-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px 16px;
  text-align: center;
}

.docker-state.compact {
  flex: 0;
  padding: 18px 16px;
}

.docker-state-icon {
  margin-bottom: 4px;
  color: var(--color-text-tertiary);
  opacity: 0.7;
}

.docker-state-icon.error {
  color: #ef4444;
  opacity: 1;
}

.docker-state-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.docker-state-detail {
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  font-family: 'Menlo', Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.4;
  word-break: break-word;
}

.docker-state-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.docker-state-hint code {
  font-family: 'Menlo', Consolas, monospace;
  font-size: 10.5px;
}

.state-btn {
  margin-top: 6px;
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-primary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.state-btn:hover:not(:disabled) {
  background: var(--color-hover);
}

.state-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

/* ---- skeleton ---- */
.skeleton-list {
  padding: 10px;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 6px;
}

.skeleton-dot,
.skeleton-line {
  background: var(--color-bg-surface-raised);
  animation: pulse 1.2s ease-in-out infinite;
}

.skeleton-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.skeleton-line {
  height: 8px;
  border-radius: 4px;
}

.skeleton-line.short {
  width: 30%;
  height: 6px;
}

/* ---- toolbar (busca + filtro de estado) ---- */
.docker-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px 6px;
  background: var(--color-bg-surface);
}

.search-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 8px;
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 26px;
  padding: 0 24px 0 25px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 11.5px;
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.search-input:focus {
  outline: none;
  border-color: var(--selected-color, #3b82f6);
}

.search-clear {
  position: absolute;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.search-clear:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.segmented {
  display: flex;
  flex-shrink: 0;
  padding: 2px;
  gap: 2px;
  border-radius: 7px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border);
}

.segment {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 7px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.segment:hover {
  color: var(--color-text-primary);
}

.segment.active {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-primary);
  box-shadow: 0 1px 2px var(--color-shadow);
}

.segment-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.segment-dot.running {
  background: #22c55e;
}

.segment-dot.stopped {
  background: var(--color-text-tertiary);
}

.segment-count {
  font-family: 'Menlo', Consolas, monospace;
  font-size: 9.5px;
  opacity: 0.75;
}

/* ---- banner de erro de ação ---- */
.action-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 8px 4px;
  padding: 6px 6px 6px 9px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
  background: color-mix(in srgb, #ef4444 10%, transparent);
  color: var(--color-text-primary);
  font-size: 11px;
  line-height: 1.4;
}

.action-error-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.action-error-text strong {
  font-weight: 600;
  color: #ef4444;
}

.action-error-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.action-error-close:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.banner-enter-active,
.banner-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ---- lista ---- */
.container-list {
  padding: 0 6px 8px;
}

.container-group + .container-group {
  margin-top: 4px;
}

.group-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 6px;
  border-radius: 6px;
  color: var(--color-text-primary);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

.group-header:hover {
  background: var(--color-hover);
}

.group-chevron {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  transition: transform 0.12s ease;
  transform: rotate(90deg);
}

.group-chevron.collapsed {
  transform: rotate(0deg);
}

.group-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-count {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 500;
  font-family: 'Menlo', Consolas, monospace;
}

.group-count-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.group-count-dot.running {
  background: #22c55e;
}

.group-count.partial .group-count-dot.running {
  background: #eab308;
}

.group-count-dot.stopped {
  background: var(--color-text-tertiary);
}

.group-actions {
  display: none;
  gap: 3px;
}

.group-header:hover .group-actions {
  display: flex;
}

.group-header:hover .group-count {
  display: none;
}

.container-sublist {
  list-style: none;
  margin: 0;
  padding: 0;
}

.container-sublist-grouped {
  position: relative;
  margin-left: 11px;
  padding-left: 6px;
  border-left: 1px solid var(--color-border);
}

.container-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 3px 6px;
  border-radius: 6px;
  cursor: pointer;
}

.container-row:hover {
  background: var(--color-hover);
}

.container-row.dimmed .container-name {
  color: var(--color-text-secondary);
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
  box-shadow: 0 0 0 2px color-mix(in srgb, #22c55e 22%, transparent);
}

.container-state.stopped {
  background: transparent;
  border: 1.5px solid var(--color-text-tertiary);
  box-sizing: border-box;
}

.container-state.dead {
  background: #ef4444;
}

.container-state.warn {
  background: #eab308;
}

.container-state.pulsing {
  animation: pulse 0.9s ease-in-out infinite;
}

.container-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.container-name {
  font-size: 12px;
  font-weight: 500;
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

.container-row.pending .container-meta {
  color: var(--color-text-secondary);
  font-style: italic;
}

.container-ports {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.port-chip {
  height: 18px;
  padding: 0 5px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  font-family: 'Menlo', Consolas, monospace;
  font-size: 9.5px;
  cursor: pointer;
}

.port-chip:hover {
  border-color: var(--selected-color, #3b82f6);
  color: var(--color-text-primary);
}

.port-more {
  font-size: 9.5px;
  color: var(--color-text-tertiary);
}

/* ações ficam fora do fluxo até o hover: a linha fica com uma altura só
   e o nome ganha a largura toda */
.container-actions {
  display: none;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.container-row:hover .container-actions,
.container-row.pending .container-actions {
  display: flex;
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

.action-btn:hover:not(:disabled) {
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.action-btn.danger:hover:not(:disabled) {
  color: #ef4444;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.row-spinner {
  width: 12px;
  height: 12px;
  margin: 0 5px;
  border: 1.5px solid var(--color-border-strong);
  border-top-color: var(--color-text-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* ---- modal de logs ---- */
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
  width: 860px;
  max-width: calc(100vw - 32px);
  height: 620px;
  max-height: calc(100vh - 64px);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 16px 48px var(--color-shadow);
  cursor: default;
  overflow: hidden;
}

.logs-modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  height: 48px;
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
  font-size: 13px;
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

.modal-action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.modal-action-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.modal-action-btn.danger:hover:not(:disabled) {
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 40%, transparent);
}

.modal-action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.header-divider {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: var(--color-border);
}

.logs-modal-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
}

.logs-search-wrap .search-input {
  padding-right: 40px;
}

.search-count {
  position: absolute;
  right: 8px;
  color: var(--color-text-tertiary);
  font-family: 'Menlo', Consolas, monospace;
  font-size: 10px;
  pointer-events: none;
}

.toolbar-select {
  height: 26px;
  padding: 0 6px;
  border: none;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.toolbar-select:focus {
  outline: none;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
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

.toolbar-btn.icon-only {
  width: 26px;
  padding: 0;
}

.toolbar-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.toolbar-btn.active {
  background: color-mix(in srgb, var(--selected-color, #3b82f6) 18%, transparent);
  color: var(--color-text-primary);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
}

.live-dot.on {
  background: #ef4444;
  animation: pulse 1.2s ease-in-out infinite;
}

.logs-body-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

.logs-modal-body {
  flex: 1;
  min-width: 0;
  padding: 8px 0;
  overflow: auto;
  background: var(--color-bg-app);
  color: var(--color-text-secondary);
  font-size: 11.5px;
  font-family: 'Menlo', Consolas, monospace;
  line-height: 1.55;
}

.log-line {
  padding: 0 14px;
  white-space: pre-wrap;
  word-break: break-word;
  border-left: 2px solid transparent;
}

.logs-modal-body.nowrap .log-line {
  width: max-content;
  min-width: 100%;
  box-sizing: border-box;
  white-space: pre;
}

.log-line:hover {
  background: var(--color-hover);
}

.log-line.error {
  color: #f87171;
  border-left-color: #ef4444;
  background: color-mix(in srgb, #ef4444 6%, transparent);
}

.log-line.warn {
  color: #eab308;
  border-left-color: #eab308;
}

.log-line mark {
  border-radius: 2px;
  background: color-mix(in srgb, #eab308 45%, transparent);
  color: var(--color-text-primary);
}

.logs-placeholder {
  padding: 4px 14px;
  color: var(--color-text-tertiary);
}

.logs-placeholder.error {
  color: #f87171;
}

.jump-bottom {
  position: absolute;
  right: 16px;
  bottom: 14px;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11px;
  box-shadow: 0 4px 14px var(--color-shadow);
  cursor: pointer;
}

.jump-bottom:hover {
  background: var(--color-hover);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.15s ease;
}

.modal-fade-enter-active .logs-modal,
.modal-fade-leave-active .logs-modal {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
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
</style>
