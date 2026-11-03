import { computed } from 'vue'
import { activeTerminalId, activeWorkspace } from './flowStore'
import { DEFAULT_PROFILE_ID, claudeProfiles, resolveClaudeProfile, usageByProfile } from './claudeProfilesStore'

// Limite do plano Claude Pro/Max (sessão de 5h + semana), o mesmo que a CLI
// mostra no /usage, do perfil "em foco" pro ClaudeUsageDock: o perfil do
// terminal Claude selecionado (activeTerminalId) ou, sem nenhum, o padrão.
// O estado de todos os perfis mora em claudeProfilesStore.js.
const CLAUDE_TERMINAL_TYPES = ['wsl-claude-terminal', 'claude-terminal']

export const focusedProfile = computed(() => {
  const node = activeWorkspace.value?.nodes.find((n) => n.id === activeTerminalId.value)
  const id = node && CLAUDE_TERMINAL_TYPES.includes(node.type) ? node.data.claudeProfileId : DEFAULT_PROFILE_ID
  return resolveClaudeProfile(id || DEFAULT_PROFILE_ID)
})

const focusedUsage = computed(() => usageByProfile.value[focusedProfile.value?.id ?? DEFAULT_PROFILE_ID] || null)

// Num erro transitório (rede, 401 momentâneo) o bridge mantém o último valor
// bom e só anota o erro — então session/week continuam na tela.
export const session = computed(() => focusedUsage.value?.session ?? null)
export const week = computed(() => focusedUsage.value?.week ?? null)
// 'no-auth' | 'expired' | 'unauthorized' | 'network' | 'http-error' | 'bad-response' | null
export const usageError = computed(() => focusedUsage.value?.error ?? null)

// nome do perfil só interessa quando existe mais de um
export const focusedProfileLabel = computed(() => (claudeProfiles.value.length > 1 ? focusedProfile.value?.name : null))
