<template>
  <div class="field">
    <span class="field-label">Cor do header</span>
    <div class="swatches">
      <button
        v-for="color in presetColors"
        :key="color"
        class="swatch"
        :class="{ active: node.data.headerColor === color }"
        :style="{ background: color }"
        :title="color"
        @click="setColor(color)"
      />
      <label class="swatch custom-swatch" title="Cor customizada">
        <input type="color" class="color-input" :value="node.data.headerColor || '#1e1e22'" @input="setColor($event.target.value)" />
      </label>
    </div>

    <button v-if="node.data.headerColor" class="reset-link" @click="resetColor">Usar cor padrão</button>
  </div>
</template>

<script setup>
import { updateNodeData } from '../store/flowStore'

const props = defineProps({
  node: { type: Object, required: true }
})

const presetColors = ['#1e1e22', '#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#db2777', '#0891b2']

function setColor(color) {
  updateNodeData(props.node.id, { headerColor: color })
}

function resetColor() {
  updateNodeData(props.node.id, { headerColor: null })
}
</script>

<style scoped>
.field {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}

.swatch.active {
  border-color: var(--color-text-primary);
}

.custom-swatch {
  position: relative;
  display: flex;
  overflow: hidden;
  background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
}

.color-input {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  border: none;
  padding: 0;
  cursor: pointer;
  opacity: 0;
}

.reset-link {
  display: block;
  margin-top: 10px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11px;
  text-decoration: underline;
  cursor: pointer;
}

.reset-link:hover {
  color: var(--color-text-primary);
}
</style>
