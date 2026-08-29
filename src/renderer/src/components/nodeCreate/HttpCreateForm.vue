<template>
  <div class="create-form">
    <button class="back-btn" @click="$emit('cancel')">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
      Voltar
    </button>

    <label class="field-label" for="new-http-url">URL</label>
    <input
      id="new-http-url"
      ref="urlInput"
      v-model="url"
      class="field-input"
      type="text"
      placeholder="https://api.exemplo.com/endpoint"
      autocomplete="off"
      @keyup.enter="submit"
    />

    <p class="status" :class="{ invalid: url && !isValid }">
      <span v-if="url && !isValid">URL inválida.</span>
    </p>

    <button class="btn-primary" :disabled="!isValid" @click="submit">Criar</button>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'

const emit = defineEmits(['submit', 'cancel'])

const url = ref('https://')
const urlInput = ref(null)

function normalize(value) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const isValid = computed(() => {
  try {
    const normalized = normalize(url.value)
    if (!normalized) return false
    const parsed = new URL(normalized)
    return parsed.hostname === 'localhost' || parsed.hostname.includes('.')
  } catch {
    return false
  }
})

function submit() {
  if (!isValid.value) return
  emit('submit', {
    name: 'Request',
    url: normalize(url.value),
    method: 'GET',
    headers: [{ key: '', value: '' }],
    body: ''
  })
}

onMounted(() => {
  nextTick(() => {
    urlInput.value?.focus()
    urlInput.value?.select()
  })
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
