const DEFAULT_TIMEOUT_MS = 5000
const MAX_CONCURRENCY = 100
const MAX_PATHS = 5000

// Wordlist curta de recon inicial — mesmo espírito da TOP_PORTS do
// port-scan.js e da COMMON_SUBDOMAINS do subdomain-scan.js: cobre os paths
// mais prováveis de expor algo interessante (painéis admin, arquivos de
// config/segredo, artefatos de deploy, endpoints de API/observabilidade),
// não uma wordlist exaustiva tipo SecLists/dirbuster (dezenas de milhares
// de entradas) que levaria horas pra rodar.
const COMMON_PATHS = [
  'admin', 'administrator', 'admin.php', 'administrator.php', 'admin/login', 'wp-admin', 'wp-login.php',
  'login', 'logout', 'signin', 'signup', 'register', 'dashboard', 'panel', 'cpanel', 'console',
  'api', 'api/v1', 'api/v2', 'graphql', 'swagger', 'swagger.json', 'swagger-ui', 'api-docs', 'openapi.json',
  '.env', '.env.local', '.env.production', '.env.dev', '.env.bak', 'config', 'config.php', 'config.json',
  'config.yml', 'settings.php', '.git', '.git/config', '.git/HEAD', '.git/index', '.git/logs/HEAD', '.svn', '.hg',
  'backup', 'backups', 'backup.zip', 'backup.tar.gz', 'backup.sql', 'dump.sql', 'db.sql', 'database.sql',
  '.htaccess', '.htpasswd', 'robots.txt', 'sitemap.xml', 'security.txt', '.well-known', '.well-known/security.txt',
  'phpinfo.php', 'info.php', 'test.php', 'test', 'debug', 'debug.php', 'server-status', 'server-info',
  '.aws', '.aws/credentials', '.ssh', '.ssh/id_rsa', 'id_rsa', 'id_rsa.pub', 'credentials', 'credentials.json',
  'secret', 'secrets', 'secrets.json', 'keys', 'key.pem', 'private.key', 'certificate.pem',
  '.npmrc', '.dockerignore', '.gitignore', 'docker-compose.yml', 'Dockerfile', 'package.json', 'composer.json',
  'composer.lock', 'package-lock.json', 'yarn.lock', 'vendor', 'node_modules', '.DS_Store', 'Thumbs.db',
  'uploads', 'upload', 'files', 'assets', 'static', 'media', 'images', 'tmp', 'temp', 'cache',
  'logs', 'log', 'error_log', 'access_log', 'error.log', 'access.log', '.idea', '.vscode',
  'install', 'install.php', 'setup', 'setup.php', 'old', 'old_site', 'backup_old', 'new', 'staging',
  'test-api', 'health', 'healthz', 'status', 'metrics', 'actuator', 'actuator/health', 'actuator/env',
  'auth', 'oauth', 'token', 'jwt', 'README.md', 'CHANGELOG.md', 'LICENSE',
  'private', 'internal', 'hidden', 'admin_area', 'manage', 'management', 'webadmin', 'adminpanel'
]

function parseCustomWordlist(raw) {
  const seen = new Set()
  for (const line of String(raw || '').split('\n')) {
    const trimmed = line.trim().replace(/^\/+/, '')
    if (!trimmed) continue
    seen.add(trimmed)
    if (seen.size >= MAX_PATHS) break
  }
  return [...seen]
}

function parseWordlist({ mode, customWordlist } = {}) {
  const list = mode === 'custom' ? parseCustomWordlist(customWordlist) : COMMON_PATHS
  return [...new Set(list)].slice(0, MAX_PATHS)
}

function buildTargetUrl(baseUrl, p) {
  const base = baseUrl.replace(/\/+$/, '')
  const cleanPath = String(p).replace(/^\/+/, '')
  return `${base}/${cleanPath}`
}

// GET (não HEAD) porque precisamos do tamanho real do corpo — o card pede
// "path, status code e tamanho da resposta". redirect: 'manual' pra reportar
// o status do path em si (301/302 incluso), não seguir pra onde ele
// redireciona (mesmo motivo do probeHttp em subdomain-scan.js). 404 é
// descartado sem ler o corpo (não interessa o conteúdo, e a wordlist inteira
// costuma ser majoritariamente 404); os demais usam content-length quando
// presente, ou leem o corpo pra medir (ex: respostas chunked sem esse header).
async function fetchPath(targetUrl, timeoutMs, activeControllers) {
  const controller = new AbortController()
  activeControllers?.add(controller)
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    const response = await fetch(targetUrl, { method: 'GET', redirect: 'manual', signal: controller.signal })

    if (response.status === 404) {
      if (response.body) await response.body.cancel().catch(() => {})
      return { status: 404 }
    }

    const contentLengthHeader = response.headers.get('content-length')
    let size = contentLengthHeader !== null ? Number(contentLengthHeader) : null
    if (size === null) {
      const buf = await response.arrayBuffer()
      size = buf.byteLength
    } else if (response.body) {
      await response.body.cancel().catch(() => {})
    }

    return { status: response.status, size }
  } catch (err) {
    return { status: null, error: err.name === 'AbortError' ? 'timeout' : err.message || 'erro de rede' }
  } finally {
    clearTimeout(timer)
    activeControllers?.delete(controller)
  }
}

// Mesmo shape do createRunner de portScan.js/subdomainScan.js: onProgress a
// cada path testado (achado ou não — a UI usa isso pra barra de progresso),
// onDone uma vez com o resumo; stop() cancela cooperativamente (workers em
// voo terminam a checagem atual e não pegam a próxima).
function createRunner({ url, wordlist: wordlistConfig, timeoutMs, concurrency }, { onProgress, onDone }) {
  const baseUrl = String(url || '').trim()
  const words = parseWordlist(wordlistConfig)
  const total = words.length
  const timeout = Math.max(200, Math.min(20_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  const workers = Math.max(1, Math.min(MAX_CONCURRENCY, Number(concurrency) || 20, total || 1))

  let cancelled = false
  let nextIndex = 0
  let completed = 0
  const found = []
  const activeControllers = new Set()
  const startedAt = Date.now()

  if (total === 0 || !/^https?:\/\//i.test(baseUrl)) {
    setTimeout(() => onDone({ cancelled: false, totalPaths: 0, found: [], durationMs: 0 }), 0)
    return { stop() {} }
  }

  async function worker() {
    while (!cancelled) {
      const index = nextIndex++
      if (index >= total) return
      const p = words[index]
      const targetUrl = buildTargetUrl(baseUrl, p)
      const result = await fetchPath(targetUrl, timeout, activeControllers)
      completed += 1

      if (result.status !== null && result.status !== 404) {
        const entry = { path: p, url: targetUrl, status: result.status, size: result.size ?? null }
        found.push(entry)
        onProgress({ seq: completed, total, path: p, found: true, ...entry })
      } else {
        onProgress({ seq: completed, total, path: p, found: false, error: result.error })
      }
    }
  }

  Promise.all(Array.from({ length: workers }, worker)).then(() => {
    onDone({
      cancelled,
      totalPaths: total,
      found: found.sort((a, b) => a.path.localeCompare(b.path)),
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

module.exports = { createRunner, parseWordlist, COMMON_PATHS }
