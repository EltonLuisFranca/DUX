<template>
  <div
    class="node-shell"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || 'var(--color-accent)' }"
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
        <span
          v-if="$slots.icon"
          class="shell-icon-badge"
          :class="{ accented: !!accent }"
          :style="accent ? { '--badge-accent': accent } : undefined"
          ><slot name="icon"
        /></span>
        <span v-if="status && !statusLabel" class="shell-status-dot" :class="{ pulsing: statusPulse }" :style="{ background: status }" />
        <span class="shell-title">{{ title }}</span>
        <span v-if="meta" class="shell-meta">{{ meta }}</span>
        <slot name="headerMeta" />
        <span
          v-if="statusLabel"
          class="shell-status-pill"
          :class="[`tone-${statusTone}`, { pulsing: statusPulse }]"
        >
          <span class="shell-status-pill-dot" />
          {{ statusLabel }}
        </span>
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
  // anima o dot/pill pulsando (ex: scan/teste em andamento) — vários dos
  // scanners usam essa mesma indicação de "rodando"
  statusPulse: { type: Boolean, default: false },
  // pill de status explícito no header (ex: "Trabalhando 0:42", "Aguardando").
  // Quando presente, substitui o dot simples. statusTone escolhe a cor.
  statusLabel: { type: String, default: '' },
  statusTone: {
    type: String,
    default: 'idle',
    validator: (v) => ['idle', 'working', 'waiting', 'ok', 'error'].includes(v)
  },
  // cor CSS pra tingir o badge do ícone (categoria do node). Omitido = neutro.
  accent: { type: String, default: '' }
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
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--selected-color) 16%, transparent),
    0 18px 40px color-mix(in srgb, var(--color-shadow) var(--node-shadow-pct), transparent);
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
  background: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 25%, transparent);
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

/* badge tingido pela categoria do node (prop `accent`) */
.shell-icon-badge.accented {
  color: var(--badge-accent);
  background: color-mix(in srgb, var(--badge-accent) 16%, var(--color-bg-surface)) !important;
  border-color: color-mix(in srgb, var(--badge-accent) 38%, transparent) !important;
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

/* pill de status explícito no header */
.shell-status-pill {
  --tone: var(--color-text-tertiary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
  height: 20px;
  padding: 0 9px 0 8px;
  border-radius: 11px;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  color: color-mix(in srgb, var(--tone) 82%, var(--color-text-primary));
  background: color-mix(in srgb, var(--tone) 14%, transparent);
}

.shell-status-pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tone);
}

.shell-status-pill.pulsing .shell-status-pill-dot {
  animation: shell-status-pulse 1.1s ease-in-out infinite;
}

.shell-status-pill.tone-working {
  --tone: var(--color-status-working);
}
.shell-status-pill.tone-waiting {
  --tone: var(--color-status-waiting);
}
.shell-status-pill.tone-ok {
  --tone: var(--color-status-ok);
}
.shell-status-pill.tone-error {
  --tone: var(--color-status-error);
}
.shell-status-pill.tone-idle {
  --tone: var(--color-text-tertiary);
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
  background: var(--color-bg-surface-raised);
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

.variant-compact .shell-status-pill {
  height: 16px;
  padding: 0 7px 0 6px;
  font-size: 9px;
  gap: 4px;
}

.variant-compact .shell-status-pill-dot {
  width: 5px;
  height: 5px;
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
