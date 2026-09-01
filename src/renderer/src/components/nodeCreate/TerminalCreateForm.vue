<template>
  <div class="create-form">
    <button class="back-btn" @click="$emit('cancel')">
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
      Voltar
    </button>

    <label class="field-label" for="new-node-cwd">{{ wslMode ? 'Diretório no WSL' : 'Diretório' }}</label>
    <div class="path-field">
      <input
        id="new-node-cwd"
        ref="pathInput"
        v-model="path"
        class="field-input"
        type="text"
        placeholder="~/meu-projeto"
        autocomplete="off"
        @focus="handleFocus"
        @blur="showDropdown = false"
        @keydown.up.prevent="moveHighlight(-1)"
        @keydown.down.prevent="moveHighlight(1)"
        @keyup.enter="handleEnter"
      />

      <Teleport to="body">
        <ul v-if="showDropdown && listItems.length" class="dir-list" :style="dropdownStyle">
          <li
            v-for="(item, i) in listItems"
            :key="item.type + item.label"
            :ref="(el) => { if (el) itemRefs[i] = el }"
            :class="{ active: highlightedIndex === i }"
            @mousedown.prevent="selectItem(item)"
            @mouseenter="highlightedIndex = i"
          >
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path
                d="M2 4.5a1 1 0 0 1 1-1h3l1.2 1.5H13a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5z"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
            {{ item.label }}
          </li>
        </ul>
      </Teleport>
    </div>

    <p class="status" :class="status">
      <span v-if="status === 'checking'">Verificando...</span>
      <span v-else-if="status === 'invalid'">{{ wslMode ? 'Diretório não encontrado no WSL.' : 'Diretório não encontrado.' }}</span>
      <span v-else-if="status === 'valid'">{{ resolvedPath }}</span>
    </p>

    <button class="btn-primary" :disabled="status !== 'valid'" @click="submit">Criar</button>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { checkWslPath } from '../../lib/bridgeClient'

const props = defineProps({
  wslMode: { type: Boolean, default: false },
  command: { type: String, default: '' }
})

const emit = defineEmits(['submit', 'cancel'])

const path = ref('~')
const status = ref('idle')
const resolvedPath = ref('')
const entries = ref([])
const showDropdown = ref(false)
const pathInput = ref(null)
const dropdownStyle = ref({})
const highlightedIndex = ref(-1)
let itemRefs = []
let debounceTimer = null

// pai de um path absoluto, sem depender de node:path no renderer — cobre
// tanto separador WSL ("/") quanto Windows ("C:\"), pra alimentar o item
// ".." do dropdown
function parentOf(target) {
  const trimmed = target.replace(/[\\/]+$/, '')
  if (!trimmed || /^[a-zA-Z]:$/.test(trimmed)) return target
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (idx < 0) return target
  const parent = trimmed.slice(0, idx)
  if (!parent) return trimmed[0]
  return /^[a-zA-Z]:$/.test(parent) ? `${parent}\\` : parent
}

const listItems = computed(() => {
  const items = []
  if (status.value === 'valid' && resolvedPath.value) {
    const parent = parentOf(resolvedPath.value)
    if (parent !== resolvedPath.value) items.push({ type: 'up', label: '..' })
  }
  entries.value.forEach((name) => items.push({ type: 'dir', label: name }))
  return items
})

function handleFocus() {
  showDropdown.value = true
  highlightedIndex.value = -1
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
  const result = await checkWslPath(current)
  if (current !== path.value) return
  status.value = result.valid ? 'valid' : 'invalid'
  resolvedPath.value = result.resolved || ''
  entries.value = result.entries || []
  highlightedIndex.value = -1
}

watch(path, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(validate, 400)
})

function moveHighlight(delta) {
  if (!showDropdown.value || !listItems.value.length) return
  const max = listItems.value.length - 1
  highlightedIndex.value =
    highlightedIndex.value < 0
      ? delta > 0
        ? 0
        : max
      : Math.min(max, Math.max(0, highlightedIndex.value + delta))
  nextTick(() => itemRefs[highlightedIndex.value]?.scrollIntoView({ block: 'nearest' }))
}

function drillInto(entry) {
  const trimmed = path.value.replace(/\/+$/, '')
  path.value = trimmed ? `${trimmed}/${entry}` : entry
  pathInput.value?.focus()
}

function goUp() {
  path.value = parentOf(resolvedPath.value)
  pathInput.value?.focus()
}

function selectItem(item) {
  if (item.type === 'up') goUp()
  else drillInto(item.label)
}

function handleEnter() {
  if (showDropdown.value && highlightedIndex.value >= 0 && listItems.value[highlightedIndex.value]) {
    selectItem(listItems.value[highlightedIndex.value])
  } else {
    submit()
  }
}

function submit() {
  if (status.value !== 'valid') return
  const payload = { name: 'Novo terminal', cwd: path.value }
  if (props.command) payload.command = props.command
  emit('submit', payload)
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

.dir-list li:hover,
.dir-list li.active {
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
