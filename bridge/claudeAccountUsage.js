const fs = require('fs')
const os = require('os')
const path = require('path')
const { WebSocket } = require('ws')
const claudeProfiles = require('./claudeProfiles')

// O /usage do Claude Code chama esse mesmo endpoint (confirmado lendo o
// próprio binário da CLI) com o access token OAuth salvo por ela em
// .credentials.json — não é uma API pública documentada, então o formato da
// resposta pode mudar entre versões da CLI sem aviso.
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
// Dono real do token. O oauthAccount do .claude.json pode ficar defasado em
// relação ao .credentials.json (já vimos um perfil mostrar um e-mail com o
// token de outra conta) — nesse caso dois perfis "diferentes" gastam a mesma
// licença e nada na tela denuncia. Por isso a identidade exibida vem daqui.
const PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile'

// Limite de plano é conta inteira, não por sessão — não faz sentido repetir
// a leitura a cada 3s por terminal aberto (como o claudeUsage.js de contexto
// faz). Um poll global e compartilhado entre todos os watchers já bastam,
// agora um fetch por perfil logado (ver claudeProfiles.js).
const POLL_MS = 60000
// Login/logout feito num terminal (o /login grava .credentials.json) precisa
// aparecer nas configurações sem esperar o próximo poll de uso — reler a
// lista de perfis é só ler meia dúzia de JSONs pequenos, dá pra ser frequente.
const PROFILES_CHECK_MS = 4000
// "Atualizar agora" na tela de configurações não pode virar spam no endpoint
// — ele tem rate limit (429) e é o mesmo que a própria CLI usa.
const MIN_FORCED_REFRESH_MS = 30000
// Depois de um 429 o perfil fica de fora dos polls por um tempo (ou pelo que
// o Retry-After pedir), em vez de insistir a cada minuto e prolongar o bloqueio.
const RATE_LIMIT_BACKOFF_MS = 5 * 60000

// Último valor bom por perfil, persistido: a CLI só renova o access token
// quando roda, então um perfil parado há dias fica com token expirado e sem
// como consultar — melhor mostrar o último uso conhecido (com a data) do que
// nada.
const CACHE_PATH = path.join(os.homedir(), '.dux', 'claude-usage-cache.json')

let usageByProfile = loadCache() // profileId -> { ...usage, fetchedAt, error }
let lastProfilesJson = null
let pollTimer = null
let profilesTimer = null
let polling = false
const lastForcedAt = new Map()
const backoffUntil = new Map() // profileId -> timestamp
// profileId -> { token, accountUuid, email, displayName, organization }. Só em
// memória, e o token nunca sai daqui: serve pra consultar de novo apenas quando
// ele muda (renovação a cada poucas horas ou um /login novo).
const identityByProfile = new Map()
const subscribers = new Set()

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function saveCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify(usageByProfile))
  } catch {
    // cache é só conveniência — falhar aqui não afeta o poll
  }
}

function pickLimit(entry) {
  if (!entry || typeof entry.utilization !== 'number') return null
  return { percent: Math.round(entry.utilization), resetsAt: entry.resets_at || null }
}

function pickExtra(extra) {
  if (!extra || typeof extra !== 'object') return null
  return {
    enabled: !!extra.is_enabled,
    used: typeof extra.used_credits === 'number' ? extra.used_credits : null,
    limit: typeof extra.monthly_limit === 'number' ? extra.monthly_limit : null,
    percent: typeof extra.utilization === 'number' ? Math.round(extra.utilization) : null,
    currency: extra.currency || null,
    decimals: typeof extra.decimal_places === 'number' ? extra.decimal_places : 2
  }
}

function pickBreakdown(breakdown) {
  const rows = breakdown?.rows
  if (!Array.isArray(rows)) return null
  return rows
    .filter((r) => r && typeof r.percent === 'number')
    .map((r) => ({ key: r.key, label: r.display_name || r.key, percent: Math.round(r.percent) }))
}

async function fetchUsage(profile) {
  const oauth = claudeProfiles.readOauth(profile)
  if (!oauth?.accessToken) return { error: 'no-auth' }
  // A CLI renova o token sozinha enquanto está rodando; o bridge não mexe no
  // refresh token (trocá-lo por fora poderia derrubar o login da própria
  // CLI). Token vencido = perfil parado, só avisa.
  if (oauth.expiresAt && oauth.expiresAt < Date.now()) return { error: 'expired' }

  let res
  try {
    res = await fetch(USAGE_URL, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oauth.accessToken}` }
    })
  } catch {
    return { error: 'network' }
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'))
    return { error: 'rate-limited', retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_BACKOFF_MS }
  }
  if (!res.ok) return { error: res.status === 401 ? 'unauthorized' : 'http-error' }

  let data
  try {
    data = await res.json()
  } catch {
    return { error: 'bad-response' }
  }

  return {
    session: pickLimit(data.five_hour),
    week: pickLimit(data.seven_day),
    weekOpus: pickLimit(data.seven_day_opus),
    weekSonnet: pickLimit(data.seven_day_sonnet),
    extra: pickExtra(data.extra_usage),
    breakdown: pickBreakdown(data.seven_day_breakdown)
  }
}

// Falha aqui (rede, 429) não atrapalha o uso: a tela segue com a identidade
// anterior ou a do .claude.json, e o próximo poll tenta de novo.
async function verifyIdentity(profile) {
  const oauth = claudeProfiles.readOauth(profile)
  const known = identityByProfile.get(profile.id)
  if (!oauth?.accessToken || known?.token === oauth.accessToken) return
  if (oauth.expiresAt && oauth.expiresAt < Date.now()) return

  let data
  try {
    const res = await fetch(PROFILE_URL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oauth.accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20'
      }
    })
    if (!res.ok) return
    data = await res.json()
  } catch {
    return
  }
  if (!data?.account?.uuid) return

  // /login em outra conta: uso guardado e bloqueio de 429 eram da conta antiga
  if (known && known.accountUuid !== data.account.uuid) {
    delete usageByProfile[profile.id]
    backoffUntil.delete(profile.id)
    lastForcedAt.delete(profile.id)
  }

  identityByProfile.set(profile.id, {
    token: oauth.accessToken,
    accountUuid: data.account.uuid,
    email: data.account.email || null,
    displayName: data.account.display_name || data.account.full_name || null,
    organization: data.organization?.name || null
  })
}

// listProfiles() só enxerga os arquivos locais; aqui entra o que o servidor
// disse sobre o token de cada perfil, quando já se sabe.
function listVerifiedProfiles() {
  return claudeProfiles.listProfiles().map((profile) => {
    const identity = profile.loggedIn ? identityByProfile.get(profile.id) : null
    if (!identity) return profile
    return {
      ...profile,
      accountUuid: identity.accountUuid,
      email: identity.email || profile.email,
      displayName: identity.displayName || profile.displayName,
      organization: identity.organization || profile.organization
    }
  })
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload))
}

function broadcast(payload) {
  for (const ws of subscribers) send(ws, payload)
}

function usageMessage(profileId) {
  return { type: 'accountUsageUpdate', profileId, ...usageByProfile[profileId] }
}

// Num erro (rede, token vencido) mantém o último valor bom e só anota o erro
// — o renderer decide como sinalizar "desatualizado" com base em fetchedAt.
function store(profileId, result) {
  const previous = usageByProfile[profileId] || {}
  usageByProfile[profileId] = result.error
    ? { ...previous, error: result.error }
    : { ...result, error: null, fetchedAt: new Date().toISOString() }
}

async function pollProfile(profile) {
  const result = await fetchUsage(profile)
  if (result.retryAfterMs) {
    backoffUntil.set(profile.id, Date.now() + result.retryAfterMs)
    delete result.retryAfterMs
  }
  store(profile.id, result)
  broadcast(usageMessage(profile.id))
}

function inBackoff(profileId) {
  return (backoffUntil.get(profileId) || 0) > Date.now()
}

async function pollAll() {
  if (polling) return
  polling = true
  try {
    for (const profile of claudeProfiles.listProfiles()) {
      if (!profile.loggedIn) {
        identityByProfile.delete(profile.id)
        store(profile.id, { error: 'no-auth' })
        broadcast(usageMessage(profile.id))
        continue
      }
      // antes do backoff: é um endpoint à parte, e um /login novo tira o
      // perfil do bloqueio da conta anterior
      const resolved = claudeProfiles.resolveProfile(profile.id)
      await verifyIdentity(resolved)
      if (inBackoff(profile.id)) continue
      await pollProfile(resolved)
    }
    saveCache()
  } finally {
    polling = false
  }
}

function checkProfiles() {
  const profiles = listVerifiedProfiles()
  const json = JSON.stringify(profiles)
  if (json === lastProfilesJson) return
  const previous = lastProfilesJson ? JSON.parse(lastProfilesJson) : []
  lastProfilesJson = json
  broadcast({ type: 'claudeProfiles', profiles })

  // token novo (primeiro login, /login em outra conta ou renovação) não espera
  // o próximo ciclo de 60s
  const previousTokens = new Map(previous.map((p) => [p.id, p.tokenExpiresAt]))
  if (profiles.some((p) => p.loggedIn && previousTokens.get(p.id) !== p.tokenExpiresAt)) pollAll()

  // perfil apagado: some do cache também
  const ids = new Set(profiles.map((p) => p.id))
  for (const id of Object.keys(usageByProfile)) {
    if (!ids.has(id)) delete usageByProfile[id]
  }
  for (const id of identityByProfile.keys()) {
    if (!ids.has(id)) identityByProfile.delete(id)
  }
}

function ensurePolling() {
  if (pollTimer) return
  checkProfiles()
  pollAll()
  pollTimer = setInterval(pollAll, POLL_MS)
  profilesTimer = setInterval(checkProfiles, PROFILES_CHECK_MS)
}

function stopPollingIfIdle() {
  if (subscribers.size > 0 || !pollTimer) return
  clearInterval(pollTimer)
  clearInterval(profilesTimer)
  pollTimer = null
  profilesTimer = null
  lastProfilesJson = null
}

function subscribe(ws) {
  subscribers.add(ws)
  send(ws, { type: 'claudeProfiles', profiles: listVerifiedProfiles() })
  for (const id of Object.keys(usageByProfile)) send(ws, usageMessage(id))
  ensurePolling()
}

function unsubscribe(ws) {
  subscribers.delete(ws)
  stopPollingIfIdle()
}

function refresh(profileId) {
  const last = lastForcedAt.get(profileId) || 0
  if (Date.now() - last < MIN_FORCED_REFRESH_MS || inBackoff(profileId)) {
    broadcast(usageMessage(profileId))
    return
  }
  lastForcedAt.set(profileId, Date.now())
  pollProfile(claudeProfiles.resolveProfile(profileId)).then(saveCache)
}

// Chamado depois de criar/renomear/apagar um perfil — força o broadcast da
// lista nova pra todo mundo em vez de esperar o próximo checkProfiles.
function profilesChanged() {
  lastProfilesJson = null
  checkProfiles()
  saveCache()
}

module.exports = { subscribe, unsubscribe, refresh, profilesChanged }
