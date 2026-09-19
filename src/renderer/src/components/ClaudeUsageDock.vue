<template>
  <div v-if="visible" class="usage-dock">
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
import { computed, onBeforeUnmount, ref } from 'vue'
import { session, usageError, week } from '../store/accountUsageStore'

const openKey = ref(null)
let closeTimer = null

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

onBeforeUnmount(() => clearTimeout(closeTimer))
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
  background: #000;
  border: 1px solid var(--color-border);
  border-top-left-radius: 32px;
  border-bottom-left-radius: 32px;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  filter: drop-shadow(-3px 2px 14px var(--color-shadow));
}

/* Fillet convexo: preenche o vão entre o topo/base do pill e a borda da
   tela, alargando até virar a largura cheia onde encosta no pill — é
   material sendo ADICIONADO ali, não um recorte no pill. Cada pseudo tem
   DOIS gradientes empilhados: o de cima pinta o anel na cor da borda (que
   é translúcida — rgba branco 8%) sobre o de baixo, que é o preenchimento
   opaco começando exatamente onde o anel começa. Sem essa base opaca por
   baixo, a borda translúcida mistura com o canvas atrás (em vez de com o
   preto do pill) e a linha fica "desencontrada" da borda reta do pill. */
.usage-dock::before,
.usage-dock::after {
  content: '';
  position: absolute;
  right: 0;
  width: 44px;
  height: 44px;
  pointer-events: none;
}

.usage-dock::before {
  top: -44px;
  background:
    radial-gradient(circle 44px at 0 0, transparent 42px, var(--color-border) 43px, var(--color-border) 44px, transparent 45px),
    radial-gradient(circle 44px at 0 0, transparent 43px, #000 44px);
}

.usage-dock::after {
  bottom: -44px;
  background:
    radial-gradient(circle 44px at 0 100%, transparent 42px, var(--color-border) 43px, var(--color-border) 44px, transparent 45px),
    radial-gradient(circle 44px at 0 100%, transparent 43px, #000 44px);
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
