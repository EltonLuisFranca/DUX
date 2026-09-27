<template>
  <div
    class="node-shell"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />

    <Handle
      v-if="handles.includes('top')"
      id="top"
      type="target"
      :position="Position.Top"
      class="shell-handle"
      :class="{ connected: isTopConnected }"
    />
    <Handle
      v-if="handles.includes('left')"
      id="left"
      type="target"
      :position="Position.Left"
      class="shell-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      v-if="handles.includes('right')"
      id="right"
      type="source"
      :position="Position.Right"
      class="shell-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      v-if="handles.includes('bottom')"
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="shell-handle"
      :class="{ connected: isBottomConnected }"
    />

    <!-- card separado do container posicional acima: só ele tem
    border/raio/overflow-hidden, pra que qualquer conteúdo do corpo com fundo
    próprio (ex: composer, footer) seja recortado nos cantos arredondados sem
    precisar que cada node acerte manualmente um border-radius que bateria
    com o raio — que muda dinamicamente com a variante (estruturado/compacto). -->
    <div class="shell-card" :class="[`variant-${nodeStyleVariant}`, { selected }]">
      <div class="shell-header" :style="{ background: data.headerColor || undefined }">
        <span v-if="$slots.icon" class="shell-icon-badge"><slot name="icon" /></span>
        <span v-if="status" class="shell-status-dot" :class="{ pulsing: statusPulse }" :style="{ background: status }" />
        <span class="shell-title">{{ title }}</span>
        <span v-if="meta" class="shell-meta">{{ meta }}</span>
        <slot name="headerActions" />
      </div>

      <slot />

      <div v-if="$slots.footer" class="shell-footer nodrag">
        <slot name="footer" />
      </div>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core'
import { nodeStyleVariant } from '../store/themeStore'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'
import NodeToolbar from './NodeToolbar.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  resize: {
    type: Object,
    default: () => ({ minWidth: 260, minHeight: 160, defaultWidth: 320, defaultHeight: 220 })
  },
  handles: { type: Array, default: () => ['left', 'right', 'bottom'] },
  title: { type: String, default: '' },
  meta: { type: String, default: '' },
  // cor CSS (hex/rgb/var()) do dot de status, ou omitido/null pra não mostrar nenhum
  status: { type: String, default: null },
  // anima o dot pulsando (ex: scan/teste em andamento) — vários dos scanners
  // usam essa mesma indicação de "rodando"
  statusPulse: { type: Boolean, default: false }
})

const { isHandleConnected } = useHandleConnection(props.id)
const isTopConnected = isHandleConnected('top')
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')
const isBottomConnected = isHandleConnected('bottom')

const { nodeWidth, nodeHeight, startResize } = useNodeResize(props, props.resize)
</script>

<style scoped>
.node-shell {
  position: relative;
  width: 100%;
  height: 100%;
}

.shell-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--color-shadow) var(--node-shadow-pct), transparent);
  overflow: hidden;
}

.shell-card.selected {
  border-color: var(--selected-color);
}

.shell-handle {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.shell-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.shell-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  background: var(--color-bg-surface-alt);
}

.shell-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.shell-icon-badge :deep(svg) {
  width: 12px;
  height: 12px;
}

.shell-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--color-text-tertiary);
}

.shell-status-dot.pulsing {
  animation: shell-status-pulse 1.1s ease-in-out infinite;
}

@keyframes shell-status-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.55;
    transform: scale(1.3);
  }
}

.shell-title {
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shell-meta {
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
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
  color: var(--color-text-tertiary);
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.12s ease;
  z-index: 1;
}

.node-shell:hover .resize-handle {
  opacity: 1;
}

/* ---- variante "structured" (padrão) — Estilo B do canvas de design ---- */
.shell-card.variant-structured {
  border-radius: 12px;
}

.variant-structured .shell-header {
  height: 46px;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-border-strong);
}

.variant-structured .shell-icon-badge {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--color-border-strong);
}

.variant-structured .shell-title {
  font-size: 12.5px;
}

.variant-structured .shell-meta {
  font-size: 10.5px;
}

.variant-structured .shell-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 8px;
  border-top: 1px solid var(--color-border-strong);
  background: var(--color-bg-surface-alt);
}

/* ---- variante "compact" — Estilo C do canvas de design ---- */
.shell-card.variant-compact {
  border-radius: 7px;
}

.variant-compact .shell-header {
  height: 26px;
  padding: 0 8px;
  gap: 6px;
  border-bottom: 1px solid var(--color-border-strong);
}

.variant-compact .shell-icon-badge :deep(svg) {
  width: 11px;
  height: 11px;
}

.variant-compact .shell-title {
  font-size: 10.5px;
}

.variant-compact .shell-meta {
  font-size: 9px;
}

.variant-compact .shell-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 8px;
  border-top: 1px solid var(--color-border-strong);
  background: var(--color-bg-surface-alt);
  font-size: 9px;
  color: var(--color-text-tertiary);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.shell-card.variant-compact:hover .shell-footer {
  opacity: 1;
}
</style>
