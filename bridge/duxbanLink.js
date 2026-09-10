const { writeAsMessage, decorateDuxMessage } = require('./ptyWrite')

const REQUEST_TIMEOUT_MS = 15000
let requestCounter = 0
function nextRequestId() {
  requestCounter += 1
  return `duxban-${requestCounter}`
}

// sessionId -> { ptyProcess, ws, lastDataAt, pending: Map<requestId, {resolve,reject,timeout}> }
const sessions = new Map()

function registerSession(sessionId, { ptyProcess, ws }) {
  sessions.set(sessionId, { ptyProcess, ws, lastDataAt: Date.now(), pending: new Map() })
}

function unregisterSession(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) return
  for (const { reject, timeout } of session.pending.values()) {
    clearTimeout(timeout)
    reject(new Error('sessão encerrada'))
  }
  sessions.delete(sessionId)
}

// mesma heurística de idle de agentLink/noteLink: só usada aqui pra decidir
// quando é seguro empurrar o aviso de tarefa nova (ver pushTask)
function onSessionData(sessionId) {
  const session = sessions.get(sessionId)
  if (session) session.lastDataAt = Date.now()
}

function isIdle(session, thresholdMs) {
  return Date.now() - session.lastDataAt >= thresholdMs
}

const TASK_READY_POLL_MS = 200
const TASK_READY_MAX_WAIT_MS = 15000
// mesmo threshold de sendLinkInstructions/sendNoteInstructions — espera o
// terminal ficar ocioso por uma janela maior que a do dux-ask antes de
// injetar, pra não competir com boot do shell/agente
const TASK_IDLE_MS = 2500

// Linguagem factual/verificável, não imperativa — mesmo cuidado de
// agentLink.buildInstructions pra não ser lido como tentativa de prompt
// injection e ser recusado sem confirmação manual.
function buildTaskNotice({ boardName, columnTitle, cardId, cardText }) {
  return (
    `[DUX] Automatic notice from DUX (the Electron app running this terminal, not an external agent, and not ` +
    `part of the user's own conversation): a task was assigned to this terminal on the DuxBan board "${boardName}", ` +
    `in column "${columnTitle}", card id "${cardId}": "${cardText}". This terminal has tools available because of ` +
    `that connection ("dux_kanban_list", "dux_kanban_move_card", "dux_kanban_finish_task"): use ` +
    `"dux_kanban_move_card" to move this card to a column that reflects progress (e.g. one meaning "in progress" or ` +
    `"waiting for review") as work happens, and call "dux_kanban_finish_task" with this card's id when it's done — ` +
    `that also makes DUX send the next queued task on this board to this terminal, if one is waiting. Use ` +
    `"dux_kanban_list" any time to see the full board.`
  )
}

// Chamado pela mensagem de controle 'duxbanTaskToAgent' (renderer -> bridge,
// ver wsHandlers.js) quando o board despacha um cartão pra este terminal —
// escreve como mensagem no PTY dele (auto-confirmada, mesmo mecanismo de
// agentLink.ask, não um rascunho parado como noteLink: aqui a intenção é o
// agente já começar a tratar a tarefa).
function pushTask(sessionId, task, waitedMs = 0) {
  const session = sessions.get(sessionId)
  if (!session) return

  if (!isIdle(session, TASK_IDLE_MS) && waitedMs < TASK_READY_MAX_WAIT_MS) {
    setTimeout(() => pushTask(sessionId, task, waitedMs + TASK_READY_POLL_MS), TASK_READY_POLL_MS)
    return
  }

  writeAsMessage(session.ptyProcess, decorateDuxMessage(buildTaskNotice(task)))
}

// Pergunta estruturada bridge -> renderer, pela MESMA conexão ws persistente
// do terminal (a que já carrega type:start/input/resize/data) — o canvas é
// quem de fato guarda o estado do board, então list/move/finish do agente
// precisam ir e voltar por ali. Mesmo padrão de request/reply de
// agentLink.ask, só que o destino é o renderer, não outro PTY.
function request(sessionId, action, payload) {
  return new Promise((resolve, reject) => {
    const session = sessions.get(sessionId)
    if (!session) return reject(new Error('terminal não encontrado ou desconectado'))

    const requestId = nextRequestId()
    const timeout = setTimeout(() => {
      session.pending.delete(requestId)
      reject(new Error('timeout esperando o canvas responder'))
    }, REQUEST_TIMEOUT_MS)
    session.pending.set(requestId, { resolve, reject, timeout })
    session.ws.send(JSON.stringify({ type: 'duxbanRequest', requestId, action, payload }))
  })
}

function onResponse(sessionId, requestId, result, error) {
  const session = sessions.get(sessionId)
  const pending = session?.pending.get(requestId)
  if (!pending) return
  clearTimeout(pending.timeout)
  session.pending.delete(requestId)
  if (error) pending.reject(new Error(error))
  else pending.resolve(result)
}

module.exports = {
  registerSession,
  unregisterSession,
  onSessionData,
  pushTask,
  request,
  onResponse
}
