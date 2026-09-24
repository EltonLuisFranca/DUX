const http = require('http')
const https = require('https')

const DEFAULT_TIMEOUT_MS = 6000
const MAX_BODY_BYTES = 200_000
const DEFAULT_CONCURRENCY = 5
const MAX_CONCURRENCY = 10

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

async function readBodyCapped(response, maxBytes) {
  if (!response.body) {
    try {
      return await response.text()
    } catch {
      return ''
    }
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
    if (total >= maxBytes) {
      await reader.cancel().catch(() => {})
      break
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}

// Mesmo padrão de fetch com AbortController+timeout registrado num set
// compartilhado (activeControllers) usado em subdomainScan.js/dirFuzz.js —
// permite ao stop() do runner abortar todas as requisições em voo na hora.
async function safeFetch(url, opts, timeoutMs, activeControllers) {
  const controller = new AbortController()
  activeControllers?.add(controller)
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    const response = await fetch(url, { redirect: 'follow', ...opts, signal: controller.signal })
    const text = opts?.method === 'HEAD' ? '' : await readBodyCapped(response, MAX_BODY_BYTES)
    return { response, text }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    activeControllers?.delete(controller)
  }
}

// fetch()/undici ignoram um header Host customizado (é um dos "forbidden
// request headers" da spec) — sempre mandam o host real da conexão. Só o
// módulo http/https nativo do Node respeita um Host explícito, então o check
// de host-header-injection precisa dele em vez de safeFetch.
function requestWithHostHeader(urlStr, hostHeader, timeoutMs) {
  return new Promise((resolve) => {
    let target
    try {
      target = new URL(urlStr)
    } catch {
      resolve(null)
      return
    }
    const lib = target.protocol === 'https:' ? https : http
    const req = lib.request(target, { method: 'GET', headers: { Host: hostHeader }, timeout: timeoutMs }, (res) => {
      const chunks = []
      let total = 0
      res.on('data', (chunk) => {
        chunks.push(chunk)
        total += chunk.length
        if (total >= MAX_BODY_BYTES) res.destroy()
      })
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', () => resolve(null))
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(null))
    req.end()
  })
}

async function tryPaths(base, paths, matcher, ctx) {
  for (const p of paths) {
    const r = await safeFetch(`${base}/${p}`, {}, ctx.timeoutMs, ctx.activeControllers)
    if (r?.response.ok) {
      const hit = matcher(r.text, p)
      if (hit) return hit
    }
  }
  return null
}

// Cada checagem sonda um sintoma bem específico via HTTP puro — sem
// dependência de nuclei/nikto/sqlmap. Não é uma engine de templates (não
// mira CVEs individuais por versão), é uma checklist curada das classes de
// vulnerabilidade mais comuns em recon de aplicação web — mesmo espírito das
// wordlists de dir-fuzz/subdomain-scan: cobre o mais provável, não é
// exaustiva. Todo check devolve uma string de evidência ou null.
const CHECKS = [
  {
    id: 'git-exposed',
    name: '.git exposto',
    severity: 'critical',
    category: 'exposição de arquivo',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/.git/HEAD`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && /^ref:\s*refs\//.test(r.text.trim())) {
        return `.git/HEAD acessível: "${r.text.trim().slice(0, 60)}" — repositório pode ser reconstruído com git-dumper`
      }
      return null
    }
  },
  {
    id: 'env-exposed',
    name: '.env exposto',
    severity: 'critical',
    category: 'exposição de arquivo',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/.env`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && /^[A-Z][A-Z0-9_]*\s*=/m.test(r.text) && r.text.length < 20_000) {
        return `.env acessível com conteúdo tipo KEY=VALUE (${r.text.length} bytes)`
      }
      return null
    }
  },
  {
    id: 'aws-credentials-exposed',
    name: 'Credenciais AWS expostas',
    severity: 'critical',
    category: 'exposição de arquivo',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/.aws/credentials`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && /aws_access_key_id/i.test(r.text)) return '.aws/credentials acessível publicamente'
      return null
    }
  },
  {
    id: 'ssh-key-exposed',
    name: 'Chave SSH privada exposta',
    severity: 'critical',
    category: 'exposição de arquivo',
    run: (ctx) =>
      tryPaths(
        ctx.base,
        ['id_rsa', '.ssh/id_rsa'],
        (text) => (/-----BEGIN (RSA |OPENSSH |)PRIVATE KEY-----/.test(text) ? 'chave privada SSH acessível publicamente' : null),
        ctx
      )
  },
  {
    id: 'sql-backup-exposed',
    name: 'Backup de banco exposto',
    severity: 'high',
    category: 'exposição de arquivo',
    run: (ctx) =>
      tryPaths(
        ctx.base,
        ['backup.sql', 'dump.sql', 'db.sql', 'database.sql'],
        (text, p) => (/create table|insert into/i.test(text) ? `${p} acessível com conteúdo SQL` : null),
        ctx
      )
  },
  {
    id: 'path-traversal',
    name: 'Path traversal básico',
    severity: 'critical',
    category: 'injeção',
    run: (ctx) =>
      tryPaths(
        ctx.base,
        ['../../../../etc/passwd', '..%2f..%2f..%2f..%2fetc%2fpasswd'],
        (text, p) => (/root:.*:0:0:/.test(text) ? `path traversal expôs /etc/passwd via "/${p}"` : null),
        ctx
      )
  },
  {
    id: 'sql-injection-error',
    name: 'Erro de SQL ao injetar aspas',
    severity: 'critical',
    category: 'injeção',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/?id=1'`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r && /sql syntax|mysql_fetch|ora-\d{5}|postgresql.*error|sqlite3?::|unclosed quotation mark|sqlstate\[/i.test(r.text)) {
        return 'erro de banco de dados exposto ao injetar aspas no parâmetro "id" (possível SQL Injection)'
      }
      return null
    }
  },
  {
    id: 'reflected-xss',
    name: 'XSS refletido básico',
    severity: 'high',
    category: 'injeção',
    run: async (ctx) => {
      const probe = '<duxscan>1</duxscan>'
      for (const param of ['q', 'search', 's', 'query']) {
        const r = await safeFetch(`${ctx.base}/?${param}=${encodeURIComponent(probe)}`, {}, ctx.timeoutMs, ctx.activeControllers)
        if (r?.text.includes(probe)) return `payload refletido sem encoding via parâmetro "${param}" (possível XSS refletido)`
      }
      return null
    }
  },
  {
    id: 'open-redirect',
    name: 'Open redirect',
    severity: 'medium',
    category: 'lógica de negócio',
    run: async (ctx) => {
      const evilHost = 'evil-dux-pentest-probe.example'
      for (const param of ['next', 'url', 'redirect', 'return', 'continue', 'dest']) {
        const r = await safeFetch(`${ctx.base}/?${param}=https://${evilHost}`, { redirect: 'manual' }, ctx.timeoutMs, ctx.activeControllers)
        const status = r?.response.status || 0
        const location = r?.response.headers.get('location') || ''
        if (status >= 300 && status < 400 && location.includes(evilHost)) {
          return `parâmetro "${param}" redireciona para domínio externo arbitrário (Location: ${location})`
        }
      }
      return null
    }
  },
  {
    id: 'cors-misconfig',
    name: 'CORS mal configurado',
    severity: 'high',
    category: 'configuração',
    run: async (ctx) => {
      const evilOrigin = 'https://evil-dux-pentest-probe.example'
      const r = await safeFetch(`${ctx.base}/`, { headers: { Origin: evilOrigin } }, ctx.timeoutMs, ctx.activeControllers)
      const aco = r?.response.headers.get('access-control-allow-origin')
      const acc = r?.response.headers.get('access-control-allow-credentials')
      if (aco === evilOrigin) {
        return `Access-Control-Allow-Origin reflete a origem arbitrária enviada${acc === 'true' ? ', com Allow-Credentials habilitado (crítico)' : ''}`
      }
      return null
    }
  },
  {
    id: 'dangerous-http-methods',
    name: 'Métodos HTTP perigosos habilitados',
    severity: 'medium',
    category: 'configuração',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/`, { method: 'OPTIONS' }, ctx.timeoutMs, ctx.activeControllers)
      const allow = (r?.response.headers.get('allow') || '').toUpperCase()
      const dangerous = ['PUT', 'DELETE', 'TRACE'].filter((m) => allow.includes(m))
      if (dangerous.length) return `método(s) ${dangerous.join(', ')} habilitado(s) (Allow: ${allow})`
      return null
    }
  },
  {
    id: 'host-header-injection',
    name: 'Host header refletido',
    severity: 'medium',
    category: 'injeção',
    run: async (ctx) => {
      const probeHost = 'duxpentest-probe.example'
      const r = await requestWithHostHeader(`${ctx.base}/`, probeHost, ctx.timeoutMs)
      if (r?.text.includes(probeHost)) return 'Host header arbitrário é refletido na resposta (possível cache/password-reset poisoning)'
      return null
    }
  },
  {
    id: 'directory-listing',
    name: 'Listagem de diretório habilitada',
    severity: 'medium',
    category: 'configuração',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r && /<title>index of \//i.test(r.text)) return 'listagem de diretório habilitada na raiz'
      return null
    }
  },
  {
    id: 'verbose-error',
    name: 'Erro verboso / stack trace exposto',
    severity: 'medium',
    category: 'exposição de informação',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/?duxprobe=%27%22%3C`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (
        r &&
        /stack trace|whitelabel error page|traceback \(most recent|unhandled exception|fatal error:|django\.core\.|system\.web\.httpexception/i.test(
          r.text
        )
      ) {
        return 'resposta contém stack trace ou mensagem de erro verbosa'
      }
      return null
    }
  },
  {
    id: 'phpinfo-exposed',
    name: 'phpinfo() exposto',
    severity: 'high',
    category: 'exposição de informação',
    run: (ctx) =>
      tryPaths(
        ctx.base,
        ['phpinfo.php', 'info.php', 'test.php'],
        (text, p) => (/phpinfo\(\)|php version/i.test(text) ? `${p} expõe phpinfo()` : null),
        ctx
      )
  },
  {
    id: 'spring-actuator-env',
    name: 'Spring Boot Actuator exposto',
    severity: 'high',
    category: 'exposição de informação',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/actuator/env`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && /"propertysources"|"activeprofiles"/i.test(r.text)) {
        return '/actuator/env expõe variáveis de ambiente (Spring Boot Actuator sem proteção)'
      }
      return null
    }
  },
  {
    id: 'swagger-exposed',
    name: 'Documentação de API pública',
    severity: 'low',
    category: 'exposição de informação',
    run: (ctx) =>
      tryPaths(
        ctx.base,
        ['swagger.json', 'swagger-ui', 'api-docs', 'openapi.json', 'v2/api-docs'],
        (text, p) => (/"swagger"|"openapi"/i.test(text) ? `${p} expõe documentação Swagger/OpenAPI publicamente` : null),
        ctx
      )
  },
  {
    id: 'server-version-exposed',
    name: 'Versão de servidor exposta',
    severity: 'low',
    category: 'exposição de informação',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/`, {}, ctx.timeoutMs, ctx.activeControllers)
      const values = [r?.response.headers.get('server'), r?.response.headers.get('x-powered-by')].filter(Boolean)
      const withVersion = values.find((v) => /\d+\.\d+/.test(v))
      if (withVersion) return `versão explícita exposta: "${withVersion}" — pesquise CVEs conhecidas para essa versão`
      return null
    }
  }
]

// Mesmo shape do createRunner de dirFuzz.js: worker pool sobre uma lista fixa
// (aqui, CHECKS em vez de uma wordlist), onProgress a cada check concluído
// (achado ou não), onDone uma vez com o resumo ordenado por severidade;
// stop() cancela cooperativamente via activeControllers.
function createRunner({ url, timeoutMs, concurrency }, { onProgress, onDone }) {
  const target = String(url || '').trim()
  const timeout = Math.max(1000, Math.min(20_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  const workers = Math.max(1, Math.min(MAX_CONCURRENCY, Number(concurrency) || DEFAULT_CONCURRENCY))
  const startedAt = Date.now()

  if (!/^https?:\/\//i.test(target)) {
    setTimeout(() => onDone({ cancelled: false, error: 'URL inválida (precisa começar com http:// ou https://)' }), 0)
    return { stop() {} }
  }

  const base = target.replace(/\/+$/, '')
  const total = CHECKS.length
  let cancelled = false
  let nextIndex = 0
  let completed = 0
  const findings = []
  const activeControllers = new Set()

  async function worker() {
    while (!cancelled) {
      const index = nextIndex++
      if (index >= total) return
      const check = CHECKS[index]
      let evidence = null
      try {
        evidence = await check.run({ base, timeoutMs: timeout, activeControllers })
      } catch {
        evidence = null
      }
      completed += 1

      if (evidence) {
        findings.push({ id: check.id, name: check.name, severity: check.severity, category: check.category, evidence })
        onProgress({ seq: completed, total, id: check.id, name: check.name, found: true, severity: check.severity, evidence })
      } else {
        onProgress({ seq: completed, total, id: check.id, name: check.name, found: false })
      }
    }
  }

  Promise.all(Array.from({ length: workers }, worker)).then(() => {
    findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    onDone({
      cancelled,
      totalChecks: total,
      findings,
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

module.exports = { createRunner, CHECKS, SEVERITY_ORDER }
