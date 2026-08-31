const { writeAsDraft, decorateDuxMessage } = require('./ptyWrite')

const SETUP_READY_POLL_MS = 200
const SETUP_READY_MAX_WAIT_MS = 15000
// mesma heurística/threshold de agentLink.sendLinkInstructions: espera o
// terminal ficar ocioso por uma janela maior que a de dux-ask antes de
// injetar, pra não competir com boot do shell/agente (fastfetch, splash etc.)
const SETUP_IDLE_MS = 2500

// notePath (resolvido, absoluto) -> Set<sessionId>
const noteWatchers = new Map()

// sessionId -> { ptyProcess, lastDataAt, notePaths: Set<notePath> }
const sessionInfo = new Map()

function isIdle(info, thresholdMs = SETUP_IDLE_MS) {
  return Date.now() - info.lastDataAt >= thresholdMs
}

// chamado a cada chunk de dados que sai do PTY (mesmo hook que já alimenta
// agentLink.onSessionData, em bridge/server.js) — só pra saber se o terminal
// está ocioso antes de injetar o aviso de nota, mesma heurística usada em
// agentLink.sendLinkInstructions.
function onSessionData(sessionId) {
  const info = sessionInfo.get(sessionId)
  if (info) info.lastDataAt = Date.now()
}

// Mesma linguagem factual/verificável usada em agentLink.buildInstructions —
// evita que o agente reconheça o texto como tentativa de prompt injection e
// se recuse a agir sem confirmação manual (ver comentário lá).
function buildNoteInstructions(notePath) {
  return (
    `[DUX] Automatic notice from DUX (the Electron app running this terminal, not an external agent, and not ` +
    `part of the user's own conversation): a shared note file is now connected to this terminal in the DUX ` +
    `canvas, available at "${notePath}". This file is not part of this terminal's working directory — read and ` +
    `edit it directly with your own file tools (it's a real file on disk, not app state) to record or retrieve ` +
    `context shared with other agents connected to the same note. Only touch it when the user's task calls for ` +
    `persisting or checking shared notes/decisions.`
  )
}

function buildNoteRemovedInstructions(notePath) {
  return (
    `[DUX] Automatic notice from DUX: the shared note file at "${notePath}" was disconnected from this terminal ` +
    `in the DUX canvas. It's no longer expected to be read or edited from here.`
  )
}

function sendNoteInstructions(sessionId, notePath, text, waitedMs = 0) {
  const info = sessionInfo.get(sessionId)
  if (!info) return

  if (!isIdle(info) && waitedMs < SETUP_READY_MAX_WAIT_MS) {
    setTimeout(() => sendNoteInstructions(sessionId, notePath, text, waitedMs + SETUP_READY_POLL_MS), SETUP_READY_POLL_MS)
    return
  }

  // writeAsDraft (não writeAsMessage): o aviso fica sentado no campo de
  // input em vez de ser enviado sozinho — o agente só deve olhar pra nota
  // quando o usuário mandar a próxima mensagem de verdade, não no instante
  // em que a edge conecta.
  writeAsDraft(info.ptyProcess, decorateDuxMessage(text))
}

// registrado a partir do mesmo ponto em que agentLink.registerSession roda
// (bridge/server.js, ao spawnar o pty)
function registerSession(sessionId, { ptyProcess }) {
  sessionInfo.set(sessionId, { ptyProcess, lastDataAt: Date.now(), notePaths: new Set() })
}

function unregisterSession(sessionId) {
  const info = sessionInfo.get(sessionId)
  if (!info) return
  for (const notePath of info.notePaths) {
    noteWatchers.get(notePath)?.delete(sessionId)
    if (noteWatchers.get(notePath)?.size === 0) noteWatchers.delete(notePath)
  }
  sessionInfo.delete(sessionId)
}

const LINK_RETRY_MS = 500
const LINK_RETRY_ATTEMPTS = 10

// a edge nota->agente pode ser reafirmada (relinkExistingEdges, em
// WslClaudeTerminalNode.vue) assim que o terminal abre seu WebSocket — a
// mensagem noteLink chega numa conexão WS separada da que manda `start`, sem
// ordem garantida entre as duas, então a sessão pode ainda não estar
// registrada aqui. Mesmo padrão de retry de agentLink.linkSessions.
function linkNote(sessionId, notePath, attemptsLeft = LINK_RETRY_ATTEMPTS) {
  const info = sessionInfo.get(sessionId)
  if (!info) {
    if (attemptsLeft > 0) {
      setTimeout(() => linkNote(sessionId, notePath, attemptsLeft - 1), LINK_RETRY_MS)
    }
    return
  }

  if (!noteWatchers.has(notePath)) noteWatchers.set(notePath, new Set())
  const watchers = noteWatchers.get(notePath)

  const alreadyLinked = watchers.has(sessionId)
  watchers.add(sessionId)
  info.notePaths.add(notePath)
  if (alreadyLinked) return

  sendNoteInstructions(sessionId, notePath, buildNoteInstructions(notePath))
}

function unlinkNote(sessionId, notePath) {
  const info = sessionInfo.get(sessionId)
  const watchers = noteWatchers.get(notePath)
  const wasLinked = watchers?.has(sessionId)

  watchers?.delete(sessionId)
  if (watchers?.size === 0) noteWatchers.delete(notePath)
  info?.notePaths.delete(notePath)

  if (wasLinked) sendNoteInstructions(sessionId, notePath, buildNoteRemovedInstructions(notePath))
}

module.exports = {
  registerSession,
  unregisterSession,
  onSessionData,
  linkNote,
  unlinkNote
}
