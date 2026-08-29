<template>
  <div
    class="image-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="image-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="image-handle"
      :class="{ connected: isRightConnected }"
    />

    <Transition name="toolbar-fade">
      <div v-if="selected" class="image-toolbar nodrag nowheel">
        <AppTooltip label="Trocar imagem">
          <button class="tool-btn" @click="replaceImage">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.8" />
              <circle cx="5.5" cy="6.2" r="1.2" />
              <path d="M2.5 11l3.2-3.2 1.8 1.8 2.5-2.8 2.5 2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </AppTooltip>
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

    <div class="image-drag-handle nodrag">
      <span class="grip-dots"><span></span><span></span><span></span></span>
    </div>

    <img v-if="data.src" :src="data.src" class="image-content" alt="" draggable="false" />
    <div v-else class="image-empty">Sem imagem</div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path
          d="M13 3L3 13M13 8.5L8.5 13M13 13.5L13.5 13"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { updateNodeData, requestDeleteNode } from '../store/flowStore'
import AppTooltip from './AppTooltip.vue'
import { useHandleConnection } from '../lib/useHandleConnection'

const MIN_NODE_WIDTH = 160
const MIN_NODE_HEIGHT = 120

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { viewport } = useVueFlow()
const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')

const nodeWidth = ref(props.data.width || 360)
const nodeHeight = ref(props.data.height || 260)

async function replaceImage() {
  const result = await window.imageNodeAPI.openFile()
  if (!result.picked) return
  updateNodeData(props.id, { src: result.dataUrl, name: result.fileName })
}

let resizeStartX = 0
let resizeStartY = 0
let resizeStartW = 0
let resizeStartH = 0

function startResize(event) {
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  resizeStartW = nodeWidth.value
  resizeStartH = nodeHeight.value
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', stopResize)
  event.preventDefault()
  event.stopPropagation()
}

function onResizeMove(event) {
  const zoom = viewport.value.zoom || 1
  const dx = (event.clientX - resizeStartX) / zoom
  const dy = (event.clientY - resizeStartY) / zoom
  nodeWidth.value = Math.max(MIN_NODE_WIDTH, Math.round(resizeStartW + dx))
  nodeHeight.value = Math.max(MIN_NODE_HEIGHT, Math.round(resizeStartH + dy))
}

function stopResize() {
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
  updateNodeData(props.id, { width: nodeWidth.value, height: nodeHeight.value })
}
</script>

<style scoped>
.image-node {
  position: relative;
  display: flex;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.image-node.selected {
  border-color: var(--selected-color);
}

.image-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.image-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.image-content {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  border-radius: 9px;
}

.image-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--color-text-tertiary);
  font-size: 12px;
  border-radius: 9px;
}

.image-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 22px;
  cursor: grab;
  z-index: 1;
}

.image-drag-handle:active {
  cursor: grabbing;
}

.grip-dots {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.grip-dots span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
}

.image-node:hover .grip-dots {
  opacity: 0.8;
}

.toolbar-fade-enter-active,
.toolbar-fade-leave-active {
  transition: opacity 0.12s ease;
}

.toolbar-fade-enter-from,
.toolbar-fade-leave-to {
  opacity: 0;
}

.image-toolbar {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  padding: 3px 6px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: 0 4px 16px var(--color-shadow);
  z-index: 3;
  z-index: 2;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
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

.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 3px;
  box-sizing: border-box;
  color: #fff;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.12s ease;
  z-index: 1;
}

.image-node:hover .resize-handle {
  opacity: 1;
}
</style>
