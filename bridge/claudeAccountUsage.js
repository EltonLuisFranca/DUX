const fs = require('fs')
const os = require('os')
const path = require('path')
const { WebSocket } = require('ws')

const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json')

// O /usage do Claude Code chama esse mesmo endpoint (confirmado lendo o
// próprio binário da CLI) com o access token OAuth salvo por ela em
// .credentials.json — não é uma API pública documentada, então o formato da
// resposta pode mudar entre versões da CLI sem aviso.
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

// Limite de plano é conta inteira, não por sessão — não faz sentido repetir
// a leitura a cada 3s por terminal aberto (como o claudeUsage.js de contexto
// faz). Um poll global e compartilhado entre todos os watchers já bastam.
const POLL_MS = 60000

let cached = null
let pollTimer = null
const subscribers = new Set()

function readAccessToken() {
  try {
    const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'))
    return raw?.claudeAiOauth?.accessToken || null
  } catch {
    return null
  }
}

function pickLimit(entry) {
  if (!entry || typeof entry.utilization !== 'number') return null
  return { percent: Math.round(entry.utilization), resetsAt: entry.resets_at || null }
}

async function fetchUsage() {
  const accessToken = readAccessToken()
  if (!accessToken) return { error: 'no-auth' }

  let res
  try {
    res = await fetch(USAGE_URL, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }
    })
  } catch {
    return { error: 'network' }
  }

  if (!res.ok) return { error: res.status === 401 ? 'unauthorized' : 'http-error' }

  let data
  try {
    data = await res.json()
  } catch {
    return { error: 'bad-response' }
  }

  return { session: pickLimit(data.five_hour), week: pickLimit(data.seven_day) }
}

function broadcast(usage) {
  cached = usage
  const message = JSON.stringify({ type: 'accountUsageUpdate', ...usage })
  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message)
  }
}

async function poll() {
  broadcast(await fetchUsage())
}

function ensurePolling() {
  if (pollTimer) return
  poll()
  pollTimer = setInterval(poll, POLL_MS)
}

function stopPollingIfIdle() {
  if (subscribers.size > 0 || !pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
}

function subscribe(ws) {
  subscribers.add(ws)
  if (cached && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'accountUsageUpdate', ...cached }))
  }
  ensurePolling()
}

function unsubscribe(ws) {
  subscribers.delete(ws)
  stopPollingIfIdle()
}

module.exports = { subscribe, unsubscribe }
