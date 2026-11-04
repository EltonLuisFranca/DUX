<template>
  <div class="titlebar">
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
        <rect x="2" y="2" width="6" height="8" rx="1.6" fill="currentColor" />
        <rect x="2" y="12" width="6" height="10" rx="1.6" fill="currentColor" />
        <path
          d="M11 3l9 9-9 9"
          fill="none"
          stroke="var(--color-accent)"
          stroke-width="3.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="brand-word">DUX</span>
      <span v-if="title && title !== 'DUX'" class="brand-sep">/</span>
      <span v-if="title && title !== 'DUX'" class="brand-ctx">{{ title }}</span>
    </div>

    <div class="drag-fill" />

    <div class="right-controls">
      <div class="traffic-lights">
        <button class="light minimize" aria-label="Minimizar" @click="minimize" />
        <button class="light maximize" aria-label="Maximizar" @click="maximize" />
        <button class="light close" aria-label="Fechar" @click="close" />
      </div>
    </div>
  </div>
</template>

<script setup>
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

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
}

.brand-mark {
  display: block;
}

.brand-word {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--color-text-primary);
}

.brand-sep {
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.brand-ctx {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.drag-fill {
  flex: 1;
}

.right-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
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
</style>
