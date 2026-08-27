<template>
  <div ref="rootRef" class="zoom-controls">
    <button class="zoom-btn" title="Diminuir zoom" @click="handleZoomOut">
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path d="M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>

    <div class="zoom-level">
      <button class="zoom-percent" @click="open = !open">
        {{ zoomPercent }}%
        <svg class="chevron" :class="{ open }" viewBox="0 0 16 16" width="10" height="10">
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>

      <ul v-if="open" class="zoom-menu">
        <li v-for="level in levels" :key="level" @click="selectLevel(level)">{{ level }}%</li>
        <li class="divider" />
        <li @click="handleFitView">Ajustar à tela</li>
      </ul>
    </div>

    <button class="zoom-btn" title="Aumentar zoom" @click="handleZoomIn">
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>

    <span class="toolbar-divider" />

    <button class="zoom-btn" title="Adicionar node" @click="openAddNodeModal">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
        <path d="M8 5.5v5M5.5 8h5" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { openAddNodeModal } from '../store/flowStore'

const { zoomIn, zoomOut, zoomTo, fitView, viewport } = useVueFlow()

const levels = [50, 75, 100, 125, 150, 200]
const open = ref(false)
const rootRef = ref(null)

const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100))

const handleZoomIn = () => zoomIn({ duration: 150 })
const handleZoomOut = () => zoomOut({ duration: 150 })

const handleFitView = () => {
  fitView({ duration: 200 })
  open.value = false
}

const selectLevel = (level) => {
  zoomTo(level / 100, { duration: 150 })
  open.value = false
}

const handleClickOutside = (event) => {
  if (rootRef.value && !rootRef.value.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside))
</script>

<style scoped>
.zoom-controls {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px var(--color-shadow);
}

.zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-quaternary);
  cursor: pointer;
}

.zoom-btn:hover {
  background: var(--color-hover);
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--color-border-strong);
  margin: 0 2px;
}

.zoom-level {
  position: relative;
}

.zoom-percent {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.zoom-percent:hover {
  background: var(--color-hover);
}

.chevron {
  transition: transform 0.12s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.zoom-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  list-style: none;
  margin: 0;
  padding: 4px;
  min-width: 120px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px var(--color-shadow);
}

.zoom-menu li {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--color-text-primary);
  border-radius: 6px;
  cursor: pointer;
}

.zoom-menu li:hover {
  background: var(--color-hover);
}

.zoom-menu .divider {
  height: 1px;
  margin: 4px 2px;
  padding: 0;
  background: var(--color-border);
  cursor: default;
}

.zoom-menu .divider:hover {
  background: var(--color-border);
}
</style>
