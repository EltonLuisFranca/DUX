<template>
  <div
    class="kanban-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="kanban-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="kanban-handle"
      :class="{ connected: isRightConnected }"
    />

    <div class="kanban-header" :style="{ background: data.headerColor || undefined }">
      <span class="kanban-title">{{ data.name }}</span>
      <button class="header-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <GearIcon />
      </button>
    </div>

    <div class="board nodrag nowheel nopan">
      <div v-for="(col, colIndex) in columns" :key="col.id" class="column">
        <div class="column-header">
          <input
            :ref="(el) => { if (el) titleRefs[col.id] = el }"
            class="column-title-input"
            type="text"
            :value="col.title"
            placeholder="Título da coluna"
            @input="renameColumn(col, $event)"
          />
          <span class="column-count">{{ col.cards.length }}</span>
          <button
            class="column-btn"
            title="Mover coluna pra esquerda"
            :disabled="colIndex === 0"
            @click="moveColumn(colIndex, -1)"
          >
            <svg viewBox="0 0 16 16" width="10" height="10">
              <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
          </button>
          <button
            class="column-btn"
            title="Mover coluna pra direita"
            :disabled="colIndex === columns.length - 1"
            @click="moveColumn(colIndex, 1)"
          >
            <svg viewBox="0 0 16 16" width="10" height="10">
              <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
          </button>
          <button class="column-btn danger" title="Excluir coluna" @click="removeColumn(col.id)">
            <svg viewBox="0 0 16 16" width="11" height="11">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div
          class="card-list"
          @dragover.prevent="onColumnDragOver(col)"
          @drop.prevent="onColumnDrop(col)"
        >
          <template v-for="(card, cardIndex) in col.cards" :key="card.id">
            <div v-if="isDropTarget(col, cardIndex)" class="drop-indicator" />
            <div
              class="card"
              :class="{ dragging: dragState.cardId === card.id }"
              draggable="true"
              @dragstart="onCardDragStart(col, card, $event)"
              @dragend="onCardDragEnd"
              @dragover.prevent.stop="onCardDragOver(col, cardIndex, $event)"
            >
              <textarea
                v-if="editingCardId === card.id"
                :ref="(el) => { if (el) cardRefs[card.id] = el }"
                v-model="card.text"
                class="card-textarea"
                rows="2"
                @input="persist"
                @blur="stopEdit"
                @keydown.enter.exact.prevent="stopEdit"
              />
              <p v-else class="card-text" @click="startEdit(card)">{{ card.text || 'Cartão vazio' }}</p>
              <button class="card-remove" title="Excluir cartão" @click="removeCard(col, card.id)">
                <svg viewBox="0 0 16 16" width="10" height="10">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </template>
          <div v-if="isDropTarget(col, col.cards.length)" class="drop-indicator" />
        </div>

        <div class="add-card-row">
          <input
            v-model="drafts[col.id]"
            class="add-card-input"
            type="text"
            placeholder="Novo cartão..."
            @keyup.enter="addCard(col)"
          />
          <button class="add-card-btn" title="Adicionar cartão" @click="addCard(col)">+</button>
        </div>
      </div>

      <button class="add-column-btn" @click="addColumn">+ Coluna</button>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>
  </div>
</template>

<script setup>
import { nextTick, reactive, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import NodeToolbar from './NodeToolbar.vue'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')

const { nodeWidth, nodeHeight, startResize } = useNodeResize(props, {
  minWidth: 380,
  minHeight: 320,
  defaultWidth: 600,
  defaultHeight: 420
})

// migra dados antigos/incompletos (ex: node criado antes de um campo existir)
// pra sempre ter id/title/cards bem-formados antes de renderizar
function normalizeColumns(raw) {
  if (Array.isArray(raw) && raw.length) {
    return raw.map((col) => ({
      id: col.id || crypto.randomUUID(),
      title: col.title || 'Coluna',
      cards: Array.isArray(col.cards)
        ? col.cards.map((card) => ({ id: card.id || crypto.randomUUID(), text: card.text || '' }))
        : []
    }))
  }
  return [
    { id: crypto.randomUUID(), title: 'A fazer', cards: [] },
    { id: crypto.randomUUID(), title: 'Fazendo', cards: [] },
    { id: crypto.randomUUID(), title: 'Feito', cards: [] }
  ]
}

const columns = ref(normalizeColumns(props.data.columns))
const drafts = reactive({})
const editingCardId = ref(null)
const titleRefs = {}
const cardRefs = {}

// arraste de cartão: estado de quem está sendo arrastado + posição de destino
// (coluna + índice) resolvida a cada dragover, usada tanto pro indicador
// visual (isDropTarget) quanto pro drop em si
const dragState = reactive({ cardId: null })
const hover = reactive({ colId: null, index: null })

function persist() {
  updateNodeData(props.id, { columns: columns.value })
}

function isDropTarget(col, index) {
  return dragState.cardId !== null && hover.colId === col.id && hover.index === index
}

function addCard(col) {
  const text = (drafts[col.id] || '').trim()
  if (!text) return
  col.cards.push({ id: crypto.randomUUID(), text })
  drafts[col.id] = ''
  persist()
}

function removeCard(col, cardId) {
  col.cards = col.cards.filter((c) => c.id !== cardId)
  if (editingCardId.value === cardId) editingCardId.value = null
  persist()
}

function startEdit(card) {
  editingCardId.value = card.id
  nextTick(() => {
    const el = cardRefs[card.id]
    el?.focus()
    el?.select()
  })
}

function stopEdit() {
  editingCardId.value = null
  persist()
}

function addColumn() {
  const col = { id: crypto.randomUUID(), title: 'Nova coluna', cards: [] }
  columns.value.push(col)
  persist()
  nextTick(() => {
    const el = titleRefs[col.id]
    el?.focus()
    el?.select()
  })
}

function removeColumn(colId) {
  columns.value = columns.value.filter((c) => c.id !== colId)
  persist()
}

function moveColumn(index, direction) {
  const target = index + direction
  if (target < 0 || target >= columns.value.length) return
  const [col] = columns.value.splice(index, 1)
  columns.value.splice(target, 0, col)
  persist()
}

function renameColumn(col, event) {
  col.title = event.target.value
  persist()
}

function findCard(cardId) {
  for (const col of columns.value) {
    const idx = col.cards.findIndex((c) => c.id === cardId)
    if (idx !== -1) return { col, idx }
  }
  return null
}

function onCardDragStart(col, card, event) {
  dragState.cardId = card.id
  event.dataTransfer.effectAllowed = 'move'
  // Firefox exige setData pra permitir o drag prosseguir
  event.dataTransfer.setData('text/plain', card.id)
}

function onCardDragEnd() {
  dragState.cardId = null
  hover.colId = null
  hover.index = null
}

// refina o alvo do drop pro índice exato dentro da coluna: antes ou depois
// do cartão sob o cursor, conforme a metade em que o mouse está
function onCardDragOver(col, index, event) {
  if (!dragState.cardId) return
  const rect = event.currentTarget.getBoundingClientRect()
  const before = event.clientY < rect.top + rect.height / 2
  hover.colId = col.id
  hover.index = before ? index : index + 1
}

// fallback pra quando o mouse está sobre a coluna mas fora de qualquer
// cartão específico (lista vazia ou espaço abaixo do último item) — o
// dragover de cada cartão usa .stop, então só chega aqui quando não há
// nenhum cartão sob o cursor
function onColumnDragOver(col) {
  if (!dragState.cardId) return
  hover.colId = col.id
  hover.index = col.cards.length
}

function onColumnDrop(col) {
  if (!dragState.cardId || hover.colId !== col.id || hover.index === null) {
    dragState.cardId = null
    return
  }
  const found = findCard(dragState.cardId)
  if (!found) return
  const { col: sourceCol, idx: sourceIndex } = found
  let insertAt = hover.index
  if (sourceCol.id === col.id && sourceIndex < insertAt) insertAt -= 1
  const [card] = sourceCol.cards.splice(sourceIndex, 1)
  col.cards.splice(insertAt, 0, card)
  dragState.cardId = null
  hover.colId = null
  hover.index = null
  persist()
}
</script>

<style scoped>
.kanban-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.kanban-node.selected {
  border-color: var(--selected-color);
}

.kanban-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.kanban-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.kanban-header {
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

.kanban-header:active {
  cursor: grabbing;
}

.kanban-title {
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

.board {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  border-radius: 0 0 9px 9px;
}

.column {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 200px;
  height: 100%;
  background: var(--color-bg-app);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 6px 6px 6px 8px;
  border-bottom: 1px solid var(--color-border);
}

.column-title-input {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 11.5px;
  font-weight: 700;
}

.column-title-input:focus {
  outline: none;
  background: var(--color-bg-surface);
}

.column-count {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 600;
}

.column-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.column-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.column-btn:disabled {
  opacity: 0.25;
  cursor: default;
}

.column-btn:disabled:hover {
  background: transparent;
  color: var(--color-text-tertiary);
}

.column-btn.danger:hover {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.card-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  overflow-y: auto;
}

.drop-indicator {
  flex-shrink: 0;
  height: 2px;
  margin: 0 2px;
  border-radius: 999px;
  background: #3b82f6;
}

.card {
  position: relative;
  flex-shrink: 0;
  padding: 6px 20px 6px 8px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  box-shadow: 0 1px 3px var(--color-shadow);
  cursor: grab;
}

.card:active {
  cursor: grabbing;
}

.card.dragging {
  opacity: 0.4;
}

.card-text {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 11.5px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: text;
}

.card-textarea {
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1.4;
  resize: none;
}

.card-textarea:focus {
  outline: none;
}

.card-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-tertiary);
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.12s ease;
}

.card:hover .card-remove {
  opacity: 1;
}

.card-remove:hover {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.add-card-row {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  padding: 6px;
  border-top: 1px solid var(--color-border);
}

.add-card-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11px;
}

.add-card-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.add-card-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 5px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.add-card-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.add-column-btn {
  flex-shrink: 0;
  align-self: flex-start;
  height: 28px;
  padding: 0 12px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.add-column-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
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

.kanban-node:hover .resize-handle {
  opacity: 1;
}
</style>
