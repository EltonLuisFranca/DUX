<template>
  <div class="settings-row" :class="{ stacked, disabled }">
    <div class="row-text">
      <span class="row-label">
        {{ label }}
        <span v-if="value !== null && value !== ''" class="row-value">{{ value }}</span>
      </span>
      <span v-if="hint || $slots.hint" class="row-hint"><slot name="hint">{{ hint }}</slot></span>
    </div>
    <div class="row-control"><slot /></div>
  </div>
</template>

<script setup>
// Uma configuração: rótulo (+ dica) à esquerda e o controle à direita. Controles
// largos (grade de opções, textarea, slider) usam `stacked` e descem pra linha
// de baixo ocupando a largura toda.
defineProps({
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  value: { type: [String, Number], default: null },
  stacked: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})
</script>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 48px;
  padding: 10px 14px;
}

.settings-row.stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.settings-row.disabled .row-text {
  opacity: 0.5;
}

.row-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.row-label {
  font-size: 12.5px;
  color: var(--color-text-primary);
}

.row-value {
  margin-left: 4px;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.row-hint {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--color-text-tertiary);
}

.row-control {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  max-width: 60%;
}

.settings-row.stacked .row-control {
  max-width: none;
  flex-shrink: 1;
  flex-direction: column;
  align-items: stretch;
}
</style>
