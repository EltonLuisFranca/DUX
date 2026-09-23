<template>
  <div
    class="ps-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="ps-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="ps-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="ps-handle"
      :class="{ connected: isBottomConnected }"
    />

    <div class="ps-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="statusDotClass" />
      <span class="ps-title">{{ data.name }}</span>
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
      <button class="tab-btn" :class="{ active: activeTab === 'ports' }" @click="activeTab = 'ports'">Portas</button>
      <button class="tab-btn" :class="{ active: activeTab === 'run' }" @click="activeTab = 'run'">Execução</button>
    </div>

    <div class="tab-body nodrag nowheel nopan">
      <div v-if="activeTab === 'target'" class="pane">
        <div class="field-block">
          <span class="section-label">Host / IP alvo</span>
          <input
            v-model="host"
            class="header-input mono"
            type="text"
            placeholder="192.168.1.10 ou meu-servidor.com"
            @input="syncData"
          />
          <p class="hint">Recon inicial via TCP connect scan — sem depender de nmap instalado no host.</p>
        </div>

        <div class="field-row">
          <label class="exec-field">
            Timeout de conexão (ms)
            <input v-model.number="connectTimeoutMs" type="number" min="100" max="10000" :disabled="running" @input="syncData" />
          </label>
        </div>

        <label class="checkbox-label">
          <input type="checkbox" v-model="grabBanner" @change="syncData" />
          Tentar identificar serviço (banner grab)
        </label>
        <p class="hint">Além da porta, tenta ler o banner do serviço (SSH, FTP, SMTP...) ou faz um HEAD HTTP mínimo.</p>
      </div>

      <div v-else-if="activeTab === 'ports'" class="pane">
        <div class="mode-row">
          <label class="radio-label">
            <input type="radio" value="top20" v-model="portsMode" @change="syncData" />
            Comuns (top 20)
          </label>
          <label class="radio-label">
            <input type="radio" value="top100" v-model="portsMode" @change="syncData" />
            Estendida (top 100)
          </label>
          <label class="radio-label">
            <input type="radio" value="custom" v-model="portsMode" @change="syncData" />
            Customizada
          </label>
        </div>

        <div v-if="portsMode === 'top20'">
          <p class="hint">{{ TOP20_PORTS_CLIENT.length }} portas mais comuns pra um primeiro reconhecimento.</p>
          <div class="quick-grid">
            <span v-for="p in TOP20_PORTS_CLIENT" :key="p.port" class="quick-pill">{{ p.port }}/{{ p.service }}</span>
          </div>
        </div>

        <div v-else-if="portsMode === 'top100'">
          <p class="hint">
            {{ TOP20_PORTS_CLIENT.length }} portas comuns + ~80 adicionais (bancos de dados, filas, containers,
            k8s, ferramentas de dev...).
          </p>
        </div>

        <div v-else class="custom-list">
          <textarea
            v-model="customPorts"
            class="body-editor wordlist-editor"
            spellcheck="false"
            placeholder="22,80,443,8000-8100"
            @input="syncData"
          />
          <p class="hint">Portas separadas por vírgula, ou faixas com hífen (ex: 8000-8100). Até 10.000 portas.</p>
        </div>
      </div>

      <div v-else class="pane">
        <div class="exec-controls">
          <label class="exec-field">
            Concorrência
            <input v-model.number="concurrency" type="number" min="1" max="200" :disabled="running" @input="syncData" />
          </label>
        </div>

        <div v-if="!running && !showConfirm" class="start-row">
          <button class="btn-primary" :disabled="!canStart" @click="clickStart">Iniciar varredura</button>
          <span v-if="!host" class="hint">Informe o host alvo na aba Alvo.</span>
          <span v-else-if="portsCount === 0" class="hint">Nenhuma porta configurada na aba Portas.</span>
        </div>

        <div v-if="showConfirm" class="confirm-panel">
          <p>
            Confirma a varredura contra <strong>{{ host }}</strong> — {{ portsCount }} portas?
          </p>
          <div class="confirm-actions">
            <button class="btn-secondary" @click="showConfirm = false">Cancelar</button>
            <button class="btn-danger" @click="confirmStart">Confirmar e iniciar</button>
          </div>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar"><div class="progress-fill" :style="{ width: progressPct + '%' }" /></div>
          <div class="progress-row">
            <span class="hint">{{ progressCount }}/{{ progressTotal }} portas</span>
            <button class="btn-secondary" @click="stopScan">Parar</button>
          </div>
        </div>

        <div v-if="liveOpenPorts.length" class="banner warn">
          <strong>{{ liveOpenPorts.length }} porta(s) aberta(s):</strong>
          <div v-for="p in liveOpenPorts" :key="p.port" class="finding-row">
            {{ p.port }} <span class="finding-status">({{ p.service }})</span>
          </div>
        </div>
        <div v-else-if="lastResult && !running && !lastResult.error" class="banner ok">
          Nenhuma porta aberta encontrada em {{ lastResult.totalPorts }} verificadas.
        </div>

        <div v-if="lastResult && !lastResult.error" class="summary-row">
          <span class="hint">
            {{ lastResult.cancelled ? 'Parado manualmente' : 'Concluído' }} — {{ lastResult.totalPorts }} portas em
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
              <input v-model="logSearch" type="text" class="logs-search" placeholder="Filtrar porta/serviço..." />
              <label class="checkbox-label logs-toggle">
                <input type="checkbox" v-model="logOnlyOpen" />
                Só abertas
              </label>
            </div>

            <div class="logs-modal-body">
              <div v-if="!filteredAttempts.length" class="logs-empty">Nenhuma porta verificada ainda.</div>
              <div
                v-for="a in filteredAttempts"
                :key="a.port"
                class="log-row"
                :class="{ success: a.open, failed: !a.open }"
              >
                <span class="log-seq">#{{ a.seq }}</span>
                <span class="log-cred">{{ a.port }}</span>
                <span class="log-status">{{ a.open ? 'aberta' : 'fechada' }}</span>
                <span v-if="a.open" class="log-tag success">{{ a.service }}</span>
                <span v-else class="log-tag failed">{{ a.reason || '' }}</span>
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
import { runPortScan } from '../lib/bridgeClient'

// prévia client-side do preset "top20" do bridge (bridge/portScan.js) — só o
// prefixo dos 20 mais comuns, mesmo motivo do QUICK_CREDENTIALS_CLIENT em
// CredentialTestNode.vue: mostrar a lista na aba sem ida e volta ao bridge.
// A lista "top100" completa não é duplicada aqui — só a contagem é exibida.
const TOP20_PORTS_CLIENT = [
  [21, 'ftp'], [22, 'ssh'], [23, 'telnet'], [25, 'smtp'], [53, 'dns'],
  [80, 'http'], [110, 'pop3'], [111, 'rpcbind'], [135, 'msrpc'], [139, 'netbios-ssn'],
  [143, 'imap'], [443, 'https'], [445, 'microsoft-ds'], [993, 'imaps'], [995, 'pop3s'],
  [3306, 'mysql'], [3389, 'rdp'], [5900, 'vnc'], [8080, 'http-proxy'], [9200, 'elasticsearch']
].map(([port, service]) => ({ port, service }))

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

const host = ref(props.data.host || '')
const connectTimeoutMs = ref(props.data.connectTimeoutMs ?? 1500)
const grabBanner = ref(props.data.grabBanner ?? true)

const portsMode = ref(props.data.portsMode || 'top20')
const customPorts = ref(props.data.customPorts || '')

const concurrency = ref(props.data.concurrency ?? 50)

const running = ref(false)
const showConfirm = ref(false)
const attempts = ref([])
const lastResult = ref(props.data.lastResult || null)
const progressCount = ref(0)
const progressTotal = ref(0)
const showLogModal = ref(false)
const logSearch = ref('')
const logOnlyOpen = ref(false)
const logCopied = ref(false)
let logCopiedTimeout = null
let controller = null

function syncData() {
  updateNodeData(props.id, {
    host: host.value,
    connectTimeoutMs: connectTimeoutMs.value,
    grabBanner: grabBanner.value,
    portsMode: portsMode.value,
    customPorts: customPorts.value,
    concurrency: concurrency.value,
    lastResult: lastResult.value
  })
}

function parseCustomPortsCount() {
  const seen = new Set()
  for (const token of customPorts.value.split(',')) {
    const trimmed = token.trim()
    if (!trimmed) continue
    const [a, b] = trimmed.split('-').map((s) => Number(s.trim()))
    if (!Number.isInteger(a) || a < 1 || a > 65535) continue
    if (b === undefined) {
      seen.add(a)
    } else if (Number.isInteger(b) && b >= a && b <= 65535) {
      for (let p = a; p <= b && seen.size < 10000; p++) seen.add(p)
    }
    if (seen.size >= 10000) break
  }
  return seen.size
}

const portsCount = computed(() => {
  if (portsMode.value === 'custom') return parseCustomPortsCount()
  if (portsMode.value === 'top20') return TOP20_PORTS_CLIENT.length
  return 100
})

const canStart = computed(() => Boolean(host.value.trim()) && portsCount.value > 0 && !running.value)

const statusDotClass = computed(() => {
  if (running.value) return 'pending'
  if (!lastResult.value || lastResult.value.error) return ''
  if (lastResult.value.openPorts?.length) return 'warn'
  return 'online'
})

const progressPct = computed(() => (progressTotal.value ? Math.round((progressCount.value / progressTotal.value) * 100) : 0))

const liveOpenPorts = computed(() => {
  if (running.value) return attempts.value.filter((a) => a.open)
  return lastResult.value?.openPorts || []
})

const filteredAttempts = computed(() => {
  const term = logSearch.value.trim().toLowerCase()
  let list = attempts.value
  if (logOnlyOpen.value) list = list.filter((a) => a.open)
  if (term) list = list.filter((a) => `${a.port} ${a.service || ''}`.toLowerCase().includes(term))
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
  progressTotal.value = portsCount.value
  running.value = true
  activeTab.value = 'run'

  controller = runPortScan(
    {
      host: host.value.trim(),
      ports: { mode: portsMode.value, customPorts: customPorts.value },
      connectTimeoutMs: connectTimeoutMs.value,
      grabBanner: grabBanner.value,
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
              totalPorts: result.totalPorts,
              openPorts: result.openPorts,
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
    .map((a) => `#${a.seq} porta ${a.port} ${a.open ? 'aberta (' + a.service + ')' : 'fechada' + (a.reason ? ' [' + a.reason + ']' : '')}`)
    .join('\n')
  try {
    await navigator.clipboard.writeText(text)
    logCopied.value = true
    clearTimeout(logCopiedTimeout)
    logCopiedTimeout = setTimeout(() => {
      logCopied.value = false
    }, 1500)
  } catch (err) {
    console.error('[port-scan-node] copy failed', err)
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
.ps-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.ps-node.selected {
  border-color: var(--selected-color);
}

.ps-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.ps-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.ps-header {
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

.ps-header:active {
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

.ps-title {
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
  font-family: 'Menlo', Consolas, monospace;
  font-weight: 700;
}

.finding-status {
  font-weight: 400;
  opacity: 0.8;
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

.ps-node:hover .resize-handle {
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
  width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-status {
  flex-shrink: 0;
  width: 50px;
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
