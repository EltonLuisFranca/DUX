<template>
  <div class="create-form">
    <button class="back-btn" @click="$emit('cancel')">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
      Voltar
    </button>

    <label class="field-label" for="new-note-path">Arquivo da nota (.md)</label>
    <div class="path-field">
      <input
        id="new-note-path"
        ref="pathInput"
        v-model="path"
        class="field-input"
        type="text"
        placeholder="~/meu-projeto/notas.md"
        autocomplete="off"
        @focus="handleFocus"
        @blur="showDropdown = false"
        @keyup.enter="submit"
      />

      <Teleport to="body">
        <ul v-if="showDropdown && entries.length" class="dir-list" :style="dropdownStyle">
          <li v-for="entry in entries" :key="entry" @mousedown.prevent="drillInto(entry)">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path
                d="M2 4.5a1 1 0 0 1 1-1h3l1.2 1.5H13a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5z"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
            {{ entry }}
          </li>
        </ul>
      </Teleport>
    </div>

    <p class="status" :class="status">
      <span v-if="status === 'checking'">Verificando...</span>
      <span v-else-if="status === 'invalid'">Diretório não encontrado.</span>
      <span v-else-if="status === 'valid-new'">Será criado: {{ resolvedPath }}</span>
      <span v-else-if="status === 'valid-existing'">Abrindo nota existente: {{ resolvedPath }}</span>
    </p>

    <button class="btn-primary" :disabled="!isValid" @click="submit">Criar</button>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { checkNotePath } from '../../lib/bridgeClient'

const emit = defineEmits(['submit', 'cancel'])

const path = ref('~/notas.md')
const status = ref('idle')
const resolvedPath = ref('')
const exists = ref(false)
const entries = ref([])
const showDropdown = ref(false)
const pathInput = ref(null)
const dropdownStyle = ref({})
let debounceTimer = null

const isValid = ref(false)

function handleFocus() {
  showDropdown.value = true
  const rect = pathInput.value?.getBoundingClientRect()
  if (!rect) return
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: 20
  }
}

async function validate() {
  const current = path.value
  status.value = 'checking'
  const result = await checkNotePath(current)
  if (current !== path.value) return

  resolvedPath.value = result.resolved || ''
  entries.value = result.entries || []
  exists.value = Boolean(result.exists)

  // precisa terminar em algo que pareça arquivo (tem extensão), não só um
  // diretório válido — senão "criar" salvaria a nota como diretório
  const looksLikeFile = /\.[a-zA-Z0-9]+$/.test(resolvedPath.value)

  if (!result.parentValid || !looksLikeFile) {
    status.value = 'invalid'
    isValid.value = false
    return
  }

  status.value = exists.value ? 'valid-existing' : 'valid-new'
  isValid.value = true
}

watch(path, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(validate, 400)
})

function drillInto(entry) {
  const trimmed = path.value.replace(/\/+$/, '')
  path.value = trimmed ? `${trimmed}/${entry}/` : `${entry}/`
  pathInput.value?.focus()
}

function submit() {
  if (!isValid.value) return
  const fileName = resolvedPath.value.split('/').pop()
  emit('submit', { name: fileName || 'Nota', path: resolvedPath.value })
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

.path-field {
  position: relative;
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

.dir-list {
  max-height: 160px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.dir-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--color-text-primary);
  cursor: pointer;
}

.dir-list li svg {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.dir-list li:hover {
  background: var(--color-hover);
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

.status.valid-new,
.status.valid-existing {
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
