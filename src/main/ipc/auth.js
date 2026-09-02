import { ipcMain, shell, safeStorage, app, net } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'

const AUTH_FILE = join(app.getPath('userData'), 'auth.dat')
export const AUTH_PROTOCOL = 'dux'
const UZUNO_API_BASE = 'https://api.uzuno.tech'

// safeStorage depende de um keyring do sistema (GNOME Keyring, KWallet,
// libsecret...) que setups Linux minimalistas (sem DE completo) não têm —
// nesse caso isEncryptionAvailable() é false e ele nunca criptografa nada.
// Guardamos texto puro como fallback nesses casos, prefixado pra saber qual
// formato reler: perder o token em texto puro é bem melhor que travar login
// silenciosamente pra uma fatia real dos usuários Linux.
const PLAINTEXT_PREFIX = Buffer.from('dux-plain:')

function loadAuthToken() {
  try {
    if (!existsSync(AUTH_FILE)) return null
    const raw = readFileSync(AUTH_FILE)
    if (raw.subarray(0, PLAINTEXT_PREFIX.length).equals(PLAINTEXT_PREFIX)) {
      return raw.subarray(PLAINTEXT_PREFIX.length).toString('utf-8')
    }
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(raw)
  } catch (err) {
    console.error('[auth] failed to load token', err)
    return null
  }
}

function saveAuthToken(token) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(AUTH_FILE, safeStorage.encryptString(token))
    } else {
      console.error('[auth] safeStorage encryption unavailable, persisting token as plaintext')
      writeFileSync(AUTH_FILE, Buffer.concat([PLAINTEXT_PREFIX, Buffer.from(token, 'utf-8')]))
    }
  } catch (err) {
    console.error('[auth] failed to save token', err)
  }
}

function clearAuthToken() {
  try {
    if (existsSync(AUTH_FILE)) unlinkSync(AUTH_FILE)
  } catch (err) {
    console.error('[auth] failed to clear token', err)
  }
}

// Chamado pelo bootstrap (index.js) a partir do handler de deep link
// (dux://...) — recebe a janela principal atual pra saber pra onde mandar
// 'auth:token-received' e focar; index.js continua sendo o dono de qual é
// a janela principal, isso aqui só reage ao callback do login.
export function handleAuthCallbackUrl(url, win) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.protocol !== `${AUTH_PROTOCOL}:`) return

  const token = parsed.searchParams.get('token')
  if (!token) return

  saveAuthToken(token)
  win?.webContents.send('auth:token-received')
  win?.focus()
}

export function registerAuthIpc() {
  ipcMain.handle('auth:login', () => {
    shell.openExternal(`${UZUNO_API_BASE}/auth/google?client=dux`)
  })

  ipcMain.handle('auth:logout', () => {
    clearAuthToken()
  })

  ipcMain.on('auth:get-token-sync', (event) => {
    event.returnValue = loadAuthToken()
  })

  // A API do Uzuno é chamada daqui (main process, sem CORS) em vez do
  // renderer: fetch() no renderer é sujeito à mesma política de CORS de
  // qualquer página web comum, e a allowlist de origens do backend não cobre
  // (nem deveria precisar cobrir) um app desktop — o Electron não é um site
  // arbitrário rodando código de terceiros, é o próprio app autenticado por
  // Bearer token.
  //
  // net.fetch (stack do Chromium) em vez do fetch() do Node: em rede
  // corporativa com inspeção SSL (proxy tipo Fortinet reassinando o
  // certificado com uma CA própria), o navegador do sistema confia nessa CA
  // porque a TI a instala no Windows, mas a lista de CAs embutida do Node não
  // — o fetch() do Node falha o handshake TLS (status 0) enquanto o
  // navegador segue funcionando normalmente. net.fetch usa o mesmo trust
  // store do SO que o navegador já usa.
  ipcMain.handle('auth:api-fetch', async (_event, { path, method = 'GET', body }) => {
    const token = loadAuthToken()
    if (!token) return { ok: false, status: 401, data: { message: 'not authenticated' } }

    try {
      const response = await net.fetch(`${UZUNO_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      })

      if (response.status === 401) clearAuthToken()

      const data = await response.json().catch(() => null)
      return { ok: response.ok, status: response.status, data }
    } catch (err) {
      return { ok: false, status: 0, data: { message: err.message } }
    }
  })

  // Autoriza um canal presence/private do Reverb (POST /broadcasting/auth) a
  // partir do main process — mesmo motivo do auth:api-fetch acima: é um fetch
  // HTTP comum sujeito a CORS, e a allowlist do backend não cobre a origem do
  // Electron. O WebSocket em si roda no renderer via laravel-echo; só o
  // handshake de autorização de canal passa por aqui.
  ipcMain.handle('auth:broadcast-auth', async (_event, { socketId, channelName }) => {
    const token = loadAuthToken()
    if (!token) return { ok: false, status: 401, data: { message: 'not authenticated' } }

    try {
      const response = await net.fetch(`${UZUNO_API_BASE}/broadcasting/auth`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ socket_id: socketId, channel_name: channelName })
      })

      if (response.status === 401) clearAuthToken()

      const data = await response.json().catch(() => null)
      return { ok: response.ok, status: response.status, data }
    } catch (err) {
      return { ok: false, status: 0, data: { message: err.message } }
    }
  })
}
