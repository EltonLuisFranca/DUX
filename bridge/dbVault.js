const fs = require('fs')
const os = require('os')
const path = require('path')

// Cofre LOCAL de senhas de banco. Decisão de produto: os workspaces do DUX
// sincronizam pro backend compartilhado da Uzuno (ver workspaceSync.js), então
// a senha do banco NUNCA pode ir pra node.data — ela ficaria no servidor. Aqui
// ela vive só nesta máquina, num arquivo chmod 600 em ~/.dux, indexado pelo
// connectionId que o node carrega (esse sim sincroniza, por ser opaco).
//
// Não é criptografia de verdade (a chave teria que morar aqui do lado, sem
// ganho real num app desktop single-user) — é isolamento: fora do workspace
// sincronizado e com permissão restrita ao dono do arquivo.
const DUX_DIR = path.join(os.homedir(), '.dux')
const VAULT_PATH = path.join(DUX_DIR, 'db-credentials.json')

function readVault() {
  try {
    const raw = fs.readFileSync(VAULT_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // arquivo ainda não existe ou está corrompido — começa limpo
    return {}
  }
}

function writeVault(vault) {
  fs.mkdirSync(DUX_DIR, { recursive: true })
  // mode 0600 no open: garante a permissão mesmo na criação (um chmod depois
  // deixaria uma janela com o arquivo legível por outros)
  fs.writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2), { mode: 0o600 })
  // writeFileSync só aplica o mode quando cria o arquivo; num arquivo que já
  // existe a permissão não muda, então reforça aqui (best-effort).
  try {
    fs.chmodSync(VAULT_PATH, 0o600)
  } catch {
    // chmod pode falhar em FS que não suporta (ex: montagem Windows no WSL) —
    // não é fatal, o isolamento por ~/.dux já vale
  }
}

function getPassword(connectionId) {
  if (!connectionId) return null
  const vault = readVault()
  const entry = vault[connectionId]
  return typeof entry === 'string' ? entry : null
}

function setPassword(connectionId, password) {
  if (!connectionId) return { ok: false, error: 'connectionId ausente' }
  const vault = readVault()
  if (password == null || password === '') {
    delete vault[connectionId]
  } else {
    vault[connectionId] = String(password)
  }
  try {
    writeVault(vault)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

function hasPassword(connectionId) {
  return Boolean(getPassword(connectionId))
}

function deletePassword(connectionId) {
  return setPassword(connectionId, '')
}

module.exports = { getPassword, setPassword, hasPassword, deletePassword }
