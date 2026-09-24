const DEFAULT_TIMEOUT_MS = 10_000
const MAX_CONCURRENCY = 10

// Lista curta de credenciais clássicas pra "quick check" — não é rockyou
// inteira de propósito (card pediu só o essencial: defaults de admin, contas
// de serviço comuns e o clássico "time de QA esqueceu qa/qa em produção").
const QUICK_CREDENTIALS = [
  ['admin', 'admin'],
  ['admin', '123456'],
  ['admin', 'password'],
  ['admin', 'admin123'],
  ['admin', 'senha123'],
  ['administrator', 'admin'],
  ['root', 'root'],
  ['root', 'toor'],
  ['test', 'test'],
  ['qa', 'qa'],
  ['demo', 'demo'],
  ['guest', 'guest'],
  ['user', 'user'],
  ['sa', 'sa'],
  ['postgres', 'postgres']
].map(([user, pass]) => ({ user, pass }))

// Sinais de texto que costumam aparecer em resposta de rate limit/lockout —
// além do status 429 e do salto de latência, checados à parte em detectLockoutSignal.
const LOCKOUT_KEYWORDS = [
  'captcha',
  'bloquead',
  'locked',
  'too many',
  'muitas tentativas',
  'tente novamente mais tarde',
  'try again later',
  'conta bloqueada',
  'account locked',
  'temporarily blocked'
]

function escapeForContentType(value, contentType) {
  const str = String(value ?? '')
  if (contentType === 'form') return encodeURIComponent(str)
  // JSON.stringify entrega a string já escapada (aspas/backslash/etc) com
  // aspas em volta — tira só as aspas externas pra colar dentro do template
  // do usuário, que já vem com as aspas dele.
  return JSON.stringify(str).slice(1, -1)
}

function fillTemplate(template, user, pass, contentType) {
  const u = escapeForContentType(user, contentType)
  const p = escapeForContentType(pass, contentType)
  return String(template ?? '').replaceAll('{{user}}', u).replaceAll('{{pass}}', p)
}

function parseCredentials({ mode, customWordlist, fixedUser } = {}) {
  if (mode !== 'custom') return QUICK_CREDENTIALS

  const lines = String(customWordlist || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const out = []
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx !== -1) {
      out.push({ user: line.slice(0, idx), pass: line.slice(idx + 1) })
    } else if (fixedUser) {
      out.push({ user: fixedUser, pass: line })
    }
  }
  return out
}

function checkSuccess(rule, response, bodyText) {
  const type = rule?.type || 'status'

  if (type === 'status') {
    const list = String(rule?.statusList ?? '200')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return list.includes(String(response.status))
  }

  if (type === 'text') {
    const hit = bodyText.toLowerCase().includes(String(rule?.text || '').toLowerCase())
    return rule?.textMode === 'not_contains' ? !hit : hit
  }

  if (type === 'redirect') {
    const location = response.headers.get('location') || ''
    return location.toLowerCase().includes(String(rule?.text || '').toLowerCase())
  }

  if (type === 'cookie') {
    const cookies =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean)
    const name = String(rule?.text || '').trim().toLowerCase()
    if (!name) return false
    return cookies.some((c) => c.split('=')[0].trim().toLowerCase() === name)
  }

  return false
}

function detectLockoutSignal(response, bodyText, latencyMs, baselineLatencyMs) {
  if (response.status === 429) return 'status_429'
  const lower = bodyText.toLowerCase()
  const keyword = LOCKOUT_KEYWORDS.find((k) => lower.includes(k))
  if (keyword) return `keyword:${keyword}`
  if (baselineLatencyMs && latencyMs > Math.max(baselineLatencyMs * 3, 1500)) return 'latency_spike'
  return null
}

// controller vem de fora (criado por createRunner) pra permitir abortar uma
// tentativa em voo assim que stop() for chamado — "parar a qualquer momento"
// é requisito explícito do card, não só parar de agendar as próximas.
async function runOneAttempt({ url, method, headers, contentType, bodyTemplate }, cred, controller) {
  const timeout = setTimeout(() => controller.abort('timeout'), DEFAULT_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const hasBody = !['GET', 'HEAD'].includes(method)
    const response = await fetch(url, {
      method,
      headers,
      body: hasBody ? fillTemplate(bodyTemplate, cred.user, cred.pass, contentType) : undefined,
      redirect: 'manual', // necessário pra inspecionar o header Location (regra de sucesso "redirect") sem seguir o pulo
      signal: controller.signal
    })
    const bodyText = await response.text().catch(() => '')
    return { ok: true, response, bodyText, latencyMs: Date.now() - startedAt }
  } catch (err) {
    const reason = controller.signal.aborted ? controller.signal.reason : null
    return {
      ok: false,
      error: reason === 'stop' ? 'cancelado pelo usuário' : reason === 'timeout' ? 'tempo esgotado esperando resposta' : err.message,
      latencyMs: Date.now() - startedAt
    }
  } finally {
    clearTimeout(timeout)
  }
}

function buildHeaderMap(target) {
  const headerMap = {}
  for (const h of target.headers || []) {
    if (h.key?.trim()) headerMap[h.key.trim()] = h.value
  }
  if (!Object.keys(headerMap).some((k) => k.toLowerCase() === 'content-type')) {
    headerMap['Content-Type'] = target.contentType === 'form' ? 'application/x-www-form-urlencoded' : 'application/json'
  }
  return headerMap
}

// Paths mais comuns de tela de login — cobre o mais provável (WordPress,
// paineis admin genéricos, apps com /login), não é exaustivo. '' testa a
// própria URL base, pra pegar SPAs com o form direto na home.
const LOGIN_CANDIDATE_PATHS = [
  '/login',
  '/signin',
  '/wp-login.php',
  '/administrator',
  '/admin',
  '/admin/login',
  '/user/login',
  '/account/login',
  '/auth/login',
  ''
]

function extractForms(html) {
  const forms = []
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi
  let m
  while ((m = re.exec(html))) forms.push({ attrs: m[1], body: m[2] })
  return forms
}

function attrValue(attrs, name) {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')
  const m = re.exec(attrs || '')
  return m ? m[1] : null
}

function findInputs(body) {
  const inputs = []
  const re = /<input\b([^>]*)>/gi
  let m
  while ((m = re.exec(body))) {
    inputs.push({ type: (attrValue(m[1], 'type') || 'text').toLowerCase(), name: attrValue(m[1], 'name') })
  }
  return inputs
}

function resolveFormUrl(pageUrl, action) {
  try {
    return new URL(action || '', pageUrl).toString()
  } catch {
    return pageUrl
  }
}

// Heurística de auto-detecção de formulário de login: varre alguns paths
// candidatos, procura um <form> com <input type="password">, e monta um
// target/successRule pro credentialTest.createRunner a partir disso. Igual
// ao resto das checagens curadas do projeto: cobre o caso mais comum (form
// HTML simples, sem CSRF token dinâmico), não é infalível — sites com login
// via JS puro (fetch/XHR sem <form>) ou com token CSRF por requisição não
// são detectados corretamente, e quem usa isso deve conferir antes de
// confiar 100% no resultado. A regra de sucesso ("resposta não contém mais
// o campo de senha") assume que um login falho volta a renderizar o form.
async function detectLoginForm({ url, timeoutMs }) {
  const base = String(url || '').trim().replace(/\/+$/, '')
  const timeout = Math.max(1000, Math.min(20_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  if (!/^https?:\/\//i.test(base)) return { found: false }

  for (const path of LOGIN_CANDIDATE_PATHS) {
    const pageUrl = path ? `${base}${path}` : `${base}/`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), timeout)
    let html = ''
    let finalUrl = pageUrl
    try {
      const response = await fetch(pageUrl, { redirect: 'follow', signal: controller.signal })
      finalUrl = response.url || pageUrl
      html = await response.text()
    } catch {
      continue
    } finally {
      clearTimeout(timer)
    }

    for (const form of extractForms(html)) {
      const inputs = findInputs(form.body)
      const passwordField = inputs.find((i) => i.type === 'password' && i.name)
      if (!passwordField) continue
      const userField =
        inputs.find((i) => i.name && i.type !== 'password' && i.type !== 'hidden' && i.type !== 'submit' && /user|email|login|name/i.test(i.name)) ||
        inputs.find((i) => i.name && (i.type === 'text' || i.type === 'email'))
      if (!userField) continue

      const method = (attrValue(form.attrs, 'method') || 'POST').toUpperCase()
      const formUrl = resolveFormUrl(finalUrl, attrValue(form.attrs, 'action'))

      return {
        found: true,
        url: formUrl,
        method: method === 'GET' ? 'GET' : 'POST',
        contentType: 'form',
        bodyTemplate: `${encodeURIComponent(userField.name)}={{user}}&${encodeURIComponent(passwordField.name)}={{pass}}`,
        successRule: { type: 'text', textMode: 'not_contains', text: passwordField.name },
        sourceUrl: pageUrl,
        userField: userField.name,
        passwordField: passwordField.name
      }
    }
  }

  return { found: false }
}

// Cria e já inicia (fire-and-forget, acompanhado via callbacks) uma corrida
// de tentativas de credencial. onProgress dispara a cada tentativa concluída
// (streaming, não só no final — pedido explícito do card); onDone dispara
// uma vez, com o resumo final. stop() sinaliza cancelamento cooperativo: os
// workers em voo terminam a tentativa atual e não pegam a próxima.
function createRunner({ target, credentials: credentialsConfig, successRule, execution }, { onProgress, onDone }) {
  const credentials = parseCredentials(credentialsConfig)
  const total = credentials.length
  const concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(execution?.concurrency) || 1, total || 1))
  const delayMs = Math.max(0, Number(execution?.delayMs) || 0)
  const headerMap = buildHeaderMap(target)

  let cancelled = false
  let nextIndex = 0
  let completed = 0
  const activeControllers = new Set()
  let baselineLatencyMs = null
  const latencies = []
  const findings = []
  let rateLimit = null
  const startedAt = Date.now()

  if (total === 0) {
    // agenda pro próximo tick pra manter a mesma forma assíncrona de quando há credenciais
    setTimeout(() => onDone({ cancelled: false, totalAttempts: 0, totalCredentials: 0, findings: [], rateLimit: null, durationMs: 0 }), 0)
    return { stop() {} }
  }

  async function worker() {
    while (!cancelled) {
      const index = nextIndex++
      if (index >= total) return
      const cred = credentials[index]
      const attemptController = new AbortController()
      activeControllers.add(attemptController)
      const result = await runOneAttempt(
        { url: target.url, method: target.method, headers: headerMap, contentType: target.contentType, bodyTemplate: target.bodyTemplate },
        cred,
        attemptController
      )
      activeControllers.delete(attemptController)

      completed += 1

      if (!result.ok) {
        onProgress({ seq: completed, index, total, user: cred.user, pass: cred.pass, ok: false, error: result.error, latencyMs: result.latencyMs })
      } else {
        latencies.push(result.latencyMs)
        if (baselineLatencyMs === null && latencies.length >= 3) {
          baselineLatencyMs = latencies.slice(0, 3).reduce((a, b) => a + b, 0) / 3
        }

        const success = checkSuccess(successRule, result.response, result.bodyText)
        const signal = detectLockoutSignal(result.response, result.bodyText, result.latencyMs, baselineLatencyMs)
        if (signal && !rateLimit) {
          rateLimit = { detected: true, afterAttempts: completed, signal, user: cred.user, pass: cred.pass }
        }
        if (success) findings.push({ user: cred.user, pass: cred.pass, status: result.response.status })

        onProgress({
          seq: completed,
          index,
          total,
          user: cred.user,
          pass: cred.pass,
          ok: true,
          status: result.response.status,
          success,
          latencyMs: result.latencyMs,
          rateLimitSignal: signal
        })
      }

      if (!cancelled && delayMs && nextIndex < total) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  Promise.all(Array.from({ length: concurrency }, worker)).then(() => {
    onDone({
      cancelled,
      totalAttempts: completed,
      totalCredentials: total,
      findings,
      rateLimit,
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

module.exports = { createRunner, parseCredentials, QUICK_CREDENTIALS, detectLoginForm }
