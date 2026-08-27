<template>
  <div class="create-form">
    <button class="back-btn" @click="$emit('cancel')">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
      Voltar
    </button>

    <label class="field-label" for="new-node-cwd">Diretório no WSL</label>
    <input
      id="new-node-cwd"
      ref="pathInput"
      v-model="path"
      class="field-input"
      type="text"
      placeholder="~/meu-projeto"
      @keyup.enter="submit"
    />

    <p class="status" :class="status">
      <span v-if="status === 'checking'">Verificando...</span>
      <span v-else-if="status === 'invalid'">Diretório não encontrado no WSL.</span>
      <span v-else-if="status === 'valid'">{{ resolvedPath }}</span>
    </p>

    <button class="btn-primary" :disabled="status !== 'valid'" @click="submit">Criar</button>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { checkWslPath } from '../../lib/bridgeClient'

const emit = defineEmits(['submit', 'cancel'])

const path = ref('~')
const status = ref('idle')
const resolvedPath = ref('')
const pathInput = ref(null)
let debounceTimer = null

async function validate() {
  const current = path.value
  status.value = 'checking'
  const result = await checkWslPath(current)
  if (current !== path.value) return
  status.value = result.valid ? 'valid' : 'invalid'
  resolvedPath.value = result.resolved || ''
}

watch(path, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(validate, 400)
})

function submit() {
  if (status.value !== 'valid') return
  emit('submit', { name: 'Novo terminal', cwd: path.value })
}

onMounted(() => {
  validate()
  nextTick(() => pathInput.value?.focus())
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

.status {
  min-height: 14px;
  margin: 0;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  word-break: break-all;
}

.status.invalid {
  color: #ff6b6b;
}

.status.valid {
  color: #4ade80;
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
