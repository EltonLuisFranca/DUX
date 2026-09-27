const fs = require('fs')
const http = require('http')
const { WebSocketServer } = require('ws')
const agentLink = require('./agentLink')
const duxbanLink = require('./duxbanLink')
const dockerStatus = require('./dockerStatus')
const noteLink = require('./noteLink')
const noteTabs = require('./noteTabs')
const { createConnectionHandler } = require('./wsHandlers')

const PORT = 4577
const AGENT_PORT = 4578

// 1MB bastava antes de dux_kanban_create_card/add_comment aceitarem
// image_paths (mcp-server.mjs) — uma imagem só em base64 já passa disso.
// Local (127.0.0.1) e single-user, então um teto maior não é risco de DoS
// relevante; 8MB por imagem (ver MAX_IMAGE_BYTES em mcp-server.mjs) + folga
// pro overhead do base64/JSON e pra múltiplos anexos no mesmo request.
const MAX_BODY_BYTES = 24 * 1024 * 1024

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })
wss.on('connection', createConnectionHandler({ agentPort: AGENT_PORT }))

const agentServer = http.createServer((req, res) => {
  if (req.method !== 'POST' || !['/ask', '/duxban', '/docker', '/notes'].includes(req.url)) {
    res.writeHead(404).end()
    return
  }

  let body = ''
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > MAX_BODY_BYTES) req.destroy()
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

  // /notes: usado pelas tools dux_notes_* (bridge/mcp-server.mjs) — assim
  // como /docker, resolve sozinho (lê/escreve o arquivo direto do disco),
  // sem ida-e-volta pro canvas: notas são arquivo, não estado do renderer.
  // Restrito às notas de fato ligadas a esta sessão (noteLink.getLinkedNotePaths)
  // — ver comentário lá sobre isso não ser uma fronteira de segurança de
  // verdade, só manter a tool coerente com seu propósito.
  if (req.url === '/notes') {
    req.on('end', async () => {
      try {
        const { sessionId, action, payload = {} } = JSON.parse(body)
        const linkedPaths = noteLink.getLinkedNotePaths(sessionId)

        if (action === 'list') {
          const notes = linkedPaths.map((notePath) => {
            let tabs = []
            try {
              tabs = noteTabs.splitTabs(fs.readFileSync(notePath, 'utf8')).map((t) => t.title)
            } catch {
              // arquivo pode ter sido apagado/movido — segue reportando o path, sem abas
            }
            return { path: notePath, tabs }
          })
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ result: { notes } }))
          return
        }

        if (!linkedPaths.includes(payload.path)) {
          throw new Error(`"${payload.path}" não é uma nota conectada a este terminal. Use dux_notes_list pra ver as disponíveis.`)
        }

        if (action === 'read') {
          const content = fs.readFileSync(payload.path, 'utf8')
          const tabs = noteTabs.splitTabs(content)
          if (payload.tab) {
            const tab = tabs.find((t) => t.title.toLowerCase() === String(payload.tab).toLowerCase())
            if (!tab) throw new Error(`aba "${payload.tab}" não encontrada. Abas disponíveis: ${tabs.map((t) => t.title).join(', ')}`)
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ result: { tab: tab.title, content: tab.markdown } }))
            return
          }
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({ result: { tabs: tabs.map((t) => ({ tab: t.title, content: t.markdown })) } })
          )
          return
        }

        if (action === 'write') {
          const tabs = noteTabs.splitTabs(fs.readFileSync(payload.path, 'utf8'))
          let targetIndex
          if (payload.tab) {
            targetIndex = tabs.findIndex((t) => t.title.toLowerCase() === String(payload.tab).toLowerCase())
            if (targetIndex === -1) throw new Error(`aba "${payload.tab}" não encontrada. Abas disponíveis: ${tabs.map((t) => t.title).join(', ')}`)
          } else if (tabs.length === 1) {
            targetIndex = 0
          } else {
            throw new Error(`esta nota tem ${tabs.length} abas (${tabs.map((t) => t.title).join(', ')}) — informe "tab" pra dizer qual editar.`)
          }
          tabs[targetIndex] = { ...tabs[targetIndex], markdown: payload.content ?? '' }
          fs.writeFileSync(payload.path, noteTabs.joinTabs(tabs))
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ result: { ok: true, tab: tabs[targetIndex].title } }))
          return
        }

        throw new Error(`ação desconhecida: ${action}`)
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
