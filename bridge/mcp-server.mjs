#!/usr/bin/env node
// Servidor MCP stdio, um processo por terminal do DUX — spawnado pelo próprio
// bridge (server.js) junto com o Claude Code de cada sessão, via
// --mcp-config inline (não mexe em nenhum arquivo do projeto do usuário).
// Expõe dux_ask como tool: chamar a tool é uma requisição estruturada
// normal, sem precisar simular "digitar no terminal" nem depender do
// usuário confiar em texto solto na conversa — resolve o lado de quem
// pergunta. O lado de quem recebe a pergunta continua avisado via texto no
// terminal dele (ver agentLink.js): um Claude Code ocioso só "acorda" com
// input chegando no PTY, não existe canal pra uma tool call alcançá-lo de
// fora enquanto ele não está processando nada.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import http from 'node:http'

const sessionId = process.env.DUX_SESSION_ID
const agentPort = Number(process.env.DUX_AGENT_PORT || '4578')

if (!sessionId) {
  process.stderr.write('dux-mcp-server: DUX_SESSION_ID não definido, encerrando\n')
  process.exit(1)
}

function askViaBridge(toName, message) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ from: sessionId, to: toName, message })

    const req = http.request(
      {
        host: '127.0.0.1',
        port: agentPort,
        path: '/ask',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 130_000
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body)
            if (res.statusCode !== 200) return reject(new Error(parsed.error || `bridge respondeu HTTP ${res.statusCode}`))
            resolve(parsed.answer)
          } catch {
            reject(new Error('resposta inválida do bridge'))
          }
        })
      }
    )

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout esperando resposta do agente'))
    })
    req.on('error', (err) => reject(new Error(`não foi possível falar com o bridge (${err.message})`)))
    req.end(payload)
  })
}

// Mesma ida-e-volta HTTP de askViaBridge, mas o bridge resolve chamando
// duxbanLink.request (bridge/duxbanLink.js), que repassa a pergunta pra
// conexão ws persistente deste próprio terminal — o board DuxBan conectado
// mora no canvas (renderer), não no bridge, então list/move/finish sempre
// fazem essa volta.
function duxbanViaBridge(action, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ sessionId, action, payload })

    const req = http.request(
      {
        host: '127.0.0.1',
        port: agentPort,
        path: '/duxban',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 20_000
      },
      (res) => {
        let responseBody = ''
        res.on('data', (chunk) => (responseBody += chunk))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody)
            if (res.statusCode !== 200) return reject(new Error(parsed.error || `bridge respondeu HTTP ${res.statusCode}`))
            resolve(parsed.result)
          } catch {
            reject(new Error('resposta inválida do bridge'))
          }
        })
      }
    )

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout esperando o canvas responder'))
    })
    req.on('error', (err) => reject(new Error(`não foi possível falar com o bridge (${err.message})`)))
    req.end(body)
  })
}

const server = new McpServer({ name: 'dux', version: '1.0.0' })

server.registerTool(
  'dux_ask',
  {
    title: 'Ask another DUX agent',
    description:
      'Send a message to another agent terminal connected to this one in the DUX canvas, and wait for its reply. ' +
      'Use the exact agent name as shown in the canvas. Blocks until the other agent replies or times out (~2 minutes).',
    inputSchema: {
      agent_name: z.string().describe('Exact name of the connected agent terminal to ask, as shown in the DUX canvas'),
      message: z.string().describe('The message/question to send to that agent')
    }
  },
  async ({ agent_name, message }) => {
    try {
      const answer = await askViaBridge(agent_name, message)
      return { content: [{ type: 'text', text: answer }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_kanban_list',
  {
    title: 'List connected DuxBan board',
    description:
      'Show the DuxBan board(s) connected to this terminal in the DUX canvas: columns, cards, who each card is ' +
      'assigned to, and which ones are assigned to this terminal ("mine": true). Use this to see the full picture ' +
      'before moving or finishing a task, or when picking up work.',
    inputSchema: {}
  },
  async () => {
    try {
      const result = await duxbanViaBridge('list', {})
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_kanban_move_card',
  {
    title: 'Move a DuxBan card to another column',
    description:
      'Move a card on the connected DuxBan board to a different column, by card id and the target column\'s exact ' +
      'title (case-insensitive), e.g. a column meaning "in progress" or "waiting for review". This only changes ' +
      'which column the card is shown in — it does not free this terminal\'s task queue slot; call ' +
      'dux_kanban_finish_task for that when the task is actually done.',
    inputSchema: {
      card_id: z.string().describe('id of the card to move, as returned by dux_kanban_list'),
      column: z.string().describe('exact title of the destination column, as shown by dux_kanban_list')
    }
  },
  async ({ card_id, column }) => {
    try {
      const result = await duxbanViaBridge('move_card', { cardId: card_id, column })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_kanban_finish_task',
  {
    title: 'Mark a DuxBan task as done',
    description:
      'Report that a task assigned to this terminal on the connected DuxBan board is complete, by card id. This ' +
      'frees this terminal\'s queue slot on that board, so DUX immediately sends the next task queued for this ' +
      'terminal, if one is waiting. Only call this for a card actually assigned to this terminal.',
    inputSchema: {
      card_id: z.string().describe('id of the card to mark as finished, as returned by dux_kanban_list')
    }
  },
  async ({ card_id }) => {
    try {
      const result = await duxbanViaBridge('finish_task', { cardId: card_id })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
