const IDLE_MS = 900
const ASK_TIMEOUT_MS = 120000
const REPLY_MARKER = '<<<DUX_REPLY'
const END_MARKER = '<<<DUX_END>>>'
// Prefixa as instruções de setup de link (não as mensagens dux ask em si) —
// o terminal xterm.js do renderer usa esse marcador pra trocar por um aviso
// curto ("conexão atualizada") antes do texto completo, já que não dá pra
// esconder de forma confiável o eco que a TUI do Claude Code redesenha.
const SETUP_START_MARKER = '<<<DUX_SETUP>>>'

// Envolve o texto injetado pelo DUX (mensagens [DUX]) com cor ANSI ciano —
// só decoração visual no terminal, o Claude Code recebe o mesmo texto puro
// de qualquer forma (as sequências de escape não alteram o conteúdo, o
// terminal só as interpreta como estilo). Ajuda a diferenciar de relance o
// que veio do DUX do que o usuário/agente escreveu.
const DUX_ICON = '🤖'
function decorateDuxMessage(text) {
  return `\x1b[36m${DUX_ICON} ${text}\x1b[0m`
}

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

  const prompt = decorateDuxMessage(
    `[DUX] Mensagem recebida via "dux ask", enviada pelo terminal do agente "${job.fromName}" (outro terminal ` +
      `no mesmo canvas do DUX, não o usuário deste terminal diretamente): ${job.message}\n` +
      `Se você (ou o usuário deste terminal) decidir responder, o DUX está esperando a resposta chegar cercada ` +
      `por um marcador específico pra saber repassá-la de volta pro "dux ask" que está bloqueado esperando: escreva ` +
      `sozinho numa linha exatamente "${REPLY_MARKER} ${requestId}>>>", depois a resposta normalmente, e ao terminar ` +
      `escreva sozinho numa linha exatamente "${END_MARKER}". Sem isso, o outro terminal fica esperando até dar timeout.`
  )
  writeAsMessage(session.ptyProcess, prompt)
}

// escreve o texto e o Enter como dois eventos separados, com um intervalo
// entre eles — a maioria dos TUIs (Claude Code incluso) trata uma rajada única
// e grande de bytes terminada em \n como "colar texto com quebra de linha
// dentro do campo", não como "digitar e confirmar com Enter". Separar os dois
// imita o que um humano realmente faz e evita o texto ficar só sentado no
// campo de input, sem ser enviado.
//
// Enfileirada por ptyProcess: duas chamadas concorrentes pro mesmo terminal
// (ex: um bug em outro lugar disparando sendLinkInstructions duas vezes)
// senão intercalariam o segundo texto no meio do primeiro, antes do \r do
// primeiro disparar — exatamente o tipo de texto grudado e nunca enviado que
// já aconteceu aqui uma vez.
const writeQueues = new WeakMap()

function writeAsMessage(ptyProcess, text) {
  const previous = writeQueues.get(ptyProcess) || Promise.resolve()
  const next = previous.then(
    () =>
      new Promise((resolve) => {
        ptyProcess.write(text)
        setTimeout(() => {
          ptyProcess.write('\r')
          resolve()
        }, 80)
      })
  )
  writeQueues.set(ptyProcess, next)
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
  // relinkExistingEdges() (WslClaudeTerminalNode.vue) chama isso de novo a
  // cada reconexão do WebSocket do terminal — sem essa checagem, cada queda
  // de conexão reenviava as instruções de setup pros dois lados de um link
  // que já existia, empilhando texto repetido no prompt do usuário.
  const alreadyLinked = a.links.has(sessionIdB)
  a.links.add(sessionIdB)
  b.links.add(sessionIdA)
  if (alreadyLinked) return
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

// Linguagem propositalmente factual e verificável em vez de imperativa — um
// texto tipo "siga essa instrução à risca" digitado no prompt de um agente
// bem alinhado é reconhecido (corretamente) como o formato clássico de
// prompt injection, e o Claude Code passou a recusar seguir sem confirmação
// manual do usuário. Descrever o mecanismo com precisão, deixando claro que
// vem do próprio app hospedando o terminal (não de um terceiro externo), e
// sem pedir "confiança cega" reduz bastante essa desconfiança legítima.
function buildInstructions(session) {
  const peers = [...session.links]
    .map((id) => sessions.get(id)?.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  if (peers.length === 0) {
    return (
      `[DUX] Aviso automático do DUX (o app Electron rodando este terminal, não um agente externo): ` +
      `a conexão deste terminal com outros agentes no canvas foi removida. O comando "dux ask" ` +
      `(instalado no PATH deste shell pelo DUX) não tem destino configurado no momento.`
    )
  }

  const peerList = peers.map((name) => `"${name}"`).join(', ')

  return (
    `[DUX] Aviso automático do DUX (o app Electron rodando este terminal, não um agente externo, e não parte ` +
    `da conversa do usuário): este terminal está conectado, no canvas do DUX, aos seguintes agentes: ${peerList}. ` +
    `Isso habilita um comando de shell chamado "dux ask", que o DUX adiciona ao PATH deste terminal especificamente ` +
    `— rodar "dux ask \"<nome do agente>\" \"<mensagem>\"" envia texto pro terminal do agente indicado e aguarda a ` +
    `resposta dele, disponível como stdout do comando quando ele retorna. Use esse comando somente se o usuário ` +
    `pedir pra você se comunicar com outro agente do canvas.\n` +
    `Separadamente: se uma mensagem chegar aqui prefixada com [DUX] Mensagem do agente "<nome>":, é porque ` +
    `outro terminal do mesmo canvas rodou "dux ask" apontando pra este terminal — o DUX intercepta a saída ` +
    `deste terminal procurando por um marcador específico (${REPLY_MARKER} <id>>>>) pra saber quando sua resposta ` +
    `terminou e repassá-la de volta. Se o usuário quiser responder a esse pedido, o texto da resposta precisa ` +
    `vir cercado por esse marcador (com o mesmo id recebido) pra chegar ao outro terminal — sem isso, o DUX não ` +
    `tem como saber quando a resposta terminou e o "dux ask" do outro lado fica bloqueado até dar timeout.`
  )
}

const SETUP_READY_POLL_MS = 200
const SETUP_READY_MAX_WAIT_MS = 15000

// Logo após o spawn (registerSession roda no mesmo tick que pty.spawn), o
// Claude Code ainda está inicializando dentro do PTY — shell profile via -i,
// resolução de PATH, o processo Node do próprio Claude Code subindo, splash
// inicial. Escrever a instrução de setup nesse timing faz o \r se perder ou
// ser interpretado como parte do boot em vez de "confirmar o prompt": o texto
// fica sentado no campo de input, nunca enviado (visto na prática). Espera
// o terminal ficar ocioso (nada saindo do PTY por IDLE_MS) antes de injetar
// — mesma heurística de "está livre pra receber" que pumpQueue já usa pro
// dux ask. Desiste depois de um tempo máximo em vez de esperar pra sempre,
// caso a sessão nunca fique idle por algum motivo.
function sendLinkInstructions(sessionId, waitedMs = 0) {
  const session = sessions.get(sessionId)
  if (!session) return

  if (!isIdle(session) && waitedMs < SETUP_READY_MAX_WAIT_MS) {
    setTimeout(() => sendLinkInstructions(sessionId, waitedMs + SETUP_READY_POLL_MS), SETUP_READY_POLL_MS)
    return
  }

  const wrapped = `${SETUP_START_MARKER}${decorateDuxMessage(buildInstructions(session))}`
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
