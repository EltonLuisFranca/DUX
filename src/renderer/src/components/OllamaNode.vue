<template>
  <div
    class="ollama-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
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
      <button
        class="settings-btn nodrag"
        title="Nova conversa"
        :disabled="!data.messages?.length"
        @click="newConversation"
      >
        <NewChatIcon />
      </button>
      <button class="settings-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <GearIcon />
      </button>
    </div>

    <div ref="historyEl" class="ollama-history nodrag nowheel nopan">
      <div v-if="!data.messages?.length" class="empty-hint">Converse com {{ data.model }}...</div>
      <template v-for="(msg, index) in data.messages" :key="index">
        <details v-if="msg.role === 'tool'" class="tool-call">
          <summary class="tool-call-summary">
            <span class="tool-icon">🔧</span>
            <span class="tool-name">{{ msg.name }}</span>
            <span class="tool-args">{{ formatToolArgs(msg.args) }}</span>
          </summary>
          <pre class="tool-result">{{ msg.content }}</pre>
        </details>
        <div v-else-if="msg.content || msg.images?.length" class="msg" :class="msg.role">
          <div class="msg-bubble">
            <div v-if="msg.images?.length" class="msg-images">
              <img
                v-for="(img, imgIndex) in msg.images"
                :key="imgIndex"
                class="msg-image"
                :src="`data:${img.mimeType};base64,${img.base64}`"
                alt=""
              />
            </div>
            <template v-if="msg.content">{{ msg.content }}</template>
          </div>
          <button class="copy-btn nodrag" title="Copiar" @click="copyMessage(msg.content, index)">
            <CheckIcon v-if="copiedIndex === index" />
            <CopyIcon v-else />
          </button>
        </div>
      </template>
      <div v-if="streamingText" class="msg assistant">
        <div class="msg-bubble">{{ streamingText }}<span class="cursor">▍</span></div>
      </div>
      <div v-if="errorText" class="msg error">
        <div class="msg-bubble">{{ errorText }}</div>
      </div>
    </div>

    <div v-if="pendingImages.length" class="pending-images nodrag nowheel nopan">
      <div v-for="img in pendingImages" :key="img.id" class="pending-image">
        <img :src="`data:${img.mimeType};base64,${img.base64}`" alt="" />
        <button class="pending-image-remove" title="Remover" @click="removePendingImage(img.id)">
          <svg viewBox="0 0 16 16" width="9" height="9">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>

    <div class="ollama-composer nodrag nowheel nopan">
      <input
        ref="fileInputEl"
        type="file"
        accept="image/*"
        multiple
        class="file-input-hidden"
        @change="onFilesSelected"
      />
      <button
        class="attach-btn"
        title="Anexar imagem"
        :disabled="status === 'sending'"
        @click="fileInputEl?.click()"
      >
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path
            d="M10.5 4.5l-5 5a2.12 2.12 0 0 0 3 3l5.5-5.5a3.54 3.54 0 0 0-5-5L3.5 7.5a5 5 0 0 0 7 7L15 10"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>
      <textarea
        v-model="draft"
        class="composer-input"
        placeholder="Digite uma mensagem..."
        rows="1"
        :disabled="status === 'sending'"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <button
        class="send-btn"
        :disabled="status === 'sending' || (!draft.trim() && !pendingImages.length)"
        @click="send"
      >
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M2 8h11M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </button>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import CopyIcon from './icons/CopyIcon.vue'
import CheckIcon from './icons/CheckIcon.vue'
import NewChatIcon from './icons/NewChatIcon.vue'
import NodeToolbar from './NodeToolbar.vue'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'
import { streamChat } from '../lib/ollamaClient'
import { FILE_TOOLS, executeTool } from '../lib/ollamaTools'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'

const MAX_TOOL_ITERATIONS = 4

function formatToolArgs(args) {
  if (!args || Object.keys(args).length === 0) return ''
  // read_file/write_file/list_files têm todos um `path` — mostra só ele por
  // padrão (o que importa pra reconhecer de relance o que a tool tocou);
  // demais argumentos (ex: content de write_file) ficam só no resultado
  // expandido, não fazem sentido na linha de resumo
  return args.path ? `(${args.path})` : `(${JSON.stringify(args)})`
}

// mensagens exibidas (data.messages, guardadas no formato normalizado
// { id, name, arguments } pros tool_calls, { base64, mimeType } pras imagens
// — ver ollamaClient.js) -> formato que cada backend espera de volta no
// request. Precisa reconverter três casos: a mensagem assistant que carrega
// tool_calls (formato normalizado -> formato nativo de cada API), as
// mensagens role:'tool' com o resultado, e mensagens de usuário com imagens
// anexadas (modelo precisa suportar visão, ex: qwen3-vl).
function toApiMessages(messages, api) {
  return messages.map((msg) => {
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const tool_calls =
        api === 'openwebui'
          ? msg.tool_calls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.arguments || {}) }
            }))
          : msg.tool_calls.map((c) => ({ function: { name: c.name, arguments: c.arguments || {} } }))
      return { role: 'assistant', content: msg.content, tool_calls }
    }

    if (msg.role === 'tool') {
      return api === 'openwebui'
        ? { role: 'tool', tool_call_id: msg.toolCallId, content: msg.content }
        : { role: 'tool', tool_name: msg.name, content: msg.content }
    }

    if (msg.role === 'user' && msg.images?.length) {
      // Ollama nativo: array de base64 cru no campo `images` da mensagem.
      // OpenAI-compatible (Open WebUI): content vira array de partes
      // text/image_url, cada imagem como data URL.
      if (api === 'openwebui') {
        const parts = []
        if (msg.content) parts.push({ type: 'text', text: msg.content })
        for (const img of msg.images) {
          parts.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })
        }
        return { role: 'user', content: parts }
      }
      return { role: 'user', content: msg.content, images: msg.images.map((img) => img.base64) }
    }

    return msg
  })
}

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')

const { nodeWidth, nodeHeight, startResize } = useNodeResize(props, {
  minWidth: 360,
  minHeight: 320,
  defaultWidth: 420,
  defaultHeight: 480
})

const historyEl = ref(null)
const fileInputEl = ref(null)
const draft = ref('')
const status = ref('idle')
const streamingText = ref('')
const errorText = ref('')
const copiedIndex = ref(null)
const pendingImages = ref([])
let abortController = null
let copiedTimeout = null
let nextImageId = 0

function fileToImageEntry(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const [, mimeType, base64] = /^data:(.+?);base64,(.*)$/s.exec(reader.result) || []
      if (!base64) return reject(new Error('invalid image data'))
      resolve({ id: nextImageId++, mimeType, base64 })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onFilesSelected(event) {
  const files = [...(event.target.files || [])].filter((f) => f.type.startsWith('image/'))
  event.target.value = ''
  for (const file of files) {
    try {
      pendingImages.value = [...pendingImages.value, await fileToImageEntry(file)]
    } catch (err) {
      console.error('[ollama-node] failed to read image', err)
    }
  }
}

function removePendingImage(id) {
  pendingImages.value = pendingImages.value.filter((img) => img.id !== id)
}

function scrollToBottom() {
  nextTick(() => {
    if (historyEl.value) historyEl.value.scrollTop = historyEl.value.scrollHeight
  })
}

async function copyMessage(content, index) {
  try {
    await navigator.clipboard.writeText(content)
    copiedIndex.value = index
    clearTimeout(copiedTimeout)
    copiedTimeout = setTimeout(() => {
      copiedIndex.value = null
    }, 1500)
  } catch (err) {
    console.error('[ollama-node] copy failed', err)
  }
}

function newConversation() {
  abortController?.abort()
  streamingText.value = ''
  errorText.value = ''
  status.value = 'idle'
  updateNodeData(props.id, { messages: [], toolsUnsupported: false })
}

async function send() {
  const text = draft.value.trim()
  const images = pendingImages.value
  if ((!text && !images.length) || status.value === 'sending') return

  const userMessage = { role: 'user', content: text }
  if (images.length) userMessage.images = images.map(({ mimeType, base64 }) => ({ mimeType, base64 }))
  let messages = [...(props.data.messages || []), userMessage]
  updateNodeData(props.id, { messages })
  draft.value = ''
  pendingImages.value = []
  status.value = 'sending'
  errorText.value = ''
  streamingText.value = ''
  scrollToBottom()

  abortController = new AbortController()
  try {
    const host = (props.data.host || 'http://localhost:11434').replace(/\/+$/, '')
    // uma vez que o backend responde 400 pra `tools` (modelo/servidor sem
    // suporte), não tenta de novo nas próximas mensagens desta conversa —
    // evita pagar o custo de uma tentativa extra falha a cada turno
    let toolsUnsupported = Boolean(props.data.toolsUnsupported)

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let fullText = ''
      let toolCalls = null

      const result = await streamChat({
        host,
        token: props.data.token,
        model: props.data.model,
        messages: toApiMessages(messages, props.data.api),
        api: props.data.api,
        tools: toolsUnsupported ? undefined : FILE_TOOLS,
        signal: abortController.signal,
        onToken: (chunk) => {
          fullText += chunk
          streamingText.value = fullText
          scrollToBottom()
        },
        onToolCalls: (calls) => {
          toolCalls = calls
        }
      })

      if (result.toolsUnsupported) {
        toolsUnsupported = true
        updateNodeData(props.id, { toolsUnsupported: true })
      }

      streamingText.value = ''

      if (!toolCalls?.length) {
        messages = [...messages, { role: 'assistant', content: fullText }]
        updateNodeData(props.id, { messages })
        break
      }

      // registra a decisão do modelo de chamar tools (sem bolha própria —
      // o template só renderiza msg.content não-vazio pra role assistant)
      messages = [...messages, { role: 'assistant', content: fullText, tool_calls: toolCalls }]

      for (const call of toolCalls) {
        const resultText = await executeTool(call.name, call.arguments || {})
        messages = [
          ...messages,
          { role: 'tool', name: call.name, args: call.arguments, content: resultText, toolCallId: call.id }
        ]
      }

      updateNodeData(props.id, { messages })
      scrollToBottom()
      // volta pro topo do loop pra obter a resposta do modelo com o
      // resultado das tools já no histórico; se atingir MAX_TOOL_ITERATIONS
      // sem uma resposta de texto final, simplesmente para por aqui — o
      // histórico já reflete tudo que aconteceu, sem mensagem de erro
    }

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
  clearTimeout(copiedTimeout)
})
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

.settings-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.settings-btn:disabled:hover {
  background: transparent;
  color: var(--color-text-secondary);
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

.tool-call {
  align-self: flex-start;
  max-width: 85%;
  padding: 5px 9px;
  border-radius: 8px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border);
}

.tool-call-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
  list-style: none;
}

.tool-call-summary::-webkit-details-marker {
  display: none;
}

.tool-icon {
  flex-shrink: 0;
  font-size: 11px;
}

.tool-name {
  font-weight: 600;
  font-family: 'Menlo', Consolas, monospace;
  color: var(--color-text-primary);
}

.tool-args {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Menlo', Consolas, monospace;
  color: var(--color-text-tertiary);
}

.tool-result {
  margin: 6px 0 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--color-bg-app);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-family: 'Menlo', Consolas, monospace;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow-y: auto;
}

.msg {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  max-width: 85%;
}

.msg.user {
  align-self: flex-end;
  flex-direction: row-reverse;
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
  user-select: text;
  cursor: text;
}

.msg-images {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.msg-image {
  width: 110px;
  height: 110px;
  object-fit: cover;
  border-radius: 6px;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.msg:hover .copy-btn {
  opacity: 1;
}

.copy-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
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

.pending-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px 8px 0;
  background: var(--color-bg-surface-alt);
}

.pending-image {
  position: relative;
  width: 44px;
  height: 44px;
}

.pending-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--color-border-strong);
}

.pending-image-remove {
  position: absolute;
  top: -5px;
  right: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  box-shadow: 0 1px 4px var(--color-shadow);
  cursor: pointer;
}

.pending-image-remove:hover {
  color: var(--color-text-primary);
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

.file-input-hidden {
  display: none;
}

.attach-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.attach-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.attach-btn:disabled {
  opacity: 0.4;
  cursor: default;
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
