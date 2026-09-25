import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'

export function registerVulnReportIpc() {
  ipcMain.handle('vuln-report:save-html', async (_event, { html, defaultName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
    if (canceled || !filePath) return { saved: false }

    writeFileSync(filePath, html, 'utf-8')
    return { saved: true, filePath }
  })

  // Gera o PDF renderizando o mesmo HTML num BrowserWindow offscreen e usando
  // webContents.printToPDF() nativo do Electron — sem depender de nenhuma lib
  // de geração de PDF no processo main/bridge.
  ipcMain.handle('vuln-report:save-pdf', async (_event, { html, defaultName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return { saved: false }

    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
      })
      writeFileSync(filePath, pdfBuffer)
      return { saved: true, filePath }
    } finally {
      win.destroy()
    }
  })
}
