<template>
  <NodeShell
    :id="id"
    :data="data"
    :selected="selected"
    :resize="{ minWidth: 380, minHeight: 440, defaultWidth: 460, defaultHeight: 540 }"
    :title="data.name"
    :status="statusColor"
    :status-pulse="statusDotClass === 'pending'"
  >
    <template #icon>
      <svg viewBox="0 0 20 20" width="12" height="12" v-html="SECURITY_HEADERS_ICON"></svg>
    </template>

    <div class="tabs-row nodrag">
      <button class="tab-btn" :class="{ active: activeTab === 'target' }" @click="activeTab = 'target'">Alvo</button>
      <button class="tab-btn" :class="{ active: activeTab === 'result' }" @click="activeTab = 'result'">Resultado</button>
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
            Faz uma requisição e analisa os headers de resposta relevantes à segurança: CSP, HSTS, X-Frame-Options,
            X-Content-Type-Options, Referrer-Policy, Permissions-Policy, flags dos cookies (Secure/HttpOnly/SameSite)
            e exposição de versão em Server/X-Powered-By.
          </p>
        </div>

        <div class="field-row">
          <label class="exec-field">
            Timeout (ms)
            <input v-model.number="timeoutMs" type="number" min="1000" max="30000" :disabled="running" @input="syncData" />
          </label>
        </div>
      </div>

      <div v-else class="pane">
        <div v-if="!running" class="start-row">
          <button class="btn-primary" :disabled="!canStart" @click="startCheck">Verificar</button>
          <span v-if="!url" class="hint">Informe a URL alvo na aba Alvo.</span>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar indeterminate"><div class="progress-fill" /></div>
          <div class="progress-row">
            <span class="hint">Verificando {{ url }}...</span>
            <button class="btn-secondary" @click="stopCheck">Parar</button>
          </div>
        </div>

        <div v-if="lastResult && !lastResult.error" class="score-banner" :class="gradeClass(lastResult.score.grade)">
          <span class="score-grade">{{ lastResult.score.grade }}</span>
          <div class="score-info">
            <strong>{{ lastResult.score.pct }}% de proteção</strong>
            <span class="hint">HTTP {{ lastResult.status }} · {{ formatDuration(lastResult.durationMs) }}</span>
          </div>
        </div>

        <div v-if="lastResult && !lastResult.error" class="header-list">
          <div v-for="h in lastResult.headers" :key="h.id" class="header-row-item">
            <div class="header-row-head">
              <span class="header-name">{{ h.label }}</span>
              <span class="header-badge" :class="badgeClass(h.status)">{{ statusLabel(h.status) }}</span>
            </div>
            <p class="hint header-why">{{ h.why }}</p>
            <p v-if="h.value" class="hint header-value">{{ h.value }}</p>
          </div>
        </div>

        <div v-if="lastResult && lastResult.cancelled" class="banner warn">Verificação parada manualmente.</div>
        <div v-if="lastResult && lastResult.error" class="banner danger">{{ lastResult.error }}</div>
      </div>
    </div>

  </NodeShell>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import NodeShell from './NodeShell.vue'
import { SECURITY_HEADERS_ICON } from '../nodeTypes/nodeIcons'
import { updateNodeData } from '../store/flowStore'
import { runSecurityHeadersCheck } from '../lib/bridgeClient'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const activeTab = ref('target')

const url = ref(props.data.url || '')
const timeoutMs = ref(props.data.timeoutMs ?? 8000)

const running = ref(false)
const lastResult = ref(props.data.lastResult || null)
let controller = null

function syncData() {
  updateNodeData(props.id, {
    url: url.value,
    timeoutMs: timeoutMs.value,
    lastResult: lastResult.value
  })
}

const canStart = computed(() => Boolean(url.value.trim()) && !running.value)

const statusDotClass = computed(() => {
  if (running.value) return 'pending'
  if (!lastResult.value || lastResult.value.error) return ''
  const grade = lastResult.value.score?.grade
  if (grade === 'A' || grade === 'B') return 'online'
  if (grade === 'C') return 'warn'
  return 'danger'
})

const STATUS_DOT_COLORS = { pending: '#eab308', online: '#22c55e', warn: '#eab308', danger: '#ef4444' }
const statusColor = computed(() => STATUS_DOT_COLORS[statusDotClass.value] || null)

function gradeClass(grade) {
  if (grade === 'A' || grade === 'B') return 'grade-good'
  if (grade === 'C') return 'grade-mid'
  return 'grade-bad'
}

// mesmas quatro categorias que o bridge devolve (bridge/securityHeaders.js) —
// 'ok'/'weak'/'missing' pros headers de proteção, 'info' quando não se aplica
// (ex: nenhum cookie definido) ou é neutro (Server presente mas sem versão).
function badgeClass(status) {
  if (status === 'ok') return 'status-ok'
  if (status === 'weak') return 'status-weak'
  if (status === 'missing') return 'status-missing'
  return 'status-info'
}

function statusLabel(status) {
  if (status === 'ok') return 'OK'
  if (status === 'weak') return 'Fraco'
  if (status === 'missing') return 'Ausente'
  return 'Info'
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

  controller = runSecurityHeadersCheck(
    { url: url.value.trim(), timeoutMs: timeoutMs.value },
    {
      onResult: (result) => {
        running.value = false
        controller = null
        lastResult.value = result.error
          ? { error: result.error, cancelled: result.cancelled }
          : {
              status: result.status,
              finalUrl: result.finalUrl,
              headers: result.headers,
              score: result.score,
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
:deep(.shell-header) {
  cursor: grab;
}

:deep(.shell-header:active) {
  cursor: grabbing;
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

.score-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
}

.score-banner.grade-good {
  background: rgba(34, 197, 94, 0.12);
}

.score-banner.grade-mid {
  background: rgba(234, 179, 8, 0.12);
}

.score-banner.grade-bad {
  background: rgba(239, 68, 68, 0.12);
}

.score-grade {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--color-bg-surface);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.score-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--color-text-primary);
}

.header-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-row-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg-surface);
}

.header-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.header-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-why {
  line-height: 1.4;
}

.header-value {
  font-family: 'Menlo', Consolas, monospace;
  word-break: break-word;
}

.header-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.header-badge.status-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.header-badge.status-weak {
  background: rgba(234, 179, 8, 0.15);
  color: #b45309;
}

.header-badge.status-missing {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.header-badge.status-info {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-secondary);
}

</style>
