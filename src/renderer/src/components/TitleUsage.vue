<template>
  <div v-if="visible" class="tu">
    <div
      v-for="item in items"
      :key="item.key"
      class="tu-item"
      @mouseenter="openKey = item.key"
      @mouseleave="openKey = null"
    >
      <span class="tu-short">{{ item.short }}</span>
      <span class="tu-bar">
        <span class="tu-bar-fill" :class="severity(item.data.percent)" :style="{ width: clamp(item.data.percent) + '%' }" />
      </span>
      <span class="tu-pct" :class="severity(item.data.percent)">{{ item.data.percent }}%</span>

      <div v-if="openKey === item.key" class="tu-menu">
        <div v-if="focusedProfileLabel" class="tu-profile">{{ focusedProfileLabel }}</div>
        <div class="tu-row-head">
          <span>{{ item.label }}</span>
          <span>{{ item.data.percent }}%</span>
        </div>
        <div class="tu-track">
          <div class="tu-track-fill" :class="severity(item.data.percent)" :style="{ width: clamp(item.data.percent) + '%' }" />
        </div>
        <div class="tu-reset">Reseta {{ formatReset(item.data.resetsAt) }}</div>
        <div v-if="usageError === 'expired'" class="tu-stale">
          Login deste perfil está parado — abra um terminal nele pra renovar.
        </div>
        <div v-else-if="usageError" class="tu-stale">Não foi possível atualizar agora — mostrando o último valor.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { focusedProfileLabel, session, usageError, week } from '../store/accountUsageStore'
import { formatReset, usageSeverity } from '../lib/claudeUsageFormat'

const openKey = ref(null)
const severity = usageSeverity

const visible = computed(() => (session.value || week.value) && usageError.value !== 'no-auth')

const items = computed(() =>
  [
    session.value && { key: 'session', label: 'Sessão', short: '5h', data: session.value },
    week.value && { key: 'week', label: 'Semana', short: '7d', data: week.value }
  ].filter(Boolean)
)

function clamp(p) {
  return Math.min(100, Math.max(0, p))
}
</script>

<style scoped>
.tu {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 28px;
  padding: 0 11px;
  border-radius: 8px;
  background: var(--color-bg-surface-raised);
  border: 1px solid var(--color-border);
}

.tu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-secondary);
}

.tu-short {
  color: var(--color-text-tertiary);
}

.tu-bar {
  display: block;
  width: 34px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border);
  overflow: hidden;
}

.tu-bar-fill {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--color-text-primary);
}

.tu-bar-fill.warn {
  background: var(--color-status-waiting);
}

.tu-bar-fill.danger {
  background: var(--color-status-error);
}

.tu-pct {
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.tu-pct.warn {
  color: var(--color-status-waiting);
}

.tu-pct.danger {
  color: var(--color-status-error);
}

/* popover abre pra baixo (barra de título fica no topo) */
.tu-menu {
  position: absolute;
  top: calc(100% + 12px);
  right: -8px;
  width: 230px;
  padding: 12px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 12px 32px var(--color-shadow);
  font-family: var(--font-sans);
  z-index: 40;
}

.tu-profile {
  margin-bottom: 6px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
}

.tu-row-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-primary);
  margin-bottom: 5px;
}

.tu-track {
  height: 6px;
  border-radius: 3px;
  background: var(--color-border);
  overflow: hidden;
}

.tu-track-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--color-text-tertiary);
}

.tu-track-fill.warn {
  background: var(--color-status-waiting);
}

.tu-track-fill.danger {
  background: var(--color-status-error);
}

.tu-reset {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.tu-stale {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--color-text-tertiary);
}
</style>
