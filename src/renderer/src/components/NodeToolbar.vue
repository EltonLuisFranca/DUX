<template>
  <Transition name="toolbar-fade">
    <div v-if="selected" class="node-toolbar nodrag nowheel">
      <AppTooltip label="Cor do header">
        <label class="color-swatch" :style="{ background: data.headerColor || '#1e1e22' }">
          <input
            type="color"
            class="color-input"
            :value="data.headerColor || '#1e1e22'"
            @input="setColor($event.target.value)"
          />
        </label>
      </AppTooltip>
      <AppTooltip label="Remover cor (padrão)">
        <button class="tool-btn" @click="setColor(null)">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="1.3" fill="none" />
            <path d="M3.5 12.5l9-9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          </svg>
        </button>
      </AppTooltip>

      <template v-if="$slots.default">
        <span class="tool-divider" />
        <slot />
      </template>

      <span class="tool-divider" />
      <AppTooltip label="Excluir">
        <button class="tool-btn tool-danger" @click="requestDeleteNode(id)">
          <svg viewBox="0 0 16 16" width="15" height="15">
            <path
              d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M5 4.5l.5 8a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.5-8"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </button>
      </AppTooltip>
    </div>
  </Transition>
</template>

<script setup>
import { requestDeleteNode, updateNodeData } from '../store/flowStore'
import AppTooltip from './AppTooltip.vue'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

function setColor(color) {
  updateNodeData(props.id, { headerColor: color })
}
</script>

<style scoped>
.toolbar-fade-enter-active,
.toolbar-fade-leave-active {
  transition: opacity 0.12s ease;
}

.toolbar-fade-enter-from,
.toolbar-fade-leave-to {
  opacity: 0;
}

.node-toolbar {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  padding: 3px 6px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: 0 4px 16px var(--color-shadow);
  cursor: default;
  z-index: 2;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.tool-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.tool-danger:hover {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.tool-divider {
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: var(--color-border-strong);
}

.color-swatch {
  position: relative;
  display: flex;
  width: 18px;
  height: 18px;
  border-radius: 5px;
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
</style>
