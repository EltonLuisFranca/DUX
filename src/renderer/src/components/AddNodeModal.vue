<template>
  <div v-if="isAddNodeModalOpen" class="modal-backdrop" @mousedown.self="close">
    <div class="modal" :class="{ 'has-form': selectedType }">
      <template v-if="!selectedType">
        <!-- busca = cabeçalho (estilo command palette) -->
        <div class="palette-search">
          <svg class="search-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="6.8" cy="6.8" r="4.3" stroke="currentColor" stroke-width="1.5" fill="none" />
            <path d="M13 13l-3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <input
            ref="searchInput"
            v-model="query"
            class="search-input"
            type="text"
            placeholder="Buscar um node ou digitar um comando…"
            @keydown="onSearchKeydown"
          />
          <kbd class="kbd">Esc</kbd>
        </div>

        <div class="palette-subbar">
          <div v-if="!query.trim()" class="palette-tabs">
            <button
              v-for="cat in categories"
              :key="cat"
              class="palette-tab"
              :class="{ active: activeCategory === cat }"
              @click="activeCategory = cat"
            >
              {{ CATEGORY_LABELS[cat] }}
            </button>
          </div>
          <span v-else class="palette-count">{{ filteredEntries.length }} resultado{{ filteredEntries.length === 1 ? '' : 's' }}</span>
          <span class="palette-hint">↑↓ navegar · ⏎ adicionar</span>
        </div>

        <div ref="listEl" class="palette-list">
          <button
            v-for="([type, entry], i) in filteredEntries"
            :key="type"
            class="palette-item"
            :class="{ active: i === activeIndex }"
            @click="handleSelect(type, entry)"
            @mousemove="activeIndex = i"
          >
            <span class="item-icon" :style="{ '--cat': categoryAccent(entry.category) }">
              <svg class="item-icon-svg" viewBox="0 0 20 20" width="19" height="19" v-html="entry.icon" />
            </span>
            <span class="item-body">
              <span class="item-label">{{ entry.label }}</span>
              <span class="item-desc">{{ entry.description }}</span>
            </span>
            <span class="item-enter" aria-hidden="true">⏎ Adicionar</span>
            <span class="item-cat" aria-hidden="true">{{ CATEGORY_LABELS[entry.category] }}</span>
          </button>

          <div v-if="filteredEntries.length === 0" class="palette-empty">Nenhum tipo de node encontrado.</div>
        </div>

        <div class="palette-footer">
          <span class="foot-item"><kbd class="kbd">Tab</kbd> trocar categoria</span>
          <span class="foot-item"><kbd class="kbd">⏎</kbd> adicionar no centro</span>
          <span class="foot-spacer" />
          <span class="foot-count">{{ visibleEntries.length }} tipos disponíveis</span>
        </div>
      </template>

      <template v-else>
        <div class="form-head">
          <button class="back-btn" title="Voltar" @click="selectedType = null">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <span class="form-title">{{ nodeTypeRegistry[selectedType].label }}</span>
          <button class="close-btn" title="Fechar" @click="close">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <component
          :is="nodeTypeRegistry[selectedType].createForm"
          v-bind="nodeTypeRegistry[selectedType].createFormProps"
          @submit="handleFormSubmit"
          @cancel="selectedType = null"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { addNode, closeAddNodeModal, isAddNodeModalOpen, openAddNodeModal } from '../store/flowStore'
import { nodeTypeRegistry, CATEGORY_LABELS } from '../nodeTypes/registry'
import { terminalAvailability } from '../store/terminalAvailabilityStore'
import { platform } from '../lib/platform'

const query = ref('')
const searchInput = ref(null)
const listEl = ref(null)
const selectedType = ref(null)
const activeCategory = ref(Object.keys(CATEGORY_LABELS)[0])
const activeIndex = ref(0)

// cor do badge do ícone por categoria — dá leitura imediata de "que tipo de
// coisa é isto" na lista (agentes no acento, ferramentas azul, etc.)
const CATEGORY_ACCENTS = {
  agents: 'var(--color-accent)',
  tools: '#5ab8ff',
  media: '#c9a8ff',
  utility: '#7fd9d0'
}
function categoryAccent(cat) {
  return CATEGORY_ACCENTS[cat] || 'var(--color-text-secondary)'
}

const visibleEntries = computed(() =>
  Object.entries(nodeTypeRegistry).filter(([, entry]) => {
    if (entry.hideFromModal) return false
    if (entry.requiresPlatformFeature && !platform.features[entry.requiresPlatformFeature]) return false
    if (entry.requiresAvailability && !terminalAvailability.value[entry.requiresAvailability]) return false
    return true
  })
)

// abas com pelo menos um item visível na plataforma atual, na ordem
// declarada em CATEGORY_LABELS
const categories = computed(() => {
  const present = new Set(visibleEntries.value.map(([, entry]) => entry.category))
  return Object.keys(CATEGORY_LABELS).filter((cat) => present.has(cat))
})

// digitando algo na busca, ignora a aba ativa e procura em tudo — só volta a
// filtrar por categoria quando o campo de busca está vazio
const filteredEntries = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (q) {
    return visibleEntries.value.filter(
      ([, entry]) => entry.label.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q)
    )
  }
  return visibleEntries.value.filter(([, entry]) => entry.category === activeCategory.value)
})

// mudou a lista (busca/aba) → volta a seleção pro topo
watch(filteredEntries, () => {
  activeIndex.value = 0
})

watch(isAddNodeModalOpen, (open) => {
  if (open) {
    activeIndex.value = 0
    nextTick(() => searchInput.value?.focus())
  }
})

function scrollActiveIntoView() {
  nextTick(() => {
    listEl.value?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' })
  })
}

function move(delta) {
  const n = filteredEntries.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  scrollActiveIntoView()
}

function cycleCategory(delta) {
  const cats = categories.value
  if (cats.length < 2) return
  const idx = cats.indexOf(activeCategory.value)
  activeCategory.value = cats[(idx + delta + cats.length) % cats.length]
}

function onSearchKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const pick = filteredEntries.value[activeIndex.value]
    if (pick) handleSelect(pick[0], pick[1])
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'Tab' && !query.value.trim()) {
    event.preventDefault()
    cycleCategory(event.shiftKey ? -1 : 1)
  }
}

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
  align-items: flex-start;
  justify-content: center;
  padding-top: 11vh;
  background: rgba(6, 6, 9, 0.55);
  backdrop-filter: blur(3px);
  z-index: 10;
}

.modal {
  width: 680px;
  max-width: 92vw;
  max-height: 74vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 16px;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.modal.has-form {
  width: 560px;
}

/* ——— busca ——— */
.palette-search {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  flex-shrink: 0;
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
  font-size: 15.5px;
  font-family: inherit;
}

.search-input:focus {
  outline: none;
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.kbd {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-bg-surface-raised);
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  padding: 1px 6px;
}

/* ——— sub-barra: abas + dica ——— */
.palette-subbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 2px;
  flex-shrink: 0;
}

.palette-tabs {
  display: flex;
  gap: 6px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.palette-tab {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 15px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
}

.palette-tab:hover {
  color: var(--color-text-primary);
  background: var(--color-hover);
}

.palette-tab.active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: color-mix(in srgb, var(--color-accent) 70%, var(--color-text-primary));
  font-weight: 600;
}

.palette-count {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.palette-hint {
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--color-text-tertiary);
}

/* ——— lista ——— */
.palette-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px transparent;
}

.palette-item.active {
  background: linear-gradient(90deg, var(--color-accent-soft), transparent 70%);
  box-shadow: inset 0 0 0 1px var(--color-accent-border);
}

.item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 10px;
  color: var(--cat);
  background: color-mix(in srgb, var(--cat) 15%, var(--color-bg-surface));
  border: 1px solid color-mix(in srgb, var(--cat) 30%, transparent);
}

.item-icon-svg :deep(svg),
.item-icon-svg {
  width: 19px;
  height: 19px;
}

.item-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.item-label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-cat {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: var(--color-bg-surface-raised);
  border-radius: 6px;
  padding: 2px 8px;
}

.item-enter {
  display: none;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.25);
  color: color-mix(in srgb, var(--color-accent) 70%, var(--color-text-primary));
  font-size: 11px;
  font-weight: 600;
}

.palette-item.active .item-enter {
  display: inline-flex;
}

.palette-item.active .item-cat {
  display: none;
}

.palette-empty {
  padding: 28px 10px;
  text-align: center;
  font-size: 12.5px;
  color: var(--color-text-tertiary);
}

/* ——— rodapé ——— */
.palette-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 11px 18px;
  flex-shrink: 0;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  font-size: 11.5px;
  color: var(--color-text-tertiary);
}

.foot-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.foot-item .kbd {
  font-size: 10px;
  padding: 1px 5px;
}

.foot-spacer {
  flex: 1;
}

/* ——— cabeçalho do formulário de criação ——— */
.form-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.form-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.back-btn,
.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.back-btn:hover,
.close-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}
</style>
