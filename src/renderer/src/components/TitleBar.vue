<template>
  <div class="titlebar">
    <div class="spacer" />
    <div class="title">{{ title }}</div>
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
