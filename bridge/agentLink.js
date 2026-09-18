const { writeAsMessage, decorateDuxMessage } = require('./ptyWrite')

const IDLE_MS = 900
// Timeout do dux_ask não é mais "tempo total desde o envio" — uma tarefa
// longa (ex: pedir pro outro agente implementar uma feature) pode ficar
// minutos produzindo output (digitando, rodando comandos) sem nunca ficar
// realmente parada, e um teto fixo curto derrubava isso no meio mesmo com o
// agente ativo. ASK_IDLE_TIMEOUT_MS reseta a cada chunk de dado que sai do
// PTY de destino enquanto uma pergunta está pendente — só dispara se o
// terminal ficar de fato quieto por esse tempo (sinal de que ninguém vai
// responder). ASK_MAX_TOTAL_MS é o teto absoluto por trás disso, indepen-
// dente de atividade, pra não esperar pra sempre caso o terminal fique
// produzindo ruído (ex: um processo em loop) sem nunca de fato responder.
const ASK_IDLE_TIMEOUT_MS = 120000
const ASK_MAX_TOTAL_MS = 30 * 60 * 1000
const REPLY_MARKER = '<<<DUX_REPLY'
const END_MARKER = '<<<DUX_END>>>'

// decorateDuxMessage (importado de ./ptyWrite): NENHUM marcador técnico tipo
// "<<<DUX_SETUP>>>" entra no texto — um texto assim, escrito literalmente no
// PTY, é visto pelo Claude Code como parte da mensagem, e ele reconhece
// (corretamente) que imita o formato de uma tag de sistema real, o que piora
// a desconfiança em vez de ajudar. A decoração fica restrita a códigos ANSI
// de estilo (SGR), que terminais interpretam como formatação, nunca como
// conteúdo de texto.

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
    pending: null,
    dispatching: false
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

// chamado a cada chunk de dados que sai do PTY. Antes esta função exigia DUAS
// ocorrências da reply-tag (a 1ª seria sempre o eco literal do prompt que nós
// mesmos escrevemos no PTY, contendo a tag por extenso como instrução; a 2ª,
// a resposta real do agente) — isso valia enquanto o terminal ecoava o texto
// bruto injetado. Mas a UI do Claude Code renderiza o prompt recebido como
// mensagem de chat estilizada, não necessariamente como eco literal byte a
// byte contendo a tag.
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_RE = /\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b\[[0-9;?]*[a-zA-Z]/g

// Procura `marker` como o conteúdo INTEIRO de alguma linha do buffer (depois
// de remover ANSI e aparar espaço), não como substring solta em qualquer
// lugar. Necessário porque a própria instrução injetada em pumpQueue CITA os
// dois marcadores entre aspas como exemplo de formato (`write... exactly
// "<<<DUX_REPLY req-1>>>"...`) — em TUIs que redesenham o histórico inteiro a
// cada frame (ex: a interface do Claude Code), essa citação aparece na tela
// assim que o agente recebe a mensagem, e um simples indexOf() bate nela
// como se fosse a resposta real, resolvendo o dux_ask com um pedaço da
// própria instrução (reproduzido na prática). A citação nunca ocupa uma
// linha inteira sozinha — vem sempre cercada de aspas/vírgula no meio da
// frase — então exigir a linha inteira, exatamente como a instrução já pede
// ("alone on one line, exactly"), descarta esse falso positivo.
//
// ANSI_ESCAPE_RE precisa cobrir, além do CSI simples ("\x1b[<n>m" de cor
// etc.), os modos privados DEC ("\x1b[?25l"/"\x1b[?25h" de esconder/mostrar
// cursor, "\x1b[?2004h/l" de bracketed paste) e OSC (título da janela) — TUIs
// tipo a do Claude Code emitem esses códigos a cada frame de redraw, e sem
// removê-los a linha do marcador fica com lixo colado (ex: "[?25h") que nunca
// bate no === exato, travando o dux_ask até o timeout mesmo com a resposta
// certa do outro lado (reproduzido na prática). wsHandlers.js já precisou do
// mesmo fix (linha 128-129) pra detectar prompt do cmd.exe em meio a ANSI.
function findMarkerLine(lines, marker, fromIndex = 0) {
  for (let i = fromIndex; i < lines.length; i++) {
    if (lines[i].replace(ANSI_ESCAPE_RE, '').trim() === marker) return i
  }
  return -1
}

function onSessionData(sessionId, chunk) {
  const session = sessions.get(sessionId)
  if (!session) return
  session.lastDataAt = Date.now()

  if (!session.pending) return

  // Qualquer atividade nova no PTY de destino (mesmo que ainda não seja a
  // resposta final) é sinal de que o agente está trabalhando na pergunta —
  // adia o timeout de inatividade em vez de deixá-lo contar tempo total.
  session.pending.bumpIdleTimeout()

  session.rawBuffer += chunk

  const replyTag = `${REPLY_MARKER} ${session.expectedReplyId}>>>`
  const lines = session.rawBuffer.split('\n')

  const tagLineIndex = findMarkerLine(lines, replyTag)
  if (tagLineIndex === -1) return

  const endLineIndex = findMarkerLine(lines, END_MARKER, tagLineIndex + 1)
  if (endLineIndex === -1) return

  // A UI do Claude Code formata a resposta na tela com códigos ANSI de estilo
  // (cor, negrito para markdown) — eles ficam misturados no texto bruto do
  // PTY entre os marcadores, e sem removê-los o "answer" chega ao outro lado
  // do dux ask com fragmentos tipo "[39m" ou "[38;5;231m" colados no meio.
  const answer = lines
    .slice(tagLineIndex + 1, endLineIndex)
    .map((line) => line.replace(ANSI_ESCAPE_RE, ''))
    .join('\n')
    .trim()

  const { resolve } = session.pending
  session.pending = null
  session.expectedReplyId = null
  session.rawBuffer = ''
  resolve(answer)
  pumpQueue(sessionId)
}

function isIdle(session, thresholdMs = IDLE_MS) {
  return Date.now() - session.lastDataAt >= thresholdMs
}

// tenta despachar a próxima pergunta da fila de um destino, se ele estiver
// livre (sem pergunta pendente/despachando) e ocioso (sem output novo
// recentemente, heurística de "não está no meio de outra coisa")
function pumpQueue(sessionId) {
  const session = sessions.get(sessionId)
  if (!session || session.pending || session.dispatching || session.queue.length === 0) return

  if (!isIdle(session)) {
    setTimeout(() => pumpQueue(sessionId), IDLE_MS)
    return
  }

  const job = session.queue.shift()
  const requestId = nextRequestId()

  // dispatching bloqueia pumpQueue de rodar de novo pro mesmo destino
  // enquanto a escrita ainda está em andamento — sem isso, uma pergunta
  // seguinte poderia começar a ser despachada antes da atual sequer terminar
  // de ser escrita no PTY.
  session.dispatching = true

  const prompt = decorateDuxMessage(
    `[DUX] Message received via "dux ask", sent by agent terminal "${job.fromName}" (another terminal in the ` +
      `same DUX canvas, not this terminal's own user directly): ${job.message}\n` +
      `If you (or this terminal's user) decide to reply, DUX is waiting for the reply to arrive wrapped in a ` +
      `specific marker so it can relay it back to the "dux ask" call that's blocked waiting: write, alone on ` +
      `one line, exactly "${REPLY_MARKER} ${requestId}>>>", then the reply normally, and when done write, alone ` +
      `on one line, exactly "${END_MARKER}". Without this, the other terminal keeps waiting until it times out.`
  )

  // A pergunta em si CITA o marcador de reply por extenso como instrução —
  // se rawBuffer começasse a acumular antes da escrita terminar, o eco
  // síncrono dessa própria citação (não uma resposta real do agente) seria
  // capturado como se fosse a resposta. Só limpa o buffer e passa a
  // monitorar DEPOIS que a escrita (texto + \r) já aconteceu por completo.
  writeAsMessage(session.ptyProcess, prompt).then(() => {
    session.dispatching = false
    session.rawBuffer = ''
    session.expectedReplyId = requestId

    let idleTimeoutHandle = null

    const clearPendingTimers = () => {
      clearTimeout(idleTimeoutHandle)
      clearTimeout(maxTimeoutHandle)
    }

    const failPending = (message) => {
      if (session.pending !== pendingEntry) return // já resolvido/substituído
      session.pending = null
      session.expectedReplyId = null
      clearPendingTimers()
      job.reject(new Error(message))
      pumpQueue(sessionId)
    }

    // teto absoluto: independe de atividade, existe só pra não esperar pra
    // sempre se o terminal ficar produzindo ruído sem nunca responder
    const maxTimeoutHandle = setTimeout(
      () => failPending(`timeout esperando resposta do agente (mais de ${Math.round(ASK_MAX_TOTAL_MS / 60000)} min no total)`),
      ASK_MAX_TOTAL_MS
    )

    const pendingEntry = {
      resolve: (answer) => {
        clearPendingTimers()
        job.resolve(answer)
      },
      reject: (err) => {
        clearPendingTimers()
        job.reject(err)
      },
      bumpIdleTimeout: () => {
        clearTimeout(idleTimeoutHandle)
        idleTimeoutHandle = setTimeout(
          () => failPending(`timeout esperando resposta do agente (sem atividade por ${Math.round(ASK_IDLE_TIMEOUT_MS / 1000)}s)`),
          ASK_IDLE_TIMEOUT_MS
        )
      }
    }

    session.pending = pendingEntry
    pendingEntry.bumpIdleTimeout()
  })
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
      `[DUX] Automatic notice from DUX (the Electron app running this terminal, not an external agent): ` +
      `this terminal's connection to other agents in the canvas was removed. The "dux ask" command ` +
      `(installed on this shell's PATH by DUX) has no configured destination right now.`
    )
  }

  const peerList = peers.map((name) => `"${name}"`).join(', ')

  return (
    `[DUX] Automatic notice from DUX (the Electron app running this terminal, not an external agent, and not ` +
    `part of the user's own conversation): this terminal is connected, in the DUX canvas, to the following ` +
    `agents: ${peerList}. This enables a shell command called "dux ask", which DUX adds to this terminal's PATH ` +
    `specifically — running "dux ask \"<agent name>\" \"<message>\"" sends text to the indicated agent's ` +
    `terminal and waits for its reply, available as the command's stdout once it returns. Use this command only ` +
    `if the user asks you to communicate with another agent in the canvas.\n` +
    `Separately: if a message arrives here prefixed with [DUX] Message from agent "<name>":, it's because ` +
    `another terminal in the same canvas ran "dux ask" targeting this terminal — DUX intercepts this ` +
    `terminal's output looking for a specific marker (${REPLY_MARKER} <id>>>>) to know when your reply is done ` +
    `and relay it back. If the user wants to respond to that request, the reply text needs to be wrapped in ` +
    `that marker (with the same id received) to reach the other terminal — without it, DUX has no way to know ` +
    `when the reply is done and the other side's "dux ask" stays blocked until it times out.`
  )
}

const SETUP_READY_POLL_MS = 200
const SETUP_READY_MAX_WAIT_MS = 15000
// Maior que IDLE_MS (900ms, usado pro dux ask esperar resposta) de propósito:
// um shell "-i" costuma rodar algo tipo fastfetch/neofetch/motd no login antes
// do Claude Code sequer começar a subir, e isso cria um período de silêncio
// FALSO entre esse output e o boot real do Claude Code — 900ms cabe
// facilmente dentro desse intervalo e injeta a instrução cedo demais de novo
// (reproduzido na prática com um dotfiles que roda fastfetch automaticamente).
// Esse threshold mais alto é só pra decidir "o terminal já ficou pronto pra
// receber a primeira coisa", não precisa ser rápido como o do dux ask.
const SETUP_IDLE_MS = 2500

// Logo após o spawn (registerSession roda no mesmo tick que pty.spawn), o
// Claude Code ainda está inicializando dentro do PTY — shell profile via -i,
// resolução de PATH, o processo Node do próprio Claude Code subindo, splash
// inicial. Escrever a instrução de setup nesse timing faz o \r se perder ou
// ser interpretado como parte do boot em vez de "confirmar o prompt": o texto
// fica sentado no campo de input, nunca enviado (visto na prática). Espera
// o terminal ficar ocioso por SETUP_IDLE_MS antes de injetar — mesma
// heurística de "está livre pra receber" que pumpQueue já usa pro dux ask,
// só que com uma janela de silêncio bem maior (ver comentário acima).
// Desiste depois de um tempo máximo em vez de esperar pra sempre, caso a
// sessão nunca fique idle por algum motivo.
function sendLinkInstructions(sessionId, waitedMs = 0) {
  const session = sessions.get(sessionId)
  if (!session) return

  if (!isIdle(session, SETUP_IDLE_MS) && waitedMs < SETUP_READY_MAX_WAIT_MS) {
    setTimeout(() => sendLinkInstructions(sessionId, waitedMs + SETUP_READY_POLL_MS), SETUP_READY_POLL_MS)
    return
  }

  writeAsMessage(session.ptyProcess, decorateDuxMessage(buildInstructions(session)))
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
