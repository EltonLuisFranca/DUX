const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const pty = require('node-pty')
const { WebSocketServer, WebSocket } = require('ws')
const agentLink = require('./agentLink')

const PORT = 4577
const AGENT_PORT = 4578
const HOME = os.homedir()
const BIN_DIR = path.join(__dirname, 'bin')

// allowlist de CLIs de agente que os nodes podem pedir pro bridge spawnar —
// evita que uma mensagem WebSocket arbitrária execute qualquer comando no host
const ALLOWED_COMMANDS = {
  claude: 'claude',
  codex: 'codex'
}

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
  let sessionId = null

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

      sessionId = msg.sessionId || null
      const command = ALLOWED_COMMANDS[msg.command] || ALLOWED_COMMANDS.claude

      ptyProcess = pty.spawn('zsh', ['-lc', command], {
        name: 'xterm-256color',
        cols: msg.cols || 80,
        rows: msg.rows || 24,
        cwd,
        env: {
          ...process.env,
          PATH: `${BIN_DIR}${path.delimiter}${process.env.PATH}`,
          DUX_SESSION_ID: sessionId || '',
          DUX_AGENT_PORT: String(AGENT_PORT)
        }
      })

      if (sessionId) {
        agentLink.registerSession(sessionId, { name: msg.name || sessionId, cwd, ptyProcess })
      }

      ptyProcess.onData((data) => {
        if (sessionId) agentLink.onSessionData(sessionId, data)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }))
        }
      })

      ptyProcess.onExit(({ exitCode, signal }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'exit', exitCode, signal }))
        }
        if (sessionId) agentLink.unregisterSession(sessionId)
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
    } else if (msg.type === 'link') {
      agentLink.linkSessions(msg.sessionA, msg.sessionB)
    } else if (msg.type === 'unlink') {
      agentLink.unlinkSessions(msg.sessionA, msg.sessionB)
    } else if (msg.type === 'rename') {
      agentLink.renameSession(msg.sessionId, msg.name)
    }
  })

  ws.on('close', () => {
    ptyProcess?.kill()
    ptyProcess = null
    if (sessionId) agentLink.unregisterSession(sessionId)
  })
})

const agentServer = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/ask') {
    res.writeHead(404).end()
    return
  }

  let body = ''
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > 1e6) req.destroy()
  })

  req.on('end', async () => {
    try {
      const { from, to, message } = JSON.parse(body)
      const answer = await agentLink.ask(from, to, message)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ answer }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err.message }))
    }
  })
})

agentServer.listen(AGENT_PORT, '127.0.0.1')

console.log(`dux-bridge listening on ws://127.0.0.1:${PORT}`)
console.log(`dux-agent-link listening on http://127.0.0.1:${AGENT_PORT}`)
