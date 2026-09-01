const fs = require('fs')
const path = require('path')
const { WebSocket } = require('ws')

// Watchers de nota ativos por conexão WS — cada `ws` pode observar vários
// paths; guardado aqui (não em noteLink.js) porque é estado de transporte
// (quem quer receber noteChanged por qual socket), não de "quais sessões de
// agente estão linkadas a qual nota".
const noteFsWatchersByWs = new WeakMap()

function readNoteFile(notePath) {
  try {
    return fs.readFileSync(notePath, 'utf8')
  } catch {
    return ''
  }
}

function stopWatchingNote(ws, notePath) {
  const watchers = noteFsWatchersByWs.get(ws)
  const watcher = watchers?.get(notePath)
  if (!watcher) return
  clearTimeout(watcher.debounceHandle)
  watcher.fsWatcher.close()
  watchers.delete(notePath)
}

function stopAllNoteWatches(ws) {
  const watchers = noteFsWatchersByWs.get(ws)
  if (!watchers) return
  for (const notePath of [...watchers.keys()]) stopWatchingNote(ws, notePath)
  noteFsWatchersByWs.delete(ws)
}

function startWatchingNote(ws, notePath) {
  if (!noteFsWatchersByWs.has(ws)) noteFsWatchersByWs.set(ws, new Map())
  const watchers = noteFsWatchersByWs.get(ws)
  if (watchers.has(notePath)) return

  // fs.watch dispara em rajada em vários editores/salvamentos (ex: um agente
  // fazendo várias escritas pequenas) — debounce evita mandar um noteChanged
  // por evento bruto.
  const send = () => {
    if (ws.readyState !== WebSocket.OPEN) return
    const stat = (() => {
      try {
        return fs.statSync(notePath)
      } catch {
        return null
      }
    })()
    ws.send(
      JSON.stringify({
        type: 'noteChanged',
        path: notePath,
        content: readNoteFile(notePath),
        mtime: stat ? stat.mtimeMs : null
      })
    )
  }

  // Observa o DIRETÓRIO pai, não o arquivo em si — muitos editores/ferramentas
  // (incluído o Claude Code) escrevem de forma atômica: gravam num arquivo
  // temporário e fazem rename() por cima do original, em vez de escrever
  // direto nele. Um fs.watch(notePath) fica preso ao inode antigo, que deixa
  // de existir após o rename — o watch para de disparar eventos
  // silenciosamente a partir daí, mesmo que o arquivo (novo inode, mesmo nome)
  // continue sendo escrito depois (confirmado reproduzindo o cenário: o
  // primeiro rename ainda dispara, a escrita seguinte já não). Watch no
  // diretório sobrevive a qualquer rename porque nunca perde esse inode.
  const targetName = path.basename(notePath)
  const dir = path.dirname(notePath)
  const entry = { fsWatcher: null, debounceHandle: null }
  try {
    entry.fsWatcher = fs.watch(dir, (_event, filename) => {
      if (filename !== targetName) return
      clearTimeout(entry.debounceHandle)
      entry.debounceHandle = setTimeout(send, 150)
    })
  } catch {
    return
  }

  watchers.set(notePath, entry)
}

module.exports = { startWatchingNote, stopWatchingNote, stopAllNoteWatches, readNoteFile }
