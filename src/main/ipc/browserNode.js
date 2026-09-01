import { ipcMain, dialog } from 'electron'
import { writeFileSync } from 'fs'

export function registerBrowserNodeIpc() {
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
}
