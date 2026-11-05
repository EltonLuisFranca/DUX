<template>
  <div v-if="open" class="cmd-backdrop" @mousedown.self="close">
    <div class="cmd" role="dialog" aria-label="Paleta de comandos">
      <div class="cmd-search">
        <svg class="search-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="6.8" cy="6.8" r="4.3" stroke="currentColor" stroke-width="1.5" fill="none" />
          <path d="M13 13l-3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <input
          ref="searchInput"
          v-model="query"
          class="search-input"
          type="text"
          placeholder="Digite um comando ou busque…"
          @keydown="onKeydown"
        />
        <kbd class="kbd">Esc</kbd>
      </div>

      <div ref="listEl" class="cmd-list">
        <template v-for="section in grouped" :key="section.group">
          <div class="cmd-group">{{ section.group }}</div>
          <button
            v-for="row in section.items"
            :key="row.action.id"
            class="cmd-item"
            :class="{ active: row.index === activeIndex }"
            @click="run(row.action)"
            @mousemove="activeIndex = row.index"
          >
            <span class="cmd-icon" :style="{ '--c': row.action.color || 'var(--color-text-secondary)' }" v-html="row.action.icon" />
            <span class="cmd-label">{{ row.action.label }}</span>
            <span v-if="row.action.badge" class="cmd-badge" :style="{ background: row.action.badge }" />
            <span class="cmd-enter" aria-hidden="true">⏎</span>
          </button>
        </template>
        <div v-if="filtered.length === 0" class="cmd-empty">Nenhum comando encontrado.</div>
      </div>

      <div class="cmd-footer">
        <span class="foot-item"><kbd class="kbd">↑↓</kbd> navegar</span>
        <span class="foot-item"><kbd class="kbd">⏎</kbd> executar</span>
        <span class="foot-spacer" />
        <span class="foot-hint">Ctrl K</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  workspaces,
  activeWorkspaceId,
  switchWorkspace,
  createWorkspace,
  openAddNodeModal
} from '../store/flowStore'
import { theme, toggleTheme, openSettings, setAccentColor, ACCENT_PRESETS } from '../store/themeStore'
import { commandBarOpen, openCommandBar, closeCommandBar } from '../store/uiStore'

// estado global (pode ser aberto pela busca na barra de título)
const open = commandBarOpen
const query = ref('')
const activeIndex = ref(0)
const searchInput = ref(null)
const listEl = ref(null)

const ICONS = {
  node: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M8 5.5v5M5.5 8h5"/></svg>',
  workspace: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="8" height="8" rx="1.5"/><rect x="6" y="6" width="8" height="8" rx="1.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  theme: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3.2"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1"/></svg>',
  accent: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5s4 4.2 4 6.8a4 4 0 0 1-8 0C4 6.7 8 2.5 8 2.5z"/></svg>'
}

const actions = computed(() => {
  const list = []

  list.push({ id: 'add-node', group: 'Criar', label: 'Adicionar node…', icon: ICONS.node, run: () => openAddNodeModal() })
  list.push({ id: 'new-ws', group: 'Criar', label: 'Novo workspace', icon: ICONS.workspace, run: () => switchWorkspace(createWorkspace()) })

  for (const ws of workspaces.value) {
    if (ws.id === activeWorkspaceId.value) continue
    list.push({
      id: 'go-' + ws.id,
      group: 'Workspaces',
      label: `Ir para “${ws.name}”`,
      keywords: ws.name,
      icon: ICONS.workspace,
      run: () => switchWorkspace(ws.id)
    })
  }

  list.push({ id: 'set-appearance', group: 'Configurações', label: 'Abrir Aparência', icon: ICONS.gear, run: () => openSettings('appearance') })
  list.push({ id: 'set-claude', group: 'Configurações', label: 'Abrir Contas Claude', icon: ICONS.gear, run: () => openSettings('claude') })
  list.push({ id: 'set-account', group: 'Configurações', label: 'Abrir Conta DUX', icon: ICONS.gear, run: () => openSettings('account') })
  list.push({ id: 'set-duxi', group: 'Configurações', label: 'Abrir Duxi', icon: ICONS.gear, run: () => openSettings('duxi') })
  list.push({ id: 'set-voice', group: 'Configurações', label: 'Abrir Voz e sons', icon: ICONS.gear, run: () => openSettings('voice') })

  list.push({
    id: 'toggle-theme',
    group: 'Aparência',
    label: theme.value === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro',
    keywords: 'tema claro escuro dark light',
    icon: ICONS.theme,
    run: () => toggleTheme()
  })
  for (const preset of ACCENT_PRESETS) {
    list.push({
      id: 'accent-' + preset.value,
      group: 'Aparência',
      label: `Cor de destaque: ${preset.label}`,
      keywords: 'acento accent cor ' + preset.label,
      icon: ICONS.accent,
      color: preset.value,
      badge: preset.value,
      run: () => setAccentColor(preset.value)
    })
  }

  return list
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return actions.value
  return actions.value.filter((a) => (a.label + ' ' + (a.keywords || '') + ' ' + a.group).toLowerCase().includes(q))
})

// agrupa preservando a ordem; cada item carrega seu índice na lista plana
const grouped = computed(() => {
  const sections = []
  filtered.value.forEach((action, index) => {
    let section = sections.find((s) => s.group === action.group)
    if (!section) {
      section = { group: action.group, items: [] }
      sections.push(section)
    }
    section.items.push({ action, index })
  })
  return sections
})

watch(filtered, () => {
  activeIndex.value = 0
})

function scrollActive() {
  nextTick(() => listEl.value?.querySelector('.cmd-item.active')?.scrollIntoView({ block: 'nearest' }))
}

function move(delta) {
  const n = filtered.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  scrollActive()
}

function run(action) {
  action.run()
  close()
}

function onKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const pick = filtered.value[activeIndex.value]
    if (pick) run(pick)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

function close() {
  closeCommandBar()
}

// foca e reseta sempre que o command bar abre (seja por Ctrl+K ou pela busca
// na barra de título, que só seta commandBarOpen = true)
watch(open, (isOpen) => {
  if (isOpen) {
    query.value = ''
    activeIndex.value = 0
    nextTick(() => searchInput.value?.focus())
  }
})

// Ctrl+K (captura antes do xterm.js, como o Ctrl+N do AddNodeModal)
function onGlobalKeydown(event) {
  if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    event.stopPropagation()
    open.value ? closeCommandBar() : openCommandBar()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown, { capture: true }))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown, { capture: true }))
</script>

<style scoped>
.cmd-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 13vh;
  background: rgba(6, 6, 9, 0.55);
  backdrop-filter: blur(3px);
  z-index: 12;
}

.cmd {
  width: 620px;
  max-width: 92vw;
  max-height: 66vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 16px;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.cmd-search {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 18px;
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
  font-size: 15px;
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

.cmd-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.cmd-group {
  padding: 10px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}

.cmd-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.cmd-item.active {
  background: linear-gradient(90deg, var(--color-accent-soft), transparent 70%);
  box-shadow: inset 0 0 0 1px var(--color-accent-border);
}

.cmd-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 8px;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 14%, var(--color-bg-surface));
  border: 1px solid color-mix(in srgb, var(--c) 26%, transparent);
}

.cmd-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmd-badge {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.cmd-enter {
  display: none;
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.cmd-item.active .cmd-enter {
  display: inline;
}

.cmd-empty {
  padding: 26px 10px;
  text-align: center;
  font-size: 12.5px;
  color: var(--color-text-tertiary);
}

.cmd-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 18px;
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

.foot-hint {
  font-family: var(--font-mono);
}
</style>
