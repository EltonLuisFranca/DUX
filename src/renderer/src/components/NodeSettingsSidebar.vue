<template>
  <div
    class="sidebar"
    :class="{ open: !!activeNode, resizing }"
    :style="{ width: activeNode ? `${width}px` : '0' }"
  >
    <div v-if="activeNode" class="sidebar-content" :style="{ width: `${width}px` }">
      <div class="sidebar-header">
        <div class="sidebar-heading">
          <span class="sidebar-title">Configurações do node</span>
          <span class="sidebar-subtitle">{{ typeLabel }}</span>
        </div>
        <button class="close-btn" title="Fechar" @click="closeNodeSettings">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <component :is="settingsComponent" v-if="settingsComponent" :node="activeNode" />
    </div>

    <div
      v-if="activeNode"
      class="resize-handle"
      @mousedown="startResize"
      @mouseenter="showTip = true"
      @mouseleave="showTip = false"
    >
      <span class="resize-grip" />
      <div v-if="showTip" class="resize-tooltip"><kbd>Ctrl</kbd> + <kbd>B</kbd> fecha o painel</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { nodes, activeSettingsNodeId, closeNodeSettings } from '../store/flowStore'
import { nodeTypeRegistry } from '../nodeTypes/registry'

const MIN_WIDTH = 220
const MAX_WIDTH = 440

const activeNode = computed(() => nodes.value.find((n) => n.id === activeSettingsNodeId.value) ?? null)
const typeEntry = computed(() => (activeNode.value ? nodeTypeRegistry[activeNode.value.type] : null))
const typeLabel = computed(() => typeEntry.value?.label ?? '')
const settingsComponent = computed(() => typeEntry.value?.settingsComponent ?? null)

const width = ref(260)
const resizing = ref(false)
const showTip = ref(false)
let startX = 0
let startWidth = 0

function startResize(event) {
  resizing.value = true
  showTip.value = false
  startX = event.clientX
  startWidth = width.value
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', stopResize)
  event.preventDefault()
}

function onResizeMove(event) {
  const dx = event.clientX - startX
  width.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + dx))
}

function stopResize() {
  resizing.value = false
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
}

// captura antes do xterm.js pra fechar mesmo com o terminal focado
function onKeydown(event) {
  if (!activeSettingsNodeId.value) return
  if (event.ctrlKey && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    event.stopPropagation()
    closeNodeSettings()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, { capture: true }))

onBeforeUnmount(() => {
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
  border-right: 1px solid var(--color-border);
  transition: width 0.16s ease;
}

.sidebar.resizing {
  transition: none;
}

.sidebar-content {
  height: 100%;
  padding: 14px;
  box-sizing: border-box;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}

.sidebar-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sidebar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.sidebar-subtitle {
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  z-index: 1;
}

.resize-grip {
  position: relative;
  right: 2px;
  width: 3px;
  height: 25px;
  border-radius: 4px;
  background: transparent;
}

.resize-handle:hover .resize-grip,
.sidebar.resizing .resize-grip {
  background: rgba(255, 255, 255, 0.35);
}

.resize-tooltip {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  white-space: nowrap;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  box-shadow: 0 4px 16px var(--color-shadow);
  color: var(--color-text-quaternary);
  font-size: 11px;
  pointer-events: none;
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
