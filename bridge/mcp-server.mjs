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

const transport = new StdioServerTransport()
await server.connect(transport)
