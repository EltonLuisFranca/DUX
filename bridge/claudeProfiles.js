const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

// Perfis de conta do Claude Code: cada um é só uma pasta de configuração
// diferente, apontada pra CLI via CLAUDE_CONFIG_DIR — credenciais
// (.credentials.json), conta (.claude.json), transcripts (projects/) e
// histórico ficam todos lá dentro, então N pastas = N logins independentes
// que coexistem sem um derrubar o outro.
//
// O perfil padrão é implícito e sempre existe: é o ~/.claude de sempre, rodado
// SEM CLAUDE_CONFIG_DIR. Não dá pra simplesmente setar CLAUDE_CONFIG_DIR=~/.claude
// pra ele — com a variável setada a CLI passa a procurar o .claude.json dentro
// da pasta (~/.claude/.claude.json) em vez de ~/.claude.json, e o login/
// onboarding existente "sumiria".
//
// O registro mora só nesta máquina (~/.dux), não no workspace sincronizado:
// a pasta e o login são locais. O node guarda só o profileId — numa máquina
// onde esse id não existe, resolveProfile() cai no padrão.

const HOME = os.homedir()
const DUX_DIR = path.join(HOME, '.dux')
const REGISTRY_PATH = path.join(DUX_DIR, 'claude-profiles.json')
const MANAGED_ROOT = path.join(DUX_DIR, 'claude-profiles')
const DEFAULT_CONFIG_DIR = path.join(HOME, '.claude')

const DEFAULT_PROFILE_ID = 'default'

// Itens do ~/.claude padrão que um perfil novo pode herdar via symlink —
// tudo que é "como eu gosto de trabalhar" (settings, CLAUDE.md global,
// skills/agents/commands/plugins), nada que seja da conta ou da sessão
// (.credentials.json, .claude.json, projects/, history.jsonl).
const SHAREABLE_ENTRIES = ['settings.json', 'CLAUDE.md', 'agents', 'commands', 'skills', 'plugins', 'keybindings.json']

function readRegistry() {
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
    return {
      defaultName: typeof raw.defaultName === 'string' ? raw.defaultName : null,
      profiles: Array.isArray(raw.profiles) ? raw.profiles.filter((p) => p && p.id && p.configDir) : []
    }
  } catch {
    return { defaultName: null, profiles: [] }
  }
}

function writeRegistry(registry) {
  fs.mkdirSync(DUX_DIR, { recursive: true })
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2))
}

function defaultProfile(registry) {
  return {
    id: DEFAULT_PROFILE_ID,
    name: registry.defaultName || 'Padrão',
    configDir: DEFAULT_CONFIG_DIR,
    isDefault: true
  }
}

function allProfiles() {
  const registry = readRegistry()
  return [defaultProfile(registry), ...registry.profiles.map((p) => ({ ...p, isDefault: false }))]
}

// id desconhecido (perfil apagado, node vindo de outra máquina via sync) cai
// no padrão em vez de falhar — o terminal abre logado na conta padrão.
function resolveProfile(id) {
  const profiles = allProfiles()
  return profiles.find((p) => p.id === id) || profiles[0]
}

function credentialsPathFor(profile) {
  return path.join(profile.configDir, '.credentials.json')
}

function accountFilePathFor(profile) {
  return profile.isDefault ? path.join(HOME, '.claude.json') : path.join(profile.configDir, '.claude.json')
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function readOauth(profile) {
  return readJson(credentialsPathFor(profile))?.claudeAiOauth || null
}

// Tudo que dá pra saber do perfil sem rede: se tem login, de qual conta, e
// qual plano — vem dos mesmos arquivos que a CLI escreve no /login.
function describeProfile(profile) {
  const oauth = readOauth(profile)
  const account = readJson(accountFilePathFor(profile))?.oauthAccount || null
  return {
    id: profile.id,
    name: profile.name,
    configDir: profile.configDir,
    isDefault: profile.isDefault,
    loggedIn: !!oauth?.accessToken,
    tokenExpiresAt: oauth?.expiresAt || null,
    plan: oauth?.subscriptionType || null,
    rateLimitTier: oauth?.rateLimitTier || null,
    email: account?.emailAddress || null,
    displayName: account?.displayName || account?.fullName || null,
    organization: account?.organizationName || null
  }
}

function listProfiles() {
  return allProfiles().map(describeProfile)
}

function slugify(name) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'perfil'
  )
}

function linkSharedEntries(configDir) {
  for (const entry of SHAREABLE_ENTRIES) {
    const source = path.join(DEFAULT_CONFIG_DIR, entry)
    const target = path.join(configDir, entry)
    if (!fs.existsSync(source) || fs.existsSync(target)) continue
    try {
      fs.symlinkSync(source, target)
    } catch {
      // symlink falhando (FS sem suporte) não impede o perfil de existir —
      // só nasce sem herdar aquele item
    }
  }
}

function createProfile({ name, shareConfig }) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('Dê um nome pro perfil.')

  const registry = readRegistry()
  const id = crypto.randomUUID()
  let dirName = slugify(trimmed)
  while (fs.existsSync(path.join(MANAGED_ROOT, dirName))) dirName = `${slugify(trimmed)}-${id.slice(0, 4)}`
  const configDir = path.join(MANAGED_ROOT, dirName)

  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
  if (shareConfig) linkSharedEntries(configDir)

  registry.profiles.push({ id, name: trimmed, configDir, createdAt: new Date().toISOString() })
  writeRegistry(registry)
  return id
}

function renameProfile({ id, name }) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('O nome não pode ficar vazio.')
  const registry = readRegistry()
  if (id === DEFAULT_PROFILE_ID) {
    registry.defaultName = trimmed
  } else {
    const profile = registry.profiles.find((p) => p.id === id)
    if (!profile) throw new Error('Perfil não encontrado.')
    profile.name = trimmed
  }
  writeRegistry(registry)
}

// Apaga o perfil E a pasta dele (login, histórico de conversas) — mas só se a
// pasta estiver dentro de ~/.dux/claude-profiles, que é onde o próprio DUX as
// cria. Os symlinks pro ~/.claude padrão são removidos como links (rmSync não
// segue symlink), então nada do perfil padrão é tocado.
function deleteProfile({ id }) {
  if (id === DEFAULT_PROFILE_ID) throw new Error('O perfil padrão não pode ser removido.')
  const registry = readRegistry()
  const profile = registry.profiles.find((p) => p.id === id)
  if (!profile) return
  registry.profiles = registry.profiles.filter((p) => p.id !== id)
  writeRegistry(registry)

  const resolved = path.resolve(profile.configDir)
  if (resolved.startsWith(MANAGED_ROOT + path.sep)) {
    fs.rmSync(resolved, { recursive: true, force: true })
  }
}

// Env extra pro pty de um terminal Claude neste perfil — vazio pro padrão
// (ver comentário no topo sobre por que não setar CLAUDE_CONFIG_DIR=~/.claude).
function envFor(id) {
  const profile = resolveProfile(id)
  return profile.isDefault ? {} : { CLAUDE_CONFIG_DIR: profile.configDir }
}

module.exports = {
  DEFAULT_PROFILE_ID,
  listProfiles,
  resolveProfile,
  readOauth,
  createProfile,
  renameProfile,
  deleteProfile,
  envFor
}
