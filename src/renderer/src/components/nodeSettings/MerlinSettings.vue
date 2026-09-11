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

  <div class="field">
    <label class="field-label" for="node-voice">Voz da resposta</label>
    <select
      id="node-voice"
      class="field-input"
      :value="node.data.voiceId || AVAILABLE_VOICES[0].id"
      @change="updateNodeData(node.id, { voiceId: $event.target.value })"
    >
      <option v-for="voice in AVAILABLE_VOICES" :key="voice.id" :value="voice.id">{{ voice.label }}</option>
    </select>
  </div>

  <div class="field field-row">
    <label class="field-label" for="node-voice-output">Falar respostas em voz alta</label>
    <input
      id="node-voice-output"
      type="checkbox"
      :checked="node.data.voiceOutputEnabled ?? true"
      @change="updateNodeData(node.id, { voiceOutputEnabled: $event.target.checked })"
    />
  </div>

  <div class="field">
    <label class="field-label" for="node-system-prompt">Prompt de sistema</label>
    <textarea
      id="node-system-prompt"
      class="field-input field-textarea"
      rows="5"
      :value="node.data.systemPrompt || DEFAULT_MERLIN_SYSTEM_PROMPT"
      @input="updateNodeData(node.id, { systemPrompt: $event.target.value })"
    ></textarea>
  </div>
</template>

<script setup>
import { updateNodeData } from '../../store/flowStore'
import { AVAILABLE_VOICES } from '../../store/ttsStore'
import { DEFAULT_MERLIN_SYSTEM_PROMPT } from '../../lib/merlinPrompt'

defineProps({
  node: { type: Object, required: true }
})
</script>

<style scoped>
.field {
  margin-bottom: 16px;
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-row .field-label {
  margin-bottom: 0;
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

.field-textarea {
  height: auto;
  padding: 8px;
  resize: vertical;
  font-family: inherit;
  line-height: 1.4;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}
</style>
