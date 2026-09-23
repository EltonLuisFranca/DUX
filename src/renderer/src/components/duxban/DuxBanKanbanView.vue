<template>
  <div class="board nodrag nowheel nopan">
    <template v-for="(col, colIndex) in columns" :key="col.id">
      <div v-if="isColDropTarget(colIndex)" class="drop-indicator-col" />
      <div
        class="column"
        :class="{
          'drop-active': dragState.cardId && hover.colId === col.id,
          'col-dragging': colDragState.colId === col.id
        }"
        @dragover.prevent="onColumnDragOverForReorder(colIndex, $event)"
        @drop.prevent="onColumnDropForReorder"
      >
        <div class="column-header">
          <span
            class="column-drag-handle"
            title="Arrastar para reordenar"
            draggable="true"
            @dragstart="onColHeaderDragStart(col, $event)"
            @dragend="onColHeaderDragEnd"
          >
            <svg viewBox="0 0 16 16" width="12" height="12">
              <circle cx="5" cy="4" r="1.2" fill="currentColor" />
              <circle cx="5" cy="8" r="1.2" fill="currentColor" />
              <circle cx="5" cy="12" r="1.2" fill="currentColor" />
              <circle cx="11" cy="4" r="1.2" fill="currentColor" />
              <circle cx="11" cy="8" r="1.2" fill="currentColor" />
              <circle cx="11" cy="12" r="1.2" fill="currentColor" />
            </svg>
          </span>
          <span class="column-dot" :style="{ '--dot-color': columnMetas[colIndex].color }">
            <DuxBanColumnIcon :icon="columnMetas[colIndex].icon" />
          </span>
          <input
            :ref="(el) => { if (el) titleRefs[col.id] = el }"
            class="column-title-input"
            type="text"
            :value="col.title"
            placeholder="Título da coluna"
            @input="renameColumn(col, $event)"
          />
          <span class="column-count">{{ col.cards.length }}</span>
          <button class="column-btn" title="Adicionar cartão" @click="$emit('open-create', col)">
            <svg viewBox="0 0 16 16" width="15" height="15">
              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
          <div class="col-menu-wrap">
            <button class="column-btn" title="Mais opções" @mousedown.stop @click="toggleColMenu(col.id)">
              <svg viewBox="0 0 16 16" width="15" height="15">
                <circle cx="3.2" cy="8" r="1.3" fill="currentColor" />
                <circle cx="8" cy="8" r="1.3" fill="currentColor" />
                <circle cx="12.8" cy="8" r="1.3" fill="currentColor" />
              </svg>
            </button>
            <div v-if="openColMenuId === col.id" class="col-menu">
              <button class="col-menu-item" :disabled="colIndex === 0" @click="moveColumn(colIndex, -1); openColMenuId = null">
                Mover pra esquerda
              </button>
              <button
                class="col-menu-item"
                :disabled="colIndex === columns.length - 1"
                @click="moveColumn(colIndex, 1); openColMenuId = null"
              >
                Mover pra direita
              </button>
              <button
                class="col-menu-item danger"
                @click="requestDelete('col-' + col.id, () => removeColumn(col.id)); openColMenuId = null"
              >
                {{ pendingDeleteId === 'col-' + col.id ? 'Clique de novo pra confirmar' : 'Excluir coluna' }}
              </button>
            </div>
          </div>
        </div>

        <div
          class="card-list"
          @dragover.prevent="onColumnDragOver(col)"
          @drop.prevent="onColumnDrop(col)"
        >
          <p v-if="!col.cards.length" class="empty-column-hint">Nenhum cartão aqui</p>
          <template v-for="(card, cardIndex) in col.cards" :key="card.id">
            <div v-if="isDropTarget(col, cardIndex)" class="drop-indicator" />
            <div
              class="card"
              :class="{ dragging: dragState.cardId === card.id }"
              draggable="true"
              @dragstart="onCardDragStart(col, card, $event)"
              @dragend="onCardDragEnd"
              @dragover.prevent.stop="onCardDragOver(col, cardIndex, $event)"
              @click="$emit('open-detail', card)"
            >
              <div class="card-top-row">
                <div v-if="card.dueDate" class="due-date">
                  <svg viewBox="0 0 16 16" width="13" height="13">
                    <rect x="2.5" y="3" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
                    <path d="M2.5 6h11M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                  </svg>
                  <span>Due: {{ formatDueDate(card.dueDate) }}</span>
                </div>
                <span v-else class="due-date-spacer" />
                <div class="card-menu-wrap">
                  <button class="card-icon-btn dots-btn" title="Mais opções" @mousedown.stop @click.stop="toggleCardMenu(card.id)">
                    <svg viewBox="0 0 16 16" width="15" height="15">
                      <circle cx="3.2" cy="8" r="1.3" fill="currentColor" />
                      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
                      <circle cx="12.8" cy="8" r="1.3" fill="currentColor" />
                    </svg>
                  </button>
                  <div v-if="openCardMenuId === card.id" class="card-menu">
                    <button
                      class="card-menu-item danger"
                      @click.stop="requestDelete('card-' + card.id, () => onRemoveCard(card.id)); openCardMenuId = null"
                    >
                      {{ pendingDeleteId === 'card-' + card.id ? 'Clique de novo pra confirmar' : 'Excluir cartão' }}
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="cardTags(card, tags).length" class="tag-badges">
                <span v-for="tag in cardTags(card, tags)" :key="tag.id" class="category-badge" :style="{ background: tag.color }">
                  {{ tag.name }}
                </span>
              </div>

              <p class="card-text">{{ card.text || 'Cartão vazio' }}</p>

              <p v-if="card.description" class="card-description">{{ card.description }}</p>

              <div v-if="card.milestoneTotal" class="milestone-block">
                <div class="milestone-label-row">
                  <span>Milestone</span>
                  <span class="milestone-fraction">{{ card.milestoneCurrent }}/{{ card.milestoneTotal }}</span>
                </div>
                <div class="milestone-bar">
                  <div class="milestone-fill" :style="{ width: milestonePercent(card) + '%' }" />
                </div>
              </div>

              <div class="card-bottom-row">
                <span
                  v-if="card.priority"
                  class="priority-pill"
                  :style="{ '--priority-color': PRIORITY_META[card.priority].color }"
                >
                  {{ PRIORITY_META[card.priority].label }}
                </span>
                <span v-else class="priority-pill-spacer" />
                <div v-if="card.comments.length" class="comment-count" :title="`${card.comments.length} comentário${card.comments.length === 1 ? '' : 's'}`">
                  <svg viewBox="0 0 16 16" width="13" height="13">
                    <path d="M2.5 3.5h11v7h-6l-3 3v-3h-2v-7z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none" />
                  </svg>
                  <span>{{ card.comments.length }}</span>
                </div>
                <div
                  v-if="cardImageCount(card)"
                  class="comment-count"
                  :title="`${cardImageCount(card)} imagem${cardImageCount(card) === 1 ? '' : 'ns'} anexada${cardImageCount(card) === 1 ? '' : 's'}`"
                >
                  <svg viewBox="0 0 16 16" width="13" height="13">
                    <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none" />
                    <circle cx="5.5" cy="6.5" r="1.1" fill="currentColor" />
                    <path d="M3 12l3.5-4 2.5 3 2-2.5 3 3.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <span>{{ cardImageCount(card) }}</span>
                </div>
              </div>
            </div>
          </template>
          <div v-if="isDropTarget(col, col.cards.length)" class="drop-indicator" />
        </div>
      </div>
    </template>
    <div v-if="isColDropTarget(columns.length)" class="drop-indicator-col" />

    <button class="add-column-btn" @click="addColumn">+ Coluna</button>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import DuxBanColumnIcon from './DuxBanColumnIcon.vue'
import { useConfirmDelete } from '../../lib/useConfirmDelete'
import {
  PRIORITY_META,
  formatDueDate,
  milestonePercent,
  columnMeta,
  cardTags,
  cardImageCount
} from '../../lib/duxbanCardUi'
import {
  removeCard,
  moveCard,
  addColumn as addColumnOp,
  removeColumn as removeColumnOp,
  moveColumn as moveColumnOp,
  renameColumn as renameColumnOp,
  reorderColumn as reorderColumnOp
} from '../../lib/duxbanOps'

const props = defineProps({
  data: { type: Object, required: true },
  columns: { type: Array, required: true },
  tags: { type: Array, required: true },
  connectedAgents: { type: Array, required: true }
})

const emit = defineEmits(['open-detail', 'open-create'])

const columnMetas = computed(() => props.columns.map((col, i) => columnMeta(col, i)))

// menu "⋯" do cartão (excluir) e menu "⋯" da coluna (mover / excluir) — só um
// aberto por vez, fechado por clique fora (onDocClick) ou Escape.
const openCardMenuId = ref(null)
const openColMenuId = ref(null)

function toggleCardMenu(cardId) {
  openCardMenuId.value = openCardMenuId.value === cardId ? null : cardId
}
function toggleColMenu(colId) {
  openColMenuId.value = openColMenuId.value === colId ? null : colId
}

function onDocClick(event) {
  if (openCardMenuId.value && !event.target.closest('.card-menu-wrap')) openCardMenuId.value = null
  if (openColMenuId.value && !event.target.closest('.col-menu-wrap')) openColMenuId.value = null
}

function onKeydown(event) {
  if (event.key !== 'Escape') return
  openCardMenuId.value = null
  openColMenuId.value = null
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mousedown', onDocClick)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousedown', onDocClick)
})

const { pendingDeleteId, requestDelete } = useConfirmDelete()

function onRemoveCard(cardId) {
  removeCard(props.data, cardId)
}

const titleRefs = {}

function addColumn() {
  const col = addColumnOp(props.data, 'Nova coluna')
  nextTick(() => {
    const el = titleRefs[col.id]
    el?.focus()
    el?.select()
  })
}

function removeColumn(colId) {
  removeColumnOp(props.data, colId)
}

function moveColumn(index, direction) {
  const col = props.columns[index]
  if (!col) return
  moveColumnOp(props.data, col.id, direction)
}

function renameColumn(col, event) {
  renameColumnOp(props.data, col.id, event.target.value)
}

// arraste de cartão: estado de quem está sendo arrastado + posição de destino
// (coluna + índice) resolvida a cada dragover, usada tanto pro indicador
// visual (isDropTarget) quanto pro drop em si
const dragState = reactive({ cardId: null })
const hover = reactive({ colId: null, index: null })

function isDropTarget(col, index) {
  return dragState.cardId !== null && hover.colId === col.id && hover.index === index
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

// arraste de coluna inteira (reordenar) via handle dedicado no header — estado
// separado de dragState (cartão) porque os dois nunca coexistem, mas usam
// listeners de dragover/drop distintos (coluna inteira vs. dentro do card-list)
const colDragState = reactive({ colId: null })
const colHover = reactive({ index: null })

function isColDropTarget(index) {
  return colDragState.colId !== null && colHover.index === index
}

function onColHeaderDragStart(col, event) {
  colDragState.colId = col.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', col.id)
}

function onColHeaderDragEnd() {
  colDragState.colId = null
  colHover.index = null
}

// mesmo cálculo de "antes/depois da metade" do onCardDragOver, só que no eixo
// X (colunas ficam lado a lado) em vez de Y
function onColumnDragOverForReorder(colIndex, event) {
  if (!colDragState.colId) return
  const rect = event.currentTarget.getBoundingClientRect()
  const before = event.clientX < rect.left + rect.width / 2
  colHover.index = before ? colIndex : colIndex + 1
}

function onColumnDropForReorder() {
  if (!colDragState.colId || colHover.index === null) {
    colDragState.colId = null
    colHover.index = null
    return
  }
  reorderColumnOp(props.data, colDragState.colId, colHover.index)
  colDragState.colId = null
  colHover.index = null
}
</script>

<style scoped>
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
  width: 270px;
  height: 100%;
  background: var(--color-bg-app);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.column.drop-active {
  border-color: #3b82f6;
  background: color-mix(in srgb, #3b82f6 6%, var(--color-bg-app));
}

.column.col-dragging {
  opacity: 0.4;
}

.drop-indicator-col {
  flex-shrink: 0;
  align-self: stretch;
  width: 2px;
  margin: 0 -1px;
  border-radius: 999px;
  background: #3b82f6;
}

.column-drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 24px;
  color: var(--color-text-tertiary);
  cursor: grab;
}

.column-drag-handle:active {
  cursor: grabbing;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 6px 6px 6px 8px;
  border-bottom: 1px solid var(--color-border);
}

.column-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  color: var(--dot-color);
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
  width: 24px;
  height: 24px;
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

.col-menu-wrap {
  position: relative;
  flex-shrink: 0;
}

.col-menu {
  position: absolute;
  top: 24px;
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 150px;
  padding: 4px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: 0 8px 20px var(--color-shadow);
}

.col-menu-item {
  padding: 6px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.col-menu-item:hover:not(:disabled) {
  background: var(--color-hover);
}

.col-menu-item:disabled {
  opacity: 0.35;
  cursor: default;
}

.col-menu-item.danger {
  color: #ff6b6b;
}

.col-menu-item.danger:hover {
  background: rgba(255, 107, 107, 0.15);
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

.empty-column-hint {
  margin: 10px 4px;
  padding: 10px 6px;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  text-align: center;
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
  padding: 7px 8px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  box-shadow: 0 1px 3px var(--color-shadow);
  cursor: grab;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.card:hover {
  box-shadow: 0 4px 12px var(--color-shadow);
  border-color: var(--color-text-tertiary);
}

.card:active {
  cursor: grabbing;
}

.card.dragging {
  opacity: 0.4;
}

.tag-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 4px;
}

.category-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1.5;
}

.card-text {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
}

.card-description {
  margin: 3px 0 0;
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 5px;
}

.due-date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--color-text-tertiary);
  font-size: 10px;
  white-space: nowrap;
}

.due-date-spacer {
  flex: 1;
}

.card-menu-wrap {
  position: relative;
  flex-shrink: 0;
}

.dots-btn {
  opacity: 0;
  transition: opacity 0.12s ease;
}

.card:hover .dots-btn,
.card-menu-wrap:has(.card-menu) .dots-btn {
  opacity: 1;
}

.card-menu {
  position: absolute;
  top: 22px;
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 140px;
  padding: 4px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: 0 8px 20px var(--color-shadow);
  cursor: default;
}

.card-menu-item {
  padding: 6px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.card-menu-item:hover {
  background: var(--color-hover);
}

.card-menu-item.danger {
  color: #ff6b6b;
}

.card-menu-item.danger:hover {
  background: rgba(255, 107, 107, 0.15);
}

.card-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.card-icon-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.card-icon-btn.danger:hover {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.card-icon-btn.danger.confirming,
.column-btn.danger.confirming {
  background: #ff6b6b;
  color: #fff;
}

.milestone-block {
  margin-top: 6px;
}

.milestone-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 3px;
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.milestone-fraction {
  font-weight: 600;
  color: var(--color-text-secondary);
}

.milestone-bar {
  height: 4px;
  border-radius: 999px;
  background: var(--color-bg-app);
  overflow: hidden;
}

.milestone-fill {
  height: 100%;
  border-radius: 999px;
  background: #22c55e;
  transition: width 0.15s ease;
}

.comment-count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.card-bottom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 7px;
}

.priority-pill,
.priority-pill-spacer {
  flex-shrink: 0;
}

.priority-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--priority-color) 18%, transparent);
  color: var(--priority-color);
  font-size: 9.5px;
  font-weight: 700;
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

.board::-webkit-scrollbar,
.card-list::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.board::-webkit-scrollbar-track,
.card-list::-webkit-scrollbar-track {
  background: transparent;
}

.board::-webkit-scrollbar-thumb,
.card-list::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 999px;
}
</style>
