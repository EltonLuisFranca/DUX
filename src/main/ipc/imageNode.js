import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'fs'

const IMAGE_MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

export function registerImageNodeIpc() {
  // A imagem vira data URL e vai direto pro data do node (persistido junto do
  // workspace) — mais simples que gerenciar um path externo que pode mudar ou
  // sumir entre máquinas depois de sincronizado.
  ipcMain.handle('image-node:open-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
    })
    if (canceled || !filePaths[0]) return { picked: false }

    const filePath = filePaths[0]
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    const mime = IMAGE_MIME_BY_EXT[ext] || 'application/octet-stream'
    const base64 = readFileSync(filePath).toString('base64')
    return { picked: true, dataUrl: `data:${mime};base64,${base64}`, fileName: filePath.split('/').pop() }
  })
}
