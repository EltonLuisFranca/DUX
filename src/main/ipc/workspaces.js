import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'fs'

const WORKSPACES_FILE = join(app.getPath('userData'), 'workspaces.json')
const TMP_FILE = `${WORKSPACES_FILE}.tmp`

// Se o parse falhar, o arquivo existe mas está corrompido (ex: processo
// morto no meio de uma escrita antiga, antes do rename atômico abaixo
// existir) — sem isso, o caller (flowStore.js no renderer) não distinguia
// "corrompido" de "nunca existiu" e caía pro workspace padrão vazio, que o
// autopersist do boot escrevia de volta no disco segundos depois, destruindo
// de vez o que ainda estava recuperável no arquivo original. Em vez de
// sobrescrever, guarda uma cópia do jeito que estava pra investigar/recuperar
// depois.
function loadWorkspacesFromDisk() {
  if (!existsSync(WORKSPACES_FILE)) return null
  try {
    return JSON.parse(readFileSync(WORKSPACES_FILE, 'utf-8'))
  } catch (err) {
    console.error('[workspaces] failed to parse, arquivo corrompido — fazendo backup em vez de sobrescrever', err)
    try {
      const backupPath = `${WORKSPACES_FILE}.corrupted-${Date.now()}.json`
      copyFileSync(WORKSPACES_FILE, backupPath)
      console.error('[workspaces] backup do arquivo corrompido salvo em', backupPath)
    } catch (backupErr) {
      console.error('[workspaces] failed to back up corrupted file', backupErr)
    }
    return null
  }
}

// Escreve num arquivo temporário e só então troca pelo definitivo via rename
// — se o processo morrer/for morto no meio da escrita (crash, fechamento
// forçado, queda de energia), o workspaces.json original fica intacto em vez
// de ficar com um JSON pela metade. writeFileSync direto no destino final
// (como era antes) deixava exatamente essa janela aberta.
function saveWorkspacesToDisk(data) {
  try {
    writeFileSync(TMP_FILE, JSON.stringify(data, null, 2))
    renameSync(TMP_FILE, WORKSPACES_FILE)
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
