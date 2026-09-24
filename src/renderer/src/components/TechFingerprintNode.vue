<template>
  <div
    class="tf-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="tf-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="tf-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="tf-handle"
      :class="{ connected: isBottomConnected }"
    />

    <div class="tf-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="statusDotClass" />
      <span class="tf-title">{{ data.name }}</span>
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
          <span class="section-label">URL alvo</span>
          <input
            v-model="url"
            class="header-input mono"
            type="text"
            placeholder="https://exemplo.com"
            @input="syncData"
          />
          <p class="hint">
            Faz uma requisição e cruza headers, cookies e o HTML da resposta contra uma lista curada de assinaturas
            (CMS, framework, linguagem, bibliotecas JS, servidor web, CDN/WAF e analytics) — sem depender de
            Wappalyzer/whatweb instalado.
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
          <button class="btn-primary" :disabled="!canStart" @click="startCheck">Identificar</button>
          <span v-if="!url" class="hint">Informe a URL alvo na aba Alvo.</span>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar indeterminate"><div class="progress-fill" /></div>
          <div class="progress-row">
            <span class="hint">Analisando {{ url }}...</span>
            <button class="btn-secondary" @click="stopCheck">Parar</button>
          </div>
        </div>

        <div v-if="lastResult && !lastResult.error" class="summary-row">
          <span class="hint">HTTP {{ lastResult.status }} · {{ lastResult.detected.length }} tecnologia(s) · {{ formatDuration(lastResult.durationMs) }}</span>
        </div>

        <div v-if="lastResult && !lastResult.error && lastResult.detected.length === 0" class="banner ok">
          Nenhuma tecnologia identificada pelas assinaturas conhecidas.
        </div>

        <div v-if="lastResult && !lastResult.error && lastResult.detected.length" class="category-list">
          <div v-for="group in groupedDetected" :key="group.category" class="category-block">
            <span class="section-label">{{ categoryLabel(group.category) }}</span>
            <div class="tech-pills">
              <span v-for="t in group.items" :key="t.id" class="tech-pill" :title="t.evidence">{{ t.name }}</span>
            </div>
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
import { runTechFingerprint } from '../lib/bridgeClient'

// mesmos rótulos do bridge (bridge/techFingerprint.js) — duplicado aqui pra
// não precisar de IPC só pra montar a UI, mesmo padrão do
// COMMON_PATHS_CLIENT em DirFuzzNode.vue.
const CATEGORY_LABELS = {
  cms: 'CMS',
  framework: 'Framework / Linguagem',
  'js-library': 'Biblioteca JS',
  'web-server': 'Servidor Web',
  'cdn-waf': 'CDN / Proxy / WAF',
  analytics: 'Analytics / Terceiros'
}
const CATEGORY_ORDER = ['cms', 'framework', 'js-library', 'web-server', 'cdn-waf', 'analytics']

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
  defaultHeight: 500
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
  return lastResult.value.detected?.length ? 'online' : 'warn'
})

const groupedDetected = computed(() => {
  if (!lastResult.value?.detected?.length) return []
  const byCategory = new Map()
  for (const t of lastResult.value.detected) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, [])
    byCategory.get(t.category).push(t)
  }
  return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => ({ category, items: byCategory.get(category) }))
})

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category
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

  controller = runTechFingerprint(
    { url: url.value.trim(), timeoutMs: timeoutMs.value },
    {
      onResult: (result) => {
        running.value = false
        controller = null
        lastResult.value = result.error
          ? { error: result.error, cancelled: result.cancelled }
          : {
              url: result.url,
              finalUrl: result.finalUrl,
              status: result.status,
              detected: result.detected,
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
.tf-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.tf-node.selected {
  border-color: var(--selected-color);
}

.tf-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.tf-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.tf-header {
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

.tf-header:active {
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

.tf-title {
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

.banner.warn {
  background: rgba(234, 179, 8, 0.12);
  color: #b45309;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tech-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tech-pill {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
  font-size: 10.5px;
  font-weight: 600;
  cursor: default;
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

.tf-node:hover .resize-handle {
  opacity: 1;
}
</style>
