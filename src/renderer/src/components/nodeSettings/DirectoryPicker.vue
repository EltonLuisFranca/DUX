<template>
  <div class="path-field">
    <input
      :id="inputId"
      ref="pathInput"
      :value="modelValue"
      class="field-input"
      type="text"
      autocomplete="off"
      @input="emit('update:modelValue', $event.target.value)"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown.up.prevent="moveHighlight(-1)"
      @keydown.down.prevent="moveHighlight(1)"
      @keyup.enter="handleEnter"
    />

    <!-- lista no fluxo da sidebar (não flutuando por cima): empurra o
         status e o botão de salvar pra baixo em vez de cobri-los, e fica
         dentro da sidebar no DOM, então clicar numa pasta não conta como
         "clique fora" (handleClickOutside do NodeSettingsSidebar) -->
    <ul v-if="showDropdown && listItems.length" class="dir-list">
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
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { checkWslPath } from '../../lib/bridgeClient'

// Campo de diretório com navegação: valida o caminho no bridge enquanto
// digita e abre um dropdown com ".." e as subpastas pra ir descendo/subindo
// (setas + Enter ou clique). Usado nas configurações de nodes que apontam
// pra uma pasta (terminal, git). O pai guarda o rascunho via v-model e
// recebe o resultado da validação em `validated` pra decidir se libera salvar.
const props = defineProps({
  modelValue: { type: String, default: '' },
  inputId: { type: String, default: undefined }
})

const emit = defineEmits(['update:modelValue', 'validated', 'submit'])

const status = ref('idle') // idle | checking | valid | invalid
const resolvedPath = ref('')
const entries = ref([])
const showDropdown = ref(false)
const pathInput = ref(null)
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

function setStatus(next) {
  status.value = next
  emit('validated', { status: next, resolved: resolvedPath.value })
}

async function validate() {
  const current = props.modelValue
  setStatus('checking')
  const result = await checkWslPath(current)
  if (current !== props.modelValue) return
  resolvedPath.value = result.resolved || ''
  entries.value = result.entries || []
  highlightedIndex.value = -1
  setStatus(result.valid ? 'valid' : 'invalid')
}

watch(
  () => props.modelValue,
  () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(validate, 400)
  }
)

function handleFocus() {
  showDropdown.value = true
  highlightedIndex.value = -1
}

// A lista fica no fluxo da página: fechar ela no blur faz o que está embaixo
// (ex: botão Salvar) subir. Se o blur veio de um clique, esse clique só
// completa no mouseup — fechando já no mousedown, o botão sai de baixo do
// cursor e o clique se perde. Então, com o mouse pressionado, espera soltar
// (e o click ser despachado) antes de fechar.
let pointerIsDown = false
const onPointerDown = () => (pointerIsDown = true)
const onPointerUp = () => (pointerIsDown = false)
window.addEventListener('pointerdown', onPointerDown, true)
window.addEventListener('pointerup', onPointerUp, true)
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('pointerup', onPointerUp, true)
})

function handleBlur() {
  if (!pointerIsDown) {
    showDropdown.value = false
    return
  }
  window.addEventListener(
    'pointerup',
    () =>
      setTimeout(() => {
        if (document.activeElement !== pathInput.value) showDropdown.value = false
      }, 0),
    { once: true }
  )
}

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
  const trimmed = props.modelValue.replace(/\/+$/, '')
  emit('update:modelValue', trimmed ? `${trimmed}/${entry}` : entry)
  pathInput.value?.focus()
}

function goUp() {
  emit('update:modelValue', parentOf(resolvedPath.value))
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
    emit('submit')
  }
}

// revalida na hora (sem debounce) — ex: o sidebar trocou de node
defineExpose({ validate })

validate()
</script>

<style scoped>
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
  margin: 4px 0 0;
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
</style>
