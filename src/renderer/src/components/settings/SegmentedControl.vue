<template>
  <div class="segmented" role="radiogroup">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      role="radio"
      class="segmented-btn"
      :class="{ active: opt.value === modelValue }"
      :aria-checked="opt.value === modelValue"
      @click="$emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: [String, Number, Boolean], default: null },
  options: { type: Array, required: true } // [{ value, label }]
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.segmented {
  display: inline-flex;
  padding: 2px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
}

.segmented-btn {
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11.5px;
  white-space: nowrap;
  cursor: pointer;
}

.segmented-btn:hover {
  color: var(--color-text-primary);
}

.segmented-btn.active {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-primary);
  box-shadow: 0 1px 2px var(--color-shadow);
}
</style>
