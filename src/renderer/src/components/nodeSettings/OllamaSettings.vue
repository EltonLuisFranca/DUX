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
    <label class="field-label" for="node-host">Endereço do Ollama</label>
    <input
      id="node-host"
      class="field-input"
      type="text"
      :value="node.data.host"
      @input="updateNodeData(node.id, { host: $event.target.value })"
    />
  </div>

  <div class="field">
    <label class="field-label" for="node-token">Token de autenticação</label>
    <input
      id="node-token"
      class="field-input"
      type="password"
      placeholder="Bearer token, se o servidor exigir"
      :value="node.data.token"
      @input="updateNodeData(node.id, { token: $event.target.value })"
    />
  </div>

  <div class="field">
    <label class="field-label" for="node-model">Modelo</label>
    <input
      id="node-model"
      class="field-input"
      type="text"
      :value="node.data.model"
      @input="updateNodeData(node.id, { model: $event.target.value })"
    />
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
</style>
