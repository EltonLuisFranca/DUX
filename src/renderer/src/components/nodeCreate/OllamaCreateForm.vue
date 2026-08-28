<template>
  <div class="create-form">
    <button class="back-btn" @click="$emit('cancel')">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
      Voltar
    </button>

    <label class="field-label" for="new-node-host">Endereço do Ollama</label>
    <input
      id="new-node-host"
      v-model="host"
      class="field-input"
      type="text"
      placeholder="http://localhost:11434"
      autocomplete="off"
      @blur="fetchModels"
      @keyup.enter="fetchModels"
    />

    <label class="field-label" for="new-node-token">Token de autenticação (opcional)</label>
    <input
      id="new-node-token"
      v-model="token"
      class="field-input"
      type="password"
      placeholder="Bearer token, se o servidor exigir"
      autocomplete="off"
      @blur="fetchModels"
      @keyup.enter="fetchModels"
    />

    <label class="field-label" for="new-node-model">Modelo</label>
    <select id="new-node-model" v-model="selectedModel" class="field-input" :disabled="status !== 'ready'">
      <option v-if="status !== 'ready'" value="">{{ statusLabel }}</option>
      <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
    </select>

    <p class="status" :class="{ invalid: status === 'error' }">
      <span v-if="status === 'error'">Não foi possível conectar em {{ host }}. O Ollama está rodando?</span>
      <span v-else-if="status === 'ready' && !models.length">Nenhum modelo instalado nesse Ollama.</span>
    </p>

    <button class="btn-primary" :disabled="!canSubmit" @click="submit">Criar</button>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { listModels } from '../../lib/ollamaClient'

const emit = defineEmits(['submit', 'cancel'])

const host = ref('http://localhost:11434')
const token = ref('')
const models = ref([])
const selectedModel = ref('')
const status = ref('idle')
const detectedApi = ref('ollama')

const statusLabel = computed(() => {
  if (status.value === 'checking') return 'Buscando modelos...'
  if (status.value === 'error') return 'Falha ao conectar'
  return 'Nenhum modelo encontrado'
})

const canSubmit = computed(() => status.value === 'ready' && Boolean(selectedModel.value))

async function fetchModels() {
  const trimmed = host.value.trim().replace(/\/+$/, '')
  if (!trimmed) return
  host.value = trimmed
  status.value = 'checking'
  models.value = []
  selectedModel.value = ''
  try {
    const { api, models: list } = await listModels(trimmed, token.value.trim())
    detectedApi.value = api
    models.value = list
    selectedModel.value = models.value[0] || ''
    status.value = 'ready'
  } catch (err) {
    console.error('[ollama-node] failed to list models', err)
    status.value = 'error'
  }
}

function submit() {
  if (!canSubmit.value) return
  emit('submit', {
    name: selectedModel.value,
    host: host.value,
    token: token.value.trim(),
    model: selectedModel.value,
    api: detectedApi.value,
    messages: []
  })
}

onMounted(() => {
  fetchModels()
  nextTick(() => document.getElementById('new-node-host')?.focus())
})
</script>

<style scoped>
.create-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 14px;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  margin-bottom: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.back-btn:hover {
  color: var(--color-text-primary);
}

.field-label {
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

.field-input:disabled {
  color: var(--color-text-tertiary);
}

.status {
  min-height: 14px;
  margin: 0;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  word-break: break-word;
}

.status.invalid {
  color: #ff6b6b;
}

.btn-primary {
  height: 30px;
  margin-top: 4px;
  border: none;
  border-radius: 6px;
  background: #3b82f6;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:disabled {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  cursor: default;
}
</style>
