const http = require('http')
const { WebSocketServer } = require('ws')
const agentLink = require('./agentLink')
const { createConnectionHandler } = require('./wsHandlers')

const PORT = 4577
const AGENT_PORT = 4578

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })
wss.on('connection', createConnectionHandler({ agentPort: AGENT_PORT }))

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
