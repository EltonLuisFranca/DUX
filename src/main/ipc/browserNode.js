import { ipcMain, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { basename } from 'path'

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov'
}

function extFromMime(mime) {
  return MIME_EXT[(mime || '').split(';')[0].trim().toLowerCase()] || ''
}

// nome sugerido a partir da URL (último segmento do path), com fallback
function suggestName(url, ext) {
  try {
    const u = new URL(url)
    let name = basename(u.pathname) || 'midia'
    name = name.split('?')[0] || 'midia'
    if (ext && !name.toLowerCase().endsWith('.' + ext)) {
      name = name.replace(/\.[^.]*$/, '') || 'midia'
      name += '.' + ext
    }
    return name
  } catch {
    return `midia${ext ? '.' + ext : ''}`
  }
}

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

  // Baixa uma mídia (imagem/vídeo) da página. Busca no main process pra não
  // esbarrar em CORS (mesmo motivo do http-node:request); envia Referer da
  // página de origem porque alguns servidores de mídia exigem. URLs blob:
  // (vídeo em streaming/MSE) não são alcançáveis daqui — reportadas como erro.
  ipcMain.handle('browser-node:download-media', async (_event, { url, pageUrl }) => {
    try {
      let buffer
      let ext = ''
      if (url.startsWith('blob:')) {
        return { saved: false, error: 'mídia em streaming (blob) não pode ser baixada diretamente' }
      }
      if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
        const mime = match?.[1] || ''
        const isBase64 = Boolean(match?.[2])
        const data = match?.[3] || ''
        buffer = isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data))
        ext = extFromMime(mime)
      } else {
        const res = await fetch(url, {
          headers: {
            Referer: pageUrl || '',
            'User-Agent':
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
          }
        })
        if (!res.ok) return { saved: false, error: `HTTP ${res.status}` }
        buffer = Buffer.from(await res.arrayBuffer())
        const urlExt = (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1] || ''
        ext = urlExt || extFromMime(res.headers.get('content-type'))
      }

      const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: suggestName(url, ext) })
      if (canceled || !filePath) return { saved: false }
      writeFileSync(filePath, buffer)
      return { saved: true, filePath }
    } catch (err) {
      return { saved: false, error: err.message }
    }
  })
}
