<template>
  <div
    class="http-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <Handle id="left" type="target" :position="Position.Left" class="http-handle" />
    <Handle id="right" type="source" :position="Position.Right" class="http-handle" />

    <div class="http-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="statusDotClass" />
      <span class="http-title">{{ data.name }}</span>
      <button class="header-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
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

    <div class="request-row nodrag">
      <select v-model="method" class="method-select" :class="method.toLowerCase()">
        <option v-for="m in METHODS" :key="m" :value="m">{{ m }}</option>
      </select>
      <input v-model="url" class="url-input" type="text" placeholder="https://..." @keyup.enter="send" />
      <button class="send-btn" :disabled="loading || !url" @click="send">
        <svg v-if="!loading" viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
          <path d="M2 2l12 6-12 6 2.5-6L2 2z" />
        </svg>
        <svg v-else class="spinner" viewBox="0 0 16 16" width="13" height="13">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="24 12" />
        </svg>
      </button>
    </div>

    <div class="tabs-row nodrag">
      <button class="tab-btn" :class="{ active: activeTab === 'auth' }" @click="activeTab = 'auth'">Auth</button>
      <button class="tab-btn" :class="{ active: activeTab === 'headers' }" @click="activeTab = 'headers'">
        Headers
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'body' }" @click="activeTab = 'body'">Body</button>
      <button class="tab-btn" :class="{ active: activeTab === 'response' }" @click="activeTab = 'response'">
        Resposta
      </button>
    </div>

    <div class="tab-body nodrag nowheel nopan">
      <div v-if="activeTab === 'auth'" class="auth-editor">
        <select v-model="authType" class="auth-type-select" @change="syncData">
          <option value="none">Nenhuma</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="apiKey">API Key</option>
        </select>

        <div v-if="authType === 'bearer'" class="auth-fields">
          <input
            v-model="authBearerToken"
            class="header-input"
            type="text"
            placeholder="Token"
            @input="syncData"
          />
        </div>

        <div v-else-if="authType === 'basic'" class="auth-fields">
          <input
            v-model="authBasicUser"
            class="header-input"
            type="text"
            placeholder="Usuário"
            @input="syncData"
          />
          <input
            v-model="authBasicPass"
            class="header-input"
            type="password"
            placeholder="Senha"
            @input="syncData"
          />
        </div>

        <div v-else-if="authType === 'apiKey'" class="auth-fields">
          <input
            v-model="authApiKeyName"
            class="header-input"
            type="text"
            placeholder="Nome do header (ex: X-API-Key)"
            @input="syncData"
          />
          <input
            v-model="authApiKeyValue"
            class="header-input"
            type="text"
            placeholder="Valor"
            @input="syncData"
          />
        </div>

        <p v-if="authType !== 'none'" class="auth-hint">Aplicado automaticamente como header ao enviar.</p>
      </div>

      <div v-else-if="activeTab === 'headers'" class="headers-editor">
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

      <textarea
        v-else-if="activeTab === 'body'"
        v-model="body"
        class="body-editor"
        placeholder='{"chave": "valor"}'
        spellcheck="false"
        @input="syncData"
      />

      <div v-else class="response-view">
        <div v-if="!response" class="response-empty">Envie a requisição para ver a resposta.</div>
        <template v-else>
          <div class="response-meta">
            <span class="response-status" :class="statusClass">{{ response.status || 'erro' }}</span>
            <span class="response-time" v-if="response.durationMs != null">{{ response.durationMs }}ms</span>
          </div>
          <pre class="response-body">{{ formattedResponseBody }}</pre>
        </template>
      </div>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path
          d="M13 3L3 13M13 8.5L8.5 13M13 13.5L13.5 13"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'

const MIN_NODE_WIDTH = 340
const MIN_NODE_HEIGHT = 300
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { viewport } = useVueFlow()

const nodeWidth = ref(props.data.width || 420)
const nodeHeight = ref(props.data.height || 380)

const url = ref(props.data.url || '')
const method = ref(props.data.method || 'GET')
const headers = ref(
  Array.isArray(props.data.headers) && props.data.headers.length ? props.data.headers : [{ key: '', value: '' }]
)
const body = ref(props.data.body || '')
const activeTab = ref('headers')
const loading = ref(false)
const response = ref(props.data.lastResponse || null)

const authType = ref(props.data.auth?.type || 'none')
const authBearerToken = ref(props.data.auth?.token || '')
const authBasicUser = ref(props.data.auth?.user || '')
const authBasicPass = ref(props.data.auth?.pass || '')
const authApiKeyName = ref(props.data.auth?.keyName || '')
const authApiKeyValue = ref(props.data.auth?.keyValue || '')

const statusDotClass = computed(() => {
  if (loading.value) return 'pending'
  if (!response.value) return ''
  return response.value.ok ? 'online' : 'offline'
})

const statusClass = computed(() => {
  const status = response.value?.status
  if (!status) return 'error'
  if (status < 300) return 'success'
  if (status < 400) return 'redirect'
  return 'error'
})

const formattedResponseBody = computed(() => {
  const raw = response.value?.body
  if (!raw) return response.value?.error || ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
})

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
    auth: {
      type: authType.value,
      token: authBearerToken.value,
      user: authBasicUser.value,
      pass: authBasicPass.value,
      keyName: authApiKeyName.value,
      keyValue: authApiKeyValue.value
    }
  })
}

// Monta o header de auth conforme o tipo selecionado — fica separado dos
// headers manuais na aba Headers pra não precisar duplicar Authorization
// toda vez que trocar o token.
function buildAuthHeader() {
  if (authType.value === 'bearer' && authBearerToken.value) {
    return { Authorization: `Bearer ${authBearerToken.value}` }
  }
  if (authType.value === 'basic' && authBasicUser.value) {
    const encoded = btoa(`${authBasicUser.value}:${authBasicPass.value}`)
    return { Authorization: `Basic ${encoded}` }
  }
  if (authType.value === 'apiKey' && authApiKeyName.value) {
    return { [authApiKeyName.value]: authApiKeyValue.value }
  }
  return {}
}

async function send() {
  if (!url.value || loading.value) return
  syncData()
  loading.value = true
  activeTab.value = 'response'

  const headerMap = { ...buildAuthHeader() }
  for (const h of headers.value) {
    if (h.key.trim()) headerMap[h.key.trim()] = h.value
  }

  const result = await window.httpNodeAPI.request({
    url: url.value,
    method: method.value,
    headers: headerMap,
    body: ['POST', 'PUT', 'PATCH'].includes(method.value) && body.value ? body.value : undefined
  })

  loading.value = false
  response.value = result
  updateNodeData(props.id, { lastResponse: result })
}

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

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
})
</script>

<style scoped>
.http-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.http-node.selected {
  border-color: var(--selected-color);
}

.http-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
}

.http-header {
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

.http-header:active {
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

.status-dot.offline {
  background: #ef4444;
}

.status-dot.pending {
  background: #eab308;
}

.http-title {
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
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.header-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.request-row {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
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

.method-select.get {
  color: #3b82f6;
}

.method-select.post {
  color: #22c55e;
}

.method-select.put,
.method-select.patch {
  color: #eab308;
}

.method-select.delete {
  color: #ef4444;
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

.url-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: #3b82f6;
  color: #fff;
  cursor: pointer;
}

.send-btn:disabled {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  cursor: default;
}

.spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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

.auth-editor {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.auth-type-select {
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
  cursor: pointer;
}

.auth-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auth-hint {
  margin: 0;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.headers-editor {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.header-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11px;
  font-family: 'Menlo', Consolas, monospace;
}

.header-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
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

.body-editor {
  width: 100%;
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 11.5px;
  font-family: 'Menlo', Consolas, monospace;
  line-height: 1.5;
  resize: none;
}

.body-editor:focus {
  outline: none;
}

.response-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.response-empty {
  padding: 16px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  text-align: center;
}

.response-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
}

.response-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  font-family: 'Menlo', Consolas, monospace;
}

.response-status.success {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.response-status.redirect {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
}

.response-status.error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.response-time {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.response-body {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-family: 'Menlo', Consolas, monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
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

.http-node:hover .resize-handle {
  opacity: 1;
}
</style>
