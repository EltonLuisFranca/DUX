<template>
  <div
    class="ollama-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="ollama-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="ollama-handle"
      :class="{ connected: isRightConnected }"
    />

    <div class="ollama-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="status" />
      <span class="ollama-title">{{ data.name || data.model }}</span>
      <span class="ollama-model">{{ data.model }}</span>
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

    <div ref="historyEl" class="ollama-history nodrag nowheel nopan">
      <div v-if="!data.messages?.length" class="empty-hint">Converse com {{ data.model }}...</div>
      <div v-for="(msg, index) in data.messages" :key="index" class="msg" :class="msg.role">
        <div class="msg-bubble">{{ msg.content }}</div>
      </div>
      <div v-if="streamingText" class="msg assistant">
        <div class="msg-bubble">{{ streamingText }}<span class="cursor">▍</span></div>
      </div>
      <div v-if="errorText" class="msg error">
        <div class="msg-bubble">{{ errorText }}</div>
      </div>
    </div>

    <div class="ollama-composer nodrag nowheel nopan">
      <textarea
        v-model="draft"
        class="composer-input"
        placeholder="Digite uma mensagem..."
        rows="1"
        :disabled="status === 'sending'"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <button class="send-btn" :disabled="status === 'sending' || !draft.trim()" @click="send">
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M2 8h11M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </button>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path d="M13 3L3 13M13 8.5L8.5 13M13 13.5L13.5 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'
import { streamChat } from '../lib/ollamaClient'
import { useHandleConnection } from '../lib/useHandleConnection'

const MIN_NODE_WIDTH = 360
const MIN_NODE_HEIGHT = 320

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { viewport } = useVueFlow()
const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')

const nodeWidth = ref(props.data.width || 420)
const nodeHeight = ref(props.data.height || 480)

const historyEl = ref(null)
const draft = ref('')
const status = ref('idle')
const streamingText = ref('')
const errorText = ref('')
let abortController = null

function scrollToBottom() {
  nextTick(() => {
    if (historyEl.value) historyEl.value.scrollTop = historyEl.value.scrollHeight
  })
}

async function send() {
  const text = draft.value.trim()
  if (!text || status.value === 'sending') return

  const messages = [...(props.data.messages || []), { role: 'user', content: text }]
  updateNodeData(props.id, { messages })
  draft.value = ''
  status.value = 'sending'
  errorText.value = ''
  streamingText.value = ''
  scrollToBottom()

  abortController = new AbortController()
  try {
    const host = (props.data.host || 'http://localhost:11434').replace(/\/+$/, '')
    let fullText = ''

    await streamChat({
      host,
      token: props.data.token,
      model: props.data.model,
      messages,
      api: props.data.api,
      signal: abortController.signal,
      onToken: (chunk) => {
        fullText += chunk
        streamingText.value = fullText
        scrollToBottom()
      }
    })

    updateNodeData(props.id, { messages: [...messages, { role: 'assistant', content: fullText }] })
    streamingText.value = ''
    status.value = 'idle'
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[ollama-node] chat failed', err)
      errorText.value = `Erro ao conectar com ${props.data.host}. O Ollama está rodando?`
    }
    streamingText.value = ''
    status.value = 'idle'
  } finally {
    abortController = null
    scrollToBottom()
  }
}

onBeforeUnmount(() => {
  abortController?.abort()
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
})

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
.ollama-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.ollama-node.selected {
  border-color: var(--selected-color);
}

.ollama-handle {
  width: 8px;
  height: 8px;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.ollama-handle.connected {
  background: #3b82f6;
  border-color: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.ollama-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: 36px;
  padding: 0 10px;
  background: var(--color-bg-surface-alt);
  border-bottom: 1px solid var(--color-border-strong);
  border-radius: 9px 9px 0 0;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--color-text-tertiary);
}

.status-dot.sending {
  background: #f59e0b;
}

.ollama-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ollama-model {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

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

.settings-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.ollama-history {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-hint {
  margin: auto;
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.msg {
  display: flex;
  max-width: 85%;
}

.msg.user {
  align-self: flex-end;
}

.msg.assistant,
.msg.error {
  align-self: flex-start;
}

.msg-bubble {
  padding: 7px 10px;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg.user .msg-bubble {
  background: #3b82f6;
  color: #fff;
}

.msg.assistant .msg-bubble {
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
}

.msg.error .msg-bubble {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.cursor {
  animation: blink 1s step-start infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.ollama-composer {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px;
  border-top: 1px solid var(--color-border-strong);
  background: var(--color-bg-surface-alt);
  border-radius: 0 0 9px 9px;
}

.composer-input {
  flex: 1;
  min-height: 30px;
  max-height: 90px;
  padding: 6px 8px;
  box-sizing: border-box;
  resize: none;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  color: var(--color-text-primary);
  font-size: 12px;
  font-family: inherit;
}

.composer-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
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

.ollama-node:hover .resize-handle {
  opacity: 1;
}
</style>
