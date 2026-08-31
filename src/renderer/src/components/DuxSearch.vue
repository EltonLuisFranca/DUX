<template>
  <div v-if="isSearchOpen" class="search-backdrop" @mousedown.self="close">
    <div class="search-modal">
      <div class="search-field">
        <svg class="search-icon" viewBox="0 0 16 16" width="14" height="14">
          <circle cx="6.8" cy="6.8" r="4.3" stroke="currentColor" stroke-width="1.4" fill="none" />
          <path d="M13 13l-3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
        <input
          ref="searchInput"
          v-model="query"
          class="search-input"
          type="text"
          placeholder="Buscar node..."
          @keydown.down.prevent="moveSelection(1)"
          @keydown.up.prevent="moveSelection(-1)"
          @keydown.enter.prevent="goToSelected"
        />
        <kbd class="esc-hint">ESC</kbd>
      </div>

      <div class="search-list">
        <button
          v-for="(node, index) in results"
          :key="node.id"
          class="search-item"
          :class="{ active: index === selectedIndex }"
          @mousemove="selectedIndex = index"
          @click="goTo(node)"
        >
          <span class="search-item-icon-wrap">
            <svg class="search-item-icon" viewBox="0 0 20 20" width="15" height="15" v-html="typeIcon(node.type)" />
          </span>
          <span class="search-item-text">
            <span class="search-item-label">{{ nodeLabel(node) }}</span>
            <span class="search-item-type">{{ typeLabel(node.type) }}</span>
          </span>
        </button>

        <div v-if="results.length === 0" class="search-empty">
          {{ query.trim() ? 'Nenhum node encontrado.' : 'Nenhum node neste workspace.' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { closeSearch, isSearchOpen } from '../store/flowStore'
import { nodeTypeRegistry } from '../nodeTypes/registry'

const props = defineProps({
  workspace: { type: Object, required: true }
})

const { setCenter, addSelectedNodes, removeSelectedNodes, getSelectedNodes, viewport } = useVueFlow()

const query = ref('')
const searchInput = ref(null)
const selectedIndex = ref(0)

function typeLabel(type) {
  return nodeTypeRegistry[type]?.label || type
}

function typeIcon(type) {
  return nodeTypeRegistry[type]?.icon || ''
}

function nodeLabel(node) {
  return node.data?.name || typeLabel(node.type)
}

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const nodes = props.workspace.nodes
  if (!q) return nodes
  return nodes.filter((node) => {
    const haystack = `${nodeLabel(node)} ${typeLabel(node.type)}`.toLowerCase()
    return haystack.includes(q)
  })
})

// digitar filtra a lista e o resultado antes selecionado pode não existir
// mais nela — sempre volta pro topo pra evitar apontar pra um item invisível
watch(results, () => {
  selectedIndex.value = 0
})

function moveSelection(delta) {
  if (results.value.length === 0) return
  const next = (selectedIndex.value + delta + results.value.length) % results.value.length
  selectedIndex.value = next
}

function goTo(node) {
  removeSelectedNodes(getSelectedNodes.value)
  addSelectedNodes([node])
  const width = node.dimensions?.width || node.data?.width || 320
  const height = node.dimensions?.height || node.data?.height || 200
  setCenter(node.position.x + width / 2, node.position.y + height / 2, {
    zoom: Math.max(viewport.value.zoom, 0.75),
    duration: 300
  })
  close()
}

function goToSelected() {
  const node = results.value[selectedIndex.value]
  if (node) goTo(node)
}

function close() {
  query.value = ''
  selectedIndex.value = 0
  closeSearch()
}

watch(isSearchOpen, (open) => {
  if (open) nextTick(() => searchInput.value?.focus())
})

// ESC fecha mesmo com foco em qualquer campo do modal — capture pra não
// depender de bubbling através do input
function onKeydown(event) {
  if (event.key === 'Escape' && isSearchOpen.value) {
    event.preventDefault()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, { capture: true }))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, { capture: true }))
</script>

<style scoped>
.search-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  background: rgba(0, 0, 0, 0.35);
  z-index: 40;
}

.search-modal {
  width: 480px;
  max-width: calc(100vw - 48px);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  box-shadow: 0 24px 64px var(--color-shadow);
  overflow: hidden;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
}

.search-icon {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 14px;
}

.search-input:focus {
  outline: none;
}

.esc-hint {
  flex-shrink: 0;
  padding: 2px 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: var(--color-bg-surface);
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-family: inherit;
}

.search-list {
  overflow-y: auto;
  padding: 6px;
}

.search-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
}

.search-item.active {
  background: var(--color-hover);
}

.search-item-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
}

.search-item-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.search-item-label {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-item-type {
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.search-empty {
  padding: 24px 10px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  text-align: center;
}
</style>
