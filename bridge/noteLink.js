// notePath (resolvido, absoluto) -> Set<sessionId>
const noteWatchers = new Map()

// sessionId -> { notePaths: Set<notePath> }
const sessionInfo = new Map()

// registrado a partir do mesmo ponto em que agentLink.registerSession roda
// (bridge/server.js, ao spawnar o pty)
function registerSession(sessionId) {
  sessionInfo.set(sessionId, { notePaths: new Set() })
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

  watchers.add(sessionId)
  info.notePaths.add(notePath)
}

function unlinkNote(sessionId, notePath) {
  const info = sessionInfo.get(sessionId)
  const watchers = noteWatchers.get(notePath)

  watchers?.delete(sessionId)
  if (watchers?.size === 0) noteWatchers.delete(notePath)
  info?.notePaths.delete(notePath)
}

// usado por /notes (bridge/server.js) pra restringir dux_notes_read/write às
// notas de fato ligadas a esta sessão — o agente já tem suas próprias tools
// de arquivo pra qualquer path arbitrário, então essa checagem não é uma
// fronteira de segurança de verdade, é só manter a tool dux_notes_* coerente
// com seu próprio propósito (notas conectadas, não arquivo qualquer)
function getLinkedNotePaths(sessionId) {
  const info = sessionInfo.get(sessionId)
  return info ? [...info.notePaths] : []
}

module.exports = {
  registerSession,
  unregisterSession,
  linkNote,
  unlinkNote,
  getLinkedNotePaths
}
