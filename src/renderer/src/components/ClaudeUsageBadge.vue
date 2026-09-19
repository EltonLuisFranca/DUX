<template>
  <div v-if="visible" ref="rootRef" class="usage-badge-wrap">
    <AppTooltip label="Uso do plano Claude Code">
      <button class="usage-pill" :class="severity(headlinePercent)" @click="open = !open">
        <span class="usage-dot" />
        {{ headlinePercent }}%
      </button>
    </AppTooltip>

    <div v-if="open" class="usage-menu">
      <div v-if="session" class="usage-row">
        <div class="usage-row-head">
          <span>Sessão</span>
          <span>{{ session.percent }}%</span>
        </div>
        <div class="usage-bar">
          <div class="usage-bar-fill" :class="severity(session.percent)" :style="{ width: session.percent + '%' }" />
        </div>
        <div class="usage-reset">Reseta {{ formatReset(session.resetsAt) }}</div>
      </div>

      <div v-if="week" class="usage-row">
        <div class="usage-row-head">
          <span>Semana</span>
          <span>{{ week.percent }}%</span>
        </div>
        <div class="usage-bar">
          <div class="usage-bar-fill" :class="severity(week.percent)" :style="{ width: week.percent + '%' }" />
        </div>
        <div class="usage-reset">Reseta {{ formatReset(week.resetsAt) }}</div>
      </div>

      <div v-if="usageError" class="usage-stale">Não foi possível atualizar agora — mostrando o último valor.</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppTooltip from './AppTooltip.vue'
import { session, usageError, week } from '../store/accountUsageStore'

const open = ref(false)
const rootRef = ref(null)

// 'no-auth' é a única condição em que escondemos o badge de vez — o resto
// (rede caiu, 401 passageiro) mantém o último valor bom na tela via
// accountUsageStore, então o badge continua útil mesmo com usageError setado.
const visible = computed(() => (session.value || week.value) && usageError.value !== 'no-auth')

const headlinePercent = computed(() => Math.max(session.value?.percent ?? 0, week.value?.percent ?? 0))

function severity(percent) {
  if (percent >= 90) return 'danger'
  if (percent >= 70) return 'warn'
  return ''
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

const handleClickOutside = (event) => {
  if (rootRef.value && !rootRef.value.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside, { capture: true }))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside, { capture: true }))
</script>

<style scoped>
.usage-badge-wrap {
  position: relative;
  display: flex;
}

.usage-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--color-text-quaternary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.usage-pill:hover {
  background: var(--color-hover);
}

.usage-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}

.usage-pill.warn {
  color: #d97706;
}

.usage-pill.danger {
  color: #ef4444;
}

.usage-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 220px;
  padding: 10px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px var(--color-shadow);
}

.usage-row + .usage-row {
  margin-top: 10px;
}

.usage-row-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.usage-bar {
  height: 5px;
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
  margin-top: 3px;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.usage-stale {
  margin-top: 8px;
  font-size: 11px;
  color: var(--color-text-tertiary);
}
</style>
