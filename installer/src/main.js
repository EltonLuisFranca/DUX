const { app, BrowserWindow, ipcMain } = require('electron')
const { join, basename } = require('path')
const { existsSync } = require('fs')
const { spawn } = require('child_process')
const { runInstall } = require('./install')
const { runUninstall } = require('./uninstall')

// O mesmo .exe atua como instalador ou desinstalador — install.js copia este
// próprio binário para "Uninstall DUX.exe" dentro da pasta instalada, e é
// esse nome de arquivo que o Windows lança a partir de Add/Remove Programs.
const UNINSTALL_MODE = basename(process.execPath).toLowerCase() === 'uninstall dux.exe'

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 320,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile(join(__dirname, UNINSTALL_MODE ? 'uninstall.html' : 'index.html'))
  return win
}

// Em produção, os arquivos do DUX ficam em resources/app-files (via
// extraResources do electron-builder). Em dev, aponta pro out/win-unpacked
// do projeto principal, já buildado, pra poder testar sem gerar o instalador
// de verdade a cada mudança.
function resolveAppFilesSource() {
  if (process.resourcesPath && existsSync(join(process.resourcesPath, 'app-files'))) {
    return join(process.resourcesPath, 'app-files')
  }
  return join(__dirname, '../../dist/win-unpacked')
}

app.whenReady().then(() => {
  const win = createWindow()

  ipcMain.handle('install:start', async () => {
    const source = resolveAppFilesSource()
    return runInstall(source, (progress) => {
      if (!win.isDestroyed()) win.webContents.send('install:progress', progress)
    })
  })

  ipcMain.handle('install:launch-app', (_event, installDir) => {
    // detached + unref pra o DUX não morrer junto quando o instalador fechar
    spawn(join(installDir, 'DUX.exe'), [], { detached: true, stdio: 'ignore' }).unref()
  })

  ipcMain.handle('uninstall:start', async () => {
    return runUninstall((progress) => {
      if (!win.isDestroyed()) win.webContents.send('uninstall:progress', progress)
    })
  })
})

app.on('window-all-closed', () => app.quit())
