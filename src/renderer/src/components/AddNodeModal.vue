<template>
  <div v-if="isAddNodeModalOpen" class="modal-backdrop" @mousedown.self="close">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Adicionar node</span>
        <button class="close-btn" title="Fechar" @click="close">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <template v-if="!selectedType">
        <div class="modal-search">
          <svg class="search-icon" viewBox="0 0 16 16" width="13" height="13">
            <circle cx="6.8" cy="6.8" r="4.3" stroke="currentColor" stroke-width="1.4" fill="none" />
            <path d="M13 13l-3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
          <input
            ref="searchInput"
            v-model="query"
            class="search-input"
            type="text"
            placeholder="Buscar tipo de node..."
          />
        </div>

        <div class="modal-list">
          <button
            v-for="[type, entry] in filteredEntries"
            :key="type"
            class="modal-item"
            @click="handleSelect(type, entry)"
          >
            <span class="modal-item-icon-wrap">
              <svg class="modal-item-icon" viewBox="0 0 20 20" width="16" height="16" v-html="entry.icon" />
            </span>
            <span class="modal-item-text">
              <span class="modal-item-label">{{ entry.label }}</span>
              <span class="modal-item-desc">{{ entry.description }}</span>
            </span>
          </button>

          <div v-if="filteredEntries.length === 0" class="modal-empty">Nenhum tipo de node encontrado.</div>
        </div>
      </template>

      <component
        :is="nodeTypeRegistry[selectedType].createForm"
        v-else
        @submit="handleFormSubmit"
        @cancel="selectedType = null"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { addNode, closeAddNodeModal, isAddNodeModalOpen, openAddNodeModal } from '../store/flowStore'
import { nodeTypeRegistry } from '../nodeTypes/registry'

const query = ref('')
const searchInput = ref(null)
const selectedType = ref(null)

const filteredEntries = computed(() => {
  const q = query.value.trim().toLowerCase()
  return Object.entries(nodeTypeRegistry).filter(
    ([, entry]) =>
      !entry.hideFromModal &&
      (!q || entry.label.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q))
  )
})

watch(isAddNodeModalOpen, (open) => {
  if (open) nextTick(() => searchInput.value?.focus())
})

// captura antes do xterm.js pra abrir mesmo com o terminal focado
function onKeydown(event) {
  if (event.ctrlKey && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    event.stopPropagation()
    openAddNodeModal()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, { capture: true }))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, { capture: true }))

function close() {
  query.value = ''
  selectedType.value = null
  closeAddNodeModal()
}

function handleSelect(type, entry) {
  if (entry.createForm) {
    selectedType.value = type
  } else {
    addNode(type, entry.createData(), undefined, entry.defaultZIndex ?? 0)
    close()
  }
}

function handleFormSubmit(data) {
  const entry = nodeTypeRegistry[selectedType.value]
  addNode(selectedType.value, data, undefined, entry?.defaultZIndex ?? 0)
  close()
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 10;
}

.modal {
  width: 320px;
  max-height: 70%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  box-shadow: 0 16px 48px var(--color-shadow);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.modal-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.close-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.modal-search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 10px 10px 4px;
  padding: 0 9px;
  height: 30px;
  flex-shrink: 0;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
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
  font-size: 12px;
}

.search-input:focus {
  outline: none;
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.modal-list {
  overflow-y: auto;
  padding: 6px;
}

.modal-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.modal-item:hover {
  background: var(--color-hover);
}

.modal-item-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.modal-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-top: 2px;
}

.modal-item-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-item-desc {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.modal-empty {
  padding: 16px 10px;
  text-align: center;
  font-size: 11.5px;
  color: var(--color-text-tertiary);
}
</style>
