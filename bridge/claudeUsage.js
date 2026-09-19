const fs = require('fs')
const os = require('os')
const path = require('path')

const HOME = os.homedir()
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects')

const POLL_MS = 3000
// Lê só a cauda do arquivo em vez do arquivo inteiro — transcripts de sessões
// longas passam de vários MB, e como isso roda a cada POLL_MS pra todo
// terminal Claude Code aberto, ler tudo a cada tick pesaria à toa. A última
// mensagem "assistant" (com o campo usage que interessa) cabe folgado nos
// últimos 64KB, mesmo com respostas grandes.
const TAIL_BYTES = 65536

// Janela de contexto padrão dos modelos Claude atuais. Sessões com o beta de
// 1M de contexto (flag "context-1m-..." / modelo com sufixo "-1m") usam uma
// janela bem maior — sem essa distinção, uma sessão 1M apareceria sempre
// perto de 100% cheia.
const DEFAULT_CONTEXT_WINDOW = 200000
const LARGE_CONTEXT_WINDOW = 1000000

function contextWindowFor(model) {
  if (model && /1m\b|-1m$|\[1m\]/i.test(model)) return LARGE_CONTEXT_WINDOW
  return DEFAULT_CONTEXT_WINDOW
}

// Mesmo esquema de nome de pasta usado pelo próprio Claude Code em
// ~/.claude/projects: o cwd absoluto com qualquer caractere não
// alfanumérico virando "-" (então "/home/user/my.app" -> "-home-user-my-app").
function encodeProjectDir(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

function projectDirFor(cwd) {
  return path.join(PROJECTS_DIR, encodeProjectDir(cwd))
}

// sessionId (do DUX) -> { timer, cwd, startedAt, lastFile, lastMtimeMs, lastPercent }
const watches = new Map()

function newestTranscript(dir, notBeforeMs) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }

  let best = null
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    const full = path.join(dir, entry.name)
    let stat
    try {
      stat = fs.statSync(full)
    } catch {
      continue
    }
    // ignora transcripts de sessões antigas que por acaso sobraram no mesmo
    // projeto — só interessa a que nasceu depois deste terminal ter iniciado
    if (stat.mtimeMs < notBeforeMs) continue
    if (!best || stat.mtimeMs > best.mtimeMs) best = { file: full, mtimeMs: stat.mtimeMs }
  }
  return best
}

// Extrai o "usage" da última linha "assistant" completa dentro do trecho de
// texto dado (a cauda do arquivo). Uma linha pode ter ficado cortada no início
// do trecho lido — por isso descarta a primeira linha (possivelmente parcial)
// e varre de baixo pra cima, parando na primeira que parsear como JSON válido
// com o formato esperado.
function lastUsageFrom(text) {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 1; i--) {
    const line = lines[i].trim()
    if (!line) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const usage = entry?.message?.usage
    if (entry?.type === 'assistant' && usage) {
      return { usage, model: entry.message.model }
    }
  }
  return null
}

function readLatestUsage(file) {
  let size
  try {
    size = fs.statSync(file).size
  } catch {
    return null
  }
  const start = Math.max(0, size - TAIL_BYTES)
  const length = size - start
  if (length <= 0) return null

  const buffer = Buffer.alloc(length)
  let fd
  try {
    fd = fs.openSync(file, 'r')
    fs.readSync(fd, buffer, 0, length, start)
  } catch {
    return null
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }

  return lastUsageFrom(buffer.toString('utf8'))
}

function computeUsage(file) {
  const found = readLatestUsage(file)
  if (!found) return null

  const { usage, model } = found
  const contextTokens =
    (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
  const contextWindow = contextWindowFor(model)
  const percent = Math.max(0, Math.min(100, Math.round((contextTokens / contextWindow) * 100)))

  return { percent, contextTokens, contextWindow, model }
}

function tick(sessionId) {
  const watch = watches.get(sessionId)
  if (!watch) return

  if (!watch.lastFile) {
    const found = newestTranscript(projectDirFor(watch.cwd), watch.startedAt - POLL_MS)
    if (found) watch.lastFile = found.file
  }
  if (!watch.lastFile) return

  let mtimeMs
  try {
    mtimeMs = fs.statSync(watch.lastFile).mtimeMs
  } catch {
    watch.lastFile = null
    return
  }
  if (mtimeMs === watch.lastMtimeMs) return
  watch.lastMtimeMs = mtimeMs

  const info = computeUsage(watch.lastFile)
  if (!info || info.percent === watch.lastPercent) return
  watch.lastPercent = info.percent
  watch.onUsage(info)
}

function startWatch(sessionId, { cwd, onUsage }) {
  stopWatch(sessionId)
  const watch = {
    cwd,
    startedAt: Date.now(),
    lastFile: null,
    lastMtimeMs: null,
    lastPercent: null,
    onUsage
  }
  watches.set(sessionId, watch)
  watch.timer = setInterval(() => tick(sessionId), POLL_MS)
}

function stopWatch(sessionId) {
  const watch = watches.get(sessionId)
  if (!watch) return
  clearInterval(watch.timer)
  watches.delete(sessionId)
}

module.exports = { startWatch, stopWatch }
