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

// Diferente de askViaBridge/duxbanViaBridge: docker não depende de nenhum
// estado do canvas (o daemon roda no host, não num node), então não carrega
// sessionId nenhum — o bridge resolve list/action/logs sozinho chamando
// dockerStatus.js direto (ver /docker em bridge/server.js).
function dockerViaBridge(action, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ action, payload })

    const req = http.request(
      {
        host: '127.0.0.1',
        port: agentPort,
        path: '/docker',
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
      reject(new Error('timeout esperando resposta do docker'))
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
      'Show the DuxBan board(s) connected to this terminal in the DUX canvas: the board\'s tags (id, name, color), ' +
      'columns, cards, who each card is assigned to, and which ones are assigned to this terminal ("mine": true). ' +
      'Use this to see the full picture before moving or finishing a task, or to look up a tag_id for the ' +
      'dux_kanban_*_tag tools.',
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
  'dux_kanban_create_card',
  {
    title: 'Create a card on the connected DuxBan board',
    description:
      'Create a new card on the connected DuxBan board, in a given column, with a short title and an optional ' +
      'longer description (same title/description split shown by the card\'s detail modal in the UI). Use ' +
      'dux_kanban_list first to see the exact column titles available.',
    inputSchema: {
      column: z.string().describe('exact title of the column to add the card to, as shown by dux_kanban_list'),
      text: z.string().describe('short title of the new card'),
      description: z.string().optional().describe('optional longer description, kept separate from the title')
    }
  },
  async ({ column, text, description }) => {
    try {
      const result = await duxbanViaBridge('create_card', { column, text, description })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
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

server.registerTool(
  'dux_kanban_assign_card',
  {
    title: 'Assign a DuxBan card to an agent',
    description:
      'Assign a card on the connected DuxBan board to an agent terminal connected to that same board, by card id ' +
      'and the agent\'s exact name (as shown by dux_kanban_list under "assigned_to", or as seen in the canvas). ' +
      'Pass an empty agent_name to unassign the card. If the target agent is free, the task dispatches to it ' +
      'immediately; otherwise it queues until that agent calls dux_kanban_finish_task on its current task.',
    inputSchema: {
      card_id: z.string().describe('id of the card to assign, as returned by dux_kanban_list'),
      agent_name: z
        .string()
        .describe('exact name of the agent terminal to assign to, as shown by dux_kanban_list; empty string to unassign')
    }
  },
  async ({ card_id, agent_name }) => {
    try {
      const result = await duxbanViaBridge('assign_card', { cardId: card_id, agentName: agent_name })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_kanban_create_tag',
  {
    title: 'Create a tag on the connected DuxBan board',
    description:
      'Create a new tag on the connected DuxBan board (tags mark cards with a color to classify the kind of ' +
      'task — a card can have several). Returns the created tag\'s id, name and color. Omit color to get the ' +
      'next color from the board\'s fixed palette.',
    inputSchema: {
      name: z.string().describe('name of the new tag'),
      color: z.string().optional().describe('optional hex color (e.g. "#3b82f6"); omit to auto-pick one')
    }
  },
  async ({ name, color }) => {
    try {
      const result = await duxbanViaBridge('create_tag', { name, color })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_kanban_rename_tag',
  {
    title: 'Rename a DuxBan tag',
    description: 'Rename an existing tag on the connected DuxBan board, by tag id (see dux_kanban_list).',
    inputSchema: {
      tag_id: z.string().describe('id of the tag to rename, as returned by dux_kanban_list'),
      name: z.string().describe('new name for the tag')
    }
  },
  async ({ tag_id, name }) => {
    try {
      const result = await duxbanViaBridge('rename_tag', { tagId: tag_id, name })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_kanban_recolor_tag',
  {
    title: 'Change a DuxBan tag\'s color',
    description: 'Change the color of an existing tag on the connected DuxBan board, by tag id (see dux_kanban_list).',
    inputSchema: {
      tag_id: z.string().describe('id of the tag to recolor, as returned by dux_kanban_list'),
      color: z.string().describe('new hex color for the tag (e.g. "#3b82f6")')
    }
  },
  async ({ tag_id, color }) => {
    try {
      const result = await duxbanViaBridge('recolor_tag', { tagId: tag_id, color })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_kanban_remove_tag',
  {
    title: 'Delete a DuxBan tag',
    description:
      'Delete a tag from the connected DuxBan board, by tag id (see dux_kanban_list). Also removes it from every ' +
      'card that had it.',
    inputSchema: {
      tag_id: z.string().describe('id of the tag to delete, as returned by dux_kanban_list')
    }
  },
  async ({ tag_id }) => {
    try {
      const result = await duxbanViaBridge('remove_tag', { tagId: tag_id })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_kanban_add_card_tag',
  {
    title: 'Add a tag to a DuxBan card',
    description:
      'Add an existing tag to a card on the connected DuxBan board, by card id and tag id (see dux_kanban_list ' +
      'for both). Safe to call even if the card already has the tag.',
    inputSchema: {
      card_id: z.string().describe('id of the card, as returned by dux_kanban_list'),
      tag_id: z.string().describe('id of the tag to add, as returned by dux_kanban_list')
    }
  },
  async ({ card_id, tag_id }) => {
    try {
      const result = await duxbanViaBridge('add_card_tag', { cardId: card_id, tagId: tag_id })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_kanban_remove_card_tag',
  {
    title: 'Remove a tag from a DuxBan card',
    description:
      'Remove a tag from a card on the connected DuxBan board, by card id and tag id (see dux_kanban_list for ' +
      'both). Safe to call even if the card doesn\'t have the tag.',
    inputSchema: {
      card_id: z.string().describe('id of the card, as returned by dux_kanban_list'),
      tag_id: z.string().describe('id of the tag to remove, as returned by dux_kanban_list')
    }
  },
  async ({ card_id, tag_id }) => {
    try {
      const result = await duxbanViaBridge('remove_card_tag', { cardId: card_id, tagId: tag_id })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_kanban_add_comment',
  {
    title: 'Add a comment to a DuxBan card',
    description:
      'Add a comment to a card on the connected DuxBan board, by card id. Comments form a persisted timeline ' +
      '(author + timestamp + text) shown in the card\'s detail modal, meant as working context for humans and for ' +
      'this agent itself if it resumes the task later. Use this proactively while working a task — not only when ' +
      'explicitly asked — to record what has already been done, what is being done right now, and any important ' +
      'decisions made along the way.',
    inputSchema: {
      card_id: z.string().describe('id of the card to comment on, as returned by dux_kanban_list'),
      text: z.string().describe('the comment text')
    }
  },
  async ({ card_id, text }) => {
    try {
      const result = await duxbanViaBridge('add_comment', { cardId: card_id, text })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_docker_list',
  {
    title: 'List Docker containers',
    description:
      'List all Docker containers visible on this host (running and stopped), equivalent to `docker ps -a`. ' +
      'Returns id, name, image, status and ports for each container.',
    inputSchema: {
      host: z
        .string()
        .optional()
        .describe('optional Docker host to target (e.g. "tcp://host:2375" or "ssh://user@host"); omit for the local default')
    }
  },
  async ({ host }) => {
    try {
      const result = await dockerViaBridge('list', { host })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_docker_action',
  {
    title: 'Start, stop or restart a Docker container',
    description: 'Start, stop, or restart a Docker container by id or name, as returned by dux_docker_list.',
    inputSchema: {
      container: z.string().describe('container id or name, as returned by dux_docker_list'),
      action: z.enum(['start', 'stop', 'restart']).describe('action to perform'),
      host: z.string().optional().describe('optional Docker host to target; omit for the local default')
    }
  },
  async ({ container, action, host }) => {
    try {
      const result = await dockerViaBridge('action', { container, action, host })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

server.registerTool(
  'dux_docker_logs',
  {
    title: 'Get Docker container logs',
    description: 'Fetch recent logs from a Docker container by id or name, as returned by dux_docker_list.',
    inputSchema: {
      container: z.string().describe('container id or name'),
      tail: z.number().optional().describe('number of lines from the end of the logs (default 200)'),
      host: z.string().optional().describe('optional Docker host to target; omit for the local default')
    }
  },
  async ({ container, tail, host }) => {
    try {
      const result = await dockerViaBridge('logs', { container, tail, host })
      return { content: [{ type: 'text', text: result.ok ? result.logs : `Error: ${result.error}` }], isError: !result.ok }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
