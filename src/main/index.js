import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'

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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

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
