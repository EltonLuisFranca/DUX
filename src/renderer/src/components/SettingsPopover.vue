<template>
  <div class="settings-anchor">
    <button class="settings-trigger" title="Configurações" @click="open = !open">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
    </button>

    <div v-if="open" class="settings-backdrop" @mousedown="open = false" />

    <Transition name="popover-fade">
      <div v-if="open" class="settings-panel-box">
        <div class="settings-header">
          <span class="settings-title">Configurações</span>
          <button class="close-btn" title="Fechar" @click="open = false">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="settings-body">
          <section class="settings-section">
            <h3 class="section-title">Conta</h3>

            <div v-if="isAuthenticated" class="account-profile">
              <img v-if="user?.avatar" class="account-avatar" :src="user.avatar" alt="" />
              <div v-else class="account-avatar account-avatar-fallback">
                {{ (user?.firstname || '?').charAt(0).toUpperCase() }}
              </div>
              <div class="account-info">
                <span class="account-name">{{ [user?.firstname, user?.lastname].filter(Boolean).join(' ') || 'Conectado' }}</span>
                <span class="account-email">{{ user?.email }}</span>
              </div>
              <button class="segmented-btn account-action" @click="logout">Sair</button>
            </div>
            <div v-else class="setting-row">
              <span class="setting-label">Sincronizar entre máquinas</span>
              <button class="segmented-btn account-action" @click="login">Entrar com Google</button>
            </div>
          </section>

          <section class="settings-section">
            <h3 class="section-title">Aparência</h3>

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
          </section>

          <section class="settings-section">
            <h3 class="section-title">Conexões</h3>

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
        </div>

        <div class="settings-footer">
          <span class="version-label">v{{ version }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import {
  theme,
  setTheme,
  canvasVariant,
  setCanvasVariant,
  edgeStyle,
  setEdgeStyle,
  EDGE_STYLES
} from '../store/themeStore'
import { isAuthenticated, user, login, logout } from '../store/authStore'

const open = ref(false)
const version = window.appInfo?.version ?? '0.0.0'

const EDGE_PREVIEW_PATHS = {
  default: 'M6 8 C 30 8, 34 24, 58 24',
  smoothstep: 'M6 8 H32 Q36 8 36 12 V20 Q36 24 40 24 H58',
  step: 'M6 8 H32 V24 H58',
  straight: 'M6 8 L58 24'
}
</script>

<style scoped>
.settings-anchor {
  position: relative;
}

.settings-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  cursor: pointer;
  box-shadow: 0 2px 8px var(--color-shadow);
}

.settings-trigger:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.settings-panel-box {
  position: absolute;
  top: 44px;
  right: 0;
  z-index: 41;
  width: 320px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  box-shadow: 0 16px 40px var(--color-shadow);
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border);
}

.settings-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
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

.settings-body {
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 0;
}

.settings-section:first-child {
  padding-top: 0;
}

.settings-section:last-child {
  padding-bottom: 0;
}

.settings-section + .settings-section {
  border-top: 1px solid var(--color-border);
}

.section-title {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setting-label {
  font-size: 12.5px;
  color: var(--color-text-primary);
}

.segmented {
  display: flex;
  padding: 2px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
}

.segmented-btn {
  height: 24px;
  padding: 0 10px;
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

.account-action {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  flex-shrink: 0;
}

.account-action:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.account-profile {
  display: flex;
  align-items: center;
  gap: 10px;
}

.account-avatar {
  width: 32px;
  height: 32px;
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
  font-size: 13px;
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

.settings-footer {
  flex-shrink: 0;
  padding: 8px 12px;
  text-align: right;
}

.version-label {
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.12s ease;
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
}
</style>
