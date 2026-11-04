<template>
  <aside
    ref="rootRef"
    class="settings-sidebar"
    :class="{ open: settingsSidebarOpen, resizing, compact: isCompact }"
    :style="{ width: settingsSidebarOpen ? `${width}px` : '0' }"
    aria-label="Configurações"
  >
    <div v-if="settingsSidebarOpen" class="sidebar-content" :style="{ width: `${width}px` }">
      <header class="sidebar-header">
        <div class="header-top">
          <span class="sidebar-title">Configurações</span>
          <button class="close-btn" title="Fechar (Ctrl+,)" @click="closeSettings">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <label class="search">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input
            ref="searchInput"
            v-model="query"
            class="search-input"
            type="text"
            placeholder="Buscar configurações"
            spellcheck="false"
            @keydown.enter="selectFirstMatch"
            @keydown.down.prevent="focusNav"
          />
          <button v-if="query" class="search-clear" title="Limpar busca" @click="clearSearch">
            <svg viewBox="0 0 16 16" width="10" height="10">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </label>
      </header>

      <div class="sidebar-main">
        <nav ref="navRef" class="category-nav" aria-label="Categorias">
          <template v-for="section in visibleSections" :key="section.label">
            <span class="nav-section">{{ section.label }}</span>
            <button
              v-for="cat in section.items"
              :key="cat.id"
              class="nav-item"
              :class="{ active: activeId === cat.id }"
              :title="isCompact ? cat.label : undefined"
              :aria-current="activeId === cat.id ? 'page' : undefined"
              @click="selectCategory(cat.id)"
            >
              <component :is="cat.icon" class="nav-icon" />
              <span class="nav-label">{{ cat.label }}</span>
              <span v-if="cat.alert?.value" class="nav-alert" :title="cat.alert.value" />
            </button>
          </template>
          <p v-if="!visibleSections.length" class="nav-empty">Nada encontrado pra "{{ query }}".</p>

          <span class="sidebar-version">DUX v{{ version }}</span>
        </nav>

        <main ref="panelRef" class="category-panel">
          <template v-if="activeCategory">
            <div class="panel-heading">
              <h2 class="panel-title">{{ activeCategory.label }}</h2>
              <p class="panel-description">{{ activeCategory.description }}</p>
            </div>
            <div class="panel-body">
              <component :is="activeCategory.component" />
            </div>
          </template>
        </main>
      </div>
    </div>

    <div
      v-if="settingsSidebarOpen"
      class="resize-handle"
      @mousedown="startResize"
      @mouseenter="handleTipEnter"
      @mouseleave="handleTipLeave"
    >
      <span class="resize-grip" />
      <Transition name="tip-fade">
        <div v-if="showTip" class="resize-tooltip">
          <div class="tooltip-row"><kbd>Ctrl</kbd> + <kbd>,</kbd> abre/fecha o painel</div>
          <div class="tooltip-sub">Arraste pra redimensionar</div>
        </div>
      </Transition>
    </div>
  </aside>
</template>

<script setup>
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { settingsSidebarOpen, settingsActiveCategory, closeSettings, toggleSettings } from '../store/themeStore'
import { claudeProfiles, usageByProfile } from '../store/claudeProfilesStore'
import { useSidebarResize } from '../lib/useSidebarResize'
import AccountSettings from './settings/AccountSettings.vue'
import AppearanceSettings from './settings/AppearanceSettings.vue'
import ClaudeAccountsSettings from './settings/ClaudeAccountsSettings.vue'
import DuxiSettings from './settings/DuxiSettings.vue'
import VoiceSettings from './settings/VoiceSettings.vue'

// Ícones inline como render functions simples — evita mais um arquivo .vue
// por ícone.
function icon(children) {
  return () =>
    h(
      'svg',
      {
        viewBox: '0 0 16 16',
        width: 15,
        height: 15,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.4,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      },
      children
    )
}

// Aviso na navegação quando alguma conta Claude precisa de atenção (login
// vencido/revogado) — dá pra ver sem abrir a aba.
const claudeAlert = computed(() => {
  const broken = claudeProfiles.value.filter((p) => {
    const err = usageByProfile.value[p.id]?.error
    return p.loggedIn && (err === 'expired' || err === 'unauthorized')
  })
  if (!broken.length) return null
  return broken.length === 1 ? `"${broken[0].name}" precisa de atenção` : `${broken.length} contas precisam de atenção`
})

// Seções e categorias da navegação. Categoria nova = um componente em
// settings/ + uma entrada aqui; `keywords` alimentam a busca (coloque os
// nomes das opções que moram dentro dela).
const SECTIONS = [
  {
    label: 'Geral',
    items: [
      {
        id: 'account',
        label: 'Conta DUX',
        description: 'Login e sincronização de workspaces entre máquinas.',
        component: AccountSettings,
        keywords: ['google', 'login', 'entrar', 'sair', 'sincronizar', 'sync', 'workspace', 'usuário'],
        // Silhueta de usuário: cabeça (círculo) + ombros (arco aberto por baixo).
        icon: icon([h('circle', { cx: 8, cy: 5.3, r: 2.6 }), h('path', { d: 'M2.5 14c.5-3.3 2.8-5.1 5.5-5.1s5 1.8 5.5 5.1' })])
      },
      {
        id: 'appearance',
        label: 'Aparência',
        description: 'Tema e visual dos nodes, do canvas e das conexões.',
        component: AppearanceSettings,
        keywords: [
          'tema', 'escuro', 'claro', 'dark', 'light', 'sombra', 'fundo', 'canvas', 'padrão', 'grade', 'pontos',
          'linhas', 'cruzes', 'xadrez', 'cor', 'espaçamento', 'encaixe', 'magnético', 'snap', 'conexões', 'edges',
          'estilo', 'compacto', 'estruturado'
        ],
        // Sol: núcleo + raios — ícone universal de tema/aparência.
        icon: icon([
          h('circle', { cx: 8, cy: 8, r: 2.6 }),
          h('path', {
            d: 'M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6'
          })
        ])
      }
    ]
  },
  {
    label: 'Agentes',
    items: [
      {
        id: 'claude',
        label: 'Contas Claude',
        description: 'Várias contas do Claude Code conectadas ao mesmo tempo, com o uso e os limites de cada uma.',
        component: ClaudeAccountsSettings,
        keywords: [
          'claude', 'code', 'conta', 'contas', 'perfil', 'perfis', 'login', 'uso', 'limite', 'plano', 'sessão',
          'semana', 'pro', 'max', 'créditos', 'capacidade', 'trocar', 'alternar'
        ],
        alert: claudeAlert,
        // Duas pessoas: conta principal à frente, outra atrás.
        icon: icon([
          h('circle', { cx: 6, cy: 5.6, r: 2.3 }),
          h('path', { d: 'M1.8 13.5c.4-2.8 2.1-4.3 4.2-4.3s3.8 1.5 4.2 4.3' }),
          h('path', { d: 'M10.4 3.6a2.3 2.3 0 0 1 0 4.2M11.6 9.4c1.4.4 2.3 1.8 2.6 4.1' })
        ])
      },
      {
        id: 'duxi',
        label: 'Duxi',
        description: 'Assistente de voz do DUX: modelo, voz e comportamento.',
        component: DuxiSettings,
        keywords: ['ollama', 'modelo', 'token', 'voz', 'falar', 'música', 'prompt', 'sistema', 'boca', 'ativar', 'conversa'],
        // Rostinho do robô: painel arredondado com dois olhos.
        icon: icon([h('rect', { x: 2, y: 4, width: 12, height: 8.5, rx: 2.4 }), h('path', { d: 'M6.2 7.4v1.6M9.8 7.4v1.6' })])
      }
    ]
  },
  {
    label: 'Sistema',
    items: [
      {
        id: 'voice',
        label: 'Voz e sons',
        description: 'Microfone, leitura em voz das respostas e notificações sonoras.',
        component: VoiceSettings,
        keywords: ['microfone', 'mic', 'tts', 'piper', 'voz', 'som', 'sons', 'notificação', 'ler', 'leitura', 'áudio'],
        // Alto-falante com ondas sonoras.
        icon: icon([
          h('path', { d: 'M2.5 6.2h2.3L8.3 3v10L4.8 9.8H2.5z', 'stroke-linejoin': 'round' }),
          h('path', { d: 'M11 5.6a3.4 3.4 0 0 1 0 4.8M13 3.6a6.3 6.3 0 0 1 0 8.8' })
        ])
      }
    ]
  }
]

const ALL_CATEGORIES = SECTIONS.flatMap((s) => s.items)

// --- busca
const query = ref('')
const searchInput = ref(null)
const navRef = ref(null)
const panelRef = ref(null)

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function matches(cat, terms) {
  const haystack = normalize([cat.label, cat.description, ...cat.keywords].join(' '))
  return terms.every((t) => haystack.includes(t))
}

const visibleSections = computed(() => {
  const terms = normalize(query.value).split(/\s+/).filter(Boolean)
  if (!terms.length) return SECTIONS
  return SECTIONS.map((s) => ({ ...s, items: s.items.filter((c) => matches(c, terms)) })).filter((s) => s.items.length)
})

const visibleCategories = computed(() => visibleSections.value.flatMap((s) => s.items))

// a categoria ativa some do filtro → pula pra primeira que bate
watch(visibleCategories, (list) => {
  if (list.length && !list.some((c) => c.id === settingsActiveCategory.value)) {
    settingsActiveCategory.value = list[0].id
  }
})

function selectFirstMatch() {
  if (visibleCategories.value.length) selectCategory(visibleCategories.value[0].id)
}

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

function focusNav() {
  navRef.value?.querySelector('.nav-item.active, .nav-item')?.focus()
}

// --- categoria ativa (mora no themeStore, dá pra abrir direto numa aba de fora)
const activeId = computed(() =>
  ALL_CATEGORIES.some((c) => c.id === settingsActiveCategory.value) ? settingsActiveCategory.value : ALL_CATEGORIES[0].id
)
const activeCategory = computed(() => ALL_CATEGORIES.find((c) => c.id === activeId.value))

function selectCategory(id) {
  settingsActiveCategory.value = id
}

watch(activeId, () => {
  if (panelRef.value) panelRef.value.scrollTop = 0
})

// --- largura (abre pela esquerda; handle na borda direita)
const { width, resizing, showTip, startResize, handleTipEnter, handleTipLeave } = useSidebarResize({
  defaultWidth: 560,
  minWidth: 380,
  maxWidth: 900,
  storageKey: 'dux-settings-sidebar-width'
})

// estreito demais pra navegação com rótulos: vira trilho só de ícones
const isCompact = computed(() => width.value < 500)

const version = window.appInfo?.version ?? '0.0.0'

// --- teclado
const rootRef = ref(null)

function onKeydown(event) {
  if (event.ctrlKey && event.key === ',') {
    event.preventDefault()
    event.stopPropagation()
    const opening = !settingsSidebarOpen.value
    toggleSettings()
    if (opening) nextTick(() => searchInput.value?.focus())
    return
  }

  if (event.key !== 'Escape' || !settingsSidebarOpen.value) return
  const target = event.target
  const insideSidebar = rootRef.value?.contains(target)
  // Esc num terminal (o Claude Code usa pra interromper) ou em qualquer coisa
  // fora do painel não é pra fechar as configurações
  if (!insideSidebar && target !== document.body) return

  if (target === searchInput.value && query.value) {
    query.value = ''
    return
  }
  // outro campo do painel: o próprio campo trata o Esc (cancelar renomear etc.)
  if (insideSidebar && target !== searchInput.value && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
  closeSettings()
}

onMounted(() => window.addEventListener('keydown', onKeydown, { capture: true }))

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, { capture: true })
})
</script>

<style scoped>
.settings-sidebar {
  position: relative;
  flex-shrink: 0;
  overflow: visible;
  background: var(--color-bg-surface-alt);
  border-right: 1px solid var(--color-border);
  transition: width 0.18s ease;
}

.settings-sidebar:not(.open) {
  border-right: none;
}

.settings-sidebar.resizing {
  transition: none;
}

.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ---- header */
.sidebar-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
  padding: 12px 12px 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 650;
  color: var(--color-text-primary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.close-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  margin-right: 4px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface);
  color: var(--color-text-tertiary);
  cursor: text;
}

.search:focus-within {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent);
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 12.5px;
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  cursor: pointer;
}

/* ---- corpo: navegação + painel */
.sidebar-main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.category-nav {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 1px;
  width: 184px;
  padding: 10px 8px;
  border-right: 1px solid var(--color-border);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}

.category-nav::-webkit-scrollbar {
  display: none;
}

.nav-section {
  padding: 12px 10px 5px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
}

.nav-section:first-child {
  padding-top: 4px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 32px;
  flex-shrink: 0;
  padding: 0 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.nav-item:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.nav-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-accent) 50%, transparent);
  outline-offset: -2px;
}

.nav-item.active {
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  color: var(--color-text-primary);
  font-weight: 600;
}

.nav-item.active .nav-icon {
  color: var(--color-accent);
}

.nav-icon {
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-alert {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #d97706;
}

.nav-empty {
  margin: 8px 10px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--color-text-tertiary);
}

.sidebar-version {
  margin-top: auto;
  padding: 12px 10px 2px;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

/* trilho só de ícones quando o painel está estreito */
.compact .category-nav {
  width: 52px;
  align-items: center;
}

.compact .nav-section {
  width: 24px;
  height: 1px;
  margin: 8px 0;
  padding: 0;
  overflow: hidden;
  background: var(--color-border-strong);
  color: transparent;
}

.compact .nav-section:first-child {
  display: none;
}

.compact .nav-item {
  justify-content: center;
  width: 36px;
  padding: 0;
}

.compact .nav-label,
.compact .nav-empty,
.compact .sidebar-version {
  display: none;
}

.compact .nav-alert {
  position: absolute;
  top: 6px;
  right: 6px;
}

.category-panel {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 20px 28px;
}

.panel-heading {
  margin-bottom: 20px;
}

.panel-title {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  color: var(--color-text-primary);
}

.panel-description {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-tertiary);
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* ---- resize (borda direita) */
.resize-handle {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  z-index: 2;
}

.resize-grip {
  position: relative;
  right: 3px;
  width: 3px;
  height: 35px;
  border-radius: 4px;
  background: transparent;
}

.resize-handle:hover .resize-grip,
.settings-sidebar.resizing .resize-grip {
  background: rgba(255, 255, 255, 0.35);
}

.tip-fade-enter-active,
.tip-fade-leave-active {
  transition: opacity 0.15s ease;
}

.tip-fade-enter-from,
.tip-fade-leave-to {
  opacity: 0;
}

.resize-tooltip {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 9px;
  white-space: nowrap;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  box-shadow: 0 4px 16px var(--color-shadow);
  font-size: 11px;
  pointer-events: none;
}

.tooltip-row {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-quaternary);
}

.tooltip-sub {
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.resize-tooltip kbd {
  padding: 1px 5px;
  background: var(--color-bg-surface-raised);
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  font-family: inherit;
  font-size: 10.5px;
  color: var(--color-text-primary);
}
</style>

<!-- Controles de formulário compartilhados por todos os painéis em
components/settings/ — sem scoped de propósito (escopados pelo
.settings-sidebar), pra cada painel novo não ter que redefinir input/botão. -->
<style>
.settings-sidebar .st-input,
.settings-sidebar .st-select {
  width: 100%;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 12px;
  font-family: inherit;
}

.settings-sidebar .st-select {
  width: auto;
  min-width: 140px;
  max-width: 220px;
  cursor: pointer;
}

.settings-sidebar .st-input:focus,
.settings-sidebar .st-select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent);
}

.settings-sidebar .st-select:disabled,
.settings-sidebar .st-input:disabled {
  opacity: 0.5;
  cursor: default;
}

.settings-sidebar .st-textarea {
  height: auto;
  padding: 8px 9px;
  line-height: 1.5;
  resize: vertical;
}

.settings-sidebar .st-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.settings-sidebar .st-btn:hover:not(:disabled) {
  background: var(--color-hover);
}

.settings-sidebar .st-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.settings-sidebar .st-btn--primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

.settings-sidebar .st-btn--primary:hover:not(:disabled) {
  background: #2f6fdb;
}

.settings-sidebar .st-btn--danger {
  background: #ef4444;
  border-color: #ef4444;
  color: #fff;
}

.settings-sidebar .st-btn--danger:hover:not(:disabled) {
  background: #dc2626;
}

.settings-sidebar .st-btn--ghost {
  border-color: transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.settings-sidebar .st-btn--small {
  height: 26px;
  padding: 0 10px;
  font-size: 11.5px;
}

.settings-sidebar .st-btn--icon {
  width: 30px;
  padding: 0;
}

.settings-sidebar .st-range {
  width: 100%;
  accent-color: var(--color-accent);
}

.settings-sidebar .st-hint {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--color-text-tertiary);
}

.settings-sidebar .st-note {
  margin: 0;
  padding: 10px 14px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--color-text-tertiary);
}

.settings-sidebar .st-note--error,
.settings-sidebar .st-error-text {
  color: #ef4444;
}

.settings-sidebar .st-error-text {
  margin: 0;
  font-size: 11.5px;
}
</style>
