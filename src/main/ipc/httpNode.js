import { ipcMain } from 'electron'

export function registerHttpNodeIpc() {
  // Requisição do node HTTP roda aqui (main process) pelo mesmo motivo do
  // auth:api-fetch: fetch() no renderer é sujeito a CORS, e boa parte das
  // APIs que alguém quer testar não libera origem nenhuma — o app desktop
  // não deveria ficar refém disso.
  ipcMain.handle('http-node:request', async (_event, { url, method = 'GET', headers = {}, body }) => {
    const startedAt = Date.now()
    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(body ? { body } : {})
      })

      const responseHeaders = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      const text = await response.text()
      return {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: text,
        durationMs: Date.now() - startedAt
      }
    } catch (err) {
      return { ok: false, error: err.message, durationMs: Date.now() - startedAt }
    }
  })
}
