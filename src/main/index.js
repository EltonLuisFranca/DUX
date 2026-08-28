import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { autoUpdater } from 'electron-updater'

const WSL_DISTRO = 'Debian'
const BRIDGE_CMD = 'source ~/.zshrc; cd /mnt/c/Users/57224/dux-fleet/bridge && node server.js'
const BRIDGE_DIR = join(__dirname, '../../bridge')

const WORKSPACES_FILE = join(app.getPath('userData'), 'workspaces.json')

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

function setupAutoUpdater(win) {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (channel, payload) => win.webContents.send(channel, payload)

  autoUpdater.on('update-available', (info) => send('updater:status', { state: 'available', info }))
  autoUpdater.on('update-not-available', () => send('updater:status', { state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) => send('updater:status', { state: 'downloading', progress }))
  autoUpdater.on('update-downloaded', (info) => send('updater:status', { state: 'downloaded', info }))
  autoUpdater.on('error', (err) => send('updater:status', { state: 'error', message: err?.message }))

  ipcMain.handle('updater:install-now', () => autoUpdater.quitAndInstall())

  autoUpdater.checkForUpdates().catch((err) => console.error('[updater] check failed', err))
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

  win.once('ready-to-show', () => {
    win.show()
    setupAutoUpdater(win)
  })

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

app.whenReady().then(() => {
  startBridge()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', stopBridge)
