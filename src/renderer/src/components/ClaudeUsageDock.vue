<template>
  <div v-if="visible" ref="dockRef" class="usage-dock">
    <div class="dock-surface" :style="dockMaskStyle" />

    <div
      v-for="item in items"
      :key="item.key"
      class="usage-ring-item"
      @mouseenter="scheduleOpen(item.key)"
      @mouseleave="scheduleClose"
    >
      <button class="usage-ring">
        <span class="usage-ring-track" :style="ringStyle(item.data.percent)">
          <span class="usage-ring-inner">{{ item.short }}</span>
        </span>
      </button>
      <span class="usage-ring-percent" :class="severity(item.data.percent)">{{ item.data.percent }}%</span>

      <div v-if="openKey === item.key" class="usage-menu">
        <div class="usage-row-head">
          <span>{{ item.label }}</span>
          <span>{{ item.data.percent }}%</span>
        </div>
        <div class="usage-bar">
          <div
            class="usage-bar-fill"
            :class="severity(item.data.percent)"
            :style="{ width: item.data.percent + '%' }"
          />
        </div>
        <div class="usage-reset">Reseta {{ formatReset(item.data.resetsAt) }}</div>
        <div v-if="usageError" class="usage-stale">Não foi possível atualizar agora — mostrando o último valor.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { session, usageError, week } from '../store/accountUsageStore'

const openKey = ref(null)
let closeTimer = null

const dockRef = ref(null)
const dockSize = ref({ width: 0, height: 0 })
const dockResizeObserver = new ResizeObserver(([entry]) => {
  if (!entry) return
  const box = entry.borderBoxSize?.[0]
  if (box) {
    dockSize.value = { width: box.inlineSize, height: box.blockSize }
  } else {
    const rect = entry.target.getBoundingClientRect()
    dockSize.value = { width: rect.width, height: rect.height }
  }
})

// O root fica atrás de v-if (some quando não há sessão/semana), então
// dockRef aparece/some ao longo da vida do componente — não dá pra montar
// o observer uma vez só no onMounted, tem que seguir o ref.
watch(
  dockRef,
  (el, prevEl) => {
    if (prevEl) dockResizeObserver.unobserve(prevEl)
    if (el) dockResizeObserver.observe(el)
  },
  { immediate: true }
)

// Fillets côncavos nas pontas de cima/baixo (raio FILLET_SPAN) fundindo com
// a borda direita da tela, cantos convexos normais (raio CORNER_RADIUS) do
// lado esquerdo — um único <path> usado como mask-image de .dock-surface,
// recalculado via ResizeObserver porque a altura do conteúdo varia com o
// número de itens (sessão/semana). Trocamos a técnica anterior de
// ::before/::after com radial-gradient (usada no ZoomControls antes de
// migrar pra SVG real) porque ela também sofre dos mesmos artefatos de
// composição do Electron.
//
// FILLET_SPAN é a ÚNICA fonte de verdade pro tamanho do fillet: tanto o
// raio do arco côncavo no path quanto o quanto .dock-surface transborda
// (top/bottom) vêm dela — mudar só a constante já recalcula os dois juntos,
// sem precisar tocar no path à mão. Se ficassem dessincronizados, o corpo
// do path (largura cheia, de y=FILLET_SPAN até y=H-FILLET_SPAN) deixaria de
// coincidir com a caixa de conteúdo real e voltaria a cortar rótulo/anel.
const FILLET_SPAN = 34
const CORNER_RADIUS = 18

const dockPath = computed(() => {
  const { width: w, height: contentHeight } = dockSize.value
  if (!w || !contentHeight) return null
  const R = FILLET_SPAN
  const r = CORNER_RADIUS
  const h = contentHeight + R * 2
  return (
    `M ${w},0 A ${R},${R} 0 0 1 ${w - R},${R} L ${r},${R} A ${r},${r} 0 0 0 0,${R + r} ` +
    `L 0,${h - R - r} A ${r},${r} 0 0 0 ${r},${h - R} L ${w - R},${h - R} ` +
    `A ${R},${R} 0 0 1 ${w},${h} Z`
  )
})

const dockMaskStyle = computed(() => {
  if (!dockPath.value) return {}
  const { width: w, height: contentHeight } = dockSize.value
  const h = contentHeight + FILLET_SPAN * 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${dockPath.value}" fill="#000"/></svg>`
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  return {
    top: `-${FILLET_SPAN}px`,
    bottom: `-${FILLET_SPAN}px`,
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

// 'no-auth' é a única condição em que escondemos o dock de vez — o resto
// (rede caiu, 401 passageiro) mantém o último valor bom na tela via
// accountUsageStore, então o dock continua útil mesmo com usageError setado.
const visible = computed(() => (session.value || week.value) && usageError.value !== 'no-auth')

const items = computed(() =>
  [
    session.value && { key: 'session', label: 'Sessão', short: '5h', data: session.value },
    week.value && { key: 'week', label: 'Semana', short: '7d', data: week.value }
  ].filter(Boolean)
)

function severity(percent) {
  if (percent >= 90) return 'danger'
  if (percent >= 70) return 'warn'
  return ''
}

function ringStyle(percent) {
  const clamped = Math.min(100, Math.max(0, percent))
  const color = clamped >= 90 ? '#ef4444' : clamped >= 70 ? '#d97706' : '#10b981'
  const deg = clamped * 3.6
  return { background: `conic-gradient(${color} ${deg}deg, var(--color-border) ${deg}deg)` }
}

function formatReset(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return `às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }
  return date.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

// Delay no fechamento pra tolerar o "vão" entre o anel e o popover (que abre
// pra esquerda, fora da caixa do item) — sem isso o mouse perde o hover ao
// atravessar esse espaço e o popover fecha antes de dar tempo de alcançá-lo.
function scheduleOpen(key) {
  clearTimeout(closeTimer)
  openKey.value = key
}

function scheduleClose() {
  clearTimeout(closeTimer)
  closeTimer = setTimeout(() => {
    openKey.value = null
  }, 200)
}

onBeforeUnmount(() => {
  dockResizeObserver.disconnect()
  clearTimeout(closeTimer)
})
</script>

<style scoped>
.usage-dock {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: 64px;
  padding: 24px 8px;
}

/* top/bottom vêm de dockMaskStyle (derivados de FILLET_SPAN, no script) —
   não hardcode aqui de novo, senão volta a poder dessincronizar do H do
   path. Left/right ficam fixos: só o eixo vertical transborda. */
.dock-surface {
  position: absolute;
  left: 0;
  right: 0;
  background: #000;
  pointer-events: none;
  filter: drop-shadow(-3px 2px 14px var(--color-shadow));
}

.usage-ring-item {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.usage-ring {
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.usage-ring-item:hover .usage-ring {
  transform: scale(1.1);
  filter: brightness(1.25);
}

.usage-ring-track {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 4px;
  border-radius: 50%;
}

.usage-ring-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #000;
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 600;
}

.usage-ring-percent {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-quaternary);
}

.usage-ring-percent.warn {
  color: #d97706;
}

.usage-ring-percent.danger {
  color: #ef4444;
}

.usage-menu {
  position: absolute;
  right: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  width: 240px;
  padding: 12px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px var(--color-shadow);
}

.usage-row-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-primary);
  margin-bottom: 5px;
}

.usage-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--color-border);
  overflow: hidden;
}

.usage-bar-fill {
  height: 100%;
  background: var(--color-text-tertiary);
  border-radius: 3px;
}

.usage-bar-fill.warn {
  background: #d97706;
}

.usage-bar-fill.danger {
  background: #ef4444;
}

.usage-reset {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.usage-stale {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}
</style>
