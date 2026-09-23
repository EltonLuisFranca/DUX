const http = require('http')
const { WebSocketServer } = require('ws')
const agentLink = require('./agentLink')
const duxbanLink = require('./duxbanLink')
const dockerStatus = require('./dockerStatus')
const { createConnectionHandler } = require('./wsHandlers')

const PORT = 4577
const AGENT_PORT = 4578

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })
wss.on('connection', createConnectionHandler({ agentPort: AGENT_PORT }))

const agentServer = http.createServer((req, res) => {
  if (req.method !== 'POST' || !['/ask', '/duxban', '/docker'].includes(req.url)) {
    res.writeHead(404).end()
    return
  }

  let body = ''
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > 1e6) req.destroy()
  })

  if (req.url === '/ask') {
    req.on('end', async () => {
      try {
        const { from, to, message } = JSON.parse(body)
        const answer = await agentLink.ask(from, to, message)
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ answer }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // /docker: usado pelas tools dux_docker_* (bridge/mcp-server.mjs) — ao
  // contrário do /duxban, docker não depende de estado de nenhum node aberto
  // no canvas, então este servidor resolve sozinho chamando dockerStatus.js
  // direto, sem ida-e-volta pra nenhum terminal.
  if (req.url === '/docker') {
    req.on('end', async () => {
      try {
        const { action, payload = {} } = JSON.parse(body)
        let result
        if (action === 'list') result = await dockerStatus.listContainers(payload.host)
        else if (action === 'action') result = await dockerStatus.containerAction(payload.container, payload.action, payload.host)
        else if (action === 'logs') result = await dockerStatus.containerLogs(payload.container, payload)
        else throw new Error(`ação desconhecida: ${action}`)
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ result }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // /duxban: usado pelas tools dux_kanban_* (bridge/mcp-server.mjs) — a
  // sessão que pergunta é sempre o terminal conectado ao board, então o
  // pedido vira uma ida-e-volta pela conexão ws persistente dele (ver
  // duxbanLink.request), não algo que este servidor resolve sozinho.
  req.on('end', async () => {
    try {
      const { sessionId, action, payload } = JSON.parse(body)
      const result = await duxbanLink.request(sessionId, action, payload)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ result }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err.message }))
    }
  })
})

agentServer.listen(AGENT_PORT, '127.0.0.1')

console.log(`dux-bridge listening on ws://127.0.0.1:${PORT}`)
console.log(`dux-agent-link listening on http://127.0.0.1:${AGENT_PORT}`)
