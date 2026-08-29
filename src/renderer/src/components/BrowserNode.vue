<template>
  <div
    class="browser-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <Handle id="left" type="target" :position="Position.Left" class="browser-handle" />
    <Handle id="right" type="source" :position="Position.Right" class="browser-handle" />

    <div class="browser-header" :style="{ background: data.headerColor || undefined }">
      <button class="nav-btn nodrag" title="Voltar" :disabled="!canGoBack" @click="goBack">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </button>
      <button class="nav-btn nodrag" title="Avançar" :disabled="!canGoForward" @click="goForward">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </button>
      <button class="nav-btn nodrag" title="Recarregar" @click="reload">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path
            d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3h-3"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>

      <input
        class="url-bar nodrag"
        type="text"
        :value="addressBarValue"
        placeholder="https://exemplo.com"
        @focus="handleAddressFocus"
        @blur="addressEditing = false"
        @keydown.enter="navigateToAddress"
      />

      <button class="nav-btn nodrag" title="Tirar print" :disabled="capturing" @click="captureScreenshot">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path
            d="M4 4.5V4a1 1 0 0 1 1-1h1.2l.6-1h2.4l.6 1H11a1 1 0 0 1 1 1v.5M2 4.5h12a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
          <circle cx="8" cy="8.5" r="2.4" stroke="currentColor" stroke-width="1.3" fill="none" />
        </svg>
      </button>
      <button class="settings-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
      </button>
    </div>

    <webview
      ref="webviewEl"
      class="browser-body nodrag nowheel nopan"
      :src="data.url"
      webpreferences="nodeIntegration=no,contextIsolation=yes"
      allowpopups="false"
    ></webview>

    <div v-if="captureFlash" class="capture-flash" />

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path d="M13 3L3 13M13 8.5L8.5 13M13 13.5L13.5 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'

const MIN_NODE_WIDTH = 360
const MIN_NODE_HEIGHT = 260

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { viewport } = useVueFlow()

const webviewEl = ref(null)
const nodeWidth = ref(props.data.width || 640)
const nodeHeight = ref(props.data.height || 440)

const currentUrl = ref(props.data.url)
const canGoBack = ref(false)
const canGoForward = ref(false)
const addressEditing = ref(false)
const addressDraft = ref(props.data.url)
const capturing = ref(false)
const captureFlash = ref(false)

const addressBarValue = ref(props.data.url)

function handleAddressFocus(event) {
  addressEditing.value = true
  addressDraft.value = currentUrl.value
  addressBarValue.value = currentUrl.value
  event.target.select()
}

function normalize(value) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function navigateToAddress(event) {
  const normalized = normalize(event.target.value)
  if (!normalized) return
  addressEditing.value = false
  webviewEl.value?.loadURL(normalized)
}

function goBack() {
  webviewEl.value?.goBack()
}

function goForward() {
  webviewEl.value?.goForward()
}

function reload() {
  webviewEl.value?.reload()
}

async function captureScreenshot() {
  if (!webviewEl.value || capturing.value) return
  capturing.value = true
  try {
    const image = await webviewEl.value.capturePage()
    const dataUrl = image.toDataURL()
    const hostname = safeHostname(currentUrl.value)
    const defaultName = `${hostname}-${Date.now()}.png`
    const result = await window.browserNodeAPI?.saveScreenshot(dataUrl, defaultName)
    if (result?.saved) {
      captureFlash.value = true
      setTimeout(() => (captureFlash.value = false), 250)
    }
  } catch (err) {
    console.error('[browser-node] screenshot failed', err)
  } finally {
    capturing.value = false
  }
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_')
  } catch {
    return 'screenshot'
  }
}

function onDidNavigate() {
  const wv = webviewEl.value
  if (!wv) return
  currentUrl.value = wv.getURL()
  canGoBack.value = wv.canGoBack()
  canGoForward.value = wv.canGoForward()
  if (!addressEditing.value) addressBarValue.value = currentUrl.value
  updateNodeData(props.id, { url: currentUrl.value })
}

onMounted(() => {
  const wv = webviewEl.value
  if (!wv) return
  wv.addEventListener('did-navigate', onDidNavigate)
  wv.addEventListener('did-navigate-in-page', onDidNavigate)
})

onBeforeUnmount(() => {
  const wv = webviewEl.value
  if (!wv) return
  wv.removeEventListener('did-navigate', onDidNavigate)
  wv.removeEventListener('did-navigate-in-page', onDidNavigate)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
})

watch(
  () => props.data.url,
  (newUrl) => {
    if (newUrl && newUrl !== currentUrl.value) {
      webviewEl.value?.loadURL(newUrl)
    }
  }
)

let resizeStartX = 0
let resizeStartY = 0
let resizeStartW = 0
let resizeStartH = 0

function startResize(event) {
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  resizeStartW = nodeWidth.value
  resizeStartH = nodeHeight.value
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', stopResize)
  event.preventDefault()
  event.stopPropagation()
}

function onResizeMove(event) {
  const zoom = viewport.value.zoom || 1
  const dx = (event.clientX - resizeStartX) / zoom
  const dy = (event.clientY - resizeStartY) / zoom
  nodeWidth.value = Math.max(MIN_NODE_WIDTH, Math.round(resizeStartW + dx))
  nodeHeight.value = Math.max(MIN_NODE_HEIGHT, Math.round(resizeStartH + dy))
}

function stopResize() {
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
  updateNodeData(props.id, { width: nodeWidth.value, height: nodeHeight.value })
}
</script>

<style scoped>
.browser-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.browser-node.selected {
  border-color: var(--selected-color);
}

.browser-handle {
  width: 8px;
  height: 8px;
}

.browser-header {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  height: 36px;
  padding: 0 6px;
  background: var(--color-bg-surface-alt);
  border-bottom: 1px solid var(--color-border-strong);
  border-radius: 9px 9px 0 0;
}

.nav-btn,
.settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.nav-btn:hover:not(:disabled),
.settings-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.nav-btn:disabled {
  color: var(--color-text-tertiary);
  cursor: default;
  opacity: 0.5;
}

.url-bar {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
}

.url-bar:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.browser-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  background: #fff;
  border-radius: 0 0 9px 9px;
}

.capture-flash {
  position: absolute;
  inset: 36px 0 0 0;
  background: #fff;
  opacity: 0.6;
  pointer-events: none;
  animation: flash-fade 0.25s ease-out;
}

@keyframes flash-fade {
  from {
    opacity: 0.6;
  }
  to {
    opacity: 0;
  }
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

.browser-node:hover .resize-handle {
  opacity: 1;
}
</style>
