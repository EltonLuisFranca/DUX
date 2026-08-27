<template>
  <div
    class="agent-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <div class="agent-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="status" />
      <span class="agent-title">{{ data.name }}</span>
      <span class="agent-path">{{ data.cwd }}</span>
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
    <div ref="termEl" class="agent-term nodrag nowheel nopan"></div>

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
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useVueFlow } from '@vue-flow/core'
import '@xterm/xterm/css/xterm.css'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'
import { theme, XTERM_THEMES } from '../store/themeStore'

const MIN_NODE_WIDTH = 320
const MIN_NODE_HEIGHT = 220

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { viewport } = useVueFlow()

const termEl = ref(null)
const status = ref('connecting')
const nodeWidth = ref(props.data.width || 480)
const nodeHeight = ref(props.data.height || 344)

let term = null
let fitAddon = null
let ws = null
let resizeObserver = null
let retryTimer = null
let stopThemeWatch = null
let stopCwdWatch = null
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

function sendResize() {
  if (!term || !ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
}

function connect() {
  status.value = 'connecting'
  ws = new WebSocket('ws://127.0.0.1:4577')

  ws.onopen = () => {
    fitAddon.fit()
    ws.send(
      JSON.stringify({
        type: 'start',
        cwd: props.data.cwd,
        cols: term.cols,
        rows: term.rows
      })
    )
    status.value = 'online'
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.type === 'data') {
      term.write(msg.data)
    } else if (msg.type === 'exit') {
      status.value = 'offline'
      term.write(`\r\n\r\n[sessão encerrada — código ${msg.exitCode}]\r\n`)
    } else if (msg.type === 'error') {
      status.value = 'offline'
      term.write(`\r\n\r\n[erro: ${msg.message}]\r\n`)
    }
  }

  ws.onclose = () => {
    status.value = 'offline'
    retryTimer = setTimeout(connect, 1500)
  }

  ws.onerror = () => {
    ws?.close()
  }
}

function disconnect() {
  clearTimeout(retryTimer)
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
}

onMounted(async () => {
  term = new Terminal({
    convertEol: true,
    fontSize: 13,
    fontFamily: 'Menlo, Consolas, monospace',
    theme: XTERM_THEMES[theme.value]
  })
  stopThemeWatch = watch(theme, (t) => {
    if (term) term.options.theme = XTERM_THEMES[t]
  })
  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(termEl.value)

  // espera a fonte carregar e o layout assentar antes do primeiro fit,
  // senão a medição de altura da célula fica errada e corta a última linha
  await document.fonts.ready
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  fitAddon.fit()

  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }))
    }
  })

  term.onResize(sendResize)

  resizeObserver = new ResizeObserver(() => fitAddon?.fit())
  resizeObserver.observe(termEl.value)

  connect()

  stopCwdWatch = watch(
    () => props.data.cwd,
    () => {
      disconnect()
      term.clear()
      term.write('[reiniciando sessão no novo diretório...]\r\n')
      connect()
    }
  )
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
  resizeObserver?.disconnect()
  stopThemeWatch?.()
  stopCwdWatch?.()
  disconnect()
  term?.dispose()
})
</script>

<style scoped>
.agent-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.agent-node.selected {
  border-color: var(--selected-color);
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  flex-shrink: 0;
  background: var(--color-bg-app);
  border-bottom: 1px solid var(--color-border);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7280;
  flex-shrink: 0;
}

.status-dot.online {
  background: #28c840;
}

.status-dot.connecting {
  background: #febc2e;
}

.status-dot.offline {
  background: #ff5f57;
}

.agent-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex-shrink: 0;
}

.agent-path {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
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

.agent-term {
  flex: 1;
  min-height: 0;
  padding: 6px;
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

.agent-node:hover .resize-handle {
  opacity: 1;
}
</style>
