<template>
  <div
    class="sidebar"
    :class="{ open: !!activeNode, resizing }"
    :style="{ width: activeNode ? `${width}px` : '0' }"
  >
    <div v-if="activeNode" class="sidebar-content" :style="{ width: `${width}px` }">
      <div class="sidebar-body">
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

        <div class="tabs">
          <button class="tab" :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">
            Configurações
          </button>
          <button class="tab" :class="{ active: activeTab === 'visual' }" @click="activeTab = 'visual'">
            Visual
          </button>
        </div>

        <component
          :is="settingsComponent"
          v-if="activeTab === 'settings' && settingsComponent"
          :node="activeNode"
          v-bind="typeEntry?.settingsProps"
        />
        <NodeVisualSettings v-else-if="activeTab === 'visual'" :node="activeNode" />
      </div>

      <div class="danger-zone">
        <span class="danger-zone-label">Área de risco</span>
        <button class="delete-btn" @click="requestDeleteNode(activeNode.id)">Excluir node</button>
      </div>
    </div>

    <div
      v-if="activeNode"
      class="resize-handle"
      @mousedown="startResize"
      @mouseenter="handleTipEnter"
      @mouseleave="handleTipLeave"
    >
      <span class="resize-grip" />
      <Transition name="tip-fade">
        <div v-if="showTip" class="resize-tooltip">
          <div class="tooltip-row"><kbd>Ctrl</kbd> + <kbd>B</kbd> fecha o painel</div>
          <div class="tooltip-sub">Drag to resize</div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { activeWorkspace, activeSettingsNodeId, closeNodeSettings, requestDeleteNode } from '../store/flowStore'
import { nodeTypeRegistry } from '../nodeTypes/registry'
import { useSidebarResize } from '../lib/useSidebarResize'
import NodeVisualSettings from './NodeVisualSettings.vue'

const activeNode = computed(
  () => activeWorkspace.value.nodes.find((n) => n.id === activeSettingsNodeId.value) ?? null
)
const typeEntry = computed(() => (activeNode.value ? nodeTypeRegistry[activeNode.value.type] : null))
const typeLabel = computed(() => typeEntry.value?.label ?? '')
const settingsComponent = computed(() => typeEntry.value?.settingsComponent ?? null)

const activeTab = ref('settings')
watch(activeSettingsNodeId, () => {
  activeTab.value = 'settings'
})

const { width, resizing, showTip, startResize, handleTipEnter, handleTipLeave } = useSidebarResize({
  defaultWidth: 260,
  minWidth: 220,
  maxWidth: 440
})

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
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.sidebar-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
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

.tabs {
  display: flex;
  gap: 3px;
  margin-bottom: 16px;
  padding: 3px;
  background: var(--color-bg-surface);
  border-radius: 8px;
}

.tab {
  flex: 1;
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: var(--color-bg-app);
  color: var(--color-text-tertiary);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.tab:hover {
  color: var(--color-text-primary);
}

.tab.active {
  background: var(--color-bg-surface-raised);
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
  right: 3px;
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
  left: 14px;
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

.danger-zone {
  flex-shrink: 0;
  padding: 14px;
  border-top: 1px solid var(--color-border);
  background: rgba(255, 107, 107, 0.05);
}

.danger-zone-label {
  display: block;
  margin-bottom: 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #ff6b6b;
}

.delete-btn {
  width: 100%;
  height: 30px;
  border: 1px solid rgba(255, 107, 107, 0.35);
  border-radius: 6px;
  background: transparent;
  color: #ff6b6b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.delete-btn:hover {
  background: rgba(255, 107, 107, 0.1);
}
</style>
