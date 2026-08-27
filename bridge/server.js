const fs = require('fs')
const os = require('os')
const path = require('path')
const pty = require('node-pty')
const { WebSocketServer, WebSocket } = require('ws')

const PORT = 4577
const HOME = os.homedir()

function resolveCwd(input) {
  const raw = input && input.trim() ? input.trim() : '~'
  const expanded = raw === '~' || raw.startsWith('~/') ? path.join(HOME, raw.slice(1)) : raw
  return path.resolve(HOME, expanded)
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function listSubdirectories(target) {
  try {
    return fs
      .readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })

wss.on('connection', (ws) => {
  let ptyProcess = null

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    if (msg.type === 'start') {
      if (ptyProcess) return

      const cwd = resolveCwd(msg.cwd)
      if (!isDirectory(cwd)) {
        ws.send(JSON.stringify({ type: 'error', message: `Diretório não encontrado: ${cwd}` }))
        ws.close()
        return
      }

      ptyProcess = pty.spawn('zsh', ['-lc', 'claude'], {
        name: 'xterm-256color',
        cols: msg.cols || 80,
        rows: msg.rows || 24,
        cwd,
        env: process.env
      })

      ptyProcess.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }))
        }
      })

      ptyProcess.onExit(({ exitCode, signal }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'exit', exitCode, signal }))
        }
        ptyProcess = null
      })
    } else if (msg.type === 'input') {
      ptyProcess?.write(msg.data)
    } else if (msg.type === 'resize') {
      if (ptyProcess && msg.cols > 0 && msg.rows > 0) {
        ptyProcess.resize(msg.cols, msg.rows)
      }
    } else if (msg.type === 'checkPath') {
      const resolved = resolveCwd(msg.path)
      const valid = isDirectory(resolved)
      const entries = valid ? listSubdirectories(resolved) : []
      ws.send(JSON.stringify({ type: 'pathCheck', path: msg.path, resolved, valid, entries }))
    }
  })

  ws.on('close', () => {
    ptyProcess?.kill()
    ptyProcess = null
  })
})

console.log(`dux-bridge listening on ws://127.0.0.1:${PORT}`)
