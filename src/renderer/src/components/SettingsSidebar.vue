<template>
  <div
    class="sidebar"
    :class="{ open: settingsSidebarOpen, resizing }"
    :style="{ width: settingsSidebarOpen ? `${width}px` : '0' }"
  >
    <div v-if="settingsSidebarOpen" class="sidebar-content" :style="{ width: `${width}px` }">
      <div class="sidebar-header">
        <span class="sidebar-title">Configurações</span>
        <button class="close-btn" title="Fechar (Ctrl+,)" @click="closeSettings">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <div class="sidebar-main">
        <div class="category-panel">
          <section v-if="activeCategory === 'account'" class="settings-section">
            <div v-if="isAuthenticated" class="account-profile">
              <img v-if="user?.avatar" class="account-avatar" :src="user.avatar" alt="" />
              <div v-else class="account-avatar account-avatar-fallback">
                {{ (user?.firstname || '?').charAt(0).toUpperCase() }}
              </div>
              <div class="account-info">
                <span class="account-name">{{ [user?.firstname, user?.lastname].filter(Boolean).join(' ') || 'Conectado' }}</span>
                <span class="account-email">{{ user?.email }}</span>
              </div>
            </div>
            <button v-if="isAuthenticated" class="action-btn" @click="logout">Sair</button>
            <template v-else>
              <p class="setting-hint">Conecte sua conta Google pra sincronizar workspaces entre máquinas.</p>
              <button class="action-btn primary" @click="login">Entrar com Google</button>
            </template>
          </section>

          <section v-else-if="activeCategory === 'appearance'" class="settings-section">
            <div class="setting-row">
              <span class="setting-label">Tema</span>
              <div class="segmented">
                <button class="segmented-btn" :class="{ active: theme === 'dark' }" @click="setTheme('dark')">
                  Escuro
                </button>
                <button class="segmented-btn" :class="{ active: theme === 'light' }" @click="setTheme('light')">
                  Claro
                </button>
              </div>
            </div>

            <div class="setting-row">
              <span class="setting-label">Fundo do canvas</span>
              <div class="segmented">
                <button
                  class="segmented-btn"
                  :class="{ active: canvasVariant === 'dots' }"
                  @click="setCanvasVariant('dots')"
                >
                  Pontos
                </button>
                <button
                  class="segmented-btn"
                  :class="{ active: canvasVariant === 'lines' }"
                  @click="setCanvasVariant('lines')"
                >
                  Linhas
                </button>
              </div>
            </div>

            <div class="setting-row">
              <span class="setting-label">Encaixe magnético</span>
              <div class="segmented">
                <button class="segmented-btn" :class="{ active: snapEnabled }" @click="setSnapEnabled(true)">
                  Ativado
                </button>
                <button class="segmented-btn" :class="{ active: !snapEnabled }" @click="setSnapEnabled(false)">
                  Desativado
                </button>
              </div>
            </div>

            <div class="setting-divider" />

            <span class="subsection-title">Conexões entre nodes</span>

            <div class="edge-style-grid">
              <button
                v-for="style in EDGE_STYLES"
                :key="style.value"
                class="edge-style-btn"
                :class="{ active: edgeStyle === style.value }"
                @click="setEdgeStyle(style.value)"
              >
                <svg class="edge-style-preview" viewBox="0 0 64 32" width="64" height="32">
                  <path :d="EDGE_PREVIEW_PATHS[style.value]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <circle cx="6" cy="8" r="3" fill="currentColor" />
                  <circle cx="58" cy="24" r="3" fill="currentColor" />
                </svg>
                <span class="edge-style-label">{{ style.label }}</span>
              </button>
            </div>
          </section>

          <section v-else-if="activeCategory === 'voice'" class="settings-section">
            <span class="subsection-title">Leitura em voz</span>

            <div class="setting-row">
              <span class="setting-label">Ler respostas do agente</span>
              <div class="segmented">
                <button class="segmented-btn" :class="{ active: ttsEnabled }" @click="ttsEnabled = true">
                  Ativado
                </button>
                <button class="segmented-btn" :class="{ active: !ttsEnabled }" @click="ttsEnabled = false">
                  Desativado
                </button>
              </div>
            </div>

            <div class="setting-row">
              <span class="setting-label">Voz</span>
              <select
                class="select-input"
                :value="selectedVoiceId"
                :disabled="!ttsEnabled"
                @change="selectedVoiceId = $event.target.value"
              >
                <option v-for="voice in AVAILABLE_VOICES" :key="voice.id" :value="voice.id">{{ voice.label }}</option>
              </select>
            </div>

            <button class="action-btn" :disabled="testDisabled" @click="testVoice">{{ testStatusLabel }}</button>

            <p v-if="lastError" class="setting-hint setting-error">Erro: {{ lastError }}</p>

            <p class="setting-hint">
              Só existem vozes masculinas em português no momento — o catálogo do Piper TTS não
              inclui nenhuma voz feminina para pt-BR.
            </p>

            <div class="setting-divider" />

            <span class="subsection-title">Notificação sonora</span>

            <div class="setting-row">
              <span class="setting-label">Som ao terminar resposta</span>
              <div class="segmented">
                <button
                  class="segmented-btn"
                  :class="{ active: notificationSoundEnabled }"
                  @click="notificationSoundEnabled = true"
                >
                  Ativado
                </button>
                <button
                  class="segmented-btn"
                  :class="{ active: !notificationSoundEnabled }"
                  @click="notificationSoundEnabled = false"
                >
                  Desativado
                </button>
              </div>
            </div>

            <div class="setting-row">
              <span class="setting-label">Som</span>
              <select
                class="select-input"
                :value="selectedSoundId"
                :disabled="!notificationSoundEnabled"
                @change="selectedSoundId = $event.target.value"
              >
                <option v-for="sound in AVAILABLE_SOUNDS" :key="sound.id" :value="sound.id">{{ sound.label }}</option>
              </select>
            </div>

            <button class="action-btn" @click="testNotificationSound">Testar som selecionado</button>

            <p class="setting-hint">
              Toca quando o agente termina de responder num terminal — só funciona com a leitura
              em voz (acima) desativada.
            </p>
          </section>
        </div>

        <nav class="category-nav">
          <button
            v-for="cat in CATEGORIES"
            :key="cat.id"
            class="category-btn"
            :class="{ active: activeCategory === cat.id }"
            :title="cat.label"
            @click="activeCategory = cat.id"
          >
            <component :is="cat.icon" class="category-icon" />
          </button>
        </nav>
      </div>

      <div class="sidebar-footer">
        <span class="sidebar-version">DUX v{{ version }}</span>
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
          <div class="tooltip-row"><kbd>Ctrl</kbd> + <kbd>,</kbd> fecha o painel</div>
          <div class="tooltip-sub">Drag to resize</div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  theme,
  setTheme,
  canvasVariant,
  setCanvasVariant,
  edgeStyle,
  setEdgeStyle,
  EDGE_STYLES,
  snapEnabled,
  setSnapEnabled,
  settingsSidebarOpen,
  closeSettings
} from '../store/themeStore'
import { isAuthenticated, user, login, logout } from '../store/authStore'
import { ttsEnabled, selectedVoiceId, AVAILABLE_VOICES, isSpeaking, isDownloadingVoice, lastError, speak } from '../store/ttsStore'
import {
  notificationSoundEnabled,
  selectedSoundId,
  AVAILABLE_SOUNDS,
  playNotificationSound
} from '../store/notificationSoundStore'

const MIN_WIDTH = 240
const MAX_WIDTH = 420

// Ícones inline como render functions simples — evita mais um arquivo .vue
// por ícone só pra 3 categorias.
function icon(children) {
  return () =>
    h(
      'svg',
      { viewBox: '0 0 16 16', width: 15, height: 15, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      children
    )
}

const CATEGORIES = [
  {
    id: 'account',
    label: 'Conta',
    // Silhueta de usuário: cabeça (círculo) + ombros (arco aberto por baixo).
    icon: icon([h('circle', { cx: 8, cy: 5.3, r: 2.6 }), h('path', { d: 'M2.5 14c.5-3.3 2.8-5.1 5.5-5.1s5 1.8 5.5 5.1' })])
  },
  {
    id: 'appearance',
    label: 'Aparência',
    // Sol: núcleo + raios — ícone universal de tema/aparência.
    icon: icon([
      h('circle', { cx: 8, cy: 8, r: 2.6 }),
      h('path', {
        d: 'M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6'
      })
    ])
  },
  {
    id: 'voice',
    label: 'Voz e sons',
    // Alto-falante com ondas sonoras.
    icon: icon([
      h('path', { d: 'M2.5 6.2h2.3L8.3 3v10L4.8 9.8H2.5z', 'stroke-linejoin': 'round' }),
      h('path', { d: 'M11 5.6a3.4 3.4 0 0 1 0 4.8M13 3.6a6.3 6.3 0 0 1 0 8.8' })
    ])
  }
]

const activeCategory = ref('account')
const version = window.appInfo?.version ?? '0.0.0'

const testStatusLabel = computed(() => {
  if (isDownloadingVoice.value) return 'Baixando voz (só na primeira vez)...'
  if (isSpeaking.value) return 'Falando...'
  return 'Testar voz selecionada'
})

const testDisabled = computed(() => isSpeaking.value || isDownloadingVoice.value)

function testVoice() {
  speak('Olá! Esta é a voz que vai ler as respostas do agente pra você.', { forceSpeak: true })
}

function testNotificationSound() {
  playNotificationSound({ force: true })
}

const EDGE_PREVIEW_PATHS = {
  default: 'M6 8 C 30 8, 34 24, 58 24',
  smoothstep: 'M6 8 H32 Q36 8 36 12 V20 Q36 24 40 24 H58',
  step: 'M6 8 H32 V24 H58',
  straight: 'M6 8 L58 24'
}

const width = ref(280)
const resizing = ref(false)
const showTip = ref(false)
let startX = 0
let startWidth = 0
let tipTimer = null

function handleTipEnter() {
  tipTimer = setTimeout(() => {
    showTip.value = true
  }, 250)
}

function handleTipLeave() {
  clearTimeout(tipTimer)
  showTip.value = false
}

function startResize(event) {
  clearTimeout(tipTimer)
  resizing.value = true
  showTip.value = false
  startX = event.clientX
  startWidth = width.value
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', stopResize)
  event.preventDefault()
}

function onResizeMove(event) {
  // Sidebar abre pela direita: arrastar pra esquerda (dx negativo) aumenta a largura.
  const dx = startX - event.clientX
  width.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + dx))
}

function stopResize() {
  resizing.value = false
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
}

function onKeydown(event) {
  if (event.ctrlKey && event.key === ',') {
    event.preventDefault()
    event.stopPropagation()
    closeSettings()
  } else if (event.key === 'Escape' && settingsSidebarOpen.value) {
    closeSettings()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, { capture: true }))

onBeforeUnmount(() => {
  clearTimeout(tipTimer)
  stopResize()
  window.removeEventListener('keydown', onKeydown, { capture: true })
})
</script>

<style scoped>
.sidebar {
  position: relative;
  flex-shrink: 0;
  overflow: visible;
  background: var(--color-bg-surface-alt);
  border-left: 1px solid var(--color-border);
  transition: width 0.16s ease;
}

.sidebar.resizing {
  transition: none;
}

.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 40px;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
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

.sidebar-footer {
  flex-shrink: 0;
  padding: 8px 14px;
  border-top: 1px solid var(--color-border);
  text-align: right;
}

.sidebar-version {
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.sidebar-main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.category-nav {
  flex-shrink: 0;
  width: 42px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border-left: 1px solid var(--color-border);
  overflow-y: auto;
}

.category-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.category-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.category-btn.active {
  background: rgb(59 130 246 / 0.14);
  color: #3b82f6;
}

.category-icon {
  flex-shrink: 0;
}

.category-panel {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 16px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--color-border);
}

.subsection-title {
  margin: 0 0 -4px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
}

.setting-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 7px;
}

.setting-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.select-input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
  cursor: pointer;
  box-sizing: border-box;
}

.select-input:disabled {
  opacity: 0.5;
  cursor: default;
}

.setting-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-text-tertiary);
}

.setting-error {
  color: #ef4444;
}

.segmented {
  display: flex;
  padding: 2px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
}

.segmented-btn {
  flex: 1;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11.5px;
  cursor: pointer;
}

.segmented-btn:hover {
  color: var(--color-text-primary);
}

.segmented-btn.active {
  background: #3b82f6;
  color: #fff;
}

.action-btn {
  width: 100%;
  height: 30px;
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.action-btn:hover:not(:disabled) {
  background: var(--color-hover);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.action-btn.primary {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.action-btn.primary:hover {
  background: #2f6fdb;
}

.account-profile {
  display: flex;
  align-items: center;
  gap: 10px;
}

.account-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.account-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3b82f6;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.account-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.account-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-email {
  font-size: 11px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edge-style-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.edge-style-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.edge-style-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-hover);
}

.edge-style-btn.active {
  border-color: #3b82f6;
  color: #3b82f6;
  background: rgb(59 130 246 / 0.08);
}

.edge-style-preview {
  color: inherit;
}

.edge-style-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.edge-style-btn.active .edge-style-label {
  color: #3b82f6;
}

.resize-handle {
  position: absolute;
  top: 0;
  left: -3px;
  width: 6px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  z-index: 1;
}

.resize-grip {
  position: relative;
  left: 3px;
  width: 3px;
  height: 35px;
  border-radius: 4px;
  background: transparent;
}

.resize-handle:hover .resize-grip,
.sidebar.resizing .resize-grip {
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
  right: 14px;
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
