import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { autoUpdater } from 'electron-updater'

const WSL_DISTRO = 'Debian'
const BRIDGE_CMD = 'source ~/.zshrc; cd /mnt/c/Users/57224/dux-fleet/bridge && node server.js'
// bridge/ está listado em asarUnpack (precisa rodar como processo real, não
// dentro do arquivo virtual .asar), então empacotado ele vive em
// app.asar.unpacked/bridge, não em app.asar/../../bridge como o __dirname
// relativo sugeriria.
const BRIDGE_DIR = app.isPackaged
  ? join(__dirname, '../../bridge').replace('app.asar', 'app.asar.unpacked')
  : join(__dirname, '../../bridge')

const WORKSPACES_FILE = join(app.getPath('userData'), 'workspaces.json')
const AUTH_FILE = join(app.getPath('userData'), 'auth.dat')
const AUTH_PROTOCOL = 'dux'
const UZUNO_API_BASE = 'https://api.uzuno.tech'

function loadWorkspacesFromDisk() {
  try {
    if (!existsSync(WORKSPACES_FILE)) return null
    return JSON.parse(readFileSync(WORKSPACES_FILE, 'utf-8'))
  } catch (err) {
    console.error('[workspaces] failed to load', err)
    return null
  }
}

function saveWorkspacesToDisk(data) {
  try {
    writeFileSync(WORKSPACES_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.error('[workspaces] failed to save', err)
  }
}

ipcMain.on('workspaces:load-sync', (event) => {
  event.returnValue = loadWorkspacesFromDisk()
})

ipcMain.on('app:get-version-sync', (event) => {
  event.returnValue = app.getVersion()
})

ipcMain.handle('workspaces:save', (_event, data) => {
  saveWorkspacesToDisk(data)
})

// A janela fecha assim que o handler window:close roda; sem uma escrita
// síncrona aqui, o debounce de 400ms do renderer pode nunca chegar a rodar
// e a última alteração (às vezes o workspace inteiro) se perde.
ipcMain.on('workspaces:save-sync', (event, data) => {
  saveWorkspacesToDisk(data)
  event.returnValue = true
})

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

let mainWindowRef = null

function handleAuthCallbackUrl(url) {
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
  mainWindowRef?.webContents.send('auth:token-received')
  mainWindowRef?.focus()
}

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
ipcMain.handle('auth:api-fetch', async (_event, { path, method = 'GET', body }) => {
  const token = loadAuthToken()
  if (!token) return { ok: false, status: 401, data: { message: 'not authenticated' } }

  try {
    const response = await fetch(`${UZUNO_API_BASE}${path}`, {
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

ipcMain.handle('browser-node:save-screenshot', async (_event, { dataUrl, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  })
  if (canceled || !filePath) return { saved: false }

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return { saved: true, filePath }
})

// Checagem de atualização feita ANTES de abrir a janela principal: uma tela de
// splash mostra progresso enquanto baixa. Timeout curto pra nunca travar o
// startup se o GitHub estiver fora do ar ou sem internet — nesse caso segue
// direto pra janela principal, sem bloquear o usuário.
const STARTUP_CHECK_TIMEOUT_MS = 6_000

function checkForUpdateBeforeLaunch() {
  return new Promise((resolve) => {
    if (!app.isPackaged) {
      resolve({ willInstall: false })
      return
    }

    const splash = new BrowserWindow({
      width: 320,
      height: 200,
      frame: false,
      resizable: false,
      show: true,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    })
    splash.loadFile(join(__dirname, 'splash.html'))

    const setStatus = (label, percent) => splash.webContents.send('splash:status', { label, percent })

    let settled = false
    const finish = (willInstall) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutHandle)
      if (!willInstall && !splash.isDestroyed()) splash.close()
      resolve({ willInstall })
    }

    const timeoutHandle = setTimeout(() => finish(false), STARTUP_CHECK_TIMEOUT_MS)

    autoUpdater.autoDownload = true
    autoUpdater.once('update-not-available', () => finish(false))
    autoUpdater.once('error', () => finish(false))
    autoUpdater.on('download-progress', (progress) => {
      setStatus('Baixando atualização...', progress.percent)
    })
    autoUpdater.once('update-downloaded', () => {
      setStatus('Atualização pronta, reiniciando...', 100)
      setTimeout(() => autoUpdater.quitAndInstall(), 600)
      finish(true)
    })

    setStatus('Verificando atualizações...')
    autoUpdater.checkForUpdates().catch(() => finish(false))
  })
}

let bridgeProcess = null

function startBridge() {
  if (process.platform === 'win32') {
    bridgeProcess = spawn('wsl.exe', ['-d', WSL_DISTRO, '--', 'zsh', '-c', BRIDGE_CMD])
  } else {
    bridgeProcess = spawn('node', ['server.js'], { cwd: BRIDGE_DIR })
  }

  bridgeProcess.stdout.on('data', (chunk) => console.log(`[bridge] ${chunk}`))
  bridgeProcess.stderr.on('data', (chunk) => console.error(`[bridge] ${chunk}`))
  bridgeProcess.on('exit', (code) => console.log(`[bridge] exited with code ${code}`))
}

function stopBridge() {
  bridgeProcess?.kill()
  bridgeProcess = null
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  mainWindowRef = win
  win.on('closed', () => {
    if (mainWindowRef === win) mainWindowRef = null
  })

  win.once('ready-to-show', () => win.show())

  // Hardening for the browser-node <webview>: force nodeintegration off and
  // strip the preload regardless of what the guest tag's attributes request,
  // since it loads arbitrary user-supplied URLs.
  win.webContents.on('will-attach-webview', (_event, webPreferences) => {
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    delete webPreferences.preload
    delete webPreferences.preloadURL
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => win.close())
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [join(__dirname, '../../')])
  }
} else {
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL)
}

// Windows/Linux entregam o link dux://... como argv de uma segunda
// instância do app, não como evento — precisa de single-instance lock pra
// redirecionar esse argv pra instância já aberta em vez de abrir duas janelas.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const authUrl = argv.find((arg) => arg.startsWith(`${AUTH_PROTOCOL}://`))
    if (authUrl) handleAuthCallbackUrl(authUrl)

    if (mainWindowRef) {
      if (mainWindowRef.isMinimized()) mainWindowRef.restore()
      mainWindowRef.focus()
    }
  })

  // macOS entrega o link via este evento em vez de argv de segunda instância.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAuthCallbackUrl(url)
  })

  app.whenReady().then(async () => {
    const { willInstall } = await checkForUpdateBeforeLaunch()
    if (willInstall) return // quitAndInstall vai reiniciar o app na versão nova

    startBridge()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', stopBridge)
