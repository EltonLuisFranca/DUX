<template>
  <div
    class="notes-node"
    :class="{ selected, 'transparent-note': data.transparent }"
    :style="{
      width: nodeWidth + 'px',
      height: nodeHeight + 'px',
      background: backgroundStyle,
      '--rest-border-color': restBorderColor,
      '--selected-color': data.headerColor || '#3b82f6'
    }"
  >
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="notes-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="notes-handle"
      :class="{ connected: isRightConnected }"
    />

    <Transition name="toolbar-fade">
      <div v-if="selected" class="notes-toolbar nodrag nowheel">
        <AppTooltip label="Negrito">
          <button class="fmt-btn" @mousedown.prevent="exec('bold')"><b>B</b></button>
        </AppTooltip>
        <AppTooltip label="Itálico">
          <button class="fmt-btn fmt-italic" @mousedown.prevent="exec('italic')"><i>I</i></button>
        </AppTooltip>
        <span class="fmt-divider" />
        <AppTooltip label="Fonte">
          <select class="fmt-select" @mousedown="saveSelection" @change="exec('fontName', $event.target.value)">
            <option value="inherit">Padrão</option>
            <option value="Georgia, serif">Serif</option>
            <option value="'Courier New', monospace">Mono</option>
          </select>
        </AppTooltip>
        <AppTooltip label="Tamanho">
          <select class="fmt-select" @mousedown="saveSelection" @change="exec('fontSize', $event.target.value)">
            <option value="2">Pequeno</option>
            <option value="3" selected>Normal</option>
            <option value="5">Grande</option>
            <option value="7">Enorme</option>
          </select>
        </AppTooltip>
        <span class="fmt-divider" />
        <AppTooltip label="Cor da nota">
          <label class="color-swatch" :style="{ background: data.headerColor || 'var(--color-notes-bg)' }">
            <input type="color" class="color-input" :value="data.headerColor || '#fef3c7'" @input="setColor($event.target.value)" />
          </label>
        </AppTooltip>
        <AppTooltip label="Remover cor (padrão)">
          <button class="fmt-btn reset-swatch" @click="setColor(null)">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="1.3" fill="none" />
              <path d="M3.5 12.5l9-9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
          </button>
        </AppTooltip>
        <AppTooltip label="Transparente (sem cor, sem borda)">
          <button class="fmt-btn" :class="{ active: data.transparent }" @click="toggleTransparent">
            <svg viewBox="0 0 16 16" width="14" height="14">
              <rect
                x="2"
                y="2"
                width="12"
                height="12"
                rx="2.5"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-dasharray="2 2"
                fill="none"
              />
            </svg>
          </button>
        </AppTooltip>
        <span class="fmt-divider" />
        <AppTooltip label="Excluir">
          <button class="fmt-btn fmt-danger" @click="requestDeleteNode(id)">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path
                d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M5 4.5l.5 8a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.5-8"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
          </button>
        </AppTooltip>
      </div>
    </Transition>

    <div class="notes-drag-handle">
      <span class="grip-dots"><span></span><span></span><span></span></span>
    </div>

    <div
      ref="editorEl"
      class="notes-body nodrag nowheel nopan"
      contenteditable="true"
      data-placeholder="Escreva algo..."
      @input="handleInput"
      @mouseup="saveSelection"
      @keyup="saveSelection"
      @focus="isEditorFocused = true"
      @blur="isEditorFocused = false"
    ></div>

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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { updateNodeData, requestDeleteNode } from '../store/flowStore'
import { readNote, writeNote, watchNote } from '../lib/bridgeClient'
import { syncNoteContent } from '../lib/noteSync'
import { htmlToMarkdown, markdownToHtml } from '../lib/noteMarkdown'
import { useHandleConnection } from '../lib/useHandleConnection'
import AppTooltip from './AppTooltip.vue'

const MIN_NODE_WIDTH = 240
const MIN_NODE_HEIGHT = 160
const SAVE_DEBOUNCE_MS = 500

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { viewport } = useVueFlow()
const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')

const editorEl = ref(null)
const nodeWidth = ref(props.data.width || 320)
const nodeHeight = ref(props.data.height || 240)
const isEditorFocused = ref(false)

const NOTE_COLOR_OPACITY = 30

function hexToRgba(hex, opacityPercent) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`
}

const backgroundStyle = computed(() => {
  if (props.data.transparent) return 'transparent'
  if (!props.data.headerColor) return undefined
  return hexToRgba(props.data.headerColor, NOTE_COLOR_OPACITY)
})

const restBorderColor = computed(() => {
  if (props.data.transparent) return 'transparent'
  if (!props.data.headerColor) return undefined
  return hexToRgba(props.data.headerColor, 55)
})

let savedRange = null

function saveSelection() {
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0 && editorEl.value?.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange()
  }
}

function restoreSelection() {
  if (!savedRange) return
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(savedRange)
}

function exec(command, value = null) {
  editorEl.value?.focus()
  restoreSelection()
  document.execCommand(command, false, value)
  saveSelection()
  handleInput()
}

// o .md em disco é a fonte da verdade (não node.data — evita duplicar
// conteúdo entre workspaces.json e o arquivo, que poderiam divergir).
// lastWrittenMarkdown guarda a última escrita feita por este node, pra
// distinguir o próprio eco (fs.watch detectando a escrita que acabamos de
// fazer) de uma mudança de fato externa (ex: um agente editando o arquivo).
let lastWrittenMarkdown = null
let saveTimer = null
let unwatch = null

function saveNow() {
  if (!editorEl.value || !props.data.path) return
  const markdown = htmlToMarkdown(editorEl.value.innerHTML)
  if (markdown === lastWrittenMarkdown) return
  lastWrittenMarkdown = markdown
  writeNote(props.data.path, markdown)
  syncNoteContent({ nodeId: props.id, path: props.data.path, content: markdown })
}

function handleInput() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS)
}

async function loadAndWatch() {
  unwatch?.()
  unwatch = null
  clearTimeout(saveTimer)

  if (!props.data.path) return

  const result = await readNote(props.data.path)
  lastWrittenMarkdown = result.content ?? ''
  if (editorEl.value) editorEl.value.innerHTML = markdownToHtml(lastWrittenMarkdown)
  syncNoteContent({ nodeId: props.id, path: props.data.path, content: lastWrittenMarkdown })

  unwatch = watchNote(props.data.path, (msg) => {
    if (msg.content === lastWrittenMarkdown) return
    lastWrittenMarkdown = msg.content
    syncNoteContent({ nodeId: props.id, path: props.data.path, content: msg.content })
    // não sobrescreve o editor enquanto o usuário está digitando nele —
    // evita arrancar cursor/seleção no meio de uma edição real; a próxima
    // vez que o autosave local rodar, a versão local prevalece (last-write-
    // wins simples, sem OT/CRDT)
    if (isEditorFocused.value || !editorEl.value) return
    editorEl.value.innerHTML = markdownToHtml(msg.content)
  })
}

watch(() => props.data.path, loadAndWatch)

function setColor(color) {
  updateNodeData(props.id, { headerColor: color, transparent: false })
}

function toggleTransparent() {
  updateNodeData(props.id, { transparent: !props.data.transparent })
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

onMounted(loadAndWatch)

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  // última chance de persistir uma edição pendente que o debounce ainda não
  // gravou (ex: node deletado/desmontado logo após digitar)
  saveNow()
  unwatch?.()
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
})
</script>

<style scoped>
.notes-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-notes-bg);
  border: 1px solid var(--rest-border-color, var(--color-notes-border));
  border-radius: 10px;
  overflow: visible;
  box-shadow: 0 8px 24px var(--color-shadow);
  cursor: default;
}

.notes-node.transparent-note {
  box-shadow: none;
}

.notes-node.selected {
  border-color: var(--selected-color);
}

.notes-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.notes-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.toolbar-fade-enter-active,
.toolbar-fade-leave-active {
  transition: opacity 0.12s ease;
}

.toolbar-fade-enter-from,
.toolbar-fade-leave-to {
  opacity: 0;
}

.notes-toolbar {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  padding: 3px 6px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: 0 4px 16px var(--color-shadow);
  cursor: default;
  z-index: 2;
}

.fmt-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.fmt-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.fmt-btn.active {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.fmt-divider {
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: var(--color-border-strong);
}

.fmt-danger:hover {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.color-swatch {
  position: relative;
  display: flex;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid var(--color-border-strong);
  overflow: hidden;
  cursor: pointer;
}

.color-input {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  border: none;
  padding: 0;
  cursor: pointer;
  opacity: 0;
}

.reset-swatch svg {
  color: var(--color-text-secondary);
}

.reset-swatch:hover svg {
  color: var(--color-text-primary);
}

.fmt-select {
  height: 20px;
  padding: 0 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 10.5px;
  cursor: pointer;
}

.fmt-select:hover {
  background: var(--color-hover);
}

.notes-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 22px;
  border-radius: 10px 10px 0 0;
  cursor: grab;
}

.notes-drag-handle:active {
  cursor: grabbing;
}

.grip-dots {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.grip-dots span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
}

.notes-node:hover .grip-dots {
  opacity: 0.6;
}

.notes-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 26px 14px 12px;
  box-sizing: border-box;
  overflow-y: auto;
  border-radius: 10px;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  word-break: break-word;
  cursor: text;
}

.notes-body:focus {
  outline: none;
}

.notes-body {
  scrollbar-width: none;
}

.notes-body:hover,
.notes-body:focus {
  scrollbar-width: thin;
  scrollbar-color: var(--color-text-tertiary) transparent;
}

.notes-body::-webkit-scrollbar {
  width: 6px;
}

.notes-body::-webkit-scrollbar-track {
  background: transparent;
}

.notes-body::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 10px;
}

.notes-body:hover::-webkit-scrollbar-thumb,
.notes-body:focus::-webkit-scrollbar-thumb {
  background-color: var(--color-text-tertiary);
}

.notes-body::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-secondary);
}

.notes-body:empty::before {
  content: attr(data-placeholder);
  color: var(--color-text-tertiary);
  pointer-events: none;
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

.notes-node:hover .resize-handle {
  opacity: 1;
}
</style>
