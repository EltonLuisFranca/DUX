import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

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

export function registerWorkspacesIpc() {
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
}
