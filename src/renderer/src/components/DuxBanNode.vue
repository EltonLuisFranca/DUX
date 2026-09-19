<template>
  <div
    class="duxban-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="top"
      type="target"
      :position="Position.Top"
      class="duxban-handle"
      :class="{ connected: isTopConnected }"
    />
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
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="duxban-handle"
      :class="{ connected: isBottomConnected }"
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
      <div
        v-for="(col, colIndex) in columns"
        :key="col.id"
        class="column"
        :class="{ 'drop-active': dragState.cardId && hover.colId === col.id }"
      >
        <div class="column-header">
          <span class="column-dot" :style="{ '--dot-color': columnMetas[colIndex].color }">
            <svg v-if="columnMetas[colIndex].icon === 'done'" viewBox="0 0 16 16" width="13" height="13">
              <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4" />
              <path d="M5.3 8.2l1.8 1.8 3.4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
            <svg v-else-if="columnMetas[colIndex].icon === 'review'" viewBox="0 0 16 16" width="13" height="13">
              <path d="M4 2.5v11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <path d="M4 3h7l-1.6 2L11 7H4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none" />
            </svg>
            <svg v-else-if="columnMetas[colIndex].icon === 'process'" viewBox="0 0 16 16" width="13" height="13">
              <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4" />
              <path d="M8 4.6v3.7l2.4 1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none" />
            </svg>
            <svg v-else viewBox="0 0 16 16" width="13" height="13">
              <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4" />
            </svg>
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
          <button class="column-btn" title="Adicionar cartão" @click="openCreateModal(col)">
            <svg viewBox="0 0 16 16" width="13" height="13">
              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
          <div class="col-menu-wrap">
            <button class="column-btn" title="Mais opções" @mousedown.stop @click="toggleColMenu(col.id)">
              <svg viewBox="0 0 16 16" width="13" height="13">
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
            >
              <div class="card-top-row">
                <div v-if="card.dueDate" class="due-date">
                  <svg viewBox="0 0 16 16" width="11" height="11">
                    <rect x="2.5" y="3" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
                    <path d="M2.5 6h11M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                  </svg>
                  <span>Due: {{ formatDueDate(card.dueDate) }}</span>
                </div>
                <span v-else class="due-date-spacer" />
                <div class="card-menu-wrap">
                  <button class="card-icon-btn dots-btn" title="Mais opções" @mousedown.stop @click.stop="toggleCardMenu(card.id)">
                    <svg viewBox="0 0 16 16" width="13" height="13">
                      <circle cx="3.2" cy="8" r="1.3" fill="currentColor" />
                      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
                      <circle cx="12.8" cy="8" r="1.3" fill="currentColor" />
                    </svg>
                  </button>
                  <div v-if="openCardMenuId === card.id" class="card-menu">
                    <button class="card-menu-item" @click="openDetail(card); openCardMenuId = null">Ver detalhes</button>
                    <button
                      class="card-menu-item danger"
                      @click="requestDelete('card-' + card.id, () => onRemoveCard(card.id)); openCardMenuId = null"
                    >
                      {{ pendingDeleteId === 'card-' + card.id ? 'Clique de novo pra confirmar' : 'Excluir cartão' }}
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="cardTags(card).length" class="tag-badges">
                <span v-for="tag in cardTags(card)" :key="tag.id" class="category-badge" :style="{ background: tag.color }">
                  {{ tag.name }}
                </span>
              </div>

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

              <div v-if="connectedAgents.length" class="card-assign assign-wrap">
                <span class="assign-label">Assigned for</span>
                <select
                  v-if="assigningCardId === card.id"
                  class="assign-select"
                  :value="card.assignedNodeId || ''"
                  autofocus
                  @change="onAssign(card, $event.target.value)"
                  @mousedown.stop
                >
                  <option value="">Sem atribuição</option>
                  <option v-for="agent in connectedAgents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
                </select>
                <button
                  v-else
                  class="avatar-btn"
                  :class="{ empty: !card.assignedNodeId }"
                  :style="card.assignedNodeId ? { background: avatarColor(card.assignedNodeId) } : {}"
                  :title="card.assignedNodeId ? agentName(card.assignedNodeId) : 'Sem atribuição — clique pra atribuir'"
                  @mousedown.stop
                  @click.stop="toggleAssign(card)"
                >
                  {{ card.assignedNodeId ? initials(agentName(card.assignedNodeId)) : '+' }}
                </button>
                <span
                  v-if="card.assignedNodeId"
                  class="task-status"
                  :class="card.taskState"
                  :title="STATUS_LABELS[card.taskState]"
                />
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
                  <svg viewBox="0 0 16 16" width="11" height="11">
                    <path d="M2.5 3.5h11v7h-6l-3 3v-3h-2v-7z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none" />
                  </svg>
                  <span>{{ card.comments.length }}</span>
                </div>
              </div>
            </div>
          </template>
          <div v-if="isDropTarget(col, col.cards.length)" class="drop-indicator" />
        </div>
      </div>

      <button class="add-column-btn" @click="addColumn">+ Coluna</button>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="detailCard" class="card-modal-backdrop" @mousedown.self="closeDetail">
        <div class="card-modal nodrag nowheel nopan">
          <div class="card-modal-header">
            <span class="card-modal-title">Detalhes do cartão</span>
            <button class="header-btn" title="Fechar" @click="closeDetail">
              <svg viewBox="0 0 16 16" width="14" height="14">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <div class="card-modal-body">
            <div class="modal-field">
              <label class="modal-label">Título</label>
              <textarea v-model="detailCard.text" class="modal-textarea" rows="2" />
            </div>

            <div class="modal-field">
              <label class="modal-label">Descrição</label>
              <textarea v-model="detailCard.description" class="modal-textarea" rows="4" />
            </div>

            <div class="modal-field modal-field-row">
              <div>
                <label class="modal-label">Vencimento</label>
                <input
                  type="date"
                  class="modal-select"
                  :value="detailCard.dueDate || ''"
                  @change="detailCard.dueDate = $event.target.value || null"
                />
              </div>
              <div>
                <label class="modal-label">Milestone</label>
                <div class="milestone-inputs">
                  <input type="number" min="0" class="modal-number" v-model.number="detailCard.milestoneCurrent" />
                  <span>/</span>
                  <input type="number" min="0" class="modal-number" v-model.number="detailCard.milestoneTotal" />
                </div>
              </div>
            </div>

            <div class="modal-field">
              <label class="modal-label">Prioridade</label>
              <div class="priority-picker">
                <button
                  v-for="p in PRIORITY_ORDER"
                  :key="p"
                  type="button"
                  class="priority-chip"
                  :class="{ active: detailCard.priority === p }"
                  :style="{ '--priority-color': PRIORITY_META[p].color }"
                  @click="detailCard.priority = detailCard.priority === p ? null : p"
                >
                  {{ PRIORITY_META[p].label }}
                </button>
              </div>
            </div>

            <div class="modal-field">
              <label class="modal-label">Tags</label>
              <div v-if="tags.length" class="modal-tag-picker">
                <button
                  v-for="tag in tags"
                  :key="tag.id"
                  type="button"
                  class="modal-tag-chip"
                  :class="{ active: detailCard.tagIds.includes(tag.id) }"
                  :style="{ '--tag-color': tag.color }"
                  @click="toggleCardTag(props.data, detailCard.id, tag.id)"
                >
                  {{ tag.name }}
                </button>
              </div>
              <p v-if="!tags.length" class="modal-hint">
                Nenhuma tag criada ainda — adicione uma nas configurações do board (ícone de engrenagem).
              </p>
            </div>

            <div class="modal-field">
              <label class="modal-label">Coluna</label>
              <select
                class="modal-select"
                :value="detailColumnId"
                @change="onDetailColumnChange($event.target.value)"
              >
                <option v-for="col in columns" :key="col.id" :value="col.id">{{ col.title }}</option>
              </select>
            </div>

            <div v-if="connectedAgents.length" class="modal-field">
              <label class="modal-label">Atribuído a</label>
              <div class="modal-assign-row">
                <select
                  class="modal-select"
                  :value="detailCard.assignedNodeId || ''"
                  @change="onAssign(detailCard, $event.target.value)"
                >
                  <option value="">Sem atribuição</option>
                  <option v-for="agent in connectedAgents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
                </select>
                <span v-if="detailCard.assignedNodeId" class="modal-status" :class="detailCard.taskState">
                  {{ STATUS_LABELS[detailCard.taskState] }}
                </span>
              </div>
            </div>

            <div class="modal-field">
              <label class="modal-label">Comentários</label>
              <div v-if="detailCard.comments.length" class="comment-list">
                <div v-for="comment in detailCard.comments" :key="comment.id" class="comment-row">
                  <p class="comment-text">{{ comment.text }}</p>
                  <div class="comment-meta">
                    <span class="comment-time">{{ formatCommentTime(comment.createdAt) }}</span>
                    <button
                      class="comment-remove-btn"
                      :class="{ confirming: pendingDeleteId === 'comment-' + comment.id }"
                      :title="pendingDeleteId === 'comment-' + comment.id ? 'Clique de novo pra confirmar' : 'Excluir comentário'"
                      @click="requestDelete('comment-' + comment.id, () => onRemoveComment(detailCard.id, comment.id))"
                    >
                      <svg viewBox="0 0 16 16" width="11" height="11">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <p v-else class="modal-hint">Nenhum comentário ainda.</p>
              <div class="comment-add-row">
                <textarea
                  v-model="commentDraft"
                  class="comment-textarea"
                  rows="2"
                  placeholder="Escrever um comentário..."
                  @keydown.enter.exact.prevent="onAddComment(detailCard.id)"
                />
                <button class="comment-send-btn" :disabled="!commentDraft.trim()" @click="onAddComment(detailCard.id)">
                  Enviar
                </button>
              </div>
            </div>
          </div>

          <div class="card-modal-footer">
            <button
              class="delete-card-btn"
              :class="{ confirming: pendingDeleteId === 'modal-' + detailCard.id }"
              @click="requestDelete('modal-' + detailCard.id, () => { onRemoveCard(detailCard.id); closeDetail() })"
            >
              {{ pendingDeleteId === 'modal-' + detailCard.id ? 'Clique de novo pra confirmar' : 'Excluir cartão' }}
            </button>
          </div>
        </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="creatingCol" class="card-modal-backdrop" @mousedown.self="closeCreateModal">
        <div class="card-modal nodrag nowheel nopan">
          <div class="card-modal-header">
            <span class="card-modal-title">Novo cartão — {{ creatingCol.title }}</span>
            <button class="header-btn" title="Fechar" @click="closeCreateModal">
              <svg viewBox="0 0 16 16" width="14" height="14">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <div class="card-modal-body">
            <div class="modal-field">
              <label class="modal-label">Título</label>
              <textarea
                ref="newCardTitleRef"
                v-model="newCardDraft.text"
                class="modal-textarea"
                rows="2"
                placeholder="Título do cartão"
              />
            </div>

            <div class="modal-field">
              <label class="modal-label">Descrição</label>
              <textarea v-model="newCardDraft.description" class="modal-textarea" rows="4" placeholder="Descrição (opcional)" />
            </div>

            <div class="modal-field modal-field-row">
              <div>
                <label class="modal-label">Vencimento</label>
                <input
                  type="date"
                  class="modal-select"
                  :value="newCardDraft.dueDate || ''"
                  @change="newCardDraft.dueDate = $event.target.value || null"
                />
              </div>
              <div>
                <label class="modal-label">Milestone</label>
                <div class="milestone-inputs">
                  <input type="number" min="0" class="modal-number" v-model.number="newCardDraft.milestoneCurrent" />
                  <span>/</span>
                  <input type="number" min="0" class="modal-number" v-model.number="newCardDraft.milestoneTotal" />
                </div>
              </div>
            </div>

            <div class="modal-field">
              <label class="modal-label">Prioridade</label>
              <div class="priority-picker">
                <button
                  v-for="p in PRIORITY_ORDER"
                  :key="p"
                  type="button"
                  class="priority-chip"
                  :class="{ active: newCardDraft.priority === p }"
                  :style="{ '--priority-color': PRIORITY_META[p].color }"
                  @click="newCardDraft.priority = newCardDraft.priority === p ? null : p"
                >
                  {{ PRIORITY_META[p].label }}
                </button>
              </div>
            </div>

            <div class="modal-field">
              <label class="modal-label">Tags</label>
              <div v-if="tags.length" class="modal-tag-picker">
                <button
                  v-for="tag in tags"
                  :key="tag.id"
                  type="button"
                  class="modal-tag-chip"
                  :class="{ active: newCardDraft.tagIds.includes(tag.id) }"
                  :style="{ '--tag-color': tag.color }"
                  @click="toggleNewCardTag(tag.id)"
                >
                  {{ tag.name }}
                </button>
              </div>
              <p v-if="!tags.length" class="modal-hint">
                Nenhuma tag criada ainda — adicione uma nas configurações do board (ícone de engrenagem).
              </p>
            </div>
          </div>

          <div class="card-modal-footer create-footer">
            <button class="cancel-btn" @click="closeCreateModal">Cancelar</button>
            <button class="create-card-btn" :disabled="!newCardDraft.text.trim()" @click="onCreateCard">Criar cartão</button>
          </div>
        </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import NodeToolbar from './NodeToolbar.vue'
import { toggleNodeSettings, AGENT_TERMINAL_TYPES } from '../store/flowStore'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'
import {
  normalizeColumns,
  boardTags,
  addCard,
  removeCard,
  moveCard,
  assignCard,
  toggleCardTag,
  addComment,
  removeComment,
  findCardById,
  TAG_COLORS,
  addColumn as addColumnOp,
  removeColumn as removeColumnOp,
  moveColumn as moveColumnOp,
  renameColumn as renameColumnOp
} from '../lib/duxbanOps'

const STATUS_LABELS = {
  queued: 'Na fila — aguardando o agente ficar livre',
  active: 'Em andamento',
  done: 'Concluído'
}

const PRIORITY_META = {
  high: { label: 'Alta', color: '#ef4444' },
  medium: { label: 'Média', color: '#eab308' },
  low: { label: 'Baixa', color: '#3b82f6' }
}
const PRIORITY_ORDER = ['high', 'medium', 'low']

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { getConnectedEdges, findNode } = useVueFlow()
const { isHandleConnected } = useHandleConnection(props.id)
const isTopConnected = isHandleConnected('top')
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')
const isBottomConnected = isHandleConnected('bottom')

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

function agentName(nodeId) {
  return connectedAgents.value.find((a) => a.id === nodeId)?.name || ''
}

// hash simples do id só pra escolher uma cor estável da paleta pro avatar do
// agente — não precisa ser criptográfico, só determinístico entre renders.
function avatarColor(id) {
  let hash = 0
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return TAG_COLORS[hash % TAG_COLORS.length]
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

// dot/ícone da coluna é só cosmético e derivado do título (sem campo novo
// persistido) — casa palavras-chave comuns de board kanban; sem match, cai
// num dot cinza cor da paleta ciclando pelo índice, igual as tags.
function columnMeta(col, index) {
  const t = (col.title || '').toLowerCase()
  if (/(conclu|feito|complet|done)/.test(t)) return { icon: 'done', color: '#22c55e' }
  if (/(revis|review)/.test(t)) return { icon: 'review', color: '#ef4444' }
  if (/(andamento|process|fazendo|progress)/.test(t)) return { icon: 'process', color: '#eab308' }
  if (/(fazer|todo|to.?do|backlog)/.test(t)) return { icon: 'todo', color: '#3b82f6' }
  return { icon: 'todo', color: TAG_COLORS[index % TAG_COLORS.length] }
}
const columnMetas = computed(() => columns.value.map((col, i) => columnMeta(col, i)))

// "Due: 14 dez 2026" a partir do value cru de <input type="date"> (sempre
// yyyy-mm-dd) — monta a Date com componentes locais em vez de new Date(str)
// pra não sofrer o shift de fuso horário do parse ISO em UTC.
function formatDueDate(value) {
  if (!value) return ''
  const [y, m, d] = String(value).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function milestonePercent(card) {
  if (!card.milestoneTotal) return 0
  return Math.min(100, Math.max(0, Math.round((card.milestoneCurrent / card.milestoneTotal) * 100)))
}

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

// mesma lógica de normalização: `tags` pode não existir ainda (ou estar só
// em `data.categories`, nome antigo) em boards salvos antes dessa feature.
const tags = computed(() => boardTags(props.data))

function cardTags(card) {
  return card.tagIds.map((id) => tags.value.find((t) => t.id === id)).filter(Boolean)
}

// Painel de detalhes do cartão — guarda só o id (não o objeto do cartão em
// si) pra sempre reler a referência viva mais recente de `columns` a cada
// render, do jeito que o resto do node já lida com o array trocado a cada
// operação (ver comentário acima de `columns`).
const detailCardId = ref(null)
const detailCard = computed(() => {
  if (!detailCardId.value) return null
  return findCardById(columns.value, detailCardId.value)?.card ?? null
})
const detailColumnId = computed(() => {
  if (!detailCardId.value) return ''
  return findCardById(columns.value, detailCardId.value)?.col.id ?? ''
})

const commentDraft = ref('')

function openDetail(card) {
  detailCardId.value = card.id
  commentDraft.value = ''
}

function closeDetail() {
  detailCardId.value = null
  commentDraft.value = ''
  pendingDeleteId.value = null
}

// menu "⋯" do cartão (ver detalhes / excluir), menu "⋯" da coluna (mover /
// excluir) e o mini-select de reatribuição no rosto do cartão — os três só
// um aberto por vez, fechado por clique fora (onDocClick) ou Escape.
const openCardMenuId = ref(null)
const openColMenuId = ref(null)
const assigningCardId = ref(null)

function toggleCardMenu(cardId) {
  openCardMenuId.value = openCardMenuId.value === cardId ? null : cardId
}
function toggleColMenu(colId) {
  openColMenuId.value = openColMenuId.value === colId ? null : colId
}
function toggleAssign(card) {
  assigningCardId.value = assigningCardId.value === card.id ? null : card.id
}

function onDocClick(event) {
  if (openCardMenuId.value && !event.target.closest('.card-menu-wrap')) openCardMenuId.value = null
  if (openColMenuId.value && !event.target.closest('.col-menu-wrap')) openColMenuId.value = null
  if (assigningCardId.value && !event.target.closest('.assign-wrap')) assigningCardId.value = null
}

function onKeydown(event) {
  if (event.key !== 'Escape') return
  if (detailCardId.value) closeDetail()
  if (creatingColId.value) closeCreateModal()
  openCardMenuId.value = null
  openColMenuId.value = null
  assigningCardId.value = null
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mousedown', onDocClick)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousedown', onDocClick)
})

// confirmação em dois cliques pra qualquer ação destrutiva (cartão, coluna,
// comentário): primeiro clique arma `pendingDeleteId` (o botão vira vermelho
// sólido / troca o texto), segundo clique dentro da janela confirma. Sem
// segundo clique, desarma sozinho — evita exclusão acidental de um clique só.
const pendingDeleteId = ref(null)
let pendingDeleteTimer = null
function requestDelete(id, action) {
  clearTimeout(pendingDeleteTimer)
  if (pendingDeleteId.value === id) {
    pendingDeleteId.value = null
    action()
  } else {
    pendingDeleteId.value = id
    pendingDeleteTimer = setTimeout(() => {
      pendingDeleteId.value = null
    }, 2500)
  }
}

function onAddComment(cardId) {
  const text = commentDraft.value.trim()
  if (!text) return
  addComment(props.data, cardId, text)
  commentDraft.value = ''
}

function onRemoveComment(cardId, commentId) {
  removeComment(props.data, cardId, commentId)
}

function formatCommentTime(timestamp) {
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function onDetailColumnChange(columnId) {
  moveCard(props.data, detailCardId.value, columnId)
}

const editingCardId = ref(null)
const titleRefs = {}
const cardRefs = {}

// modal de criação de cartão: aberto pelo botão "Adicionar cartão" de uma
// coluna, substitui o antigo input inline no rodapé — permite já preencher
// descrição/tags/etc antes do cartão existir, em vez de criar só com o
// título e editar depois.
const creatingColId = ref(null)
const creatingCol = computed(() => {
  if (!creatingColId.value) return null
  return columns.value.find((c) => c.id === creatingColId.value) || null
})
const newCardTitleRef = ref(null)
const newCardDraft = reactive({
  text: '',
  description: '',
  dueDate: null,
  priority: null,
  tagIds: [],
  milestoneCurrent: 0,
  milestoneTotal: 0
})

function openCreateModal(col) {
  creatingColId.value = col.id
  newCardDraft.text = ''
  newCardDraft.description = ''
  newCardDraft.dueDate = null
  newCardDraft.priority = null
  newCardDraft.tagIds = []
  newCardDraft.milestoneCurrent = 0
  newCardDraft.milestoneTotal = 0
  nextTick(() => newCardTitleRef.value?.focus())
}

function closeCreateModal() {
  creatingColId.value = null
}

function toggleNewCardTag(tagId) {
  newCardDraft.tagIds = newCardDraft.tagIds.includes(tagId)
    ? newCardDraft.tagIds.filter((id) => id !== tagId)
    : [...newCardDraft.tagIds, tagId]
}

function onCreateCard() {
  const text = newCardDraft.text.trim()
  if (!text || !creatingColId.value) return
  addCard(props.data, creatingColId.value, text, {
    description: newCardDraft.description.trim(),
    dueDate: newCardDraft.dueDate,
    priority: newCardDraft.priority,
    tagIds: [...newCardDraft.tagIds],
    milestoneCurrent: newCardDraft.milestoneCurrent,
    milestoneTotal: newCardDraft.milestoneTotal
  })
  closeCreateModal()
}

// arraste de cartão: estado de quem está sendo arrastado + posição de destino
// (coluna + índice) resolvida a cada dragover, usada tanto pro indicador
// visual (isDropTarget) quanto pro drop em si
const dragState = reactive({ cardId: null })
const hover = reactive({ colId: null, index: null })

function isDropTarget(col, index) {
  return dragState.cardId !== null && hover.colId === col.id && hover.index === index
}

function onRemoveCard(cardId) {
  if (editingCardId.value === cardId) editingCardId.value = null
  removeCard(props.data, cardId)
}

function onAssign(card, nodeId) {
  assignCard(props.data, card.id, nodeId || null)
  assigningCardId.value = null
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
  const col = columns.value[index]
  if (!col) return
  moveColumnOp(props.data, col.id, direction)
}

function renameColumn(col, event) {
  renameColumnOp(props.data, col.id, event.target.value)
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
  transition: background 0.12s ease, border-color 0.12s ease;
}

.column.drop-active {
  border-color: #3b82f6;
  background: color-mix(in srgb, #3b82f6 6%, var(--color-bg-app));
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
  width: 18px;
  height: 18px;
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
  width: 21px;
  height: 21px;
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
  cursor: text;
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
  width: 20px;
  height: 20px;
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
.column-btn.danger.confirming,
.comment-remove-btn.confirming {
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

.card-assign {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.assign-label {
  flex: 1;
  min-width: 0;
  color: var(--color-text-tertiary);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.avatar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: var(--color-bg-surface-raised);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.avatar-btn.empty {
  border: 1.5px dashed var(--color-border-strong);
  background: transparent;
  color: var(--color-text-tertiary);
}

.avatar-btn:hover {
  filter: brightness(1.1);
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

.assign-select {
  flex-shrink: 0;
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

.card-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.card-modal {
  display: flex;
  flex-direction: column;
  width: 560px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 16px 48px var(--color-shadow);
  cursor: default;
}

.card-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 38px;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-border);
}

.card-modal-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.card-modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}

.modal-field {
  margin-bottom: 14px;
}

.modal-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.modal-hint {
  margin: 6px 0 0;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.modal-textarea {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.4;
  resize: vertical;
}

.modal-textarea:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.modal-select {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 12px;
}

.modal-select:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.modal-field-row {
  display: flex;
  gap: 14px;
}

.modal-field-row > div {
  flex: 1;
  min-width: 0;
}

.milestone-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-secondary);
}

.modal-number {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 12px;
}

.modal-number:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.priority-picker {
  display: flex;
  gap: 6px;
}

.priority-chip {
  padding: 4px 10px;
  border: 1.5px solid var(--priority-color);
  border-radius: 999px;
  background: transparent;
  color: var(--priority-color);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.priority-chip:hover {
  background: color-mix(in srgb, var(--priority-color) 15%, transparent);
}

.priority-chip.active {
  background: var(--priority-color);
  color: #fff;
}

.modal-tag-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.modal-tag-chip {
  padding: 4px 10px;
  border: 1.5px solid var(--tag-color);
  border-radius: 999px;
  background: transparent;
  color: var(--tag-color);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.modal-tag-chip:hover {
  background: color-mix(in srgb, var(--tag-color) 15%, transparent);
}

.modal-tag-chip.active {
  background: var(--tag-color);
  color: #fff;
}

.modal-assign-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-status {
  flex-shrink: 0;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  margin-bottom: 10px;
  overflow-y: auto;
}

.comment-row {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
}

.comment-text {
  margin: 0 0 5px;
  color: var(--color-text-primary);
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.comment-time {
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.comment-remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.comment-remove-btn:hover {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.comment-add-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comment-textarea {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.4;
  resize: vertical;
}

.comment-textarea:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.comment-send-btn {
  align-self: flex-end;
  height: 28px;
  padding: 0 14px;
  border: none;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.comment-send-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.comment-send-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.card-modal-footer {
  flex-shrink: 0;
  padding: 12px 14px;
  border-top: 1px solid var(--color-border);
}

.delete-card-btn {
  width: 100%;
  height: 30px;
  border: 1px solid rgba(255, 107, 107, 0.35);
  border-radius: 6px;
  background: transparent;
  color: #ff6b6b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.delete-card-btn:hover {
  background: rgba(255, 107, 107, 0.1);
}

.delete-card-btn.confirming {
  background: #ff6b6b;
  border-color: #ff6b6b;
  color: #fff;
}

.create-footer {
  display: flex;
  gap: 8px;
}

.cancel-btn {
  flex: 1;
  height: 32px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.cancel-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.create-card-btn {
  flex: 1;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: #3b82f6;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.create-card-btn:hover:not(:disabled) {
  background: #2563eb;
}

.create-card-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.15s ease;
}

.modal-fade-enter-active .card-modal,
.modal-fade-leave-active .card-modal {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .card-modal,
.modal-fade-leave-to .card-modal {
  opacity: 0;
  transform: scale(0.96) translateY(6px);
}

.board::-webkit-scrollbar,
.card-list::-webkit-scrollbar,
.comment-list::-webkit-scrollbar,
.card-modal-body::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.board::-webkit-scrollbar-track,
.card-list::-webkit-scrollbar-track,
.comment-list::-webkit-scrollbar-track,
.card-modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.board::-webkit-scrollbar-thumb,
.card-list::-webkit-scrollbar-thumb,
.comment-list::-webkit-scrollbar-thumb,
.card-modal-body::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 999px;
}
</style>
