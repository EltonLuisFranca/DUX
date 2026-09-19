<template>
  <div class="field">
    <label class="field-label" for="board-name">Nome do board</label>
    <input
      id="board-name"
      class="field-input"
      type="text"
      :value="node.data.name"
      @input="updateNodeData(node.id, { name: $event.target.value })"
    />
  </div>

  <div class="field">
    <label class="field-label">Tags</label>
    <p class="field-hint">Marcam cartões com uma cor pra classificar o tipo de tarefa (bug, feature, etc) — um cartão pode ter várias.</p>

    <div v-if="tags.length" class="category-list">
      <div v-for="tag in tags" :key="tag.id" class="category-row">
        <span class="color-dot" :style="{ background: tag.color }" />
        <input
          class="category-name-input"
          type="text"
          :value="tag.name"
          @input="renameTag(node.data, tag.id, $event.target.value)"
        />
        <button
          class="icon-btn danger"
          :class="{ confirming: pendingDeleteId === tag.id }"
          :title="pendingDeleteId === tag.id ? 'Clique de novo pra confirmar' : 'Excluir tag'"
          @click="requestDelete(tag.id, () => removeTag(node.data, tag.id))"
        >
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>

    <div class="new-category">
      <input
        v-model="draftName"
        class="field-input"
        type="text"
        placeholder="Nova tag..."
        @keyup.enter="onAddTag"
      />
      <div class="swatch-row">
        <button
          v-for="color in TAG_COLORS"
          :key="color"
          class="swatch"
          :class="{ selected: draftColor === color }"
          :style="{ background: color }"
          :title="color"
          @click="draftColor = color"
        />
      </div>
      <button class="add-btn" :disabled="!draftName.trim()" @click="onAddTag">+ Adicionar tag</button>
    </div>
  </div>

  <div class="field">
    <label class="field-label">Agentes conectados</label>
    <p v-if="!connectedAgents.length" class="field-hint">
      Nenhum agente conectado — ligue um terminal (Claude Code, Codex) a este board pra poder atribuir cartões a ele.
    </p>
    <div v-else class="agent-list">
      <div v-for="agent in connectedAgents" :key="agent.id" class="agent-row">
        <span class="agent-name">{{ agent.name }}</span>
        <span class="agent-status" :class="agent.statusClass">{{ agent.statusLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { updateNodeData, activeWorkspace, AGENT_TERMINAL_TYPES } from '../../store/flowStore'
import {
  boardTags,
  normalizeColumns,
  addTag,
  renameTag,
  removeTag,
  TAG_COLORS
} from '../../lib/duxbanOps'

const props = defineProps({
  node: { type: Object, required: true }
})

const tags = computed(() => boardTags(props.node.data))

const draftName = ref('')
const draftColor = ref(TAG_COLORS[0])

function onAddTag() {
  const name = draftName.value.trim()
  if (!name) return
  addTag(props.node.data, name, draftColor.value)
  draftName.value = ''
  draftColor.value = TAG_COLORS[tags.value.length % TAG_COLORS.length]
}

// mesmo padrão de confirmação em dois cliques do DuxBanNode.vue — excluir
// uma tag tira ela de todo cartão que a usava, então merece o freio extra.
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

// Lido direto de activeWorkspace.edges/nodes (não via useVueFlow) — este
// painel roda fora da árvore do <VueFlow> (App.vue monta NodeSettingsSidebar
// como irmão de FleetCanvas), então o composable não teria o contexto certo.
const connectedAgents = computed(() => {
  const list = []
  for (const edge of activeWorkspace.value.edges) {
    if (edge.source !== props.node.id && edge.target !== props.node.id) continue
    const otherId = edge.source === props.node.id ? edge.target : edge.source
    const otherNode = activeWorkspace.value.nodes.find((n) => n.id === otherId)
    if (!otherNode || !AGENT_TERMINAL_TYPES.includes(otherNode.type)) continue

    const columns = normalizeColumns(props.node.data.columns)
    let activeCard = null
    let queuedCount = 0
    for (const col of columns) {
      for (const card of col.cards) {
        if (card.assignedNodeId !== otherId) continue
        if (card.taskState === 'active') activeCard = card
        else if (card.taskState === 'queued') queuedCount++
      }
    }

    let statusLabel = 'Ocioso'
    let statusClass = 'idle'
    if (activeCard) {
      statusLabel = `Em andamento: ${activeCard.text.slice(0, 40)}${activeCard.text.length > 40 ? '…' : ''}`
      statusClass = 'active'
    } else if (queuedCount > 0) {
      statusLabel = `${queuedCount} na fila`
      statusClass = 'queued'
    }

    list.push({ id: otherId, name: otherNode.data.name || otherId, statusLabel, statusClass })
  }
  return list
})
</script>

<style scoped>
.field {
  margin-bottom: 18px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.field-hint {
  margin: 0 0 8px;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--color-text-tertiary);
}

.field-input {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  box-sizing: border-box;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  color: var(--color-text-primary);
  font-size: 12px;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
}

.category-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-dot {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.category-name-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
}

.category-name-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.icon-btn.danger:hover {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.icon-btn.danger.confirming {
  background: #ff6b6b;
  color: #fff;
}

.new-category {
  padding: 8px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 8px;
}

.swatch-row {
  display: flex;
  gap: 5px;
  margin: 8px 0;
}

.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}

.swatch.selected {
  border-color: var(--color-text-primary);
}

.add-btn {
  width: 100%;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.add-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.add-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-surface);
}

.agent-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.agent-status {
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.agent-status.active {
  color: #3b82f6;
}

.agent-status.queued {
  color: #eab308;
}
</style>
