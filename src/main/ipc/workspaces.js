import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'fs'

// Resolve o path só na primeira vez que é usado (lazy) — NÃO no import deste
// módulo. app.getPath('userData') chamado antes do 'ready' pode devolver um
// diretório diferente no Windows (o nome do app ainda não foi finalizado);
// resolvendo sob demanda, sempre pega o userData definitivo (os handlers só
// rodam depois que a janela abriu, ou seja, bem depois do ready).
let workspacesFile = null
function getWorkspacesFile() {
  if (!workspacesFile) workspacesFile = join(app.getPath('userData'), 'workspaces.json')
  return workspacesFile
}

// Se o parse falhar, o arquivo existe mas está corrompido (ex: processo
// morto no meio de uma escrita antiga, antes do rename atômico abaixo
// existir) — sem isso, o caller (flowStore.js no renderer) não distinguia
// "corrompido" de "nunca existiu" e caía pro workspace padrão vazio, que o
// autopersist do boot escrevia de volta no disco segundos depois, destruindo
// de vez o que ainda estava recuperável no arquivo original. Em vez de
// sobrescrever, guarda uma cópia do jeito que estava pra investigar/recuperar
// depois.
function loadWorkspacesFromDisk() {
  const file = getWorkspacesFile()
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch (err) {
    console.error('[workspaces] failed to parse, arquivo corrompido — fazendo backup em vez de sobrescrever', err)
    try {
      const backupPath = `${file}.corrupted-${Date.now()}.json`
      copyFileSync(file, backupPath)
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
  const file = getWorkspacesFile()
  const tmpFile = `${file}.tmp`
  const json = JSON.stringify(data, null, 2)
  try {
    writeFileSync(tmpFile, json)
    renameSync(tmpFile, file)
  } catch (err) {
    // No Windows, renomear por cima de um arquivo existente pode falhar quando
    // o destino está travado (antivírus escaneando a escrita recém-feita,
    // OneDrive sincronizando, handle aberto). Antes disso o erro era só logado
    // e o workspaces.json NUNCA era atualizado — a cada boot carregava vazio e
    // o usuário "perdia tudo". Fallback: grava direto no destino. Perde a
    // atomicidade do rename, mas gravar algo é muito melhor que não gravar nada.
    console.error('[workspaces] rename atômico falhou, tentando escrita direta', err)
    try {
      writeFileSync(file, json)
    } catch (err2) {
      console.error('[workspaces] failed to save', err2)
    }
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
