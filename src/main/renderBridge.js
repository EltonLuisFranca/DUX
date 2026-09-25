import { session, BrowserWindow } from 'electron'
import crypto from 'crypto'

// Contraparte de bridge/renderBridgeClient.js: bridge/ (Node puro, sem
// Chromium) pede pra este processo (que tem um Chromium de verdade) navegar
// numa página e executar o JS dela pra checagens que fetch cru não consegue
// ver — achar/testar um form de login que só existe depois do bundle da SPA
// rodar (renderAndDetectLogin) ou confirmar se um payload de XSS realmente
// EXECUTA depois de renderizado (renderCheckXssExecution), não só se aparece
// como texto na resposta. `payload.action` na requisição decide qual roda.
const REQUEST_MARKER = '@@DUX_RENDER_REQUEST@@'
const RESPONSE_MARKER = '@@DUX_RENDER_RESPONSE@@'

// Espelha o "não é exaustivo" do resto do projeto: poucos candidatos, cada um
// custa um page load + hidratação reais (segundos, não milissegundos como um
// fetch cru), então a lista aqui é bem mais curta que LOGIN_CANDIDATE_PATHS
// do credentialTest.js (que é passada via payload — ver paths abaixo).
const DEFAULT_RENDER_PATHS = ['/login', '', '/entrar', '/signin']

// Headers que o próprio fetch()/undici do bridge já define sozinho (ou que
// não fazem sentido fora do navegador que gerou a requisição original) —
// repassar eles verbatim pra tentativa de credencial só quebraria a request
// ou vazaria estado da sessão de detecção pra sessão de teste.
const HEADER_DENYLIST = new Set([
  'content-length', 'host', 'connection', 'origin', 'referer', 'user-agent',
  'accept-encoding', 'cookie', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
  'sec-fetch-user', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform'
])

function filterHeaders(headers) {
  const out = []
  for (const [key, value] of Object.entries(headers || {})) {
    if (HEADER_DENYLIST.has(key.toLowerCase())) continue
    out.push({ key, value: Array.isArray(value) ? value[0] : value })
  }
  return out
}

function extractUploadData(uploadData) {
  if (!uploadData) return ''
  return uploadData.map((part) => (part.bytes ? part.bytes.toString('utf-8') : '')).join('')
}

// Acha <input type=password> + o campo de usuário mais provável ao lado,
// preenche os dois com valores-sentinela (únicos o bastante pra depois
// localizar sem ambiguidade dentro do body da requisição capturada) e
// dispara o submit — form real (requestSubmit/submit) ou botão clicado perto
// do form, o que existir primeiro. Roda inteiro num único executeJavaScript
// pra não depender de serializar seletor DOM entre chamadas.
function buildDetectFillSubmitScript(sentinelUser, sentinelPass) {
  return `
    (function() {
      const passwordEl = document.querySelector('input[type="password"]')
      if (!passwordEl) return { ok: false, reason: 'no-password-field' }

      const isUserish = (el) => {
        const hay = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.autocomplete || '')).toLowerCase()
        return /user|email|login|cpf|cnpj/.test(hay)
      }
      const excluded = ['password', 'hidden', 'submit', 'button', 'checkbox', 'radio']
      const textInputs = [...document.querySelectorAll('input')].filter(
        (el) => el !== passwordEl && !excluded.includes((el.type || '').toLowerCase())
      )
      const userEl = textInputs.find(isUserish) || textInputs[0]
      if (!userEl) return { ok: false, reason: 'no-user-field' }

      function setVal(el, val) {
        el.focus()
        el.value = val
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      setVal(userEl, ${JSON.stringify(sentinelUser)})
      setVal(passwordEl, ${JSON.stringify(sentinelPass)})

      const form = passwordEl.closest('form')
      let submitEl = form ? form.querySelector('button[type="submit"], input[type="submit"]') : null
      if (!submitEl) {
        const re = /entrar|acessar|login|sign\\s*in|log\\s*in/i
        submitEl = [...document.querySelectorAll('button, [role="button"], input[type="submit"]')].find(
          (b) => re.test(b.textContent || b.value || '')
        )
      }
      if (!submitEl && form) submitEl = form
      if (!submitEl) return { ok: false, reason: 'no-submit-control' }

      if (submitEl.tagName === 'FORM') {
        if (submitEl.requestSubmit) submitEl.requestSubmit()
        else submitEl.submit()
      } else {
        submitEl.click()
      }
      return { ok: true, userField: userEl.name || userEl.id || null, passwordField: passwordEl.name || passwordEl.id || null }
    })()
  `
}

async function waitForCapturedRequest(captured, sentinelUser, sentinelPass, budgetMs) {
  const deadline = Date.now() + Math.max(500, budgetMs)
  while (Date.now() < deadline) {
    for (const entry of captured.values()) {
      if (entry.body && (entry.body.includes(sentinelUser) || entry.body.includes(sentinelPass))) return entry
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  return null
}

// Substitui os valores-sentinela pelo texto bruto capturado do body real —
// funciona pra JSON, form-urlencoded ou qualquer outro formato sem precisar
// parsear/reserializar, e o resultado já sai no formato que
// credentialTest.js:fillTemplate espera ({{user}}/{{pass}} literais).
function buildTemplate(rawBody, sentinelUser, sentinelPass) {
  if (!rawBody || !rawBody.includes(sentinelUser) || !rawBody.includes(sentinelPass)) return null
  return rawBody.split(sentinelUser).join('{{user}}').split(sentinelPass).join('{{pass}}')
}

async function renderAndDetectLogin({ url, timeoutMs, paths }) {
  const base = String(url || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base)) return { found: false }

  const budget = Math.max(3000, Math.min(60_000, Number(timeoutMs) || 20_000))
  const candidatePaths = Array.isArray(paths) && paths.length ? paths.slice(0, 6) : DEFAULT_RENDER_PATHS
  const sentinelUser = `dux-probe-${crypto.randomBytes(6).toString('hex')}@dux-probe.invalid`
  const sentinelPass = `Dux-Probe-${crypto.randomBytes(6).toString('hex')}!1`

  // Sessão isolada e em memória (sem prefixo persist:) por requisição — não
  // reaproveita nem vaza cookies entre alvos diferentes, e some quando a
  // janela é destruída.
  const ses = session.fromPartition(`render-bridge-${crypto.randomBytes(6).toString('hex')}`, { cache: false })
  const captured = new Map()

  const onBeforeRequest = (details, callback) => {
    if (details.method !== 'GET' && details.method !== 'HEAD') {
      captured.set(details.id, { method: details.method, url: details.url, body: extractUploadData(details.uploadData) })
    }
    callback({})
  }
  const onBeforeSendHeaders = (details, callback) => {
    const entry = captured.get(details.id)
    if (entry) entry.headers = details.requestHeaders
    callback({ requestHeaders: details.requestHeaders })
  }
  ses.webRequest.onBeforeRequest(onBeforeRequest)
  ses.webRequest.onBeforeSendHeaders(onBeforeSendHeaders)

  // Alvo é sempre um domínio arbitrário escolhido pelo usuário (mesma
  // superfície que dirFuzz/portScan já tocam) — sandbox + contextIsolation +
  // sem preload garante que a página carregada não tem nenhum acesso a
  // Node/Electron, só ao próprio conteúdo dela.
  const win = new BrowserWindow({
    show: false,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, images: false }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  try {
    const deadline = Date.now() + budget
    for (const path of candidatePaths) {
      const remaining = deadline - Date.now()
      if (remaining < 1500) break
      const pageUrl = path ? `${base}${path}` : `${base}/`
      const perPageBudget = Math.min(remaining, 12_000)

      try {
        await Promise.race([
          win.loadURL(pageUrl),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), perPageBudget))
        ])
      } catch {
        continue
      }

      // Módulos <script type=module> de builds Vite/Vue são deferred por
      // spec (rodam depois do parse do HTML) — essa espera cobre o tempo de
      // bootstrap/hidratação da SPA depois do evento load, sem o que a busca
      // por <input type=password> abaixo roda cedo demais e não acha nada.
      await new Promise((r) => setTimeout(r, 900))

      const clickResult = await win.webContents
        .executeJavaScript(buildDetectFillSubmitScript(sentinelUser, sentinelPass), true)
        .catch(() => ({ ok: false }))
      if (!clickResult?.ok) continue

      const found = await waitForCapturedRequest(captured, sentinelUser, sentinelPass, Math.min(6000, deadline - Date.now()))
      if (!found) continue

      const bodyTemplate = buildTemplate(found.body, sentinelUser, sentinelPass)
      if (!bodyTemplate) continue

      const contentTypeHeader = Object.entries(found.headers || {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1]
      const contentType = String(contentTypeHeader || '').toLowerCase().includes('form-urlencoded') ? 'form' : 'json'

      return {
        found: true,
        url: found.url,
        method: found.method,
        contentType,
        bodyTemplate,
        headers: filterHeaders(found.headers),
        sourceUrl: pageUrl,
        userField: clickResult.userField,
        passwordField: clickResult.passwordField,
        renderDetected: true
      }
    }
    return { found: false }
  } finally {
    ses.webRequest.onBeforeRequest(null)
    ses.webRequest.onBeforeSendHeaders(null)
    if (!win.isDestroyed()) win.destroy()
  }
}

const DEFAULT_XSS_PARAMS = ['q', 'search', 's', 'query', 'keyword', 'term', 'name', 'message', 'comment', 'page']
// Marca window.__duxXssMarker via onerror de uma tag <img> real — só dispara
// se o payload foi de fato parseado como HTML/executado (onerror roda), não
// se apareceu como texto escapado na página. Bem mais confiável que o
// "response.text().includes(probe)" do check por fetch cru em vulnScan.js
// (que pode dar falso positivo se o payload aparecer dentro de um comentário,
// atributo ou string JS sem nunca ser interpretado como markup de verdade), e
// funciona igual pra XSS refletido server-side ou DOM-based via JS client-side
// (SPA lendo location.search e jogando num innerHTML, por exemplo).
const XSS_MARKER = 'HIT'
function buildXssProbe() {
  return `<img src=x onerror="window.__duxXssMarker='${XSS_MARKER}'">`
}

async function renderCheckXssExecution({ url, timeoutMs, params }) {
  const base = String(url || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base)) return { found: false }

  const budget = Math.max(3000, Math.min(45_000, Number(timeoutMs) || 15_000))
  const candidateParams = Array.isArray(params) && params.length ? params.slice(0, 12) : DEFAULT_XSS_PARAMS
  const probe = buildXssProbe()

  const ses = session.fromPartition(`render-bridge-${crypto.randomBytes(6).toString('hex')}`, { cache: false })
  const win = new BrowserWindow({
    show: false,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, images: false }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  try {
    const deadline = Date.now() + budget
    for (const param of candidateParams) {
      const remaining = deadline - Date.now()
      if (remaining < 1500) break
      const query = `${param}=${encodeURIComponent(probe)}`
      const pageUrl = `${base}/?${query}`
      const perPageBudget = Math.min(remaining, 8_000)

      try {
        await Promise.race([
          win.loadURL(pageUrl),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), perPageBudget))
        ])
      } catch {
        continue
      }
      // Mesma espera de hidratação usada em renderAndDetectLogin — cobre o
      // caso do valor só ser jogado no DOM depois do bundle da SPA rodar.
      await new Promise((r) => setTimeout(r, 700))

      const marker = await win.webContents.executeJavaScript('window.__duxXssMarker || null', true).catch(() => null)
      if (marker === XSS_MARKER) {
        return {
          found: true,
          path: `?${query}`,
          evidence: `payload <img onerror> executou de verdade (confirmado via renderização real, JS executado) através do parâmetro "${param}"`
        }
      }
    }
    return { found: false }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

// Escuta as linhas do stdout do bridge (que já é lido pra log em
// src/main/index.js — 'data' aceita múltiplos listeners, então isso não
// interfere no log existente) e responde via stdin do mesmo processo.
export function attachRenderBridge(bridgeProcess) {
  let buffer = ''
  bridgeProcess.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf-8')
    let idx
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      if (!line.startsWith(REQUEST_MARKER)) continue
      handleLine(line)
    }
  })

  async function handleLine(line) {
    let payload
    try {
      payload = JSON.parse(line.slice(REQUEST_MARKER.length))
    } catch {
      return
    }
    const runAction = payload.action === 'checkXss' ? renderCheckXssExecution : renderAndDetectLogin
    const result = await runAction(payload).catch((err) => ({
      found: false,
      error: err?.message || 'render bridge error'
    }))
    if (bridgeProcess.stdin?.writable) {
      bridgeProcess.stdin.write(`${RESPONSE_MARKER}${JSON.stringify({ id: payload.id, result })}\n`)
    }
  }
}
