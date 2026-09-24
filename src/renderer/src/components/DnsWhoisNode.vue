<template>
  <div
    class="dw-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="dw-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="dw-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="dw-handle"
      :class="{ connected: isBottomConnected }"
    />

    <div class="dw-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="statusDotClass" />
      <span class="dw-title">{{ data.name }}</span>
      <button class="header-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <GearIcon />
      </button>
    </div>

    <div class="tabs-row nodrag">
      <button class="tab-btn" :class="{ active: activeTab === 'target' }" @click="activeTab = 'target'">Alvo</button>
      <button class="tab-btn" :class="{ active: activeTab === 'result' }" @click="activeTab = 'result'">Resultado</button>
    </div>

    <div class="tab-body nodrag nowheel nopan">
      <div v-if="activeTab === 'target'" class="pane">
        <div class="field-block">
          <span class="section-label">Domínio alvo</span>
          <input
            v-model="domain"
            class="header-input mono"
            type="text"
            placeholder="exemplo.com"
            @input="syncData"
          />
          <p class="hint">
            Consulta registros DNS (A/AAAA/MX/TXT/NS/CNAME/SOA/CAA), SPF/DMARC, seletores DKIM comuns e dados de
            registro WHOIS (via socket direto na porta 43, com referral pela IANA) — sem depender de cliente whois
            instalado.
          </p>
        </div>

        <div class="field-row">
          <label class="exec-field">
            Timeout (ms)
            <input v-model.number="timeoutMs" type="number" min="1000" max="20000" :disabled="running" @input="syncData" />
          </label>
        </div>
      </div>

      <div v-else class="pane">
        <div v-if="!running" class="start-row">
          <button class="btn-primary" :disabled="!canStart" @click="startCheck">Consultar</button>
          <span v-if="!domain" class="hint">Informe o domínio alvo na aba Alvo.</span>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar indeterminate"><div class="progress-fill" /></div>
          <div class="progress-row">
            <span class="hint">{{ stage === 'whois' ? 'Consultando WHOIS...' : 'Resolvendo DNS...' }}</span>
            <button class="btn-secondary" @click="stopCheck">Parar</button>
          </div>
        </div>

        <template v-if="lastResult && !lastResult.error">
          <div class="section-block">
            <span class="section-label">Registros DNS</span>
            <div v-for="rt in recordGroups" :key="rt.type" class="record-row">
              <span class="record-type">{{ rt.type }}</span>
              <div class="record-values">
                <span v-if="!rt.entries.length" class="hint">(nenhum)</span>
                <span v-for="(v, i) in rt.entries" :key="i" class="record-value">{{ v }}</span>
              </div>
            </div>
          </div>

          <div class="section-block">
            <span class="section-label">Email (SPF / DMARC / DKIM)</span>
            <div class="pill-row">
              <span class="mail-pill" :class="lastResult.spf ? 'pill-ok' : 'pill-bad'">SPF {{ lastResult.spf ? 'OK' : 'ausente' }}</span>
              <span class="mail-pill" :class="lastResult.dmarc ? 'pill-ok' : 'pill-bad'">DMARC {{ lastResult.dmarc ? 'OK' : 'ausente' }}</span>
              <span class="mail-pill" :class="lastResult.dkim?.length ? 'pill-ok' : 'pill-bad'">
                DKIM {{ lastResult.dkim?.length ? `${lastResult.dkim.length} seletor(es)` : 'não encontrado' }}
              </span>
            </div>
            <p v-if="lastResult.spf" class="hint mono-hint">{{ lastResult.spf }}</p>
            <p v-if="lastResult.dmarc" class="hint mono-hint">{{ lastResult.dmarc }}</p>
            <p v-for="d in lastResult.dkim" :key="d.selector" class="hint mono-hint">{{ d.selector }}: {{ d.value }}</p>
          </div>

          <div class="section-block">
            <span class="section-label">WHOIS</span>
            <div v-if="lastResult.whois?.error" class="banner warn">{{ lastResult.whois.error }}</div>
            <template v-else-if="lastResult.whois">
              <div class="whois-fields">
                <div v-if="lastResult.whois.parsed?.registrar" class="whois-field">
                  <span class="hint">Registrador</span>
                  <span>{{ lastResult.whois.parsed.registrar }}</span>
                </div>
                <div v-if="lastResult.whois.parsed?.createdAt" class="whois-field">
                  <span class="hint">Criado em</span>
                  <span>{{ lastResult.whois.parsed.createdAt }}</span>
                </div>
                <div v-if="lastResult.whois.parsed?.expiresAt" class="whois-field">
                  <span class="hint">Expira em</span>
                  <span>{{ lastResult.whois.parsed.expiresAt }}</span>
                </div>
                <div v-if="lastResult.whois.parsed?.updatedAt" class="whois-field">
                  <span class="hint">Atualizado em</span>
                  <span>{{ lastResult.whois.parsed.updatedAt }}</span>
                </div>
                <div v-if="lastResult.whois.parsed?.dnssec" class="whois-field">
                  <span class="hint">DNSSEC</span>
                  <span>{{ lastResult.whois.parsed.dnssec }}</span>
                </div>
              </div>
              <div v-if="lastResult.whois.parsed?.statuses?.length" class="pill-row">
                <span v-for="s in lastResult.whois.parsed.statuses" :key="s" class="status-pill">{{ s }}</span>
              </div>
              <div v-if="lastResult.whois.parsed?.nameServers?.length" class="record-values">
                <span v-for="ns in lastResult.whois.parsed.nameServers" :key="ns" class="record-value">{{ ns }}</span>
              </div>
              <button class="link-btn" @click="showRawWhois = !showRawWhois">
                {{ showRawWhois ? 'Ocultar' : 'Ver' }} WHOIS bruto ({{ lastResult.whois.server }})
              </button>
              <pre v-if="showRawWhois" class="raw-whois">{{ lastResult.whois.raw }}</pre>
            </template>
          </div>

          <div class="summary-row">
            <span class="hint">{{ formatDuration(lastResult.durationMs) }}</span>
          </div>
        </template>

        <div v-if="lastResult && lastResult.cancelled" class="banner warn">Consulta parada manualmente.</div>
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
import { runDnsWhois } from '../lib/bridgeClient'

const RECORD_ORDER = ['A', 'AAAA', 'MX', 'NS', 'CNAME', 'TXT', 'SOA', 'CAA']

function formatRecordEntries(type, value) {
  if (!value) return []
  if (type === 'SOA') {
    if (typeof value !== 'object' || Array.isArray(value)) return []
    return [`ns=${value.nsname} admin=${value.hostmaster} serial=${value.serial} refresh=${value.refresh} retry=${value.retry} expire=${value.expire} minTTL=${value.minttl}`]
  }
  if (!Array.isArray(value)) return []
  if (type === 'MX') return value.map((r) => `${r.priority} ${r.exchange}`)
  if (type === 'TXT') return value.map((parts) => `"${(Array.isArray(parts) ? parts.join('') : parts)}"`)
  if (type === 'CAA') {
    return value.map((r) =>
      Object.entries(r)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
    )
  }
  return value
}

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
  defaultHeight: 580
})

const activeTab = ref('target')

const domain = ref(props.data.domain || '')
const timeoutMs = ref(props.data.timeoutMs ?? 5000)

const running = ref(false)
const stage = ref('dns')
const showRawWhois = ref(false)
const lastResult = ref(props.data.lastResult || null)
let controller = null

function syncData() {
  updateNodeData(props.id, {
    domain: domain.value,
    timeoutMs: timeoutMs.value,
    lastResult: lastResult.value
  })
}

const canStart = computed(() => Boolean(domain.value.trim()) && !running.value)

const statusDotClass = computed(() => {
  if (running.value) return 'pending'
  if (!lastResult.value || lastResult.value.error) return ''
  if (lastResult.value.whois?.error) return 'warn'
  return 'online'
})

const recordGroups = computed(() => {
  if (!lastResult.value?.records) return []
  return RECORD_ORDER.map((type) => ({ type, entries: formatRecordEntries(type, lastResult.value.records[type]) }))
})

function formatDuration(ms) {
  if (!ms && ms !== 0) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function startCheck() {
  if (!canStart.value) return
  syncData()
  lastResult.value = null
  showRawWhois.value = false
  stage.value = 'dns'
  running.value = true
  activeTab.value = 'result'

  controller = runDnsWhois(
    { domain: domain.value.trim(), timeoutMs: timeoutMs.value },
    {
      onProgress: (msg) => {
        if (msg.stage) stage.value = msg.stage
      },
      onResult: (result) => {
        running.value = false
        controller = null
        lastResult.value = result.error
          ? { error: result.error, cancelled: result.cancelled }
          : {
              domain: result.domain,
              records: result.records,
              spf: result.spf,
              dmarc: result.dmarc,
              dkim: result.dkim,
              whois: result.whois,
              durationMs: result.durationMs,
              cancelled: result.cancelled
            }
        syncData()
      }
    }
  )
}

function stopCheck() {
  controller?.stop()
}

onBeforeUnmount(() => {
  controller?.stop()
})
</script>

<style scoped>
.dw-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.dw-node.selected {
  border-color: var(--selected-color);
}

.dw-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.dw-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.dw-header {
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

.dw-header:active {
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

.dw-title {
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

.mono-hint {
  font-family: 'Menlo', Consolas, monospace;
  word-break: break-word;
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

.start-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary,
.btn-secondary {
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

.progress-bar.indeterminate .progress-fill {
  width: 40% !important;
  animation: indeterminate 1.1s ease-in-out infinite;
}

@keyframes indeterminate {
  0% {
    margin-left: -40%;
  }
  100% {
    margin-left: 100%;
  }
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
  justify-content: flex-end;
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

.section-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg-surface);
}

.record-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.record-type {
  flex-shrink: 0;
  width: 42px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.record-values {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.record-value {
  font-family: 'Menlo', Consolas, monospace;
  font-size: 10.5px;
  color: var(--color-text-primary);
  word-break: break-word;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.mail-pill {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
}

.mail-pill.pill-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.mail-pill.pill-bad {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-secondary);
}

.status-pill {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 10px;
}

.whois-fields {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.whois-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-primary);
}

.whois-field .hint {
  flex-shrink: 0;
  width: 90px;
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

.raw-whois {
  max-height: 220px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  font-family: 'Menlo', Consolas, monospace;
  font-size: 10px;
  white-space: pre-wrap;
  word-break: break-word;
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

.dw-node:hover .resize-handle {
  opacity: 1;
}
</style>
