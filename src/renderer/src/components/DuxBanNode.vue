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

    <div
      class="duxban-header"
      :style="{ background: data.headerColor || undefined }"
    >
      <span class="duxban-title">{{ data.name }}</span>
      <span v-if="connectedAgents.length" class="agent-count" :title="connectedAgents.map((a) => a.name).join(', ')">
        {{ connectedAgents.length }} agente{{ connectedAgents.length === 1 ? '' : 's' }}
      </span>
      <div class="view-switch nodrag">
        <button
          v-for="view in DUXBAN_VIEWS"
          :key="view.id"
          class="view-tab"
          :class="{ active: activeViewId === view.id }"
          @click="setView(view.id)"
        >
          {{ view.label }}
        </button>
      </div>
      <button class="header-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <GearIcon />
      </button>
    </div>

    <component
      :is="activeView.component"
      :data="data"
      :columns="columns"
      :tags="tags"
      :connected-agents="connectedAgents"
      @open-detail="openDetail"
      @open-create="openCreateModal"
    />

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="detailCard" class="card-modal-backdrop" @mousedown.self="closeDetail">
        <div class="card-modal card-modal-wide nodrag nowheel nopan">
          <div class="card-modal-header">
            <span class="card-modal-title">Detalhes do cartão</span>
            <button class="header-btn" title="Fechar" @click="closeDetail">
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <div class="card-modal-body card-modal-body-split">
          <div class="card-modal-main">
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

          </div>

          <div class="card-modal-comments">
            <label class="modal-label comments-panel-label">Comentários</label>
            <div v-if="detailCard.comments.length" class="comment-list">
              <div v-for="comment in detailCard.comments" :key="comment.id" class="comment-row">
                <p class="comment-text">{{ comment.text }}</p>
                <div class="comment-meta">
                  <span class="comment-author">{{ comment.author }}</span>
                  <span class="comment-time">{{ formatCommentTime(comment.createdAt) }}</span>
                  <button
                    class="comment-remove-btn"
                    :class="{ confirming: pendingDeleteId === 'comment-' + comment.id }"
                    :title="pendingDeleteId === 'comment-' + comment.id ? 'Clique de novo pra confirmar' : 'Excluir comentário'"
                    @click="requestDelete('comment-' + comment.id, () => onRemoveComment(detailCard.id, comment.id))"
                  >
                    <svg viewBox="0 0 16 16" width="13" height="13">
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
              <svg viewBox="0 0 16 16" width="16" height="16">
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

            <div class="modal-field">
              <label class="modal-label">Coluna</label>
              <select class="modal-select" :value="creatingColId" @change="creatingColId = $event.target.value">
                <option v-for="col in columns" :key="col.id" :value="col.id">{{ col.title }}</option>
              </select>
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
import { useConfirmDelete } from '../lib/useConfirmDelete'
import { STATUS_LABELS, PRIORITY_META, PRIORITY_ORDER } from '../lib/duxbanCardUi'
import { DUXBAN_VIEWS, resolveDuxBanView } from './duxban/duxbanViews'
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
  findCardById
} from '../lib/duxbanOps'

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

// visualização ativa (Kanban/Lista/...) — guardada direto em data.viewMode
// (mesmo padrão de mutação direta do resto do board) pra persistir por board
// junto do resto do workspace, sem mecanismo de save separado. Kanban
// continua sendo o padrão pra board sem essa propriedade ainda salva.
const activeViewId = computed(() => props.data.viewMode || 'kanban')
const activeView = computed(() => resolveDuxBanView(activeViewId.value))
function setView(viewId) {
  props.data.viewMode = viewId
}

// Agentes conectados por edge — viram as opções do seletor de atribuição de
// cada cartão. Deriva sozinho das edges (não é algo que se "adiciona" ao
// board à parte): conectar um terminal aqui já é o bastante pra ele virar
// atribuível. Calculado aqui (e não em cada view) porque só o node tem
// acesso ao contexto do VueFlow (useVueFlow) — as views recebem a lista
// pronta via prop.
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

// mesma lógica de normalização: `tags` pode não existir ainda (ou estar só
// em `data.categories`, nome antigo) em boards salvos antes dessa feature.
const tags = computed(() => boardTags(props.data))

// Painel de detalhes do cartão — guarda só o id (não o objeto do cartão em
// si) pra sempre reler a referência viva mais recente de `columns` a cada
// render, do jeito que o resto do node já lida com o array trocado a cada
// operação (ver comentário acima de `columns`). Compartilhado pelas duas
// visualizações: qualquer uma delas abre o mesmo modal via emit('open-detail').
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
  deleteConfirm.reset()
}

function onKeydown(event) {
  if (event.key !== 'Escape') return
  if (detailCardId.value) closeDetail()
  if (creatingColId.value) closeCreateModal()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

// confirmação em dois cliques do modal (excluir cartão, excluir comentário) —
// instância própria, independente da que o Kanban usa pro menu de coluna/
// cartão (ver useConfirmDelete.js).
const deleteConfirm = useConfirmDelete()
const { pendingDeleteId, requestDelete } = deleteConfirm

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

function onRemoveCard(cardId) {
  removeCard(props.data, cardId)
}

function onAssign(card, nodeId) {
  assignCard(props.data, card.id, nodeId || null)
}

// modal de criação de cartão: aberto pelo botão "Adicionar cartão" de uma
// coluna (Kanban) ou "Novo cartão" (Lista, sempre a partir da primeira
// coluna) — substitui o antigo input inline no rodapé, permite já preencher
// descrição/tags/coluna/etc antes do cartão existir, em vez de criar só com
// o título e editar depois.
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
  if (!col) return
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

.view-switch {
  display: flex;
  flex-shrink: 0;
  padding: 2px;
  gap: 1px;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
}

.view-tab {
  height: 20px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.view-tab:hover {
  color: var(--color-text-primary);
}

.view-tab.active {
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.header-btn:hover {
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

.card-modal-wide {
  width: 1040px;
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

.card-modal-body-split {
  display: flex;
  align-items: stretch;
  overflow-y: hidden;
  padding: 0;
}

.card-modal-main {
  flex: 1.3;
  min-width: 0;
  overflow-y: auto;
  padding: 14px;
}

.card-modal-comments {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding: 14px;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-surface-alt);
}

.comments-panel-label {
  flex-shrink: 0;
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
  flex: 1;
  min-height: 0;
  margin-bottom: 10px;
  overflow-y: auto;
}

.card-modal-comments .modal-hint {
  flex: 1;
}

.comment-row {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-surface);
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
  gap: 6px;
}

.comment-author {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.comment-time {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.comment-remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: auto;
  flex-shrink: 0;
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

.comment-remove-btn.confirming {
  background: #ff6b6b;
  color: #fff;
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

.comment-list::-webkit-scrollbar,
.card-modal-body::-webkit-scrollbar,
.card-modal-main::-webkit-scrollbar,
.card-modal-comments::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.comment-list::-webkit-scrollbar-track,
.card-modal-body::-webkit-scrollbar-track,
.card-modal-main::-webkit-scrollbar-track,
.card-modal-comments::-webkit-scrollbar-track {
  background: transparent;
}

.comment-list::-webkit-scrollbar-thumb,
.card-modal-body::-webkit-scrollbar-thumb,
.card-modal-main::-webkit-scrollbar-thumb,
.card-modal-comments::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 999px;
}
</style>
