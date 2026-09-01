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
    <label class="field-label" for="node-cwd">{{ wslMode ? 'Diretório (WSL)' : 'Diretório' }}</label>
    <div class="path-field">
      <input
        id="node-cwd"
        ref="pathInput"
        v-model="cwdDraft"
        class="field-input"
        type="text"
        autocomplete="off"
        @focus="handleFocus"
        @blur="showDropdown = false"
        @keyup.enter="applyCwd"
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

    <p class="status" :class="cwdStatus">
      <span v-if="isDirty && cwdStatus === 'checking'">Verificando...</span>
      <span v-else-if="isDirty && cwdStatus === 'invalid'">{{ wslMode ? 'Diretório não encontrado no WSL.' : 'Diretório não encontrado.' }}</span>
      <span v-else-if="isDirty && cwdStatus === 'valid'">{{ resolvedPath }}</span>
    </p>

    <button v-if="isDirty" class="btn-primary" :disabled="cwdStatus !== 'valid'" @click="applyCwd">
      Salvar e reiniciar agente
    </button>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { updateNodeData } from '../../store/flowStore'
import { checkWslPath } from '../../lib/bridgeClient'

const props = defineProps({
  node: { type: Object, required: true },
  wslMode: { type: Boolean, default: false }
})

const cwdDraft = ref(props.node.data.cwd)
const cwdStatus = ref('idle')
const resolvedPath = ref('')
const entries = ref([])
const showDropdown = ref(false)
const pathInput = ref(null)
const dropdownStyle = ref({})
const isDirty = computed(() => cwdDraft.value !== props.node.data.cwd)
let debounceTimer = null

async function validate() {
  const current = cwdDraft.value
  cwdStatus.value = 'checking'
  const result = await checkWslPath(current)
  if (current !== cwdDraft.value) return
  cwdStatus.value = result.valid ? 'valid' : 'invalid'
  resolvedPath.value = result.resolved || ''
  entries.value = result.entries || []
}

watch(
  () => props.node.id,
  () => {
    cwdDraft.value = props.node.data.cwd
    cwdStatus.value = 'idle'
    validate()
  }
)

watch(cwdDraft, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(validate, 400)
})

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

function drillInto(entry) {
  const trimmed = cwdDraft.value.replace(/\/+$/, '')
  cwdDraft.value = trimmed ? `${trimmed}/${entry}` : entry
  pathInput.value?.focus()
}

function applyCwd() {
  if (cwdStatus.value !== 'valid') return
  updateNodeData(props.node.id, { cwd: cwdDraft.value })
}

validate()
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
  margin: 6px 0 0;
  font-size: 10.5px;
  line-height: 1.4;
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
  width: 100%;
  height: 28px;
  margin-top: 8px;
  border: none;
  border-radius: 6px;
  background: #3b82f6;
  color: #fff;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:disabled {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  cursor: default;
}
</style>
