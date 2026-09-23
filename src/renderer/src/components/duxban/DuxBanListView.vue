<template>
  <div class="list-view nodrag nowheel nopan">
    <div class="list-toolbar">
      <span class="list-count">{{ allCards.length }} cartão{{ allCards.length === 1 ? '' : 's' }}</span>
      <button class="add-card-btn" title="Novo cartão" :disabled="!columns.length" @click="$emit('open-create', columns[0])">
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        Novo cartão
      </button>
    </div>

    <div class="list-body">
      <p v-if="!allCards.length" class="empty-list-hint">Nenhum cartão neste board ainda.</p>

      <div
        v-for="entry in allCards"
        :key="entry.card.id"
        class="list-row"
        @click="$emit('open-detail', entry.card)"
      >
        <span class="row-dot" :style="{ '--dot-color': columnMeta(entry.col, entry.colIndex).color }">
          <DuxBanColumnIcon :icon="columnMeta(entry.col, entry.colIndex).icon" />
        </span>

        <select
          class="row-status-select"
          :value="entry.col.id"
          :title="entry.col.title"
          @change="onMoveCard(entry.card, $event.target.value)"
          @mousedown.stop
          @click.stop
        >
          <option v-for="col in columns" :key="col.id" :value="col.id">{{ col.title }}</option>
        </select>

        <div class="row-main">
          <p class="row-title">{{ entry.card.text || 'Cartão vazio' }}</p>
          <div v-if="cardTags(entry.card, tags).length" class="row-tags">
            <span
              v-for="tag in cardTags(entry.card, tags)"
              :key="tag.id"
              class="category-badge"
              :style="{ background: tag.color }"
            >
              {{ tag.name }}
            </span>
          </div>
        </div>

        <span v-if="entry.card.priority" class="priority-pill" :style="{ '--priority-color': PRIORITY_META[entry.card.priority].color }">
          {{ PRIORITY_META[entry.card.priority].label }}
        </span>

        <span v-if="entry.card.dueDate" class="row-due">{{ formatDueDate(entry.card.dueDate) }}</span>

        <select
          class="row-status-select row-assign-select"
          :value="entry.card.assignedNodeId || ''"
          :title="entry.card.assignedNodeId ? agentName(entry.card.assignedNodeId, connectedAgents) || 'Agente desconectado' : 'Sem atribuição'"
          @change="onAssignCard(entry.card, $event.target.value)"
          @mousedown.stop
          @click.stop
        >
          <option value="">Sem atribuição</option>
          <option v-for="agent in connectedAgents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import DuxBanColumnIcon from './DuxBanColumnIcon.vue'
import {
  PRIORITY_META,
  formatDueDate,
  columnMeta,
  cardTags,
  agentName
} from '../../lib/duxbanCardUi'
import { moveCard, assignCard } from '../../lib/duxbanOps'

const props = defineProps({
  data: { type: Object, required: true },
  columns: { type: Array, required: true },
  tags: { type: Array, required: true },
  connectedAgents: { type: Array, required: true }
})

defineEmits(['open-detail', 'open-create'])

// achatado na ordem do Kanban (colunas na ordem declarada, cartões na ordem
// de cada coluna) — a Lista não agrupa por seção, identifica a coluna/status
// de cada cartão pelo chip colorido + select na própria linha
const allCards = computed(() => {
  const list = []
  props.columns.forEach((col, colIndex) => {
    for (const card of col.cards) {
      list.push({ card, col, colIndex })
    }
  })
  return list
})

function onMoveCard(card, columnId) {
  moveCard(props.data, card.id, columnId)
}

function onAssignCard(card, nodeId) {
  assignCard(props.data, card.id, nodeId || null)
}
</script>

<style scoped>
.list-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 0 0 9px 9px;
}

.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
}

.list-count {
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  font-weight: 600;
}

.add-card-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.add-card-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.add-card-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px;
}

.empty-list-hint {
  margin: 16px 4px;
  padding: 14px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  color: var(--color-text-tertiary);
  font-size: 11px;
  text-align: center;
}

.list-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.12s ease;
}

.list-row:hover {
  background: var(--color-hover);
}

.list-row:last-child {
  border-bottom: none;
}

.row-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  color: var(--dot-color);
}

.row-status-select {
  flex-shrink: 0;
  max-width: 130px;
  height: 22px;
  padding: 0 4px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  font-size: 10.5px;
}

.row-status-select:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-title {
  margin: 0;
  flex-shrink: 1;
  min-width: 0;
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  flex-shrink: 0;
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

.priority-pill {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--priority-color) 18%, transparent);
  color: var(--priority-color);
  font-size: 9.5px;
  font-weight: 700;
}

.row-due {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  font-size: 10px;
  white-space: nowrap;
}

.row-assign-select {
  max-width: 110px;
}

.list-body::-webkit-scrollbar {
  width: 8px;
}

.list-body::-webkit-scrollbar-track {
  background: transparent;
}

.list-body::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 999px;
}
</style>
