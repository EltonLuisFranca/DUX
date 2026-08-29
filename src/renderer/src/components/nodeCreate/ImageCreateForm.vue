<template>
  <div class="create-form">
    <button class="back-btn" @click="$emit('cancel')">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
      Voltar
    </button>

    <label class="field-label">Imagem</label>

    <div v-if="preview" class="preview-wrap">
      <img :src="preview" class="preview-img" alt="" />
      <button class="btn-secondary" @click="pickFile">Trocar imagem</button>
    </div>
    <button v-else class="picker-btn" @click="pickFile">
      <svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3">
        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
        <circle cx="7.2" cy="8" r="1.5" />
        <path d="M3.5 14.5l4.2-4.2 2.3 2.3 3.2-3.6 3.3 3.3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>Escolher imagem...</span>
    </button>

    <p v-if="fileName" class="status valid">{{ fileName }}</p>

    <button class="btn-primary" :disabled="!preview" @click="submit">Criar</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['submit', 'cancel'])

const preview = ref('')
const fileName = ref('')

async function pickFile() {
  const result = await window.imageNodeAPI.openFile()
  if (!result.picked) return
  preview.value = result.dataUrl
  fileName.value = result.fileName
}

function submit() {
  if (!preview.value) return
  emit('submit', { name: fileName.value || 'Imagem', src: preview.value })
}
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

.picker-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 120px;
  border: 1.5px dashed var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.picker-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.preview-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-img {
  width: 100%;
  max-height: 140px;
  object-fit: contain;
  border-radius: 8px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
}

.btn-secondary {
  height: 28px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 11.5px;
  cursor: pointer;
}

.btn-secondary:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.status {
  min-height: 14px;
  margin: 0;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  word-break: break-all;
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
