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
// tempo pro /clear (local ao CLI, sem round-trip de LLM) terminar de
// resetar o transcript antes de escrever a tarefa em cima — sem essa folga,
// as duas mensagens colidiriam na mesma janela de digitação simulada
const CONTEXT_CLEAR_SETTLE_MS = 600

// Linguagem factual/verificável, não imperativa — mesmo cuidado de
// agentLink.buildInstructions pra não ser lido como tentativa de prompt
// injection e ser recusado sem confirmação manual.
function buildTaskNotice({ boardName, columnTitle, cardId, cardText }) {
  return (
    `[DUX] Automatic notice from DUX (the Electron app running this terminal, not an external agent, and not ` +
    `part of the user's own conversation): a task was assigned to this terminal on the DuxBan board "${boardName}", ` +
    `in column "${columnTitle}", card id "${cardId}": "${cardText}". This terminal has several "dux_kanban_*" tools ` +
    `available because of that connection (see their descriptions in your tool list) — use "dux_kanban_move_card" ` +
    `to move this card to a column that reflects progress (e.g. one meaning "in progress" or ` +
    `"waiting for review") as work happens, and call "dux_kanban_finish_task" with this card's id when it's done — ` +
    `that also makes DUX send the next queued task on this board to this terminal, if one is waiting. Use ` +
    `"dux_kanban_list" any time to see the full board. Also use "dux_kanban_add_comment" throughout the task, as a ` +
    `standard practice for every task and not only when asked, to record: what has already been done, what is ` +
    `being done right now, and any important decisions made along the way — this becomes the working context on ` +
    `the card for humans and for this same agent if it resumes the task later.`
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

  // cada cartão puxado da fila do board começa numa sessão isolada por
  // padrão — sem isso, o agente ia empilhando o contexto de tarefas sem
  // relação nenhuma entre si indefinidamente, já que o despacho escreve a
  // tarefa seguinte na MESMA sessão de CLI já aberta (ver writeAsMessage),
  // em vez de abrir um terminal novo. "/clear" é suportado tanto pelo
  // Claude Code quanto pelo Codex CLI (os dois tipos de terminal que
  // recebem tarefa por aqui, ver AGENT_TERMINAL_TYPES) pra resetar o
  // transcript mantendo a mesma sessão. Uma continuação de tarefas
  // relacionadas pedida explicitamente pelo usuário acontece por fora
  // desse fluxo de despacho automático (o usuário digitando direto no
  // terminal), então não precisa de tratamento especial aqui.
  writeAsMessage(session.ptyProcess, '/clear').then(() => {
    setTimeout(() => {
      writeAsMessage(session.ptyProcess, decorateDuxMessage(buildTaskNotice(task)))
    }, CONTEXT_CLEAR_SETTLE_MS)
  })
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
