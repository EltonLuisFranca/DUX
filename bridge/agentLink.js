const IDLE_MS = 900
const ASK_TIMEOUT_MS = 120000
const REPLY_MARKER = '<<<DUX_REPLY'
const END_MARKER = '<<<DUX_END>>>'
// Envolvem as instruções de setup de link (não as mensagens dux ask em si) —
// o terminal xterm.js do renderer usa esse par pra suprimir da tela só esse
// texto de configuração, sem esconder a conversa real entre agentes.
const SETUP_START_MARKER = '<<<DUX_SETUP>>>'
const SETUP_END_MARKER = '<<<DUX_SETUP_END>>>'

// sessionId -> { name, cwd, ptyProcess, links: Set<sessionId>, lastDataAt,
//                rawBuffer, expectedReplyId, queue: [], pending: null }
const sessions = new Map()

let requestCounter = 0
function nextRequestId() {
  requestCounter += 1
  return `req-${requestCounter}`
}

function registerSession(sessionId, { name, cwd, ptyProcess }) {
  sessions.set(sessionId, {
    name,
    cwd,
    ptyProcess,
    links: new Set(),
    lastDataAt: Date.now(),
    rawBuffer: '',
    expectedReplyId: null,
    queue: [],
    pending: null
  })
}

function unregisterSession(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) return
  const linkedIds = [...session.links]
  for (const otherId of linkedIds) {
    sessions.get(otherId)?.links.delete(sessionId)
  }
  session.pending?.reject(new Error('sessão encerrada'))
  for (const waiter of session.queue) waiter.reject(new Error('sessão encerrada'))
  sessions.delete(sessionId)
  for (const id of linkedIds) sendLinkInstructions(id)
}

function findSessionByName(name) {
  for (const [id, session] of sessions) {
    if (session.name === name) return id
  }
  return null
}

function renameSession(sessionId, name) {
  const session = sessions.get(sessionId)
  if (!session || !name || session.name === name) return
  session.name = name
  for (const otherId of session.links) sendLinkInstructions(otherId)
}

// chamado a cada chunk de dados que sai do PTY. O prompt que injetamos cita,
// por extenso, tanto a tag de reply quanto a de fim (precisa, pra instruir o
// agente) — então o eco síncrono do próprio write() sempre contém as DUAS tags
// já em sequência, uma linha só. Por isso a mera presença de "reply-tag ...
// end-tag" não basta pra reconhecer uma resposta real: usamos a ÚLTIMA
// ocorrência da reply-tag (a mais recente e por decisão própria do agente,
// nunca a primeira, que é sempre o eco do que nós mesmos escrevemos) e só
// aceitamos o end-tag que vier depois DELA
function onSessionData(sessionId, chunk) {
  const session = sessions.get(sessionId)
  if (!session) return
  session.lastDataAt = Date.now()

  if (!session.pending) return

  session.rawBuffer += chunk

  const replyTag = `${REPLY_MARKER} ${session.expectedReplyId}>>>`
  const firstTagIndex = session.rawBuffer.indexOf(replyTag)
  if (firstTagIndex === -1) return

  const lastTagIndex = session.rawBuffer.lastIndexOf(replyTag)
  // só existe uma ocorrência até agora — ainda é (provavelmente) o eco do
  // nosso próprio prompt, não uma resposta de verdade; espera mais dados
  if (lastTagIndex === firstTagIndex) return

  const afterTag = session.rawBuffer.slice(lastTagIndex + replyTag.length)
  const endIndex = afterTag.indexOf(END_MARKER)
  if (endIndex === -1) return

  const answer = afterTag.slice(0, endIndex).trim()
  const { resolve } = session.pending
  session.pending = null
  session.expectedReplyId = null
  session.rawBuffer = ''
  resolve(answer)
  pumpQueue(sessionId)
}

function isIdle(session) {
  return Date.now() - session.lastDataAt >= IDLE_MS
}

// tenta despachar a próxima pergunta da fila de um destino, se ele estiver
// livre (sem pergunta pendente) e ocioso (sem output novo recentemente,
// heurística de "não está no meio de outra coisa")
function pumpQueue(sessionId) {
  const session = sessions.get(sessionId)
  if (!session || session.pending || session.queue.length === 0) return

  if (!isIdle(session)) {
    setTimeout(() => pumpQueue(sessionId), IDLE_MS)
    return
  }

  const job = session.queue.shift()
  const requestId = nextRequestId()
  session.rawBuffer = ''
  session.expectedReplyId = requestId

  const timeoutHandle = setTimeout(() => {
    session.pending = null
    session.expectedReplyId = null
    job.reject(new Error('timeout esperando resposta do agente'))
    pumpQueue(sessionId)
  }, ASK_TIMEOUT_MS)

  session.pending = {
    resolve: (answer) => {
      clearTimeout(timeoutHandle)
      job.resolve(answer)
    },
    reject: (err) => {
      clearTimeout(timeoutHandle)
      job.reject(err)
    }
  }

  const prompt =
    `[DUX] Mensagem do agente "${job.fromName}": ${job.message} ` +
    `Antes de responder, escreva sozinho numa linha exatamente: ${REPLY_MARKER} ${requestId}>>> ` +
    `— depois escreva sua resposta normalmente e, ao terminar, escreva sozinho numa linha exatamente: ${END_MARKER}`
  writeAsMessage(session.ptyProcess, prompt)
}

// escreve o texto e o Enter como dois eventos separados, com um intervalo
// entre eles — a maioria dos TUIs (Claude Code incluso) trata uma rajada única
// e grande de bytes terminada em \n como "colar texto com quebra de linha
// dentro do campo", não como "digitar e confirmar com Enter". Separar os dois
// imita o que um humano realmente faz e evita o texto ficar só sentado no
// campo de input, sem ser enviado
function writeAsMessage(ptyProcess, text) {
  ptyProcess.write(text)
  setTimeout(() => ptyProcess.write('\r'), 80)
}

function ask(fromSessionId, toName, message) {
  return new Promise((resolve, reject) => {
    const fromSession = sessions.get(fromSessionId)
    if (!fromSession) return reject(new Error('sessão de origem desconhecida'))

    const toId = [...fromSession.links].find((id) => sessions.get(id)?.name === toName)
    const toSession = toId && sessions.get(toId)
    if (!toSession) return reject(new Error(`"${toName}" não está conectado a este terminal`))

    toSession.queue.push({ fromName: fromSession.name, message, resolve, reject })
    pumpQueue(toId)
  })
}

const LINK_RETRY_MS = 500
const LINK_RETRY_ATTEMPTS = 10

// as duas sessões de uma edge normalmente chegam quase juntas (cada terminal
// abre seu próprio WebSocket e registra sua sessão de forma independente),
// então um link pedido logo no carregamento do canvas pode chegar antes de
// uma das duas sessões existir ainda — tenta de novo por alguns segundos
// antes de desistir, em vez de simplesmente descartar o pedido
function linkSessions(sessionIdA, sessionIdB, attemptsLeft = LINK_RETRY_ATTEMPTS) {
  const a = sessions.get(sessionIdA)
  const b = sessions.get(sessionIdB)
  if (!a || !b) {
    if (attemptsLeft > 0) {
      setTimeout(() => linkSessions(sessionIdA, sessionIdB, attemptsLeft - 1), LINK_RETRY_MS)
    }
    return
  }
  a.links.add(sessionIdB)
  b.links.add(sessionIdA)
  sendLinkInstructions(sessionIdA)
  sendLinkInstructions(sessionIdB)
}

function unlinkSessions(sessionIdA, sessionIdB) {
  const a = sessions.get(sessionIdA)
  const b = sessions.get(sessionIdB)
  const wasLinked = a?.links.has(sessionIdB)
  a?.links.delete(sessionIdB)
  b?.links.delete(sessionIdA)
  if (wasLinked) {
    sendLinkInstructions(sessionIdA)
    sendLinkInstructions(sessionIdB)
  }
}

function buildInstructions(session) {
  const peers = [...session.links]
    .map((id) => sessions.get(id)?.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  if (peers.length === 0) {
    return `[DUX] Você foi desconectado de todos os outros agentes no canvas do DUX Fleet. O comando "dux ask" não tem mais ninguém pra chamar por enquanto.`
  }

  const peerList = peers.map((name) => `"${name}"`).join(', ')

  return (
    `[DUX] Este terminal está conectado, no canvas do DUX Fleet, aos seguintes agentes: ${peerList}. ` +
    `Para pedir algo a um deles e aguardar a resposta, rode no shell: dux ask "<nome do agente>" "<sua mensagem>" ` +
    `— o comando bloqueia até a resposta chegar e a imprime no stdout. Use o nome exatamente como listado. ` +
    `Quando outro agente te perguntar algo, a mensagem vai chegar aqui prefixada com [DUX] Mensagem do agente "<nome>": ` +
    `e vai te instruir a ecoar um marcador antes e depois da sua resposta — siga essa instrução à risca quando ela chegar.`
  )
}

function sendLinkInstructions(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) return
  const wrapped = `${SETUP_START_MARKER}${buildInstructions(session)}${SETUP_END_MARKER}`
  writeAsMessage(session.ptyProcess, wrapped)
}

module.exports = {
  registerSession,
  unregisterSession,
  onSessionData,
  findSessionByName,
  renameSession,
  linkSessions,
  unlinkSessions,
  ask
}
