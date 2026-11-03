<template>
  <div class="meter" :class="{ stale }">
    <div class="meter-head">
      <span class="meter-label">{{ label }}</span>
      <span class="meter-percent" :class="severity">{{ data.percent }}%</span>
    </div>
    <div class="meter-track">
      <div class="meter-fill" :style="{ width: `${clamped}%`, background: color }" />
    </div>
    <span class="meter-reset">Reseta {{ formatReset(data.resetsAt) }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatReset, usageColor, usageSeverity } from '../../lib/claudeUsageFormat'

const props = defineProps({
  label: { type: String, required: true },
  data: { type: Object, required: true }, // { percent, resetsAt }
  stale: { type: Boolean, default: false }
})

const clamped = computed(() => Math.min(100, Math.max(0, props.data.percent)))
const severity = computed(() => usageSeverity(props.data.percent))
const color = computed(() => usageColor(props.data.percent))
</script>

<style scoped>
.meter {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.meter.stale {
  opacity: 0.55;
}

.meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.meter-label {
  font-size: 11.5px;
  color: var(--color-text-secondary);
}

.meter-percent {
  font-size: 15px;
  font-weight: 650;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.meter-percent.warn {
  color: #d97706;
}

.meter-percent.danger {
  color: #ef4444;
}

.meter-track {
  height: 6px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease;
}

.meter-reset {
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}
</style>
