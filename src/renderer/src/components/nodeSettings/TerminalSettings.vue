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

  <div v-if="isClaude" class="field">
    <label class="field-label" for="node-profile">Conta Claude</label>
    <select
      id="node-profile"
      class="field-input"
      :value="currentProfileId"
      @change="updateNodeData(node.id, { claudeProfileId: $event.target.value })"
    >
      <option v-for="p in claudeProfiles" :key="p.id" :value="p.id">
        {{ p.name }}{{ p.email ? ` — ${p.email}` : p.loggedIn ? '' : ' (sem login)' }}
      </option>
    </select>
    <p class="status">
      Trocar reinicia a sessão.
      <button class="link-btn" @click="openSettings('claude')">Gerenciar contas</button>
    </p>
  </div>

  <div class="field">
    <label class="field-label" for="node-cwd">{{ wslMode ? 'Diretório (WSL)' : 'Diretório' }}</label>
    <DirectoryPicker
      ref="picker"
      v-model="cwdDraft"
      input-id="node-cwd"
      @validated="onValidated"
      @submit="applyCwd"
    />

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
import { claudeProfiles, resolveClaudeProfile } from '../../store/claudeProfilesStore'
import { openSettings } from '../../store/themeStore'
import DirectoryPicker from './DirectoryPicker.vue'

const props = defineProps({
  node: { type: Object, required: true },
  wslMode: { type: Boolean, default: false }
})

const isClaude = computed(() => props.node.type === 'wsl-claude-terminal' || props.node.type === 'claude-terminal')
const currentProfileId = computed(() => resolveClaudeProfile(props.node.data.claudeProfileId)?.id)

const picker = ref(null)
const cwdDraft = ref(props.node.data.cwd)
const cwdStatus = ref('idle')
const resolvedPath = ref('')
const isDirty = computed(() => cwdDraft.value !== props.node.data.cwd)

function onValidated({ status, resolved }) {
  cwdStatus.value = status
  resolvedPath.value = resolved
}

watch(
  () => props.node.id,
  () => {
    cwdDraft.value = props.node.data.cwd
    cwdStatus.value = 'idle'
    picker.value?.validate()
  }
)

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

select.field-input {
  cursor: pointer;
}

.link-btn {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-accent);
  font-size: inherit;
  cursor: pointer;
}

.link-btn:hover {
  text-decoration: underline;
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
