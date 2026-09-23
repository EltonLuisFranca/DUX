<template>
  <div
    class="df-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="df-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="df-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="df-handle"
      :class="{ connected: isBottomConnected }"
    />

    <div class="df-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="statusDotClass" />
      <span class="df-title">{{ data.name }}</span>
      <button class="header-btn nodrag" title="Log completo da varredura" @click="showLogModal = true">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>
      <button class="header-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <GearIcon />
      </button>
    </div>

    <div class="tabs-row nodrag">
      <button class="tab-btn" :class="{ active: activeTab === 'target' }" @click="activeTab = 'target'">Alvo</button>
      <button class="tab-btn" :class="{ active: activeTab === 'wordlist' }" @click="activeTab = 'wordlist'">Wordlist</button>
      <button class="tab-btn" :class="{ active: activeTab === 'run' }" @click="activeTab = 'run'">Execução</button>
    </div>

    <div class="tab-body nodrag nowheel nopan">
      <div v-if="activeTab === 'target'" class="pane">
        <div class="field-block">
          <span class="section-label">URL base</span>
          <input
            v-model="url"
            class="header-input mono"
            type="text"
            placeholder="https://exemplo.com"
            @input="syncData"
          />
          <p class="hint">Testa cada path da wordlist contra a URL base e reporta os que não retornam 404.</p>
        </div>

        <div class="field-row">
          <label class="exec-field">
            Timeout por tentativa (ms)
            <input v-model.number="timeoutMs" type="number" min="200" max="20000" :disabled="running" @input="syncData" />
          </label>
        </div>
      </div>

      <div v-else-if="activeTab === 'wordlist'" class="pane">
        <div class="mode-row">
          <label class="radio-label">
            <input type="radio" value="common" v-model="wordlistMode" @change="syncData" />
            Comuns ({{ COMMON_PATHS_CLIENT.length }})
          </label>
          <label class="radio-label">
            <input type="radio" value="custom" v-model="wordlistMode" @change="syncData" />
            Customizada
          </label>
        </div>

        <div v-if="wordlistMode === 'common'">
          <p class="hint">Paths mais prováveis de expor algo (painéis admin, arquivos de config/segredo, backups, API/docs).</p>
          <div class="quick-grid">
            <span v-for="p in COMMON_PATHS_CLIENT.slice(0, 40)" :key="p" class="quick-pill">{{ p }}</span>
            <span class="quick-pill quick-pill-more">+{{ COMMON_PATHS_CLIENT.length - 40 }}</span>
          </div>
        </div>

        <div v-else class="custom-list">
          <textarea
            v-model="customWordlist"
            class="body-editor wordlist-editor"
            spellcheck="false"
            placeholder="admin&#10;.env&#10;api/v1&#10;backup.zip"
            @input="syncData"
          />
          <p class="hint">Um path por linha (sem barra inicial). Até 5.000 entradas.</p>
        </div>
      </div>

      <div v-else class="pane">
        <div class="exec-controls">
          <label class="exec-field">
            Concorrência
            <input v-model.number="concurrency" type="number" min="1" max="100" :disabled="running" @input="syncData" />
          </label>
        </div>

        <div v-if="!running && !showConfirm" class="start-row">
          <button class="btn-primary" :disabled="!canStart" @click="clickStart">Iniciar fuzzing</button>
          <span v-if="!url" class="hint">Informe a URL base na aba Alvo.</span>
          <span v-else-if="wordlistCount === 0" class="hint">Nenhum path configurado na aba Wordlist.</span>
        </div>

        <div v-if="showConfirm" class="confirm-panel">
          <p>
            Confirma o fuzzing contra <strong>{{ url }}</strong> — {{ wordlistCount }} paths?
          </p>
          <div class="confirm-actions">
            <button class="btn-secondary" @click="showConfirm = false">Cancelar</button>
            <button class="btn-danger" @click="confirmStart">Confirmar e iniciar</button>
          </div>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar"><div class="progress-fill" :style="{ width: progressPct + '%' }" /></div>
          <div class="progress-row">
            <span class="hint">{{ progressCount }}/{{ progressTotal }} paths</span>
            <button class="btn-secondary" @click="stopScan">Parar</button>
          </div>
        </div>

        <div v-if="liveFound.length" class="banner warn">
          <strong>{{ liveFound.length }} path(s) encontrado(s):</strong>
          <div v-for="f in liveFound" :key="f.path" class="finding-row">
            <span class="status-badge" :class="statusClass(f.status)">{{ f.status }}</span>
            /{{ f.path }}
            <span class="finding-status">{{ formatSize(f.size) }}</span>
          </div>
        </div>
        <div v-else-if="lastResult && !running && !lastResult.error" class="banner ok">
          Nenhum path encontrado em {{ lastResult.totalPaths }} testados.
        </div>

        <div v-if="lastResult && !lastResult.error" class="summary-row">
          <span class="hint">
            {{ lastResult.cancelled ? 'Parado manualmente' : 'Concluído' }} — {{ lastResult.totalPaths }} paths em
            {{ formatDuration(lastResult.durationMs) }}.
          </span>
          <button class="link-btn" @click="showLogModal = true">Ver log completo</button>
        </div>
        <div v-if="lastResult && lastResult.error" class="banner danger">{{ lastResult.error }}</div>
      </div>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showLogModal" class="logs-modal-backdrop" @mousedown.self="showLogModal = false">
          <div class="logs-modal nodrag nowheel nopan">
            <div class="logs-modal-header">
              <span class="logs-modal-title">Log do fuzzing — {{ data.name }}</span>
              <div class="logs-modal-header-actions">
                <button class="header-btn" title="Copiar" @click="copyLog">
                  <svg v-if="logCopied" viewBox="0 0 16 16" width="14" height="14">
                    <path d="M3 8.5l3.2 3.2L13 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <svg v-else viewBox="0 0 16 16" width="14" height="14">
                    <rect x="5.5" y="5.5" width="8" height="8" rx="1.3" stroke="currentColor" stroke-width="1.3" fill="none" />
                    <path d="M3.5 10.5V3.5a1 1 0 0 1 1-1h7" stroke="currentColor" stroke-width="1.3" fill="none" />
                  </svg>
                </button>
                <button class="header-btn" title="Fechar (Esc)" @click="showLogModal = false">
                  <svg viewBox="0 0 16 16" width="16" height="16">
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="logs-modal-toolbar">
              <input v-model="logSearch" type="text" class="logs-search" placeholder="Filtrar path..." />
              <label class="checkbox-label logs-toggle">
                <input type="checkbox" v-model="logOnlyFound" />
                Só encontrados
              </label>
            </div>

            <div class="logs-modal-body">
              <div v-if="!filteredAttempts.length" class="logs-empty">Nenhum path verificado ainda.</div>
              <div
                v-for="a in filteredAttempts"
                :key="a.path"
                class="log-row"
                :class="{ success: a.found, failed: !a.found }"
              >
                <span class="log-seq">#{{ a.seq }}</span>
                <span class="log-cred">/{{ a.path }}</span>
                <span v-if="a.found" class="log-tag" :class="statusClass(a.status)">{{ a.status }}</span>
                <span v-else class="log-tag failed">404</span>
                <span v-if="a.found" class="log-status">{{ formatSize(a.size) }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import NodeToolbar from './NodeToolbar.vue'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'
import { runDirFuzz } from '../lib/bridgeClient'

// prévia client-side da wordlist "common" do bridge (bridge/dirFuzz.js) —
// mesmo motivo do COMMON_SUBDOMAINS_CLIENT em SubdomainScanNode.vue: mostrar
// a lista na aba sem ida e volta ao bridge.
const COMMON_PATHS_CLIENT = [
  'admin', 'administrator', 'admin.php', 'administrator.php', 'admin/login', 'wp-admin', 'wp-login.php',
  'login', 'logout', 'signin', 'signup', 'register', 'dashboard', 'panel', 'cpanel', 'console',
  'api', 'api/v1', 'api/v2', 'graphql', 'swagger', 'swagger.json', 'swagger-ui', 'api-docs', 'openapi.json',
  '.env', '.env.local', '.env.production', '.env.dev', '.env.bak', 'config', 'config.php', 'config.json',
  'config.yml', 'settings.php', '.git', '.git/config', '.git/HEAD', '.git/index', '.git/logs/HEAD', '.svn', '.hg',
  'backup', 'backups', 'backup.zip', 'backup.tar.gz', 'backup.sql', 'dump.sql', 'db.sql', 'database.sql',
  '.htaccess', '.htpasswd', 'robots.txt', 'sitemap.xml', 'security.txt', '.well-known', '.well-known/security.txt',
  'phpinfo.php', 'info.php', 'test.php', 'test', 'debug', 'debug.php', 'server-status', 'server-info',
  '.aws', '.aws/credentials', '.ssh', '.ssh/id_rsa', 'id_rsa', 'id_rsa.pub', 'credentials', 'credentials.json',
  'secret', 'secrets', 'secrets.json', 'keys', 'key.pem', 'private.key', 'certificate.pem',
  '.npmrc', '.dockerignore', '.gitignore', 'docker-compose.yml', 'Dockerfile', 'package.json', 'composer.json',
  'composer.lock', 'package-lock.json', 'yarn.lock', 'vendor', 'node_modules', '.DS_Store', 'Thumbs.db',
  'uploads', 'upload', 'files', 'assets', 'static', 'media', 'images', 'tmp', 'temp', 'cache',
  'logs', 'log', 'error_log', 'access_log', 'error.log', 'access.log', '.idea', '.vscode',
  'install', 'install.php', 'setup', 'setup.php', 'old', 'old_site', 'backup_old', 'new', 'staging',
  'test-api', 'health', 'healthz', 'status', 'metrics', 'actuator', 'actuator/health', 'actuator/env',
  'auth', 'oauth', 'token', 'jwt', 'README.md', 'CHANGELOG.md', 'LICENSE',
  'private', 'internal', 'hidden', 'admin_area', 'manage', 'management', 'webadmin', 'adminpanel'
]

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
  minWidth: 380,
  minHeight: 420,
  defaultWidth: 460,
  defaultHeight: 480
})

const activeTab = ref('target')

const url = ref(props.data.url || '')
const timeoutMs = ref(props.data.timeoutMs ?? 5000)

const wordlistMode = ref(props.data.wordlistMode || 'common')
const customWordlist = ref(props.data.customWordlist || '')

const concurrency = ref(props.data.concurrency ?? 20)

const running = ref(false)
const showConfirm = ref(false)
const attempts = ref([])
const lastResult = ref(props.data.lastResult || null)
const progressCount = ref(0)
const progressTotal = ref(0)
const showLogModal = ref(false)
const logSearch = ref('')
const logOnlyFound = ref(false)
const logCopied = ref(false)
let logCopiedTimeout = null
let controller = null

function syncData() {
  updateNodeData(props.id, {
    url: url.value,
    timeoutMs: timeoutMs.value,
    wordlistMode: wordlistMode.value,
    customWordlist: customWordlist.value,
    concurrency: concurrency.value,
    lastResult: lastResult.value
  })
}

function parseCustomWordlistCount() {
  const seen = new Set()
  for (const line of customWordlist.value.split('\n')) {
    const trimmed = line.trim().replace(/^\/+/, '')
    if (!trimmed) continue
    seen.add(trimmed)
    if (seen.size >= 5000) break
  }
  return seen.size
}

const wordlistCount = computed(() => {
  if (wordlistMode.value === 'custom') return parseCustomWordlistCount()
  return COMMON_PATHS_CLIENT.length
})

const canStart = computed(() => Boolean(url.value.trim()) && wordlistCount.value > 0 && !running.value)

const statusDotClass = computed(() => {
  if (running.value) return 'pending'
  if (!lastResult.value || lastResult.value.error) return ''
  if (lastResult.value.found?.length) return 'warn'
  return 'online'
})

const progressPct = computed(() => (progressTotal.value ? Math.round((progressCount.value / progressTotal.value) * 100) : 0))

const liveFound = computed(() => {
  if (running.value) return attempts.value.filter((a) => a.found)
  return lastResult.value?.found || []
})

const filteredAttempts = computed(() => {
  const term = logSearch.value.trim().toLowerCase()
  let list = attempts.value
  if (logOnlyFound.value) list = list.filter((a) => a.found)
  if (term) list = list.filter((a) => a.path.toLowerCase().includes(term))
  return [...list].sort((a, b) => a.seq - b.seq)
})

// 2xx = achou de verdade (verde); 3xx = redirecionamento (azul); 401/403 =
// protegido mas existe (amarelo, é o achado mais interessante pra pentest);
// resto (5xx etc) cinza — a UI usa isso tanto na lista de achados quanto no log.
function statusClass(status) {
  if (status >= 200 && status < 300) return 'status-2xx'
  if (status >= 300 && status < 400) return 'status-3xx'
  if (status === 401 || status === 403) return 'status-auth'
  return 'status-other'
}

function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return ''
  if (ms < 1000) return `${ms}ms`
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes ? `${minutes}m${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

function clickStart() {
  if (!canStart.value) return
  showConfirm.value = true
}

function confirmStart() {
  showConfirm.value = false
  startScan()
}

function startScan() {
  syncData()
  attempts.value = []
  lastResult.value = null
  progressCount.value = 0
  progressTotal.value = wordlistCount.value
  running.value = true
  activeTab.value = 'run'

  controller = runDirFuzz(
    {
      url: url.value.trim(),
      wordlist: { mode: wordlistMode.value, customWordlist: customWordlist.value },
      timeoutMs: timeoutMs.value,
      concurrency: concurrency.value
    },
    {
      onProgress: (msg) => {
        attempts.value.push(msg)
        progressCount.value = msg.seq
      },
      onResult: (result) => {
        running.value = false
        controller = null
        lastResult.value = result.error
          ? { error: result.error }
          : {
              cancelled: result.cancelled,
              totalPaths: result.totalPaths,
              found: result.found,
              durationMs: result.durationMs
            }
        syncData()
      }
    }
  )
}

function stopScan() {
  controller?.stop()
}

async function copyLog() {
  const text = filteredAttempts.value
    .map((a) => `#${a.seq} /${a.path} ${a.found ? a.status + ' (' + formatSize(a.size) + ')' : '404'}`)
    .join('\n')
  try {
    await navigator.clipboard.writeText(text)
    logCopied.value = true
    clearTimeout(logCopiedTimeout)
    logCopiedTimeout = setTimeout(() => {
      logCopied.value = false
    }, 1500)
  } catch (err) {
    console.error('[dir-fuzz-node] copy failed', err)
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && showLogModal.value) showLogModal.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  controller?.stop()
  clearTimeout(logCopiedTimeout)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.df-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.df-node.selected {
  border-color: var(--selected-color);
}

.df-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.df-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.df-header {
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

.df-header:active {
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

.status-dot.warn {
  background: #eab308;
}

.status-dot.danger {
  background: #ef4444;
}

.status-dot.pending {
  background: #eab308;
  animation: pulse 1.1s ease-in-out infinite;
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

.df-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
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
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.header-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.tabs-row {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  padding: 6px 8px 0;
}

.tab-btn {
  padding: 5px 10px;
  border: none;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--color-text-secondary);
}

.tab-btn.active {
  background: var(--color-bg-app);
  color: var(--color-text-primary);
  font-weight: 600;
}

.tab-body {
  flex: 1;
  min-height: 0;
  background: var(--color-bg-app);
  overflow-y: auto;
  border-radius: 0 0 9px 9px;
}

.pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.hint {
  margin: 0;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.header-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 12px;
}

.header-input.mono {
  font-family: 'Menlo', Consolas, monospace;
}

.header-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.body-editor {
  width: 100%;
  height: 90px;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
  font-family: 'Menlo', Consolas, monospace;
  line-height: 1.5;
  resize: none;
}

.wordlist-editor {
  height: 90px;
}

.body-editor:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.link-btn {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  text-decoration: underline;
  cursor: pointer;
}

.link-btn:hover {
  color: var(--color-text-primary);
}

.mode-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--color-text-primary);
  cursor: pointer;
}

.quick-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.quick-pill {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 10.5px;
  font-family: 'Menlo', Consolas, monospace;
}

.quick-pill-more {
  font-family: inherit;
  font-weight: 600;
}

.custom-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.exec-controls {
  display: flex;
  gap: 10px;
}

.exec-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10.5px;
  color: var(--color-text-secondary);
}

.exec-field input {
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
}

.start-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: #3b82f6;
  color: #fff;
}

.btn-primary:disabled {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  cursor: default;
}

.btn-secondary {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
}

.btn-secondary:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.btn-danger {
  background: #ef4444;
  color: #fff;
}

.confirm-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface);
}

.confirm-panel p {
  margin: 0;
  font-size: 11.5px;
  color: var(--color-text-primary);
  word-break: break-all;
}

.confirm-actions {
  display: flex;
  gap: 6px;
}

.progress-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.15s ease;
}

.progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.banner {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.5;
}

.banner.danger {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.banner.warn {
  background: rgba(234, 179, 8, 0.12);
  color: #b45309;
}

.banner.ok {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.finding-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Menlo', Consolas, monospace;
  font-weight: 700;
}

.finding-status {
  font-weight: 400;
  opacity: 0.8;
}

.status-badge {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.status-badge.status-2xx,
.log-tag.status-2xx {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.status-badge.status-3xx,
.log-tag.status-3xx {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.status-badge.status-auth,
.log-tag.status-auth {
  background: rgba(234, 179, 8, 0.15);
  color: #b45309;
}

.status-badge.status-other,
.log-tag.status-other {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-secondary);
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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

.df-node:hover .resize-handle {
  opacity: 1;
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

.logs-modal-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
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

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--color-text-primary);
  cursor: pointer;
}

.logs-toggle {
  flex-shrink: 0;
  font-size: 10.5px;
  color: var(--color-text-secondary);
  white-space: nowrap;
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

.logs-modal-body {
  flex: 1;
  min-height: 0;
  padding: 6px 10px;
  overflow-y: auto;
  background: var(--color-bg-app);
  border-radius: 0 0 9px 9px;
}

.logs-empty {
  padding: 16px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  text-align: center;
}

.log-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 5px;
  font-size: 11px;
  font-family: 'Menlo', Consolas, monospace;
  color: var(--color-text-secondary);
}

.log-row:hover {
  background: var(--color-hover);
}

.log-row.success {
  color: #16a34a;
}

.log-row.failed {
  color: var(--color-text-tertiary);
}

.log-seq {
  flex-shrink: 0;
  width: 34px;
  color: var(--color-text-tertiary);
}

.log-cred {
  flex-shrink: 0;
  width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-status {
  flex-shrink: 0;
  width: 60px;
}

.log-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.log-tag.failed {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-tertiary);
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
</style>
