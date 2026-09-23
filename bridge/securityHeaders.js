const DEFAULT_TIMEOUT_MS = 8000

// Cada checagem tem um peso (usado no score geral) e uma função analyze(value)
// que devolve { status, value? } — status é um destes: 'ok', 'weak', 'missing'.
function analyzeCSP(value) {
  if (!value) return { status: 'missing' }
  const lower = value.toLowerCase()
  const weak = lower.includes('unsafe-inline') || lower.includes('unsafe-eval') || /(^|;)\s*default-src\s+\*/.test(lower)
  return { status: weak ? 'weak' : 'ok', value }
}

function analyzeHSTS(value) {
  if (!value) return { status: 'missing' }
  const match = /max-age=(\d+)/i.exec(value)
  const maxAge = match ? Number(match[1]) : 0
  // ~180 dias — abaixo disso o navegador esquece rápido demais pra ser proteção real
  return { status: maxAge >= 15_552_000 ? 'ok' : 'weak', value }
}

function analyzeXFrameOptions(value) {
  if (!value) return { status: 'missing' }
  const v = value.trim().toUpperCase()
  return { status: v === 'DENY' || v === 'SAMEORIGIN' ? 'ok' : 'weak', value }
}

function analyzeXContentTypeOptions(value) {
  if (!value) return { status: 'missing' }
  return { status: value.trim().toLowerCase() === 'nosniff' ? 'ok' : 'weak', value }
}

function analyzeReferrerPolicy(value) {
  if (!value) return { status: 'missing' }
  return { status: value.trim().toLowerCase() === 'unsafe-url' ? 'weak' : 'ok', value }
}

function analyzePermissionsPolicy(value) {
  if (!value) return { status: 'missing' }
  return { status: 'ok', value }
}

const HEADER_CHECKS = [
  {
    id: 'csp',
    header: 'content-security-policy',
    label: 'Content-Security-Policy',
    weight: 2,
    why: 'Restringe de onde scripts, estilos e outros recursos podem ser carregados — principal mitigação contra XSS.',
    analyze: analyzeCSP
  },
  {
    id: 'hsts',
    header: 'strict-transport-security',
    label: 'Strict-Transport-Security',
    weight: 2,
    why: 'Força o navegador a sempre usar HTTPS neste domínio, prevenindo downgrade e ataques de rede (SSL stripping).',
    analyze: analyzeHSTS
  },
  {
    id: 'xfo',
    header: 'x-frame-options',
    label: 'X-Frame-Options',
    weight: 1,
    why: 'Impede que o site seja carregado dentro de um <iframe> de outra origem, prevenindo clickjacking.',
    analyze: analyzeXFrameOptions
  },
  {
    id: 'xcto',
    header: 'x-content-type-options',
    label: 'X-Content-Type-Options',
    weight: 1,
    why: 'Impede que o navegador tente "adivinhar" o tipo de um arquivo (MIME sniffing), reduzindo o risco de execução de conteúdo malicioso disfarçado.',
    analyze: analyzeXContentTypeOptions
  },
  {
    id: 'referrer-policy',
    header: 'referrer-policy',
    label: 'Referrer-Policy',
    weight: 1,
    why: 'Controla quanta informação da URL de origem vaza para outros sites em requisições de saída (links, imagens, etc).',
    analyze: analyzeReferrerPolicy
  },
  {
    id: 'permissions-policy',
    header: 'permissions-policy',
    label: 'Permissions-Policy',
    weight: 1,
    why: 'Restringe quais APIs do navegador (câmera, microfone, geolocalização...) a página e seus iframes podem usar.',
    analyze: analyzePermissionsPolicy
  }
]

// Set-Cookie pode vir como múltiplos headers — getSetCookie() (Node 18+) já
// devolve a lista separada corretamente; sem isso, um único get() colapsaria
// vários cookies numa string ambígua.
function analyzeCookies(setCookieList) {
  if (!setCookieList || setCookieList.length === 0) {
    return { status: 'info', detail: 'Nenhum cookie definido nesta resposta.' }
  }
  const issues = []
  for (const cookie of setCookieList) {
    const parts = cookie.split(';').map((p) => p.trim())
    const name = parts[0].split('=')[0]
    const lowerParts = parts.map((p) => p.toLowerCase())
    const missing = []
    if (!lowerParts.includes('secure')) missing.push('Secure')
    if (!lowerParts.includes('httponly')) missing.push('HttpOnly')
    if (!parts.some((p) => p.toLowerCase().startsWith('samesite'))) missing.push('SameSite')
    if (missing.length) issues.push(`${name} (sem ${missing.join(', ')})`)
  }
  if (issues.length === 0) {
    return { status: 'ok', detail: `${setCookieList.length} cookie(s), todos com Secure/HttpOnly/SameSite.` }
  }
  return { status: 'weak', detail: issues.join('; ') }
}

function analyzeServerExposure(serverValue, poweredByValue) {
  const values = [serverValue, poweredByValue].filter(Boolean)
  if (values.length === 0) return { status: 'ok', detail: 'Nenhum header Server/X-Powered-By exposto.' }
  const hasVersion = values.some((v) => /\d+\.\d+/.test(v))
  return { status: hasVersion ? 'weak' : 'info', detail: values.join(' · ') }
}

// Analisa a Response já recebida e monta a lista de achados + score geral
// (0-100, com nota A-F) — mesma forma pros dois caminhos que chamam isso:
// sucesso normal e (não usado aqui, mas mantém simetria) um resultado parcial.
function analyzeResponse(response) {
  const headers = []
  let earned = 0
  let max = 0

  for (const check of HEADER_CHECKS) {
    const rawValue = response.headers.get(check.header)
    const result = check.analyze(rawValue)
    max += check.weight
    if (result.status === 'ok') earned += check.weight
    else if (result.status === 'weak') earned += check.weight * 0.5
    headers.push({ id: check.id, label: check.label, header: check.header, why: check.why, status: result.status, value: result.value ?? null })
  }

  const setCookieList =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean)
  const cookieResult = analyzeCookies(setCookieList)
  max += 2
  if (cookieResult.status === 'ok') earned += 2
  else if (cookieResult.status === 'weak') earned += 1
  headers.push({
    id: 'cookies',
    label: 'Cookies (Secure / HttpOnly / SameSite)',
    header: 'set-cookie',
    why: 'Cookies de sessão sem essas flags podem ser roubados em rede insegura (sem Secure), lidos por JavaScript malicioso (sem HttpOnly) ou enviados em requisições cross-site (sem SameSite).',
    status: cookieResult.status,
    value: cookieResult.detail
  })

  const exposureResult = analyzeServerExposure(response.headers.get('server'), response.headers.get('x-powered-by'))
  max += 1
  if (exposureResult.status === 'ok') earned += 1
  else if (exposureResult.status === 'info') earned += 0.5
  headers.push({
    id: 'server-exposure',
    label: 'Server / X-Powered-By',
    header: 'server, x-powered-by',
    why: 'Expor a versão exata do servidor/framework facilita que um atacante procure vulnerabilidades conhecidas daquela versão específica.',
    status: exposureResult.status,
    value: exposureResult.detail
  })

  const pct = max ? Math.round((earned / max) * 100) : 0
  const grade = pct >= 90 ? 'A' : pct >= 75 ? 'B' : pct >= 60 ? 'C' : pct >= 40 ? 'D' : 'F'

  return {
    status: response.status,
    finalUrl: response.url,
    headers,
    score: { earned: Math.round(earned * 10) / 10, max, pct, grade }
  }
}

// Diferente de portScan.js/dirFuzz.js/subdomainScan.js: não é um worker pool
// contra uma wordlist, é uma única requisição — não há "progresso" real além
// de "começou"/"terminou", mas mantém a mesma forma createRunner(payload,
// {onProgress, onDone}) -> {stop()} pra encaixar sem mudanças no wiring do
// wsHandlers.js e no bridgeClient.js.
function createRunner({ url, timeoutMs }, { onProgress, onDone }) {
  const target = String(url || '').trim()
  const timeout = Math.max(1000, Math.min(30_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  const startedAt = Date.now()

  if (!/^https?:\/\//i.test(target)) {
    setTimeout(() => onDone({ cancelled: false, error: 'URL inválida (precisa começar com http:// ou https://)' }), 0)
    return { stop() {} }
  }

  let cancelled = false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeout)

  onProgress?.({ status: 'checking' })

  fetch(target, { method: 'GET', redirect: 'follow', signal: controller.signal })
    .then(async (response) => {
      if (response.body) await response.body.cancel().catch(() => {})
      clearTimeout(timer)
      if (cancelled) {
        onDone({ cancelled: true, durationMs: Date.now() - startedAt })
        return
      }
      onDone({ cancelled: false, url: target, ...analyzeResponse(response), durationMs: Date.now() - startedAt })
    })
    .catch((err) => {
      clearTimeout(timer)
      if (cancelled) {
        onDone({ cancelled: true, durationMs: Date.now() - startedAt })
        return
      }
      const reason = controller.signal.aborted ? controller.signal.reason : null
      const message = reason === 'stop' ? 'cancelado pelo usuário' : reason === 'timeout' ? 'tempo esgotado esperando resposta' : err.message || 'erro de rede'
      onDone({ cancelled: false, error: message, durationMs: Date.now() - startedAt })
    })

  return {
    stop() {
      cancelled = true
      controller.abort('stop')
    }
  }
}

module.exports = { createRunner, analyzeResponse, HEADER_CHECKS }
