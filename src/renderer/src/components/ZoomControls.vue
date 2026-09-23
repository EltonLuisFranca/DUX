<template>
  <div ref="rootRef" class="zoom-controls">
    <div class="dock-surface" :style="dockMaskStyle" />

    <div class="toolbar-row">
      <WorkspaceSwitcher />

      <span class="toolbar-divider" />

      <VoiceInputBadge />

      <span class="toolbar-divider" />

      <AppTooltip label="Diminuir zoom">
        <button class="zoom-btn" @click="handleZoomOut">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
      </AppTooltip>

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

      <AppTooltip label="Aumentar zoom">
        <button class="zoom-btn" @click="handleZoomIn">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
      </AppTooltip>

      <span class="toolbar-divider" />

      <AppTooltip label="Adicionar node" shortcut="Ctrl+N">
        <button class="zoom-btn" @click="openAddNodeModal">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
            <path d="M8 5.5v5M5.5 8h5" />
          </svg>
        </button>
      </AppTooltip>

      <AppTooltip label="Arraste para o canvas">
        <button class="zoom-btn" draggable="true" @dragstart="handleNotesDragStart">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 2.5h7l3 3V13a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5z" />
            <path d="M10 2.5V5.5h3" />
            <path d="M5 8h6M5 10.5h6" />
          </svg>
        </button>
      </AppTooltip>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import WorkspaceSwitcher from './WorkspaceSwitcher.vue'
import VoiceInputBadge from './VoiceInputBadge.vue'
import AppTooltip from './AppTooltip.vue'
import { openAddNodeModal } from '../store/flowStore'

function handleNotesDragStart(event) {
  event.dataTransfer.setData('application/dux-node-type', 'notes')
  event.dataTransfer.effectAllowed = 'move'
}

const { zoomIn, zoomOut, zoomTo, fitView, viewport } = useVueFlow()

const levels = [50, 75, 100, 125, 150, 200]
const open = ref(false)
const rootRef = ref(null)

// Mesma técnica de máscara côncava do ClaudeUsageDock (ver comentário lá),
// só que rotacionada 90°: o ClaudeUsageDock gruda na borda DIREITA da tela e
// afunila (côncavo) no topo/base do conteúdo; esta barra gruda na borda
// INFERIOR e afunila nas pontas esquerda/direita — por isso o overflow do
// fillet aqui é horizontal (left/right) em vez de vertical, e os cantos
// convexos ficam em cima (longe da borda) em vez de à esquerda.
const barSize = ref({ width: 0, height: 0 })
const barResizeObserver = new ResizeObserver(([entry]) => {
  if (!entry) return
  const box = entry.borderBoxSize?.[0]
  if (box) {
    barSize.value = { width: box.inlineSize, height: box.blockSize }
  } else {
    const rect = entry.target.getBoundingClientRect()
    barSize.value = { width: rect.width, height: rect.height }
  }
})

watch(
  rootRef,
  (el, prevEl) => {
    if (prevEl) barResizeObserver.unobserve(prevEl)
    if (el) barResizeObserver.observe(el)
  },
  { immediate: true }
)

const FILLET_SPAN = 40
const CORNER_RADIUS = 19

const barPath = computed(() => {
  const { width: contentWidth, height: h } = barSize.value
  if (!contentWidth || !h) return null
  const R = FILLET_SPAN
  const r = CORNER_RADIUS
  const w = contentWidth + R * 2
  return (
    `M 0,${h} A ${R},${R} 0 0 0 ${R},${h - R} L ${R},${r} A ${r},${r} 0 0 1 ${R + r},0 ` +
    `L ${w - R - r},0 A ${r},${r} 0 0 1 ${w - R},${r} L ${w - R},${h - R} ` +
    `A ${R},${R} 0 0 0 ${w},${h} Z`
  )
})

const dockMaskStyle = computed(() => {
  if (!barPath.value) return {}
  const { width: contentWidth, height: h } = barSize.value
  const w = contentWidth + FILLET_SPAN * 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${barPath.value}" fill="#000"/></svg>`
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  return {
    left: `-${FILLET_SPAN}px`,
    right: `-${FILLET_SPAN}px`,
    maskImage: url,
    WebkitMaskImage: url,
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskOrigin: 'border-box',
    WebkitMaskOrigin: 'border-box'
  }
})

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

onMounted(() => document.addEventListener('mousedown', handleClickOutside, { capture: true }))
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside, { capture: true })
  barResizeObserver.disconnect()
})
</script>

<style scoped>
.zoom-controls {
  position: relative;
  width: fit-content;
}

/* left/right vêm de dockMaskStyle (derivados de FILLET_SPAN, no script) —
   não hardcode aqui de novo, senão volta a poder dessincronizar da largura
   do path. Top/bottom ficam fixos: só o eixo horizontal transborda, já que
   a barra gruda na borda inferior da tela e afunila (côncavo) nas pontas
   esquerda/direita, com cantos convexos no topo — mesma técnica de mask-image
   via <path> do ClaudeUsageDock, rotacionada 90°. */
.dock-surface {
  position: absolute;
  top: 0;
  bottom: 0;
  background: #000;
  box-shadow: 0 -3px 14px var(--color-shadow);
  pointer-events: none;
}

.toolbar-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px;
}

:deep(.workspace-switcher) {
  position: relative;
  z-index: 1;
}

:deep(.workspace-switcher .zoom-btn) {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #000;
}

.zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--color-text-quaternary);
  cursor: pointer;
}

.zoom-btn:hover {
  background: var(--color-hover);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
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
  height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: 9px;
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
