const dns = require('dns')

const dnsPromises = dns.promises

const DEFAULT_TIMEOUT_MS = 3000
const MAX_CONCURRENCY = 100
const MAX_SUBDOMAINS = 2000

// Wordlist curta de recon inicial — mesmo espírito da TOP_PORTS do
// port-scan.js: cobre os subdomínios mais prováveis de existir (infra,
// ambientes, serviços internos comuns), não uma wordlist exaustiva tipo
// SecLists (dezenas de milhares de entradas) que levaria horas pra rodar.
const COMMON_SUBDOMAINS = [
  'www', 'mail', 'webmail', 'smtp', 'pop', 'imap', 'ns1', 'ns2', 'mx', 'api',
  'dev', 'staging', 'stage', 'test', 'qa', 'uat', 'demo', 'beta', 'preprod', 'prod',
  'vpn', 'admin', 'portal', 'app', 'mobile', 'm', 'static', 'media', 'img', 'images',
  'cdn', 'assets', 'files', 'upload', 'uploads', 'download', 'downloads', 'secure', 'sso', 'auth',
  'login', 'dashboard', 'panel', 'cpanel', 'whm', 'git', 'gitlab', 'github', 'jenkins', 'ci',
  'jira', 'confluence', 'wiki', 'docs', 'help', 'support', 'status', 'monitor', 'monitoring', 'grafana',
  'kibana', 'elastic', 'logs', 'redis', 'db', 'database', 'mysql', 'postgres', 'mongo', 'sql',
  's3', 'old', 'new', 'backup', 'temp', 'tmp', 'internal', 'intranet', 'remote', 'ssh',
  'ftp', 'ftps', 'sftp', 'shop', 'store', 'blog', 'news', 'forum', 'community', 'chat',
  'video', 'stream', 'live', 'api-dev', 'api-staging', 'dev-api', 'staging-api', 'test-api', 'my', 'account',
  'accounts', 'id', 'oauth', 'payments', 'pay', 'billing', 'crm', 'erp', 'hr', 'ns',
  'proxy', 'lb', 'edge', 'origin', 'cache', 'search', 'kafka', 'rabbitmq', 'queue', 'worker',
  'jobs', 'cron', 'batch', 'node', 'node1', 'node2', 'web', 'web1', 'web2', 'app1',
  'app2', 'api1', 'api2', 'host', 'server'
]

function parseCustomWordlist(raw) {
  const seen = new Set()
  for (const line of String(raw || '').split('\n')) {
    const trimmed = line.trim().toLowerCase()
    if (!trimmed) continue
    seen.add(trimmed)
    if (seen.size >= MAX_SUBDOMAINS) break
  }
  return [...seen]
}

function parseWordlist({ mode, customWordlist } = {}) {
  const list = mode === 'custom' ? parseCustomWordlist(customWordlist) : COMMON_SUBDOMAINS
  return [...new Set(list)].slice(0, MAX_SUBDOMAINS)
}

// Corrida contra um timeout manual — dns.promises não suporta AbortSignal,
// então (mesma solução do socket.setTimeout no portScan.js) a promise de
// resolução original é abandonada quando o timeout vence: ela ainda resolve
// depois, só que ninguém mais espera o resultado.
function resolveWithTimeout(hostname, timeoutMs) {
  const attempt = dnsPromises
    .resolve4(hostname)
    .catch(() => dnsPromises.resolve6(hostname))
    .then((addrs) => ({ ok: true, addrs }))
    .catch(() => ({ ok: false }))

  const timeout = new Promise((resolve) => setTimeout(() => resolve({ ok: false, timedOut: true }), timeoutMs))

  return Promise.race([attempt, timeout])
}

// HEAD é suficiente pra descobrir se algo responde e com que status — não
// segue redirect (redirect: 'manual') pra reportar o status real do host
// alvo, não de onde ele redireciona.
async function probeHttp(hostname, timeoutMs, activeControllers) {
  for (const scheme of ['https', 'http']) {
    const controller = new AbortController()
    activeControllers?.add(controller)
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
    try {
      const response = await fetch(`${scheme}://${hostname}/`, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal
      })
      return { scheme, status: response.status }
    } catch {
      // tenta o próximo esquema (https -> http); se os dois falharem, retorna null
    } finally {
      clearTimeout(timer)
      activeControllers?.delete(controller)
    }
  }
  return null
}

// Resolve DNS primeiro; se resolver, tenta HTTP em cima pra pegar o status.
// Se o DNS falhar, ainda tenta HTTP como fallback (fetch usa a resolução do
// próprio Node/SO, que pode enxergar o host mesmo quando resolve4/6 direto
// não vê — ex: wildcard DNS, resolvers locais diferentes) — mesmo requisito
// do card: "resolução DNS (ou fetch HTTP como fallback)".
async function scanOneSubdomain(hostname, { timeoutMs, checkHttpEnabled, activeControllers }) {
  const dnsResult = await resolveWithTimeout(hostname, timeoutMs)

  if (dnsResult.ok) {
    const httpResult = checkHttpEnabled ? await probeHttp(hostname, timeoutMs, activeControllers) : null
    return { found: true, method: 'dns', ips: dnsResult.addrs, httpStatus: httpResult?.status ?? null, scheme: httpResult?.scheme ?? null }
  }

  if (checkHttpEnabled) {
    const httpResult = await probeHttp(hostname, timeoutMs, activeControllers)
    if (httpResult) {
      return { found: true, method: 'http', ips: [], httpStatus: httpResult.status, scheme: httpResult.scheme }
    }
  }

  return { found: false }
}

// Mesmo shape do createRunner de portScan.js: onProgress a cada subdomínio
// testado (achado ou não — a UI usa isso pra barra de progresso), onDone uma
// vez com o resumo; stop() cancela cooperativamente (workers em voo terminam
// a checagem atual e não pegam a próxima).
function createRunner({ domain, wordlist: wordlistConfig, timeoutMs, checkHttp: checkHttpEnabled, concurrency }, { onProgress, onDone }) {
  const cleanDomain = String(domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  const words = parseWordlist(wordlistConfig)
  const total = words.length
  const timeout = Math.max(200, Math.min(15_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  const workers = Math.max(1, Math.min(MAX_CONCURRENCY, Number(concurrency) || 30, total || 1))
  const shouldCheckHttp = checkHttpEnabled !== false

  let cancelled = false
  let nextIndex = 0
  let completed = 0
  const found = []
  const activeControllers = new Set()
  const startedAt = Date.now()

  if (total === 0 || !cleanDomain) {
    setTimeout(() => onDone({ cancelled: false, totalSubdomains: 0, found: [], durationMs: 0 }), 0)
    return { stop() {} }
  }

  async function worker() {
    while (!cancelled) {
      const index = nextIndex++
      if (index >= total) return
      const sub = words[index]
      const hostname = `${sub}.${cleanDomain}`
      const result = await scanOneSubdomain(hostname, { timeoutMs: timeout, checkHttpEnabled: shouldCheckHttp, activeControllers })
      completed += 1

      if (result.found) {
        const entry = { subdomain: sub, hostname, method: result.method, ips: result.ips, httpStatus: result.httpStatus, scheme: result.scheme }
        found.push(entry)
        onProgress({ seq: completed, total, subdomain: sub, hostname, found: true, ...entry })
      } else {
        onProgress({ seq: completed, total, subdomain: sub, hostname, found: false })
      }
    }
  }

  Promise.all(Array.from({ length: workers }, worker)).then(() => {
    onDone({
      cancelled,
      totalSubdomains: total,
      found: found.sort((a, b) => a.subdomain.localeCompare(b.subdomain)),
      durationMs: Date.now() - startedAt
    })
  })

  return {
    stop() {
      cancelled = true
      for (const c of activeControllers) c.abort('stop')
    }
  }
}

module.exports = { createRunner, parseWordlist, COMMON_SUBDOMAINS }
