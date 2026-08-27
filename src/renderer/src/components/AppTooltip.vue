<template>
  <div class="app-tooltip-wrap" @mouseenter="handleEnter" @mouseleave="handleLeave">
    <slot />
    <Transition name="tip-fade">
      <div v-if="show" class="app-tooltip">
        <span>{{ label }}</span>
        <kbd v-if="shortcut">{{ shortcut }}</kbd>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'

defineProps({
  label: { type: String, required: true },
  shortcut: { type: String, default: '' }
})

const show = ref(false)
let timer = null

function handleEnter() {
  timer = setTimeout(() => {
    show.value = true
  }, 250)
}

function handleLeave() {
  clearTimeout(timer)
  show.value = false
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.app-tooltip-wrap {
  position: relative;
  display: flex;
}

.tip-fade-enter-active,
.tip-fade-leave-active {
  transition: opacity 0.15s ease;
}

.tip-fade-enter-from,
.tip-fade-leave-to {
  opacity: 0;
}

.app-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  white-space: nowrap;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  box-shadow: 0 4px 16px var(--color-shadow);
  color: var(--color-text-quaternary);
  font-size: 11px;
  pointer-events: none;
  z-index: 2;
}

.app-tooltip kbd {
  padding: 1px 5px;
  background: var(--color-bg-surface-raised);
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  font-family: inherit;
  font-size: 10.5px;
  color: var(--color-text-primary);
}
</style>
