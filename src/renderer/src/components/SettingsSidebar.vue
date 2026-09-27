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
              <span class="setting-label">Estilo dos nodes</span>
              <div class="segmented">
                <button
                  class="segmented-btn"
                  :class="{ active: nodeStyleVariant === 'structured' }"
                  @click="setNodeStyleVariant('structured')"
                >
                  Estruturado
                </button>
                <button
                  class="segmented-btn"
                  :class="{ active: nodeStyleVariant === 'compact' }"
                  @click="setNodeStyleVariant('compact')"
                >
                  Compacto
                </button>
              </div>
            </div>

            <div class="setting-row">
              <span class="setting-label">
                Sombra dos nodes ({{ nodeShadowIntensity === 0 ? 'desligada' : `${nodeShadowIntensity}%` }})
              </span>
              <input
                type="range"
                class="range-input"
                min="0"
                max="100"
                step="5"
                :value="nodeShadowIntensity"
                @input="setNodeShadowIntensity(Number($event.target.value))"
              />
            </div>

            <div class="setting-row">
              <span class="setting-label">Fundo do canvas</span>
              <div class="bg-variant-grid">
                <button
                  v-for="v in CANVAS_VARIANTS"
                  :key="v.value"
                  class="bg-variant-btn"
                  :class="{ active: canvasVariant === v.value }"
                  @click="setCanvasVariant(v.value)"
                >
                  <svg class="bg-variant-preview" viewBox="0 0 48 48" width="44" height="44">
                    <rect x="0" y="0" width="48" height="48" rx="6" :fill="v.value === 'none' ? 'none' : 'currentColor'" fill-opacity="0.06" />
                    <template v-if="v.value === 'dots'">
                      <circle v-for="p in DOT_PREVIEW_POINTS" :key="p.join(',')" :cx="p[0]" :cy="p[1]" r="2" fill="currentColor" />
                    </template>
                    <path
                      v-else-if="v.value === 'lines'"
                      d="M12 0V48M36 0V48M0 12H48M0 36H48"
                      stroke="currentColor"
                      stroke-width="1.2"
                      fill="none"
                    />
                    <template v-else-if="v.value === 'cross'">
                      <path
                        v-for="p in DOT_PREVIEW_POINTS"
                        :key="p.join(',')"
                        :d="`M${p[0] - 3} ${p[1]} H${p[0] + 3} M${p[0]} ${p[1] - 3} V${p[1] + 3}`"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round"
                      />
                    </template>
                    <path
                      v-else-if="v.value === 'grid'"
                      d="M0 0H48V48H0V0ZM16 0V48M32 0V48M0 16H48M0 32H48"
                      stroke="currentColor"
                      stroke-width="1.2"
                      fill="none"
                    />
                    <path
                      v-else-if="v.value === 'diagonal'"
                      d="M-8 8L8 -8M-8 24L24 -8M-8 40L40 -8M8 56L56 8M24 56L56 24M40 56L56 40"
                      stroke="currentColor"
                      stroke-width="1.4"
                    />
                    <template v-else-if="v.value === 'checkerboard'">
                      <rect x="0" y="0" width="16" height="16" fill="currentColor" fill-opacity="0.35" />
                      <rect x="16" y="16" width="16" height="16" fill="currentColor" fill-opacity="0.35" />
                      <rect x="32" y="0" width="16" height="16" fill="currentColor" fill-opacity="0.35" />
                      <rect x="0" y="32" width="16" height="16" fill="currentColor" fill-opacity="0.35" />
                      <rect x="32" y="32" width="16" height="16" fill="currentColor" fill-opacity="0.35" />
                    </template>
                    <path
                      v-else
                      d="M12 12L36 36M36 12L12 36"
                      stroke="currentColor"
                      stroke-width="1.4"
                      stroke-linecap="round"
                      opacity="0.5"
                    />
                  </svg>
                  <span class="bg-variant-label">{{ v.label }}</span>
                </button>
              </div>
            </div>

            <div class="setting-row">
              <span class="setting-label">Cor de fundo do canvas</span>
              <div class="color-row">
                <AppTooltip label="Cor de fundo">
                  <label class="color-swatch" :style="{ background: canvasBgColor || 'var(--color-bg-app)' }">
                    <input
                      type="color"
                      class="color-input"
                      :value="canvasBgColor || '#1e1e22'"
                      @input="setCanvasBgColor($event.target.value)"
                    />
                  </label>
                </AppTooltip>
                <button class="action-btn reset-color-btn" :disabled="!canvasBgColor" @click="setCanvasBgColor(null)">
                  Automático (tema)
                </button>
              </div>
            </div>

            <template v-if="canvasVariant !== 'none'">
              <div class="setting-row">
                <span class="setting-label">Cor do padrão</span>
                <div class="color-row">
                  <AppTooltip label="Cor do padrão">
                    <label class="color-swatch" :style="{ background: resolvedCanvasPatternColor }">
                      <input
                        type="color"
                        class="color-input"
                        :value="resolvedCanvasPatternColor"
                        @input="setCanvasPatternColor($event.target.value)"
                      />
                    </label>
                  </AppTooltip>
                  <button
                    class="action-btn reset-color-btn"
                    :disabled="!canvasPatternColor"
                    @click="setCanvasPatternColor(null)"
                  >
                    Automático (tema)
                  </button>
                </div>
              </div>

              <div class="setting-row">
                <span class="setting-label">Espaçamento ({{ canvasGap }}px)</span>
                <input
                  type="range"
                  class="range-input"
                  min="8"
                  max="80"
                  step="2"
                  :value="canvasGap"
                  @input="setCanvasGap(Number($event.target.value))"
                />
              </div>

              <div v-if="canvasVariant !== 'checkerboard'" class="setting-row">
                <span class="setting-label">Tamanho {{ canvasVariant === 'dots' ? 'do ponto' : 'da linha' }} ({{ canvasPatternSize }}px)</span>
                <input
                  type="range"
                  class="range-input"
                  min="1"
                  :max="canvasVariant === 'dots' ? 10 : 4"
                  step="1"
                  :value="canvasPatternSize"
                  @input="setCanvasPatternSize(Number($event.target.value))"
                />
              </div>
            </template>

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
  nodeStyleVariant,
  setNodeStyleVariant,
  nodeShadowIntensity,
  setNodeShadowIntensity,
  canvasVariant,
  setCanvasVariant,
  CANVAS_VARIANTS,
  canvasBgColor,
  setCanvasBgColor,
  canvasPatternColor,
  setCanvasPatternColor,
  resolvedCanvasPatternColor,
  canvasGap,
  setCanvasGap,
  canvasPatternSize,
  setCanvasPatternSize,
  edgeStyle,
  setEdgeStyle,
  EDGE_STYLES,
  snapEnabled,
  setSnapEnabled,
  settingsSidebarOpen,
  closeSettings
} from '../store/themeStore'
import { isAuthenticated, user, login, logout } from '../store/authStore'
import AppTooltip from './AppTooltip.vue'
import { ttsEnabled, selectedVoiceId, AVAILABLE_VOICES, isSpeaking, isDownloadingVoice, lastError, speak } from '../store/ttsStore'
import {
  notificationSoundEnabled,
  selectedSoundId,
  AVAILABLE_SOUNDS,
  playNotificationSound
} from '../store/notificationSoundStore'
import { useSidebarResize } from '../lib/useSidebarResize'

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

// pontos de exemplo (grid 3x3) reaproveitados nos previews de "Pontos" e
// "Cruzes" — só muda o que é desenhado em cada ponto (círculo vs. +)
const DOT_PREVIEW_POINTS = [
  [12, 12],
  [24, 12],
  [36, 12],
  [12, 24],
  [24, 24],
  [36, 24],
  [12, 36],
  [24, 36],
  [36, 36]
]

const EDGE_PREVIEW_PATHS = {
  default: 'M6 8 C 30 8, 34 24, 58 24',
  smoothstep: 'M6 8 H32 Q36 8 36 12 V20 Q36 24 40 24 H58',
  step: 'M6 8 H32 V24 H58',
  straight: 'M6 8 L58 24'
}

const { width, resizing, showTip, startResize, handleTipEnter, handleTipLeave } = useSidebarResize({
  defaultWidth: 280,
  minWidth: 240,
  maxWidth: 420,
  invert: true
})

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

.color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-swatch {
  position: relative;
  display: flex;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid var(--color-border-strong);
  overflow: hidden;
  cursor: pointer;
}

.color-input {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  border: none;
  padding: 0;
  cursor: pointer;
  opacity: 0;
}

.reset-color-btn {
  width: auto;
  flex: 1;
  height: 28px;
  font-size: 11.5px;
  font-weight: 500;
}

.reset-color-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.range-input {
  width: 100%;
  accent-color: #3b82f6;
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

.bg-variant-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.bg-variant-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.bg-variant-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-hover);
}

.bg-variant-btn.active {
  border-color: #3b82f6;
  color: #3b82f6;
  background: rgb(59 130 246 / 0.08);
}

.bg-variant-preview {
  color: inherit;
}

.bg-variant-label {
  font-size: 10px;
  color: var(--color-text-secondary);
  text-align: center;
}

.bg-variant-btn.active .bg-variant-label {
  color: #3b82f6;
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
