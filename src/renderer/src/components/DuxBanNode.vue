<template>
  <div
    class="duxban-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="duxban-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="duxban-handle"
      :class="{ connected: isRightConnected }"
    />

    <div class="duxban-header" :style="{ background: data.headerColor || undefined }">
      <span class="duxban-title">{{ data.name }}</span>
      <span v-if="connectedAgents.length" class="agent-count" :title="connectedAgents.map((a) => a.name).join(', ')">
        {{ connectedAgents.length }} agente{{ connectedAgents.length === 1 ? '' : 's' }}
      </span>
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
                @blur="stopEdit"
                @keydown.enter.exact.prevent="stopEdit"
              />
              <p v-else class="card-text" @click="startEdit(card)">{{ card.text || 'Cartão vazio' }}</p>
              <button class="card-remove" title="Excluir cartão" @click="onRemoveCard(card.id)">
                <svg viewBox="0 0 16 16" width="10" height="10">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
              </button>

              <div v-if="connectedAgents.length" class="card-assign">
                <select
                  class="assign-select"
                  :value="card.assignedNodeId || ''"
                  @change="onAssign(card, $event.target.value)"
                  @mousedown.stop
                >
                  <option value="">Sem atribuição</option>
                  <option v-for="agent in connectedAgents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
                </select>
                <span
                  v-if="card.assignedNodeId"
                  class="task-status"
                  :class="card.taskState"
                  :title="STATUS_LABELS[card.taskState]"
                />
              </div>
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
            @keyup.enter="onAddCard(col)"
          />
          <button class="add-card-btn" title="Adicionar cartão" @click="onAddCard(col)">+</button>
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
import { computed, nextTick, reactive, ref } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import NodeToolbar from './NodeToolbar.vue'
import { toggleNodeSettings, AGENT_TERMINAL_TYPES } from '../store/flowStore'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'
import { normalizeColumns, addCard, removeCard, moveCard, assignCard } from '../lib/duxbanOps'

const STATUS_LABELS = {
  queued: 'Na fila — aguardando o agente ficar livre',
  active: 'Em andamento',
  done: 'Concluído'
}

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { getConnectedEdges, findNode } = useVueFlow()
const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')

const { nodeWidth, nodeHeight, startResize } = useNodeResize(props, {
  minWidth: 380,
  minHeight: 320,
  defaultWidth: 600,
  defaultHeight: 420
})

// Agentes conectados por edge — viram as opções do seletor de atribuição de
// cada cartão. Deriva sozinho das edges (não é algo que se "adiciona" ao
// board à parte): conectar um terminal aqui já é o bastante pra ele virar
// atribuível.
const connectedAgents = computed(() => {
  const list = []
  for (const edge of getConnectedEdges(props.id)) {
    const otherId = edge.source === props.id ? edge.target : edge.source
    const otherNode = findNode(otherId)
    if (otherNode && AGENT_TERMINAL_TYPES.includes(otherNode.type)) {
      list.push({ id: otherId, name: otherNode.data.name || otherId })
    }
  }
  return list
})

// `props.data` é o objeto reativo real do node (o mesmo em workspace.nodes) —
// diferente dos outros node types, aqui o template lê e edita ele
// DIRETAMENTE (sem cópia local + updateNodeData) de propósito: uma tool do
// agente (dux_kanban_move_card etc, via WslClaudeTerminalNode.vue) muda esse
// mesmo objeto por fora, e precisa aparecer na tela sozinha, sem nenhum
// mecanismo extra de sincronização.
if (!Array.isArray(props.data.columns) || !props.data.columns.length) {
  props.data.columns = normalizeColumns(props.data.columns)
}
if (!props.data.activeDispatch) props.data.activeDispatch = {}
// computed, não uma referência fixa: duxbanOps troca `data.columns` por um
// array NOVO a cada operação (ver comentário no topo de duxbanOps.js) — um
// `const columns = props.data.columns` capturado uma vez ficaria preso na
// referência antiga assim que a primeira operação rodasse
const columns = computed(() => props.data.columns)

const drafts = reactive({})
const editingCardId = ref(null)
const titleRefs = {}
const cardRefs = {}

// arraste de cartão: estado de quem está sendo arrastado + posição de destino
// (coluna + índice) resolvida a cada dragover, usada tanto pro indicador
// visual (isDropTarget) quanto pro drop em si
const dragState = reactive({ cardId: null })
const hover = reactive({ colId: null, index: null })

function isDropTarget(col, index) {
  return dragState.cardId !== null && hover.colId === col.id && hover.index === index
}

function onAddCard(col) {
  const text = (drafts[col.id] || '').trim()
  if (!text) return
  addCard(props.data, col.id, text)
  drafts[col.id] = ''
}

function onRemoveCard(cardId) {
  if (editingCardId.value === cardId) editingCardId.value = null
  removeCard(props.data, cardId)
}

function onAssign(card, nodeId) {
  assignCard(props.data, card.id, nodeId || null)
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
}

function addColumn() {
  const col = { id: crypto.randomUUID(), title: 'Nova coluna', cards: [] }
  columns.value.push(col)
  nextTick(() => {
    const el = titleRefs[col.id]
    el?.focus()
    el?.select()
  })
}

function removeColumn(colId) {
  const col = columns.value.find((c) => c.id === colId)
  if (!col) return
  // remove cartão por cartão (em vez de só cortar a coluna) pra liberar
  // direito qualquer vaga de fila que algum deles estivesse ocupando — cada
  // chamada troca `data.columns` por um array novo (ver duxbanOps.js), então
  // reprocura o índice por id depois, não reusa o objeto `col` capturado acima
  for (const card of [...col.cards]) removeCard(props.data, card.id)
  const index = columns.value.findIndex((c) => c.id === colId)
  if (index !== -1) columns.value.splice(index, 1)
}

function moveColumn(index, direction) {
  const target = index + direction
  if (target < 0 || target >= columns.value.length) return
  const [col] = columns.value.splice(index, 1)
  columns.value.splice(target, 0, col)
}

function renameColumn(col, event) {
  col.title = event.target.value
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
  moveCard(props.data, dragState.cardId, col.id, hover.index)
  dragState.cardId = null
  hover.colId = null
  hover.index = null
}
</script>

<style scoped>
.duxban-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.duxban-node.selected {
  border-color: var(--selected-color);
}

.duxban-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.duxban-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.duxban-header {
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

.duxban-header:active {
  cursor: grabbing;
}

.duxban-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-count {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
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
  width: 210px;
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

.card-assign {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 5px;
}

.assign-select {
  flex: 1;
  min-width: 0;
  height: 20px;
  padding: 0 3px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  font-size: 10px;
}

.assign-select:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.task-status {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
}

.task-status.queued {
  background: transparent;
  border: 1.5px solid #eab308;
}

.task-status.active {
  background: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
  animation: pulse 1.4s ease-in-out infinite;
}

.task-status.done {
  background: #22c55e;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
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

.duxban-node:hover .resize-handle {
  opacity: 1;
}
</style>
