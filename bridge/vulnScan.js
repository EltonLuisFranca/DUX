const http = require('http')
const https = require('https')
const { requestXssCheck } = require('./renderBridgeClient')

const DEFAULT_TIMEOUT_MS = 6000
const MAX_BODY_BYTES = 200_000
// Teto bem mais alto usado só pelos checks de segredo hardcoded no bundle
// (fetchAssetCorpus com override) — bundle real de SPA costuma ter 1-5MB, e o
// teto genérico de MAX_BODY_BYTES (200KB) deixava segredo fora dessa janela
// passar batido. Ainda é um corte, não leitura ilimitada, pra não estourar
// memória/tempo num bundle anormalmente grande.
const SECRET_SCAN_MAX_ASSET_BYTES = 5_000_000
const DEFAULT_CONCURRENCY = 5
const MAX_CONCURRENCY = 10
// Piso mínimo pro fallback de renderização real (mesmo raciocínio do
// RENDER_FALLBACK_MIN_MS em credentialTest.js): timeoutMs do card é pensado
// pra uma requisição HTTP individual, não pro ciclo completo de abrir um
// Chromium de verdade e testar vários parâmetros.
const RENDER_FALLBACK_MIN_MS = 15_000
// Nomes de parâmetro mais comuns em busca/formulário/paginação — não é
// exaustivo (mesmo espírito do resto do arquivo), cobre o mais provável.
const XSS_PARAMS = ['q', 'search', 's', 'query', 'keyword', 'term', 'name', 'message', 'comment', 'page']

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
async function safeFetch(url, opts, timeoutMs, activeControllers, maxBytes = MAX_BODY_BYTES) {
  const controller = new AbortController()
  activeControllers?.add(controller)
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    const response = await fetch(url, { redirect: 'follow', ...opts, signal: controller.signal })
    const text = opts?.method === 'HEAD' ? '' : await readBodyCapped(response, maxBytes)
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

// Busca o HTML da home + até maxAssets bundles JS same-origin referenciados
// nela (mesma origem só, pra não puxar CDN de terceiro tipo Google
// Fonts/analytics) — usado pelos checks de "segredo hardcoded no front-end"
// abaixo, que precisam olhar dentro do bundle, não só do HTML. Por padrão usa
// o teto genérico MAX_BODY_BYTES (~200KB por asset), mas quem chama pode
// passar maxBytesPerAsset maior (ex: SECRET_SCAN_MAX_ASSET_BYTES) pros checks
// que precisam varrer o bundle inteiro — os demais checks que usam esta
// função sem passar o parâmetro continuam com o comportamento atual.
async function fetchAssetCorpus(ctx, maxAssets = 4, maxBytesPerAsset = MAX_BODY_BYTES) {
  const home = await safeFetch(`${ctx.base}/`, {}, ctx.timeoutMs, ctx.activeControllers, maxBytesPerAsset)
  if (!home) return ''
  let origin
  try {
    origin = new URL(ctx.base).origin
  } catch {
    return home.text
  }

  const scriptSrcs = [...home.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])
  let corpus = home.text
  let fetched = 0
  for (const src of scriptSrcs) {
    if (fetched >= maxAssets) break
    let assetUrl
    try {
      assetUrl = new URL(src, `${ctx.base}/`)
    } catch {
      continue
    }
    if (assetUrl.origin !== origin) continue
    const r = await safeFetch(assetUrl.toString(), {}, ctx.timeoutMs, ctx.activeControllers, maxBytesPerAsset)
    if (r?.response.ok) {
      corpus += '\n' + r.text
      fetched += 1
    }
  }
  return corpus
}

// Padrões de chave de API com formato reconhecível o bastante pra não dar
// falso positivo em texto aleatório — cada um é o prefixo/formato fixo que o
// provedor usa (sk- da OpenAI, AIza do Google, etc.), não uma heurística de
// "parece uma chave".
const AI_KEY_PATTERNS = [
  { name: 'OpenAI', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'Anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Google (Gemini/Maps/Firebase)', re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: 'Stripe (chave secreta)', re: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'AWS Access Key', re: /\bAKIA[A-Z0-9]{16}\b/ }
]

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
      // GET primeiro (mais barato, cobre busca/listagem/paginação), POST
      // depois pro mesmo nome (cobre forms de busca/contato que só aceitam
      // POST e nunca são tocados pelo loop GET).
      for (const param of XSS_PARAMS) {
        const getR = await safeFetch(`${ctx.base}/?${param}=${encodeURIComponent(probe)}`, {}, ctx.timeoutMs, ctx.activeControllers)
        if (getR?.text.includes(probe)) {
          return { evidence: `payload refletido sem encoding via parâmetro GET "${param}" (possível XSS refletido)`, path: `?${param}=${encodeURIComponent(probe)}` }
        }

        const postR = await safeFetch(
          ctx.base,
          { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `${param}=${encodeURIComponent(probe)}` },
          ctx.timeoutMs,
          ctx.activeControllers
        )
        if (postR?.text.includes(probe)) {
          return { evidence: `payload refletido sem encoding via parâmetro POST "${param}" (possível XSS refletido)`, path: '' }
        }
      }

      // Nada no HTML cru — cobre o caso de SPA que só joga o parâmetro no DOM
      // via JS (o que fetch sem execução nunca vê, mesmo problema do
      // credentialTest.js) e também serve de segunda confirmação mais
      // confiável: em vez de "o texto do payload apareceu na resposta"
      // (pode ser falso positivo se aparecer dentro de comentário/atributo/
      // string JS sem nunca ser interpretado como markup), navega de verdade
      // e confere se ele EXECUTOU — ver renderCheckXssExecution em
      // src/main/renderBridge.js.
      const rendered = await requestXssCheck({ url: ctx.base, timeoutMs: Math.max(RENDER_FALLBACK_MIN_MS, ctx.timeoutMs), params: XSS_PARAMS }).catch(
        () => ({ found: false })
      )
      return rendered?.found ? { evidence: rendered.evidence, path: rendered.path } : null
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
  },

  // Checks específicos de WordPress — todos são sondas de paths/endpoints
  // conhecidos do core (não miram plugin/tema individual, isso exigiria uma
  // base de CVEs por versão que este arquivo não tem), então rodam sem custo
  // extra contra qualquer alvo: em sites que não são WordPress, cada um só
  // recebe 404/resposta genérica e devolve null, igual aos checks de
  // Spring/phpinfo acima.
  {
    id: 'wp-xmlrpc-enabled',
    name: 'WordPress XML-RPC habilitado',
    severity: 'medium',
    category: 'wordpress',
    recommendation: 'Desabilite o XML-RPC (bloqueie /xmlrpc.php no servidor web, ou use um plugin como "Disable XML-RPC") se você não depende dele pra apps móveis/Jetpack — é o vetor clássico de brute-force amplificado (system.multicall) e de pingback DDoS.',
    run: async (ctx) => {
      const body = '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName><params></params></methodCall>'
      const r = await safeFetch(`${ctx.base}/xmlrpc.php`, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body }, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && /<methodresponse/i.test(r.text) && /pingback\.ping/i.test(r.text)) {
        return { evidence: 'xmlrpc.php responde a system.listMethods e expõe pingback.ping', path: 'xmlrpc.php' }
      }
      return null
    }
  },
  {
    id: 'wp-rest-user-enumeration',
    name: 'WordPress expõe usuários via REST API',
    severity: 'medium',
    category: 'wordpress',
    recommendation: 'Restrinja /wp-json/wp/v2/users (plugin como "Disable REST API", ou regra no servidor/proxy) — nomes de usuário reais facilitam ataques de força bruta direcionados.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/wp-json/wp/v2/users`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (!r?.response.ok) return null
      let users
      try {
        users = JSON.parse(r.text)
      } catch {
        return null
      }
      if (Array.isArray(users) && users.length && users[0]?.slug) {
        const names = users.slice(0, 5).map((u) => u.slug).join(', ')
        return { evidence: `API REST expõe ${users.length} usuário(s): ${names}${users.length > 5 ? '...' : ''}`, path: 'wp-json/wp/v2/users' }
      }
      return null
    }
  },
  {
    id: 'wp-author-scan',
    name: 'WordPress permite enumerar usuário via ?author=',
    severity: 'low',
    category: 'wordpress',
    recommendation: 'Bloqueie o parâmetro ?author= no servidor/CDN, ou use um plugin que impeça esse redirect revelar o slug do usuário.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/?author=1`, { redirect: 'manual' }, ctx.timeoutMs, ctx.activeControllers)
      const status = r?.response.status || 0
      const location = r?.response.headers.get('location') || ''
      if (status >= 300 && status < 400 && /\/author\/[^/]+\/?$/i.test(location)) {
        return { evidence: `?author=1 redireciona revelando o slug do usuário (Location: ${location})`, path: '?author=1' }
      }
      return null
    }
  },
  {
    id: 'wp-config-backup-exposed',
    name: 'Backup de wp-config.php exposto',
    severity: 'critical',
    category: 'wordpress',
    recommendation: 'Remova qualquer backup/cópia de wp-config.php do diretório público — ele guarda credenciais de banco de dados e chaves secretas em texto puro.',
    run: async (ctx) =>
      tryPaths(
        ctx.base,
        ['wp-config.php.bak', 'wp-config.php~', 'wp-config.php.save', 'wp-config.php.swp', 'wp-config.php.old', 'wp-config.txt', 'wp-config.php.orig'],
        (text) => (/DB_PASSWORD|AUTH_KEY|define\(\s*['"]DB_/i.test(text) ? 'backup de wp-config.php expõe credenciais de banco/chaves secretas em texto puro' : null),
        ctx
      )
  },
  {
    id: 'wp-debug-log-exposed',
    name: 'Log de debug do WordPress exposto',
    severity: 'high',
    category: 'wordpress',
    recommendation: 'Desative WP_DEBUG_LOG em produção ou mova o log pra fora do diretório público — ele costuma vazar paths do servidor, queries SQL e stack traces de plugin/tema.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/wp-content/debug.log`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && r.text.trim().length > 0 && /\[\d{2}-\w{3}-\d{4}|PHP (Warning|Notice|Fatal error|Deprecated)/i.test(r.text)) {
        return { evidence: 'wp-content/debug.log acessível publicamente e contém saída de log real', path: 'wp-content/debug.log' }
      }
      return null
    }
  },
  {
    id: 'wp-uploads-listing',
    name: 'Directory listing em wp-content/uploads',
    severity: 'low',
    category: 'wordpress',
    recommendation: 'Desative directory listing (Options -Indexes no Apache, autoindex off no Nginx) no diretório de uploads.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/wp-content/uploads/`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && /index of \/wp-content\/uploads/i.test(r.text)) {
        return { evidence: 'wp-content/uploads/ lista arquivos publicamente (directory listing habilitado)', path: 'wp-content/uploads/' }
      }
      return null
    }
  },
  {
    id: 'wp-version-exposed',
    name: 'Versão do WordPress exposta',
    severity: 'low',
    category: 'wordpress',
    recommendation: 'Remova/bloqueie o acesso a readme.html — atacantes usam a versão exata do core pra mirar CVEs conhecidas dessa release.',
    run: async (ctx) => {
      const r = await safeFetch(`${ctx.base}/readme.html`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok) {
        const m = /version (\d+\.\d+(\.\d+)?)/i.exec(r.text)
        if (m) return { evidence: `readme.html expõe a versão do WordPress: ${m[1]}`, path: 'readme.html' }
      }
      return null
    }
  },

  // Falhas clássicas de app "vibe-coded" (protótipo feito rápido com
  // IA/low-code, sem revisão de segurança): segredo/chave hardcoded direto
  // no front-end (porque é mais rápido que subir um backend proxy), token
  // privilegiado que vazou do backend pro cliente, source map de produção
  // esquecido ligado, rota de debug que ecoa env var, e serviços gerenciados
  // (Firebase/GraphQL) deixados na config padrão "aberta pra facilitar o
  // dev". Evidência trunca o segredo em si — o achado precisa ser útil pra
  // corrigir sem virar ele mesmo um vazamento (esse relatório pode ser
  // colado numa IA externa).
  {
    id: 'ai-provider-key-exposed',
    name: 'Chave de API (IA/pagamento/cloud) hardcoded no front-end',
    severity: 'critical',
    category: 'segredo exposto',
    recommendation: 'Nunca chame provedores de IA/pagamento/cloud direto do front-end com a chave secreta embutida no bundle — mova a chamada pra um endpoint de backend seu que guarda a chave numa variável de ambiente do servidor.',
    run: async (ctx) => {
      const corpus = await fetchAssetCorpus(ctx, 4, SECRET_SCAN_MAX_ASSET_BYTES)
      for (const { name, re } of AI_KEY_PATTERNS) {
        const m = re.exec(corpus)
        if (m) {
          return { evidence: `chave de API da ${name} encontrada hardcoded no HTML/JS servido ao navegador (início: ${m[0].slice(0, 8)}...)`, path: '' }
        }
      }
      return null
    }
  },
  {
    id: 'jwt-privileged-role-exposed',
    name: 'Token JWT com papel privilegiado exposto no front-end',
    severity: 'critical',
    category: 'segredo exposto',
    recommendation: 'Nunca envie pro front-end um JWT com papel de serviço/admin (ex: service_role do Supabase) — esse token ignora Row Level Security e dá acesso total ao banco. No cliente só a chave pública (anon/publishable) deveria aparecer.',
    run: async (ctx) => {
      const corpus = await fetchAssetCorpus(ctx, 4, SECRET_SCAN_MAX_ASSET_BYTES)
      const jwtRe = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
      let m
      while ((m = jwtRe.exec(corpus))) {
        try {
          const payload = JSON.parse(Buffer.from(m[0].split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
          const role = payload.role || payload.aud
          if (role && /service_role|admin|superuser/i.test(String(role))) {
            return { evidence: `JWT com papel "${role}" encontrado no HTML/JS servido ao navegador`, path: '' }
          }
        } catch {
          // não decodificou como JSON válido — não é o token que procuramos, segue tentando o próximo
        }
      }
      return null
    }
  },
  {
    id: 'source-map-exposed',
    name: 'Source map de produção exposto',
    severity: 'medium',
    category: 'exposição de informação',
    recommendation: 'Desative a geração de source maps em produção (ex: productionBrowserSourceMaps: false no Next.js, sourcemap: false no Vite/webpack) ou sirva-os só internamente — eles reconstroem o código-fonte original, incluindo comentários e lógica que deveriam ficar privados.',
    run: async (ctx) => {
      const home = await safeFetch(`${ctx.base}/`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (!home) return null
      let origin
      try {
        origin = new URL(ctx.base).origin
      } catch {
        return null
      }
      const scriptSrcs = [...home.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])
      for (const src of scriptSrcs.slice(0, 6)) {
        let assetUrl
        try {
          assetUrl = new URL(src, `${ctx.base}/`)
        } catch {
          continue
        }
        if (assetUrl.origin !== origin) continue
        const r = await safeFetch(`${assetUrl}.map`, {}, ctx.timeoutMs, ctx.activeControllers)
        if (r?.response.ok && /"sources"\s*:|"version"\s*:\s*3/.test(r.text)) {
          return { evidence: `source map público em ${assetUrl}.map reconstrói o código-fonte original`, path: '' }
        }
      }
      return null
    }
  },
  {
    id: 'debug-env-endpoint-exposed',
    name: 'Endpoint de debug expõe variáveis de ambiente',
    severity: 'critical',
    category: 'exposição de informação',
    recommendation: 'Remova qualquer rota de debug que devolva process.env (ou similar) antes de ir pra produção — costuma acabar publicado sem querer quando o deploy é feito sem revisão.',
    run: async (ctx) => {
      const candidates = ['api/debug', 'api/env', 'api/config', '_debug', 'debug/env', '.well-known/env']
      for (const p of candidates) {
        const r = await safeFetch(`${ctx.base}/${p}`, {}, ctx.timeoutMs, ctx.activeControllers)
        if (r?.response.ok && /API_KEY|SECRET|DATABASE_URL|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN/i.test(r.text)) {
          return { evidence: `${p} responde 200 e o corpo contém nomes de variável típicos de segredo (API_KEY/SECRET/DATABASE_URL/...)`, path: p }
        }
      }
      return null
    }
  },
  {
    id: 'firebase-rtdb-public',
    name: 'Firebase Realtime Database público',
    severity: 'high',
    category: 'configuração insegura',
    recommendation: 'Configure as Security Rules do Realtime Database (nunca deixe ".read": true/".write": true no nó raiz) — é o erro de configuração mais comum em protótipos feitos com Firebase.',
    run: async (ctx) => {
      const corpus = await fetchAssetCorpus(ctx)
      const m = /([a-z0-9-]+)\.firebaseio\.com/i.exec(corpus)
      if (!m) return null
      const r = await safeFetch(`https://${m[1]}.firebaseio.com/.json?shallow=true`, {}, ctx.timeoutMs, ctx.activeControllers)
      if (r?.response.ok && r.text.trim() !== 'null' && r.text.trim().length > 2) {
        return { evidence: `Realtime Database "${m[1]}" responde com dados reais sem autenticação (regras públicas)`, path: '' }
      }
      return null
    }
  },
  {
    id: 'graphql-introspection-enabled',
    name: 'Introspecção do GraphQL habilitada em produção',
    severity: 'medium',
    category: 'exposição de informação',
    recommendation: 'Desabilite a introspecção do schema GraphQL em produção (na maioria das libs é uma flag: introspection: false) — ela expõe toda a estrutura da API, incluindo mutations sensíveis.',
    run: async (ctx) => {
      const body = JSON.stringify({ query: '{__schema{queryType{name}}}' })
      for (const p of ['graphql', 'api/graphql']) {
        const r = await safeFetch(`${ctx.base}/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, ctx.timeoutMs, ctx.activeControllers)
        if (r?.response.ok && /"__schema"/.test(r.text) && /"queryType"/.test(r.text)) {
          return { evidence: `${p} responde à query de introspecção (__schema) — schema completo da API acessível`, path: p }
        }
      }
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
