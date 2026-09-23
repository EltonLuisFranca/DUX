<template>
  <div class="field">
    <label class="field-label" for="node-name">Nome do node</label>
    <input
      id="node-name"
      class="field-input"
      type="text"
      :value="node.data.name"
      @input="updateNodeData(node.id, { name: $event.target.value })"
    />
  </div>

  <div class="field">
    <label class="field-label" for="node-host">Docker host</label>
    <input
      id="node-host"
      class="field-input"
      type="text"
      placeholder="vazio = padrão local"
      :value="node.data.host"
      @input="updateNodeData(node.id, { host: $event.target.value })"
    />
    <span class="field-hint">
      Passado como <code>docker -H</code>. Exemplos: <code>tcp://host:2375</code>, <code>ssh://user@host</code>.
    </span>
  </div>
</template>

<script setup>
import { updateNodeData } from '../../store/flowStore'

defineProps({
  node: { type: Object, required: true }
})
</script>

<style scoped>
.field {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.field-input {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  box-sizing: border-box;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  color: var(--color-text-primary);
  font-size: 12px;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.field-hint {
  display: block;
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

.field-hint code {
  font-family: 'Menlo', Consolas, monospace;
}
</style>
