import { computed, ref } from 'vue'
import { watchClaudeAccounts } from '../lib/bridgeClient'

// Perfis de conta do Claude Code (cada um = uma pasta CLAUDE_CONFIG_DIR com
// seu próprio login, ver bridge/claudeProfiles.js) e o limite de plano de
// cada um. Singleton de módulo, mesmo padrão do notificationSoundStore.js —
// quem lê: aba "Contas Claude" das configurações, seletor de perfil do node
// de terminal e o ClaudeUsageDock (via accountUsageStore.js).

export const DEFAULT_PROFILE_ID = 'default'

// [{ id, name, configDir, isDefault, loggedIn, plan, email, displayName, organization, tokenExpiresAt, accountUuid }]
// accountUuid só existe depois que o bridge confirma o dono do token no servidor
export const claudeProfiles = ref([])
// profileId -> { session, week, weekOpus, weekSonnet, extra, breakdown, fetchedAt, error }
export const usageByProfile = ref({})
export const bridgeReady = ref(false)

const pending = new Map()

const connection = watchClaudeAccounts((msg) => {
  if (msg.type === 'claudeProfiles') {
    bridgeReady.value = true
    claudeProfiles.value = msg.profiles || []
  } else if (msg.type === 'accountUsageUpdate') {
    const { type, profileId, ...usage } = msg
    usageByProfile.value = { ...usageByProfile.value, [profileId]: usage }
  } else if (msg.type === 'claudeProfileResult') {
    const resolve = pending.get(msg.requestId)
    if (!resolve) return
    pending.delete(msg.requestId)
    resolve(msg)
  }
})

function request(message) {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID()
    if (!connection.send({ ...message, requestId })) {
      resolve({ ok: false, error: 'O bridge ainda não está conectado. Tente de novo em alguns segundos.' })
      return
    }
    pending.set(requestId, resolve)
    setTimeout(() => {
      if (!pending.has(requestId)) return
      pending.delete(requestId)
      resolve({ ok: false, error: 'O bridge não respondeu.' })
    }, 8000)
  })
}

export function createClaudeProfile(name, { shareConfig = true } = {}) {
  return request({ type: 'claudeProfileCreate', name, shareConfig })
}

export function renameClaudeProfile(id, name) {
  return request({ type: 'claudeProfileRename', id, name })
}

export function deleteClaudeProfile(id) {
  return request({ type: 'claudeProfileDelete', id })
}

export function refreshClaudeUsage(profileId) {
  connection.send({ type: 'refreshAccountUsage', profileId })
}

// Mesmo fallback do bridge (resolveProfile): id desconhecido — perfil
// apagado, node sincronizado de outra máquina — é tratado como o padrão.
export function resolveClaudeProfile(id) {
  const list = claudeProfiles.value
  return list.find((p) => p.id === id) || list.find((p) => p.isDefault) || null
}

export const hasMultipleProfiles = computed(() => claudeProfiles.value.length > 1)

export const PLAN_LABELS = {
  free: 'Free',
  pro: 'Pro',
  max: 'Max',
  team: 'Team',
  enterprise: 'Enterprise'
}

export function planLabel(profile) {
  if (!profile?.plan) return null
  return PLAN_LABELS[profile.plan] || profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1)
}
