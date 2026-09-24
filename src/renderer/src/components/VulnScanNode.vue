<template>
  <div
    class="vs-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="vs-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="vs-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="vs-handle"
      :class="{ connected: isBottomConnected }"
    />

    <div class="vs-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="statusDotClass" />
      <span class="vs-title">{{ data.name }}</span>
      <button class="header-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <GearIcon />
      </button>
    </div>

    <div class="tabs-row nodrag">
      <button class="tab-btn" :class="{ active: activeTab === 'target' }" @click="activeTab = 'target'">Alvo</button>
      <button class="tab-btn" :class="{ active: activeTab === 'checks' }" @click="activeTab = 'checks'">Checagens</button>
      <button class="tab-btn" :class="{ active: activeTab === 'run' }" @click="activeTab = 'run'">Execução</button>
    </div>

    <div class="tab-body nodrag nowheel nopan">
      <div v-if="activeTab === 'target'" class="pane">
        <div class="field-block">
          <span class="section-label">URL alvo</span>
          <input
            v-model="url"
            class="header-input mono"
            type="text"
            placeholder="https://exemplo.com"
            @input="syncData"
          />
          <p class="hint">
            Roda uma checklist curada de {{ CHECKS_CLIENT.length }} vulnerabilidades comuns contra a URL base —
            arquivos sensíveis expostos, SQLi, XSS refletido, CORS, path traversal, métodos HTTP perigosos etc.
            Algumas checagens enviam payloads de teste. Use apenas em sistemas que você tem autorização para testar.
          </p>
        </div>

        <div class="field-row">
          <label class="exec-field">
            Timeout por checagem (ms)
            <input v-model.number="timeoutMs" type="number" min="1000" max="20000" :disabled="running" @input="syncData" />
          </label>
          <label class="exec-field">
            Concorrência
            <input v-model.number="concurrency" type="number" min="1" max="10" :disabled="running" @input="syncData" />
          </label>
        </div>
      </div>

      <div v-else-if="activeTab === 'checks'" class="pane">
        <p class="hint">Checagens executadas nesta varredura, por severidade:</p>
        <div v-for="group in CHECKS_BY_SEVERITY" :key="group.severity" class="category-block">
          <span class="section-label severity-label" :class="severityClass(group.severity)">{{ severityLabel(group.severity) }}</span>
          <div class="check-preview-list">
            <span v-for="c in group.items" :key="c.id" class="quick-pill">{{ c.name }}</span>
          </div>
        </div>
      </div>

      <div v-else class="pane">
        <div v-if="!running && !showConfirm" class="start-row">
          <button class="btn-primary" :disabled="!canStart" @click="clickStart">Iniciar varredura</button>
          <span v-if="!url" class="hint">Informe a URL alvo na aba Alvo.</span>
        </div>

        <div v-if="showConfirm" class="confirm-panel">
          <p>
            Confirma a varredura de vulnerabilidades contra <strong>{{ url }}</strong> —
            {{ CHECKS_CLIENT.length }} checagens (algumas enviam payloads de teste como SQLi/XSS)?
          </p>
          <div class="confirm-actions">
            <button class="btn-secondary" @click="showConfirm = false">Cancelar</button>
            <button class="btn-danger" @click="confirmStart">Confirmar e iniciar</button>
          </div>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar"><div class="progress-fill" :style="{ width: progressPct + '%' }" /></div>
          <div class="progress-row">
            <span class="hint">{{ progressCount }}/{{ progressTotal }} checagens</span>
            <button class="btn-secondary" @click="stopScan">Parar</button>
          </div>
        </div>

        <div v-if="liveFindings.length" class="findings-list">
          <div v-for="f in liveFindings" :key="f.id" class="finding-card" :class="severityClass(f.severity)">
            <div class="finding-head">
              <span class="severity-badge" :class="severityClass(f.severity)">{{ severityLabel(f.severity) }}</span>
              <span class="finding-name">{{ f.name }}</span>
            </div>
            <p class="hint finding-evidence">{{ f.evidence }}</p>
          </div>
        </div>
        <div v-else-if="lastResult && !running && !lastResult.error" class="banner ok">
          Nenhuma vulnerabilidade encontrada em {{ lastResult.totalChecks }} checagens.
        </div>

        <div v-if="lastResult && !lastResult.error" class="summary-row">
          <span class="hint">
            {{ lastResult.cancelled ? 'Parado manualmente' : 'Concluído' }} — {{ lastResult.totalChecks }} checagens em
            {{ formatDuration(lastResult.durationMs) }}.
          </span>
        </div>
        <div v-if="lastResult && lastResult.error" class="banner danger">{{ lastResult.error }}</div>
      </div>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import NodeToolbar from './NodeToolbar.vue'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'
import { runVulnScan } from '../lib/bridgeClient'

// prévia client-side da checklist do bridge (bridge/vulnScan.js) — mesmo
// motivo do COMMON_PATHS_CLIENT em DirFuzzNode.vue: mostrar a lista na aba
// sem ida e volta ao bridge. Precisa ficar em sincronia manual com CHECKS lá.
const CHECKS_CLIENT = [
  { id: 'git-exposed', name: '.git exposto', severity: 'critical' },
  { id: 'env-exposed', name: '.env exposto', severity: 'critical' },
  { id: 'aws-credentials-exposed', name: 'Credenciais AWS expostas', severity: 'critical' },
  { id: 'ssh-key-exposed', name: 'Chave SSH privada exposta', severity: 'critical' },
  { id: 'path-traversal', name: 'Path traversal básico', severity: 'critical' },
  { id: 'sql-injection-error', name: 'Erro de SQL ao injetar aspas', severity: 'critical' },
  { id: 'sql-backup-exposed', name: 'Backup de banco exposto', severity: 'high' },
  { id: 'reflected-xss', name: 'XSS refletido básico', severity: 'high' },
  { id: 'cors-misconfig', name: 'CORS mal configurado', severity: 'high' },
  { id: 'phpinfo-exposed', name: 'phpinfo() exposto', severity: 'high' },
  { id: 'spring-actuator-env', name: 'Spring Boot Actuator exposto', severity: 'high' },
  { id: 'open-redirect', name: 'Open redirect', severity: 'medium' },
  { id: 'dangerous-http-methods', name: 'Métodos HTTP perigosos habilitados', severity: 'medium' },
  { id: 'host-header-injection', name: 'Host header refletido', severity: 'medium' },
  { id: 'directory-listing', name: 'Listagem de diretório habilitada', severity: 'medium' },
  { id: 'verbose-error', name: 'Erro verboso / stack trace exposto', severity: 'medium' },
  { id: 'swagger-exposed', name: 'Documentação de API pública', severity: 'low' },
  { id: 'server-version-exposed', name: 'Versão de servidor exposta', severity: 'low' }
]

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const SEVERITY_LABELS = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' }

const CHECKS_BY_SEVERITY = Object.keys(SEVERITY_ORDER)
  .map((severity) => ({ severity, items: CHECKS_CLIENT.filter((c) => c.severity === severity) }))
  .filter((g) => g.items.length)

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
  minWidth: 400,
  minHeight: 460,
  defaultWidth: 480,
  defaultHeight: 560
})

const activeTab = ref('target')

const url = ref(props.data.url || '')
const timeoutMs = ref(props.data.timeoutMs ?? 6000)
const concurrency = ref(props.data.concurrency ?? 5)

const running = ref(false)
const showConfirm = ref(false)
const attempts = ref([])
const lastResult = ref(props.data.lastResult || null)
const progressCount = ref(0)
const progressTotal = ref(CHECKS_CLIENT.length)
let controller = null

function syncData() {
  updateNodeData(props.id, {
    url: url.value,
    timeoutMs: timeoutMs.value,
    concurrency: concurrency.value,
    lastResult: lastResult.value
  })
}

const canStart = computed(() => Boolean(url.value.trim()) && !running.value)

const statusDotClass = computed(() => {
  if (running.value) return 'pending'
  if (!lastResult.value || lastResult.value.error) return ''
  const findings = lastResult.value.findings || []
  if (findings.some((f) => f.severity === 'critical' || f.severity === 'high')) return 'danger'
  if (findings.length) return 'warn'
  return 'online'
})

const progressPct = computed(() => (progressTotal.value ? Math.round((progressCount.value / progressTotal.value) * 100) : 0))

const liveFindings = computed(() => {
  if (running.value) return attempts.value.filter((a) => a.found)
  return lastResult.value?.findings || []
})

function severityClass(severity) {
  return `sev-${severity}`
}

function severityLabel(severity) {
  return SEVERITY_LABELS[severity] || severity
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
  progressTotal.value = CHECKS_CLIENT.length
  running.value = true
  activeTab.value = 'run'

  controller = runVulnScan(
    { url: url.value.trim(), timeoutMs: timeoutMs.value, concurrency: concurrency.value },
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
              totalChecks: result.totalChecks,
              findings: result.findings,
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

onBeforeUnmount(() => {
  controller?.stop()
})
</script>

<style scoped>
.vs-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.vs-node.selected {
  border-color: var(--selected-color);
}

.vs-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.vs-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.vs-header {
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

.vs-header:active {
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

.vs-title {
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
  gap: 10px;
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

.category-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.severity-label {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
}

.check-preview-list {
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
  word-break: break-word;
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

.summary-row {
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

.banner.ok {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.banner.danger {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.findings-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.finding-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-left-width: 3px;
  border-radius: 7px;
  background: var(--color-bg-surface);
}

.finding-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.finding-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.finding-evidence {
  font-family: 'Menlo', Consolas, monospace;
  word-break: break-word;
}

.severity-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.sev-critical {
  border-left-color: #ef4444;
}
.sev-critical.severity-badge,
.severity-badge.sev-critical {
  background: rgba(239, 68, 68, 0.18);
  color: #ef4444;
}
.severity-label.sev-critical {
  background: rgba(239, 68, 68, 0.18);
  color: #ef4444;
}

.sev-high {
  border-left-color: #f97316;
}
.severity-badge.sev-high {
  background: rgba(249, 115, 22, 0.18);
  color: #f97316;
}
.severity-label.sev-high {
  background: rgba(249, 115, 22, 0.18);
  color: #f97316;
}

.sev-medium {
  border-left-color: #eab308;
}
.severity-badge.sev-medium {
  background: rgba(234, 179, 8, 0.18);
  color: #b45309;
}
.severity-label.sev-medium {
  background: rgba(234, 179, 8, 0.18);
  color: #b45309;
}

.sev-low {
  border-left-color: #3b82f6;
}
.severity-badge.sev-low {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}
.severity-label.sev-low {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.sev-info {
  border-left-color: var(--color-text-tertiary);
}
.severity-badge.sev-info {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-secondary);
}
.severity-label.sev-info {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-secondary);
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

.vs-node:hover .resize-handle {
  opacity: 1;
}
</style>
