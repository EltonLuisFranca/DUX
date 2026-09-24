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
      if (hit) return { evidence: hit, path: p }
    }
  }
  return null
}

// Cada checagem sonda um sintoma bem específico via HTTP puro — sem
// dependência de nuclei/nikto/sqlmap. Não é uma engine de templates (não
// mira CVEs individuais por versão), é uma checklist curada das classes de
// vulnerabilidade mais comuns em recon de aplicação web — mesmo espírito das
// wordlists de dir-fuzz/subdomain-scan: cobre o mais provável, não é
// exaustiva. Todo check devolve { evidence, path } (path = o path/query
// relativo à base que confirmou o achado, pra UI montar a URL exata
// testada) ou null.
const CHECKS = [
  {
    id: 'git-exposed',
    name: '.git exposto',
    severity: 'critical',
    category: 'exposição de arquivo',
    recommendation: 'Remova a pasta .git do servidor de produção (nunca faça deploy dela junto com a aplicação) ou bloqueie o acesso a caminhos que começam com ponto no servidor web/proxy.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/.git/HEAD`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && /^ref:\s*refs\//.test(r.text.trim())) {
        return { evidence: `.git/HEAD acessível: "${r.text.trim().slice(0, 60)}" — repositório pode ser reconstruído com git-dumper`, path: '.git/HEAD' }
      }
      return null
    }
  },
  {
    id: 'env-exposed',
    name: '.env exposto',
    severity: 'critical',
    category: 'exposição de arquivo',
    recommendation: 'Bloqueie o acesso público a arquivos que começam com ponto no servidor web (ex: "location ~ /\\. { deny all; }" no Nginx) e rotacione qualquer segredo que possa ter vazado.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/.env`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && /^[A-Z][A-Z0-9_]*\s*=/m.test(r.text) && r.text.length < 20_000) {
        return { evidence: `.env acessível com conteúdo tipo KEY=VALUE (${r.text.length} bytes)`, path: '.env' }
      }
      return null
    }
  },
  {
    id: 'aws-credentials-exposed',
    name: 'Credenciais AWS expostas',
    severity: 'critical',
    category: 'exposição de arquivo',
    recommendation: 'Remova o arquivo do servidor imediatamente e rotacione as credenciais AWS expostas — considere-as comprometidas.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/.aws/credentials`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && /aws_access_key_id/i.test(r.text)) return { evidence: '.aws/credentials acessível publicamente', path: '.aws/credentials' }
      return null
    }
  },
  {
    id: 'ssh-key-exposed',
    name: 'Chave SSH privada exposta',
    severity: 'critical',
    category: 'exposição de arquivo',
    recommendation: 'Remova a chave privada do diretório público e gere um novo par de chaves — a atual deve ser considerada comprometida.',
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
    recommendation: 'Mova o backup pra fora do webroot (storage privado) e restrinja o acesso via autenticação — nunca deixe dumps de banco acessíveis publicamente.',
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
    recommendation: 'Valide e normalize qualquer path recebido do usuário antes de acessar o filesystem; use uma allowlist de arquivos/diretórios em vez de montar o path com entrada externa.',
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
    recommendation: 'Use queries parametrizadas/prepared statements em vez de concatenar entrada do usuário na query SQL, e desabilite mensagens de erro de banco em produção.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/?id=1'`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r && /sql syntax|mysql_fetch|ora-\d{5}|postgresql.*error|sqlite3?::|unclosed quotation mark|sqlstate\[/i.test(r.text)) {
        return { evidence: 'erro de banco de dados exposto ao injetar aspas no parâmetro "id" (possível SQL Injection)', path: "?id=1'" }
      }
      return null
    }
  },
  {
    id: 'reflected-xss',
    name: 'XSS refletido básico',
    severity: 'high',
    category: 'injeção',
    recommendation: 'Faça encode (HTML entity) de qualquer entrada do usuário antes de refletir ela na resposta, e considere um Content-Security-Policy como camada extra.',
    run: async (ctx) => {
      const probe = '<duxscan>1</duxscan>'
      for (const param of ['q', 'search', 's', 'query']) {
        const r = await safeFetch(`${ctx.base}/?${param}=${encodeURIComponent(probe)}`, {}, ctx.timeoutMs, ctx.activeControllers)
        if (r?.text.includes(probe)) {
          return { evidence: `payload refletido sem encoding via parâmetro "${param}" (possível XSS refletido)`, path: `?${param}=${encodeURIComponent(probe)}` }
        }
      }
      return null
    }
  },
  {
    id: 'open-redirect',
    name: 'Open redirect',
    severity: 'medium',
    category: 'lógica de negócio',
    recommendation: 'Valide o destino do redirect contra uma allowlist de domínios/paths internos em vez de aceitar qualquer URL vinda de parâmetro.',
    run: async (ctx) => {
      const evilHost = 'evil-dux-pentest-probe.example'
      for (const param of ['next', 'url', 'redirect', 'return', 'continue', 'dest']) {
        const r = await safeFetch(`${ctx.base}/?${param}=https://${evilHost}`, { redirect: 'manual' }, ctx.timeoutMs, ctx.activeControllers)
        const status = r?.response.status || 0
        const location = r?.response.headers.get('location') || ''
        if (status >= 300 && status < 400 && location.includes(evilHost)) {
          return { evidence: `parâmetro "${param}" redireciona para domínio externo arbitrário (Location: ${location})`, path: `?${param}=https://${evilHost}` }
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
    recommendation: 'Não reflita a origem enviada — restrinja Access-Control-Allow-Origin a uma lista fixa de domínios confiáveis, especialmente com Allow-Credentials habilitado.',
    run: async (ctx) => {
      const evilOrigin = 'https://evil-dux-pentest-probe.example'
      const r = await safeFetch(`${ctx.base}/`, { headers: { Origin: evilOrigin } }, ctx.timeoutMs, ctx.activeControllers)
      const aco = r?.response.headers.get('access-control-allow-origin')
      const acc = r?.response.headers.get('access-control-allow-credentials')
      if (aco === evilOrigin) {
        return {
          evidence: `Access-Control-Allow-Origin reflete a origem arbitrária enviada${acc === 'true' ? ', com Allow-Credentials habilitado (crítico)' : ''}`,
          path: ''
        }
      }
      return null
    }
  },
  {
    id: 'dangerous-http-methods',
    name: 'Métodos HTTP perigosos habilitados',
    severity: 'medium',
    category: 'configuração',
    recommendation: 'Desabilite os métodos HTTP que a aplicação não usa (PUT, DELETE, TRACE) no servidor web/proxy.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/`, { method: 'OPTIONS' }, ctx.timeoutMs, ctx.activeControllers)
      const allow = (r?.response.headers.get('allow') || '').toUpperCase()
      const dangerous = ['PUT', 'DELETE', 'TRACE'].filter((m) => allow.includes(m))
      if (dangerous.length) return { evidence: `método(s) ${dangerous.join(', ')} habilitado(s) (Allow: ${allow})`, path: '' }
      return null
    }
  },
  {
    id: 'host-header-injection',
    name: 'Host header refletido',
    severity: 'medium',
    category: 'injeção',
    recommendation: 'Valide o header Host contra uma allowlist de domínios esperados em vez de confiar nele diretamente (ex: em links de reset de senha ou cache).',
    run: async (ctx) => {
      const probeHost = 'duxpentest-probe.example'
      const r = await requestWithHostHeader(`${ctx.base}/`, probeHost, ctx.timeoutMs)
      if (r?.text.includes(probeHost)) return { evidence: 'Host header arbitrário é refletido na resposta (possível cache/password-reset poisoning)', path: '' }
      return null
    }
  },
  {
    id: 'directory-listing',
    name: 'Listagem de diretório habilitada',
    severity: 'medium',
    category: 'configuração',
    recommendation: 'Desabilite a listagem de diretório no servidor web (ex: "Options -Indexes" no Apache, "autoindex off" no Nginx).',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r && /<title>index of \//i.test(r.text)) return { evidence: 'listagem de diretório habilitada na raiz', path: '' }
      return null
    }
  },
  {
    id: 'verbose-error',
    name: 'Erro verboso / stack trace exposto',
    severity: 'medium',
    category: 'exposição de informação',
    recommendation: 'Desabilite mensagens de erro detalhadas em produção (debug=false) e use uma página de erro genérica pro usuário final.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/?duxprobe=%27%22%3C`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (
        r &&
        /stack trace|whitelabel error page|traceback \(most recent|unhandled exception|fatal error:|django\.core\.|system\.web\.httpexception/i.test(
          r.text
        )
      ) {
        return { evidence: 'resposta contém stack trace ou mensagem de erro verbosa', path: '?duxprobe=%27%22%3C' }
      }
      return null
    }
  },
  {
    id: 'phpinfo-exposed',
    name: 'phpinfo() exposto',
    severity: 'high',
    category: 'exposição de informação',
    recommendation: 'Remova o arquivo do servidor de produção — ele expõe configuração interna útil pra um atacante mapear o ambiente.',
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
    recommendation: 'Restrinja os endpoints do Actuator (management.endpoints.web.exposure.include) ou exija autenticação pra eles — /env nunca deveria ser público.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/actuator/env`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && /"propertysources"|"activeprofiles"/i.test(r.text)) {
        return { evidence: '/actuator/env expõe variáveis de ambiente (Spring Boot Actuator sem proteção)', path: 'actuator/env' }
      }
      return null
    }
  },
  {
    id: 'swagger-exposed',
    name: 'Documentação de API pública',
    severity: 'low',
    category: 'exposição de informação',
    recommendation: 'Se a documentação não precisa ser pública, restrinja o acesso via autenticação ou remova do ambiente de produção.',
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
    recommendation: 'Remova ou ofusque o header Server/X-Powered-By no servidor web ou proxy reverso pra não expor a versão exata.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/`, {}, ctx.timeoutMs, ctx.activeControllers)
      const values = [r?.response.headers.get('server'), r?.response.headers.get('x-powered-by')].filter(Boolean)
      const withVersion = values.find((v) => /\d+\.\d+/.test(v))
      if (withVersion) return { evidence: `versão explícita exposta: "${withVersion}" — pesquise CVEs conhecidas para essa versão`, path: '' }
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
      let hit = null
      try {
        hit = await check.run({ base, timeoutMs: timeout, activeControllers })
      } catch {
        hit = null
      }
      completed += 1

      if (hit) {
        const { evidence, path } = typeof hit === 'string' ? { evidence: hit, path: '' } : hit
        const url = path ? `${base}/${String(path).replace(/^\/+/, '')}` : base
        const entry = { id: check.id, name: check.name, severity: check.severity, category: check.category, evidence, url, recommendation: check.recommendation || null }
        findings.push(entry)
        onProgress({ seq: completed, total, id: check.id, name: check.name, found: true, severity: check.severity, evidence, url })
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
