<template>
  <SettingsGroup title="Contas conectadas" bare>
    <template #actions>
      <button v-if="!adding" class="st-btn st-btn--small st-btn--primary" :disabled="!bridgeReady" @click="startAdding">
        + Adicionar conta
      </button>
    </template>

    <form v-if="adding" class="add-card" @submit.prevent="create">
      <div class="add-head">
        <span class="add-title">Nova conta Claude</span>
        <span class="add-sub">Depois de criar, abrimos um terminal nela pra você fazer o login.</span>
      </div>
      <label class="add-field">
        <span class="add-label">Nome</span>
        <input
          ref="nameInput"
          v-model="newName"
          class="st-input"
          type="text"
          maxlength="40"
          placeholder="Ex: Trabalho, Cliente X, Max pessoal"
          @keydown.esc.stop="cancelAdding"
        />
      </label>
      <div class="add-toggle">
        <div class="add-toggle-text">
          <span class="add-label">Usar minhas configurações</span>
          <span class="add-hint">
            Compartilha settings.json, CLAUDE.md, skills, agents, commands e plugins da conta padrão. Login e histórico
            de conversas continuam separados.
          </span>
        </div>
        <ToggleSwitch v-model="shareConfig" label="Usar minhas configurações" />
      </div>
      <p v-if="createError" class="st-error-text">{{ createError }}</p>
      <div class="add-actions">
        <button type="button" class="st-btn" @click="cancelAdding">Cancelar</button>
        <button type="submit" class="st-btn st-btn--primary" :disabled="!newName.trim() || creating">
          {{ creating ? 'Criando…' : 'Criar e fazer login' }}
        </button>
      </div>
    </form>

    <p v-if="!bridgeReady" class="st-note">Conectando ao bridge…</p>

    <ClaudeAccountCard
      v-for="p in claudeProfiles"
      :key="p.id"
      :profile="p"
      :color="profileColor(p.id, claudeProfiles)"
      :terminal-count="terminalCounts[p.id] || 0"
      :now="now"
      @open-terminal="openTerminal(p)"
    />
  </SettingsGroup>

  <SettingsGroup title="Como funciona" bare>
    <ul class="how-list">
      <li>
        Cada conta é uma pasta de configuração separada do Claude Code, com login e histórico de conversas próprios. Elas
        ficam conectadas ao mesmo tempo, sem uma deslogar a outra.
      </li>
      <li>
        Troque a conta de um terminal pelo chip no cabeçalho dele ou nas configurações do node. Trocar reinicia a
        sessão, e o <code>--resume</code> só mostra as conversas da conta ativa.
      </li>
      <li>
        O uso é atualizado a cada minuto. Uma conta parada há dias pode ficar com o acesso vencido: basta abrir um
        terminal nela que o Claude Code renova sozinho.
      </li>
    </ul>
  </SettingsGroup>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  DEFAULT_PROFILE_ID,
  bridgeReady,
  claudeProfiles,
  createClaudeProfile,
  resolveClaudeProfile
} from '../../store/claudeProfilesStore'
import { addNode, workspaces } from '../../store/flowStore'
import { platform } from '../../lib/platform'
import { profileColor } from '../../lib/claudeProfileColors'
import SettingsGroup from './SettingsGroup.vue'
import ToggleSwitch from './ToggleSwitch.vue'
import ClaudeAccountCard from './ClaudeAccountCard.vue'

const CLAUDE_TERMINAL_TYPES = ['wsl-claude-terminal', 'claude-terminal']

// "atualizado há X" precisa andar sozinho com a aba aberta
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 30000)
onBeforeUnmount(() => clearInterval(clock))

// Terminais Claude (de todos os workspaces) usando cada conta — node sem
// claudeProfileId ou com um id que não existe mais conta como padrão.
const terminalCounts = computed(() => {
  const counts = {}
  for (const ws of workspaces.value) {
    for (const node of ws.nodes) {
      if (!CLAUDE_TERMINAL_TYPES.includes(node.type)) continue
      const id = resolveClaudeProfile(node.data.claudeProfileId)?.id || DEFAULT_PROFILE_ID
      counts[id] = (counts[id] || 0) + 1
    }
  }
  return counts
})

// Mesmo node que o AddNodeModal criaria: no Windows o Claude roda dentro do
// WSL, no Linux direto.
function openTerminal(profile) {
  const type = platform.features.wslClaudeTerminal ? 'wsl-claude-terminal' : 'claude-terminal'
  const data = { name: `Claude · ${profile.name}`, cwd: '~' }
  if (type === 'claude-terminal') data.command = 'claude'
  if (!profile.isDefault) data.claudeProfileId = profile.id
  addNode(type, data)
}

const adding = ref(false)
const newName = ref('')
const shareConfig = ref(true)
const creating = ref(false)
const createError = ref(null)
const nameInput = ref(null)

async function startAdding() {
  adding.value = true
  newName.value = ''
  createError.value = null
  await nextTick()
  nameInput.value?.focus()
}

function cancelAdding() {
  adding.value = false
}

async function create() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = true
  const res = await createClaudeProfile(name, { shareConfig: shareConfig.value })
  creating.value = false
  if (!res.ok) {
    createError.value = res.error
    return
  }
  adding.value = false
  openTerminal({ id: res.profileId, name, isDefault: false })
}
</script>

<style scoped>
.add-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-accent);
  border-radius: 12px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 12%, transparent);
}

.add-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.add-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.add-sub,
.add-hint {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--color-text-tertiary);
}

.add-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.add-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.add-toggle {
  display: flex;
  align-items: center;
  gap: 14px;
}

.add-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.add-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.how-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0 0 0 18px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--color-text-secondary);
}

.how-list code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--color-bg-surface-raised);
  font-size: 11px;
}
</style>
