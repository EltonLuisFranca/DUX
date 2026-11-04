<template>
  <button
    type="button"
    role="switch"
    class="toggle"
    :class="{ on: modelValue }"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="knob" />
  </button>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '' }
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.toggle {
  position: relative;
  width: 34px;
  height: 20px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  box-shadow: inset 0 0 0 1px var(--color-border-strong);
  cursor: pointer;
  transition: background 0.15s ease;
}

.toggle.on {
  background: var(--color-accent);
  box-shadow: none;
}

.toggle:disabled {
  opacity: 0.45;
  cursor: default;
}

.toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-accent) 50%, transparent);
  outline-offset: 2px;
}

.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
  transition: transform 0.15s ease;
}

.toggle.on .knob {
  transform: translateX(14px);
}
</style>
