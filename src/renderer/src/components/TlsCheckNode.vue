<template>
  <div
    class="tc-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="tc-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="tc-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="tc-handle"
      :class="{ connected: isBottomConnected }"
    />

    <div class="tc-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="statusDotClass" />
      <span class="tc-title">{{ data.name }}</span>
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
          <span class="section-label">Host / IP alvo</span>
          <input
            v-model="host"
            class="header-input mono"
            type="text"
            placeholder="exemplo.com"
            @input="syncData"
          />
          <p class="hint">
            Conecta via TLS (módulo nativo do Node, sem depender de ferramentas externas) e reporta validade do
            certificado, cadeia, protocolo negociado e cifra.
          </p>
        </div>

        <div class="field-row">
          <label class="exec-field">
            Porta
            <input v-model.number="port" type="number" min="1" max="65535" :disabled="running" @input="syncData" />
          </label>
          <label class="exec-field">
            Timeout (ms)
            <input v-model.number="timeoutMs" type="number" min="1000" max="20000" :disabled="running" @input="syncData" />
          </label>
        </div>
      </div>

      <div v-else class="pane">
        <div v-if="!running" class="start-row">
          <button class="btn-primary" :disabled="!canStart" @click="startCheck">Verificar</button>
          <span v-if="!host" class="hint">Informe o host alvo na aba Alvo.</span>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar indeterminate"><div class="progress-fill" /></div>
          <div class="progress-row">
            <span class="hint">Conectando em {{ host }}:{{ port }}...</span>
            <button class="btn-secondary" @click="stopCheck">Parar</button>
          </div>
        </div>

        <div v-for="(a, i) in lastResult?.alerts" :key="i" class="banner" :class="a.level === 'danger' ? 'danger' : 'warn'">
          {{ a.text }}
        </div>

        <div v-if="lastResult && !lastResult.error" class="tls-summary">
          <div class="summary-pill" :class="lastResult.authorized ? 'pill-ok' : 'pill-bad'">
            {{ lastResult.authorized ? 'Cadeia confiável' : 'Cadeia não confiável' }}
          </div>
          <div class="summary-pill" :class="protocolPillClass(lastResult.protocol)">
            {{ lastResult.protocol || 'protocolo desconhecido' }}
          </div>
          <span class="hint">{{ lastResult.cipher ? lastResult.cipher.name : '' }} · {{ formatDuration(lastResult.durationMs) }}</span>
        </div>

        <div v-if="lastResult && !lastResult.error" class="chain-list">
          <div v-for="(c, i) in lastResult.chain" :key="i" class="chain-item">
            <div class="chain-item-head">
              <span class="chain-label">{{ i === 0 ? 'Certificado' : c.selfSigned ? 'Raiz (autoassinado)' : 'Emissor' }}</span>
              <span v-if="c.daysRemaining !== null" class="chain-days" :class="daysClass(c.daysRemaining)">
                {{ c.daysRemaining >= 0 ? `${c.daysRemaining}d restantes` : `expirado há ${Math.abs(c.daysRemaining)}d` }}
              </span>
            </div>
            <p class="hint chain-name">{{ c.subject || '(sem subject)' }}</p>
            <p class="hint chain-name">Emitido por: {{ c.issuer || '(desconhecido)' }}</p>
            <p class="hint">Válido de {{ formatDate(c.validFrom) }} até {{ formatDate(c.validTo) }}</p>
          </div>
        </div>

        <div v-if="lastResult && lastResult.cancelled" class="banner warn">Verificação parada manualmente.</div>
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
import { runTlsCheck } from '../lib/bridgeClient'

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
  minHeight: 440,
  defaultWidth: 460,
  defaultHeight: 540
})

const activeTab = ref('target')

const host = ref(props.data.host || '')
const port = ref(props.data.port ?? 443)
const timeoutMs = ref(props.data.timeoutMs ?? 8000)

const running = ref(false)
const lastResult = ref(props.data.lastResult || null)
let controller = null

function syncData() {
  updateNodeData(props.id, {
    host: host.value,
    port: port.value,
    timeoutMs: timeoutMs.value,
    lastResult: lastResult.value
  })
}

const canStart = computed(() => Boolean(host.value.trim()) && !running.value)

const statusDotClass = computed(() => {
  if (running.value) return 'pending'
  if (!lastResult.value || lastResult.value.error) return ''
  if (lastResult.value.alerts?.some((a) => a.level === 'danger')) return 'danger'
  if (lastResult.value.alerts?.length) return 'warn'
  return 'online'
})

function protocolPillClass(protocol) {
  if (!protocol) return 'pill-bad'
  const match = /TLSv(\d)(?:\.(\d))?/i.exec(protocol)
  const version = match ? Number(match[1]) + (match[2] ? Number(match[2]) / 10 : 0) : null
  return version !== null && version >= 1.2 ? 'pill-ok' : 'pill-bad'
}

function daysClass(days) {
  if (days < 0) return 'days-bad'
  if (days < 30) return 'days-warn'
  return 'days-ok'
}

function formatDate(value) {
  if (!value) return '?'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('pt-BR')
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function startCheck() {
  if (!canStart.value) return
  syncData()
  lastResult.value = null
  running.value = true
  activeTab.value = 'result'

  controller = runTlsCheck(
    { host: host.value.trim(), port: port.value, timeoutMs: timeoutMs.value },
    {
      onResult: (result) => {
        running.value = false
        controller = null
        lastResult.value = result.error
          ? { error: result.error, cancelled: result.cancelled }
          : {
              host: result.host,
              port: result.port,
              protocol: result.protocol,
              cipher: result.cipher,
              authorized: result.authorized,
              authorizationError: result.authorizationError,
              chain: result.chain,
              alerts: result.alerts,
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
.tc-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.tc-node.selected {
  border-color: var(--selected-color);
}

.tc-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.tc-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.tc-header {
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

.tc-header:active {
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

.tc-title {
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

.tls-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.summary-pill {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
}

.summary-pill.pill-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.summary-pill.pill-bad {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.chain-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chain-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg-surface);
}

.chain-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chain-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.chain-name {
  font-family: 'Menlo', Consolas, monospace;
  word-break: break-word;
}

.chain-days {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.chain-days.days-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.chain-days.days-warn {
  background: rgba(234, 179, 8, 0.15);
  color: #b45309;
}

.chain-days.days-bad {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
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

.tc-node:hover .resize-handle {
  opacity: 1;
}
</style>
