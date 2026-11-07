// Pedidos de aprovação/decisão que precisam do usuário, mostrados como cartão
// "Aguardando você" no node do terminal (WslClaudeTerminalNode.vue).
//
// Duas origens, mesma fila:
// - 'permission': hook PermissionRequest do Claude Code (hooks/permission.js),
//   disparado quando o Claude ia mostrar o diálogo de permissão de ferramenta.
// - 'agent': tool MCP dux_request_approval (mcp-server.mjs), quando o próprio
//   agente decide pedir uma decisão ("posso apagar estes arquivos?").
//
// Os dois chegam por HTTP no agentServer (server.js, POST /approval) e ficam
// pendurados aqui até o usuário responder no cartão — a resposta volta pela
// conexão ws do terminal (type 'approvalAnswer', ver wsHandlers.js). Mesmo
// padrão de ida-e-volta de duxbanLink.request, só que sem timeout curto:
// quem espera é uma pessoa.

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

let counter = 0

// sessionId -> { ws, pending: Map<id, { payload, resolve, timer }> }
const sessions = new Map()

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function registerSession(sessionId, ws) {
  sessions.set(sessionId, { ws, pending: new Map() })
}

// terminal fechou/agente saiu: ninguém mais vai responder — libera quem
// estava esperando (o hook cai no diálogo normal; a tool recebe "sem resposta").
// `ws` evita que o fechamento de uma conexão antiga derrube a sessão já
// re-registrada por uma reconexão do mesmo node.
function unregisterSession(sessionId, ws) {
  const session = sessions.get(sessionId)
  if (!session || (ws && session.ws !== ws)) return
  for (const { resolve, timer } of session.pending.values()) {
    clearTimeout(timer)
    resolve({ choice: null, reason: 'closed' })
  }
  sessions.delete(sessionId)
}

// payload: { source, title, detail?, options: [{ id, label, tone? }] }
// Retorna { id, done }: done resolve com { choice: <id da opção> } ou
// { choice: null, reason }; id serve pra cancel().
function request(sessionId, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const session = sessions.get(sessionId)
  if (!session) return { id: null, done: Promise.resolve({ choice: null, reason: 'no-session' }) }

  const id = `approval-${++counter}`
  const done = new Promise((resolve) => {
    const timer = setTimeout(() => {
      session.pending.delete(id)
      send(session.ws, { type: 'approvalClosed', id })
      resolve({ choice: null, reason: 'timeout' })
    }, timeoutMs)
    session.pending.set(id, { payload, resolve, timer })
    send(session.ws, { type: 'approvalRequest', id, ...payload, createdAt: Date.now() })
  })
  return { id, done }
}

function answer(sessionId, id, choice) {
  const session = sessions.get(sessionId)
  const pending = session?.pending.get(id)
  if (!pending) return
  clearTimeout(pending.timer)
  session.pending.delete(id)
  pending.resolve({ choice })
}

// Lado de quem pediu desistiu (ex: o Claude seguiu sem esperar o hook, ou a
// conexão HTTP caiu) — tira o cartão da tela.
function cancel(sessionId, id) {
  const session = sessions.get(sessionId)
  const pending = session?.pending.get(id)
  if (!pending) return
  clearTimeout(pending.timer)
  session.pending.delete(id)
  send(session.ws, { type: 'approvalClosed', id })
}

module.exports = { registerSession, unregisterSession, request, answer, cancel }
