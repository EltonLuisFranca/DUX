<template>
  <NodeShell
    :id="id"
    :data="data"
    :selected="selected"
    :resize="{ minWidth: 360, minHeight: 260, defaultWidth: 640, defaultHeight: 440 }"
    :title="data.name || 'Navegador'"
  >
    <template #icon>
      <svg viewBox="0 0 20 20" width="12" height="12" v-html="BROWSER_ICON"></svg>
    </template>
    <template #headerActions>
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
    </template>

    <div class="browser-viewport">
      <webview
        ref="webviewEl"
        class="browser-body nodrag nowheel nopan"
        :src="data.url"
        webpreferences="nodeIntegration=no,contextIsolation=yes"
        allowpopups="false"
      ></webview>

      <div v-if="captureFlash" class="capture-flash" />
    </div>
  </NodeShell>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import NodeShell from './NodeShell.vue'
import { BROWSER_ICON } from '../nodeTypes/nodeIcons'
import { updateNodeData } from '../store/flowStore'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const webviewEl = ref(null)

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
})

watch(
  () => props.data.url,
  (newUrl) => {
    if (newUrl && newUrl !== currentUrl.value) {
      webviewEl.value?.loadURL(newUrl)
    }
  }
)
</script>

<style scoped>
:deep(.shell-header) {
  padding-right: 6px;
  gap: 4px;
}

.nav-btn {
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

.nav-btn:hover:not(:disabled) {
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

.browser-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

.browser-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  background: #fff;
}

.capture-flash {
  position: absolute;
  inset: 0;
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
</style>
