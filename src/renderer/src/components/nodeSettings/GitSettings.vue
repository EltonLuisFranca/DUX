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
    <label class="field-label" for="node-git-path">Repositório</label>
    <DirectoryPicker
      ref="picker"
      v-model="pathDraft"
      input-id="node-git-path"
      @validated="onValidated"
      @submit="applyPath"
    />

    <p class="status" :class="pathStatus">
      <span v-if="isDirty && pathStatus === 'checking'">Verificando...</span>
      <span v-else-if="isDirty && pathStatus === 'invalid'">Diretório não encontrado.</span>
      <span v-else-if="isDirty && pathStatus === 'valid'">{{ resolvedPath }}</span>
    </p>

    <button v-if="isDirty" class="btn-primary" :disabled="pathStatus !== 'valid'" @click="applyPath">
      Salvar
    </button>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { updateNodeData } from '../../store/flowStore'
import DirectoryPicker from './DirectoryPicker.vue'

const props = defineProps({
  node: { type: Object, required: true }
})

const picker = ref(null)
const pathDraft = ref(props.node.data.path || '~')
const pathStatus = ref('idle')
const resolvedPath = ref('')
// o node guarda o caminho já resolvido (absoluto, como o GitCreateForm salva),
// então "~/x" digitado que resolve pro mesmo lugar não conta como mudança
const isDirty = computed(() => {
  if (pathDraft.value === props.node.data.path) return false
  return !(pathStatus.value === 'valid' && resolvedPath.value === props.node.data.path)
})

function onValidated({ status, resolved }) {
  pathStatus.value = status
  resolvedPath.value = resolved
}

watch(
  () => props.node.id,
  () => {
    pathDraft.value = props.node.data.path || '~'
    pathStatus.value = 'idle'
    picker.value?.validate()
  }
)

// GitNode observa data.path e recarrega o status sozinho
function applyPath() {
  if (pathStatus.value !== 'valid' || !isDirty.value) return
  updateNodeData(props.node.id, { path: resolvedPath.value })
  pathDraft.value = resolvedPath.value
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
  background: var(--color-accent);
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
