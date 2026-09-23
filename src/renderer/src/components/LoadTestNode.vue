<template>
  <div
    class="lt-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="lt-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="lt-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="lt-handle"
      :class="{ connected: isBottomConnected }"
    />

    <div class="lt-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="statusDotClass" />
      <span class="lt-title">{{ data.name }}</span>
      <button class="header-btn nodrag" title="Log completo do teste" @click="showLogModal = true">
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
      <button class="tab-btn" :class="{ active: activeTab === 'load' }" @click="activeTab = 'load'">Carga</button>
      <button class="tab-btn" :class="{ active: activeTab === 'run' }" @click="activeTab = 'run'">Execução</button>
    </div>

    <div class="tab-body nodrag nowheel nopan">
      <div v-if="activeTab === 'target'" class="pane">
        <div class="request-row">
          <select v-model="method" class="method-select" @change="syncData">
            <option v-for="m in METHODS" :key="m" :value="m">{{ m }}</option>
          </select>
          <input
            v-model="url"
            class="url-input"
            type="text"
            placeholder="https://staging.meu-sistema.com/endpoint"
            @input="syncData"
          />
        </div>
        <p class="hint">Alvo sempre em branco ao criar o node — informe a cada teste, de propósito.</p>

        <div class="headers-editor">
          <span class="section-label">Headers</span>
          <div v-for="(h, i) in headers" :key="i" class="header-row">
            <input v-model="h.key" class="header-input" type="text" placeholder="Chave" @input="syncData" />
            <input v-model="h.value" class="header-input" type="text" placeholder="Valor" @input="syncData" />
            <button class="remove-btn" @click="removeHeader(i)">
              <svg viewBox="0 0 16 16" width="12" height="12">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <button class="add-header-btn" @click="addHeader">+ Header</button>
        </div>

        <div v-if="!['GET', 'HEAD'].includes(method)" class="field-block">
          <span class="section-label">Body (opcional)</span>
          <textarea
            v-model="body"
            class="body-editor"
            spellcheck="false"
            placeholder='{"exemplo":"valor"}'
            @input="syncData"
          />
        </div>
      </div>

      <div v-else-if="activeTab === 'load'" class="pane">
        <label class="exec-field">
          RPS alvo (requisições/segundo)
          <input v-model.number="rps" type="number" min="1" :max="MAX_RPS" :disabled="running" @input="syncData" />
        </label>
        <p class="hint">Até {{ MAX_RPS }} req/s.</p>

        <label class="exec-field">
          Duração (segundos)
          <input v-model.number="durationSec" type="number" min="1" :max="MAX_DURATION_SEC" :disabled="running" @input="syncData" />
        </label>
        <p class="hint">Até {{ MAX_DURATION_SEC }}s ({{ Math.round(MAX_DURATION_SEC / 60) }} min).</p>

        <label class="exec-field">
          Ramp-up (segundos)
          <input v-model.number="rampUpSec" type="number" min="0" :max="durationSec" :disabled="running" @input="syncData" />
        </label>
        <p class="hint">Tempo pra subir gradualmente de 0 até o RPS alvo, em vez de começar no pico. 0 = sem ramp-up.</p>
      </div>

      <div v-else class="pane">
        <div v-if="!running && !showConfirm" class="start-row">
          <button class="btn-primary" :disabled="!canStart" @click="clickStart">Iniciar teste de carga</button>
          <span v-if="!url" class="hint">Informe a URL alvo na aba Alvo.</span>
        </div>

        <div v-if="showConfirm" class="confirm-panel">
          <p>
            Confirma o teste de carga contra <strong>{{ method }} {{ url }}</strong> — {{ rps }} req/s por
            {{ durationSec }}s{{ rampUpSec ? ` (ramp-up de ${rampUpSec}s)` : '' }}?
          </p>
          <div class="confirm-actions">
            <button class="btn-secondary" @click="showConfirm = false">Cancelar</button>
            <button class="btn-danger" @click="confirmStart">Confirmar e iniciar</button>
          </div>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar"><div class="progress-fill" :style="{ width: progressPct + '%' }" /></div>
          <div class="progress-row">
            <span class="hint">{{ elapsedLabel }} / {{ durationSec }}s</span>
            <button class="btn-secondary" @click="stopTest">Parar</button>
          </div>
          <div class="stats-grid">
            <div class="stat-tile">
              <span class="stat-label">RPS alvo agora</span>
              <span class="stat-value">{{ liveTick?.targetRpsNow ?? 0 }}</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">RPS real</span>
              <span class="stat-value">{{ liveTick?.windowRps ?? 0 }}</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">Latência média</span>
              <span class="stat-value">{{ liveTick?.avgLatencyMs != null ? liveTick.avgLatencyMs + 'ms' : '—' }}</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">Taxa de erro</span>
              <span class="stat-value">{{ formatPct(liveTick?.errorRate) }}</span>
            </div>
          </div>
        </div>

        <div v-if="lastResult && !lastResult.error" class="summary-block">
          <div class="banner" :class="summaryBannerClass">
            {{ lastResult.cancelled ? 'Parado manualmente' : 'Concluído' }} — {{ lastResult.totalCompleted }}
            requisições em {{ formatDuration(lastResult.durationMs) }} ({{ Math.round(lastResult.achievedRps) }} req/s
            médio).
          </div>
          <div class="stats-grid">
            <div class="stat-tile">
              <span class="stat-label">Taxa de erro</span>
              <span class="stat-value">{{ formatPct(lastResult.errorRate) }}</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">Latência p50</span>
              <span class="stat-value">{{ lastResult.latency.p50 }}ms</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">Latência p95</span>
              <span class="stat-value">{{ lastResult.latency.p95 }}ms</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">Latência p99</span>
              <span class="stat-value">{{ lastResult.latency.p99 }}ms</span>
            </div>
          </div>
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
              <span class="logs-modal-title">Log do teste de carga — {{ data.name }}</span>
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

            <div class="logs-modal-body">
              <div v-if="!ticks.length" class="logs-empty">Nenhum tick de progresso registrado ainda.</div>
              <div v-for="(t, i) in [...ticks].reverse()" :key="i" class="log-row">
                <span class="log-seq">{{ t.elapsedSec.toFixed(1) }}s</span>
                <span class="log-cred">alvo {{ t.targetRpsNow }}rps</span>
                <span class="log-cred">real {{ t.windowRps }}rps</span>
                <span class="log-status">{{ t.avgLatencyMs != null ? t.avgLatencyMs + 'ms' : '—' }}</span>
                <span v-if="t.errorRate" class="log-tag warn">{{ formatPct(t.errorRate) }} erro</span>
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
import { runLoadTest } from '../lib/bridgeClient'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH']
// mesmos tetos de bridge/loadTest.js (MAX_RPS/MAX_DURATION_SEC) — duplicados
// aqui só pra validação/hint no formulário; o bridge é quem realmente aplica
// o clamp, isso aqui é só UX (evita digitar um valor absurdo sem feedback)
const MAX_RPS = 5000
const MAX_DURATION_SEC = 600

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
  defaultHeight: 500
})

const activeTab = ref('target')

// URL nunca vem pré-preenchida do data (createData do registry não passa
// url) nem é sugerida — pedido explícito do card, por segurança de produto
const url = ref(props.data.url || '')
const method = ref(props.data.method || 'GET')
const headers = ref(
  Array.isArray(props.data.headers) && props.data.headers.length ? props.data.headers : [{ key: '', value: '' }]
)
const body = ref(props.data.body || '')

const rps = ref(props.data.rps ?? 20)
const durationSec = ref(props.data.durationSec ?? 30)
const rampUpSec = ref(props.data.rampUpSec ?? 5)

const running = ref(false)
const showConfirm = ref(false)
const ticks = ref([])
const lastResult = ref(props.data.lastResult || null)
const showLogModal = ref(false)
const logCopied = ref(false)
let logCopiedTimeout = null
let controller = null

function addHeader() {
  headers.value.push({ key: '', value: '' })
  syncData()
}

function removeHeader(index) {
  headers.value.splice(index, 1)
  if (headers.value.length === 0) headers.value.push({ key: '', value: '' })
  syncData()
}

function syncData() {
  updateNodeData(props.id, {
    url: url.value,
    method: method.value,
    headers: headers.value,
    body: body.value,
    rps: rps.value,
    durationSec: durationSec.value,
    rampUpSec: rampUpSec.value,
    lastResult: lastResult.value
  })
}

const canStart = computed(() => Boolean(url.value.trim()) && rps.value > 0 && durationSec.value > 0 && !running.value)

const liveTick = computed(() => ticks.value[ticks.value.length - 1] || null)

const statusDotClass = computed(() => {
  if (running.value) return 'pending'
  if (!lastResult.value || lastResult.value.error) return ''
  if (lastResult.value.errorRate >= 0.05) return 'danger'
  if (lastResult.value.errorRate > 0) return 'warn'
  return 'online'
})

const summaryBannerClass = computed(() => {
  if (!lastResult.value) return ''
  if (lastResult.value.errorRate >= 0.05) return 'danger'
  if (lastResult.value.errorRate > 0) return 'warn'
  return 'ok'
})

const progressPct = computed(() => {
  if (!liveTick.value || !durationSec.value) return 0
  return Math.min(100, Math.round((liveTick.value.elapsedSec / durationSec.value) * 100))
})

const elapsedLabel = computed(() => (liveTick.value ? Math.round(liveTick.value.elapsedSec) : 0))

function formatPct(rate) {
  if (rate == null) return '0%'
  return `${Math.round(rate * 1000) / 10}%`
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
  startTest()
}

function startTest() {
  syncData()
  ticks.value = []
  lastResult.value = null
  running.value = true
  activeTab.value = 'run'

  controller = runLoadTest(
    {
      target: {
        url: url.value.trim(),
        method: method.value,
        headers: headers.value,
        body: body.value
      },
      rps: rps.value,
      durationSec: durationSec.value,
      rampUpSec: rampUpSec.value
    },
    {
      onProgress: (msg) => {
        ticks.value.push(msg)
      },
      onResult: (result) => {
        running.value = false
        controller = null
        lastResult.value = result.error
          ? { error: result.error }
          : {
              cancelled: result.cancelled,
              totalSent: result.totalSent,
              totalCompleted: result.totalCompleted,
              totalErrors: result.totalErrors,
              errorRate: result.errorRate,
              achievedRps: result.achievedRps,
              durationMs: result.durationMs,
              latency: result.latency
            }
        syncData()
      }
    }
  )
}

function stopTest() {
  controller?.stop()
}

async function copyLog() {
  const text = [...ticks.value]
    .map((t) => `${t.elapsedSec.toFixed(1)}s alvo:${t.targetRpsNow}rps real:${t.windowRps}rps lat:${t.avgLatencyMs ?? '—'}ms erro:${formatPct(t.errorRate)}`)
    .join('\n')
  try {
    await navigator.clipboard.writeText(text)
    logCopied.value = true
    clearTimeout(logCopiedTimeout)
    logCopiedTimeout = setTimeout(() => {
      logCopied.value = false
    }, 1500)
  } catch (err) {
    console.error('[load-test-node] copy failed', err)
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
.lt-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.lt-node.selected {
  border-color: var(--selected-color);
}

.lt-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.lt-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.lt-header {
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

.lt-header:active {
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

.lt-title {
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

.request-row {
  display: flex;
  gap: 6px;
}

.method-select {
  flex-shrink: 0;
  width: 78px;
  height: 28px;
  padding: 0 4px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.url-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 12px;
  font-family: 'Menlo', Consolas, monospace;
}

.url-input:focus,
.method-select:focus,
.header-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
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

.headers-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--color-border);
}

.header-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.header-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11px;
  font-family: 'Menlo', Consolas, monospace;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.remove-btn:hover {
  background: var(--color-hover);
  color: #ef4444;
}

.add-header-btn {
  align-self: flex-start;
  margin-top: 2px;
  padding: 4px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11px;
  cursor: pointer;
}

.add-header-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.exec-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10.5px;
  color: var(--color-text-secondary);
}

.exec-field input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 12px;
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
  gap: 8px;
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

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.stat-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
}

.stat-label {
  font-size: 9.5px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.stat-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
  font-family: 'Menlo', Consolas, monospace;
}

.summary-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.lt-node:hover .resize-handle {
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

.log-seq {
  flex-shrink: 0;
  width: 44px;
  color: var(--color-text-tertiary);
}

.log-cred {
  flex-shrink: 0;
  width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-status {
  flex-shrink: 0;
  width: 56px;
}

.log-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.log-tag.warn {
  background: rgba(234, 179, 8, 0.15);
  color: #b45309;
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
