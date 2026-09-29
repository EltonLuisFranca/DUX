<template>
  <NodeShell
    :id="id"
    :data="data"
    :selected="selected"
    :resize="{ minWidth: 380, minHeight: 420, defaultWidth: 460, defaultHeight: 480 }"
    :title="data.name"
    :status="statusColor"
    :status-pulse="statusDotClass === 'pending'"
  >
    <template #icon>
      <svg viewBox="0 0 20 20" width="12" height="12" v-html="NETWORK_DEVICE_SCAN_ICON"></svg>
    </template>
    <template #headerActions>
      <button class="header-btn nodrag" title="Log completo da varredura" @click="showLogModal = true">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>
    </template>

    <div class="tabs-row nodrag">
      <button class="tab-btn" :class="{ active: activeTab === 'target' }" @click="activeTab = 'target'">Rede</button>
      <button class="tab-btn" :class="{ active: activeTab === 'run' }" @click="activeTab = 'run'">Execução</button>
    </div>

    <div class="tab-body nodrag nowheel nopan">
      <div v-if="activeTab === 'target'" class="pane">
        <label class="checkbox-label">
          <input type="checkbox" v-model="autoDetect" :disabled="running" @change="syncData" />
          Detectar rede local automaticamente
        </label>
        <p class="hint">Usa a interface de rede ativa da máquina e assume uma faixa /24 a partir do seu IP.</p>

        <div v-if="!autoDetect" class="field-block">
          <span class="section-label">Faixa CIDR</span>
          <input
            v-model="cidr"
            class="header-input mono"
            type="text"
            placeholder="192.168.1.0/24"
            :disabled="running"
            @input="syncData"
          />
          <p class="hint">De /22 a /30 (até ~1000 hosts).</p>
        </div>

        <div class="field-row">
          <label class="exec-field">
            Timeout de ping (ms)
            <input v-model.number="pingTimeoutMs" type="number" min="200" max="5000" :disabled="running" @input="syncData" />
          </label>
          <label class="exec-field">
            Concorrência
            <input v-model.number="concurrency" type="number" min="1" max="64" :disabled="running" @input="syncData" />
          </label>
        </div>
        <p class="hint">Descobre quem responde a ping e cruza com a tabela ARP local pra achar IP, MAC e hostname.</p>
      </div>

      <div v-else class="pane">
        <div v-if="!running && !showConfirm" class="start-row">
          <button class="btn-primary" @click="clickStart">Iniciar varredura</button>
        </div>

        <div v-if="showConfirm" class="confirm-panel">
          <p>
            Confirma a varredura em <strong>{{ autoDetect ? 'rede local (auto)' : cidr || '—' }}</strong>?
          </p>
          <div class="confirm-actions">
            <button class="btn-secondary" @click="showConfirm = false">Cancelar</button>
            <button class="btn-danger" @click="confirmStart">Confirmar e iniciar</button>
          </div>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar"><div class="progress-fill" :style="{ width: progressPct + '%' }" /></div>
          <div class="progress-row">
            <span class="hint">{{ progressCount }}/{{ progressTotal }} hosts</span>
            <button class="btn-secondary" @click="stopScan">Parar</button>
          </div>
        </div>

        <div v-if="lastResult && lastResult.error" class="banner danger">{{ lastResult.error }}</div>

        <template v-else>
          <div v-if="liveDevices.length" class="banner warn">
            <strong>{{ liveDevices.length }} dispositivo(s) encontrado(s):</strong>
            <div v-for="d in liveDevices" :key="d.ip" class="finding-row">
              {{ d.ip }}<span v-if="d.isSelf"> (você)</span>
              <span class="finding-status">{{ d.mac ? d.mac : '' }}{{ d.hostname ? ' · ' + d.hostname : '' }}</span>
            </div>
          </div>
          <div v-else-if="lastResult && !running" class="banner ok">Nenhum dispositivo respondeu na faixa verificada.</div>
        </template>

        <div v-if="lastResult && !lastResult.error" class="summary-row">
          <span class="hint">
            {{ lastResult.cancelled ? 'Parado manualmente' : 'Concluído' }} — {{ lastResult.totalHosts }} hosts em
            {{ formatDuration(lastResult.durationMs) }}.
          </span>
          <button class="link-btn" @click="showLogModal = true">Ver log completo</button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showLogModal" class="logs-modal-backdrop" @mousedown.self="showLogModal = false">
          <div class="logs-modal nodrag nowheel nopan">
            <div class="logs-modal-header">
              <span class="logs-modal-title">Log da varredura — {{ data.name }}</span>
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
              <input v-model="logSearch" type="text" class="logs-search" placeholder="Filtrar IP/MAC/hostname..." />
              <label class="checkbox-label logs-toggle">
                <input type="checkbox" v-model="logOnlyAlive" />
                Só ativos
              </label>
            </div>

            <div class="logs-modal-body">
              <div v-if="!filteredAttempts.length" class="logs-empty">Nenhum host verificado ainda.</div>
              <div
                v-for="a in filteredAttempts"
                :key="a.ip"
                class="log-row"
                :class="{ success: a.alive, failed: !a.alive }"
              >
                <span class="log-seq">#{{ a.seq }}</span>
                <span class="log-cred">{{ a.ip }}</span>
                <span class="log-status">{{ a.alive ? 'ativo' : 'sem resposta' }}</span>
                <span v-if="a.alive && deviceByIp[a.ip]" class="log-tag success">
                  {{ deviceByIp[a.ip].mac || deviceByIp[a.ip].hostname || '' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </NodeShell>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import NodeShell from './NodeShell.vue'
import { NETWORK_DEVICE_SCAN_ICON } from '../nodeTypes/nodeIcons'
import { updateNodeData } from '../store/flowStore'
import { runNetworkDeviceScan } from '../lib/bridgeClient'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const activeTab = ref('target')

const autoDetect = ref(props.data.cidr ? false : props.data.autoDetect ?? true)
const cidr = ref(props.data.cidr || '')
const pingTimeoutMs = ref(props.data.pingTimeoutMs ?? 1000)
const concurrency = ref(props.data.concurrency ?? 32)

const running = ref(false)
const showConfirm = ref(false)
const attempts = ref([])
const lastResult = ref(props.data.lastResult || null)
const progressCount = ref(0)
const progressTotal = ref(0)
const showLogModal = ref(false)
const logSearch = ref('')
const logOnlyAlive = ref(false)
const logCopied = ref(false)
let logCopiedTimeout = null
let controller = null

function syncData() {
  updateNodeData(props.id, {
    autoDetect: autoDetect.value,
    cidr: cidr.value,
    pingTimeoutMs: pingTimeoutMs.value,
    concurrency: concurrency.value,
    lastResult: lastResult.value
  })
}

const statusDotClass = computed(() => {
  if (running.value) return 'pending'
  if (!lastResult.value || lastResult.value.error) return ''
  if (lastResult.value.devices?.length) return 'warn'
  return 'online'
})

const STATUS_DOT_COLORS = { pending: '#eab308', online: '#22c55e', warn: '#eab308' }
const statusColor = computed(() => STATUS_DOT_COLORS[statusDotClass.value] || null)

const progressPct = computed(() => (progressTotal.value ? Math.round((progressCount.value / progressTotal.value) * 100) : 0))

const deviceByIp = computed(() => {
  const map = {}
  for (const d of lastResult.value?.devices || []) map[d.ip] = d
  return map
})

const liveDevices = computed(() => (running.value ? [] : lastResult.value?.devices || []))

const filteredAttempts = computed(() => {
  const term = logSearch.value.trim().toLowerCase()
  let list = attempts.value
  if (logOnlyAlive.value) list = list.filter((a) => a.alive)
  if (term) {
    list = list.filter((a) => {
      const d = deviceByIp.value[a.ip]
      return `${a.ip} ${d?.mac || ''} ${d?.hostname || ''}`.toLowerCase().includes(term)
    })
  }
  return [...list].sort((a, b) => a.seq - b.seq)
})

function formatDuration(ms) {
  if (!ms && ms !== 0) return ''
  if (ms < 1000) return `${ms}ms`
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes ? `${minutes}m${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

function clickStart() {
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
  progressTotal.value = 0
  running.value = true
  activeTab.value = 'run'

  controller = runNetworkDeviceScan(
    {
      cidr: autoDetect.value ? '' : cidr.value.trim(),
      pingTimeoutMs: pingTimeoutMs.value,
      concurrency: concurrency.value
    },
    {
      onProgress: (msg) => {
        attempts.value.push(msg)
        progressCount.value = msg.seq
        progressTotal.value = msg.total
      },
      onResult: (result) => {
        running.value = false
        controller = null
        lastResult.value = result.error
          ? { error: result.error }
          : {
              cancelled: result.cancelled,
              devices: result.devices,
              totalHosts: result.totalHosts,
              localAddress: result.localAddress,
              interfaceName: result.interfaceName,
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
    .map((a) => {
      const d = deviceByIp.value[a.ip]
      const extra = d ? ` (${[d.mac, d.hostname].filter(Boolean).join(' · ')})` : ''
      return `#${a.seq} ${a.ip} ${a.alive ? 'ativo' + extra : 'sem resposta'}`
    })
    .join('\n')
  try {
    await navigator.clipboard.writeText(text)
    logCopied.value = true
    clearTimeout(logCopiedTimeout)
    logCopiedTimeout = setTimeout(() => {
      logCopied.value = false
    }, 1500)
  } catch (err) {
    console.error('[network-device-scan-node] copy failed', err)
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

.header-input:disabled {
  opacity: 0.6;
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
  font-family: 'Menlo', Consolas, monospace;
  font-weight: 700;
}

.finding-status {
  margin-left: 6px;
  font-weight: 400;
  opacity: 0.8;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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
  width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-status {
  flex-shrink: 0;
  width: 80px;
}

.log-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.log-tag.success {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
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
