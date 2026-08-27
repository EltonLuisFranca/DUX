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
    <label class="field-label" for="node-cwd">Diretório (WSL)</label>
    <input
      id="node-cwd"
      v-model="cwdDraft"
      class="field-input"
      type="text"
      @keyup.enter="applyCwd"
    />

    <p class="status" :class="cwdStatus">
      <span v-if="cwdStatus === 'checking'">Verificando...</span>
      <span v-else-if="cwdStatus === 'invalid'">Diretório não encontrado no WSL.</span>
      <span v-else-if="cwdStatus === 'valid' && isDirty">{{ resolvedPath }}</span>
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
  node: { type: Object, required: true }
})

const cwdDraft = ref(props.node.data.cwd)
const cwdStatus = ref('idle')
const resolvedPath = ref('')
const isDirty = computed(() => cwdDraft.value !== props.node.data.cwd)
let debounceTimer = null

watch(
  () => props.node.id,
  () => {
    cwdDraft.value = props.node.data.cwd
    cwdStatus.value = 'idle'
  }
)

watch(cwdDraft, (value) => {
  clearTimeout(debounceTimer)
  if (value === props.node.data.cwd) {
    cwdStatus.value = 'idle'
    return
  }
  debounceTimer = setTimeout(async () => {
    cwdStatus.value = 'checking'
    const result = await checkWslPath(value)
    if (value !== cwdDraft.value) return
    cwdStatus.value = result.valid ? 'valid' : 'invalid'
    resolvedPath.value = result.resolved || ''
  }, 400)
})

function applyCwd() {
  if (cwdStatus.value !== 'valid') return
  updateNodeData(props.node.id, { cwd: cwdDraft.value })
}
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
