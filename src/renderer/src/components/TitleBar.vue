<template>
  <div class="titlebar">
    <div class="spacer" />
    <div class="title">{{ title }}</div>
    <div class="right-controls">
      <button
        class="theme-toggle"
        :title="theme === 'dark' ? 'Tema claro' : 'Tema escuro'"
        @click="toggleTheme"
      >
        <svg
          v-if="theme === 'dark'"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>

      <div class="traffic-lights">
        <button class="light minimize" aria-label="Minimizar" @click="minimize" />
        <button class="light maximize" aria-label="Maximizar" @click="maximize" />
        <button class="light close" aria-label="Fechar" @click="close" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { theme, toggleTheme } from '../store/themeStore'

defineProps({
  title: { type: String, default: '' }
})

const close = () => window.windowControls?.close()
const minimize = () => window.windowControls?.minimize()
const maximize = () => window.windowControls?.maximize()
</script>

<style scoped>
.titlebar {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  flex-shrink: 0;
  background: var(--color-bg-surface-alt);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

.spacer {
  width: 84px;
  flex-shrink: 0;
}

.right-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.theme-toggle {
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

.theme-toggle:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.traffic-lights {
  display: flex;
  gap: 8px;
}

.light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: filter 0.1s ease;
}

.light.close {
  background: #ff5f57;
}

.light.minimize {
  background: #febc2e;
}

.light.maximize {
  background: #28c840;
}

.light:hover {
  filter: brightness(1.15);
}

.title {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-tertiary);
  pointer-events: none;
}
</style>
