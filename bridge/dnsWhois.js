const dns = require('dns')
const net = require('net')

const dnsPromises = dns.promises

const DEFAULT_TIMEOUT_MS = 5000
const WHOIS_PORT = 43
const RAW_MAX_CHARS = 6000

const RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'CAA']

// Seletores DKIM mais comuns — não há como enumerar todos (quem configura o
// DNS escolhe o nome do seletor livremente), então tenta os mais usados por
// provedores populares em vez de uma varredura exaustiva, mesmo espírito das
// wordlists curadas de subdomain-scan/dir-fuzz.
const COMMON_DKIM_SELECTORS = [
  'default', 'google', 'selector1', 'selector2', 'k1', 'k2', 's1', 's2',
  'dkim', 'mail', 'smtp', 'mandrill', 'mailgun', 'sendgrid', 'zoho'
]

// dns.promises não suporta AbortSignal — mesma solução do resolveWithTimeout
// em subdomainScan.js: a promise original fica "solta" quando o timeout
// vence (ainda resolve depois, só que ninguém mais espera).
function raceTimeout(promise, timeoutMs, fallback) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs))
  return Promise.race([promise.catch(() => fallback), timeout])
}

async function resolveRecords(domain, timeoutMs) {
  const results = {}
  await Promise.all(
    RECORD_TYPES.map(async (type) => {
      results[type] = await raceTimeout(dnsPromises.resolve(domain, type), timeoutMs, [])
    })
  )
  return results
}

function extractSpf(txtRecords) {
  const flat = (txtRecords || []).map((parts) => parts.join('')).filter(Boolean)
  return flat.find((v) => v.toLowerCase().startsWith('v=spf1')) || null
}

async function resolveDmarc(domain, timeoutMs) {
  const records = await raceTimeout(dnsPromises.resolveTxt(`_dmarc.${domain}`), timeoutMs, [])
  const flat = records.map((parts) => parts.join(''))
  return flat.find((v) => v.toLowerCase().startsWith('v=dmarc1')) || null
}

async function probeDkimSelectors(domain, timeoutMs) {
  const found = []
  await Promise.all(
    COMMON_DKIM_SELECTORS.map(async (selector) => {
      const records = await raceTimeout(dnsPromises.resolveTxt(`${selector}._domainkey.${domain}`), timeoutMs, [])
      const flat = records.map((parts) => parts.join(''))
      const value = flat.find((v) => /v=dkim1/i.test(v))
      if (value) found.push({ selector, value: value.slice(0, 200) })
    })
  )
  return found
}

// Cliente WHOIS mínimo (RFC 3912): abre um socket TCP na porta 43, manda o
// termo de busca + CRLF, lê tudo até o servidor fechar a conexão — sem lib
// externa, mesmo espírito do net.Socket cru de portScan.js/tlsCheck.js.
// activeSockets permite ao stop() do runner destruir a conexão na hora.
function whoisQuery(server, query, timeoutMs, activeSockets) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    activeSockets?.add(socket)
    let buf = ''
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      activeSockets?.delete(socket)
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('timeout', () => finish({ ok: false, reason: 'timeout' }))
    socket.once('error', (err) => finish({ ok: false, reason: err.code || err.message }))
    socket.once('close', () => finish({ ok: true, text: buf }))
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
    })
    socket.connect(WHOIS_PORT, server, () => {
      socket.write(`${query}\r\n`)
    })
  })
}

function parseWhoisFields(text) {
  const fields = {}
  const nameServers = new Set()
  const statuses = new Set()
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z][A-Za-z0-9 ./-]{2,40}?):\s*(.+?)\s*$/.exec(line)
    if (!m) continue
    const key = m[1].trim().toLowerCase()
    const value = m[2].trim()
    if (!value) continue
    if (key.includes('name server') || key.includes('nserver')) nameServers.add(value.toLowerCase())
    else if (key.includes('domain status') || key === 'status') statuses.add(value)
    else if (key.includes('registrar') && !key.includes('whois') && !fields.registrar) fields.registrar = value
    else if ((key.includes('creation date') || key === 'created' || key.includes('registered on')) && !fields.createdAt) fields.createdAt = value
    else if ((key.includes('expir') || key.includes('paid-till')) && !fields.expiresAt) fields.expiresAt = value
    else if (key.includes('updated date') && !fields.updatedAt) fields.updatedAt = value
    else if (key === 'dnssec' && !fields.dnssec) fields.dnssec = value
  }
  return { ...fields, nameServers: [...nameServers], statuses: [...statuses] }
}

function findReferral(text) {
  const m = /^(?:whois server|whoisserver|referralserver|refer)\s*:\s*(?:whois:\/\/)?(\S+)/im.exec(text)
  return m ? m[1].replace(/\/$/, '') : null
}

// IANA -> registro do TLD -> (opcional) registrador, mesmos dois hops que um
// cliente whois real dá pra .com/.net (a Verisign devolve só o essencial e
// referencia o whois do registrador pros dados completos).
async function lookupWhois(domain, timeoutMs, activeSockets) {
  const tld = domain.split('.').pop()
  const ianaResult = await whoisQuery('whois.iana.org', tld, timeoutMs, activeSockets)
  if (!ianaResult.ok) return { error: `IANA: ${ianaResult.reason}` }

  const tldServer = findReferral(ianaResult.text) || /^whois:\s*(\S+)/im.exec(ianaResult.text)?.[1]
  if (!tldServer) return { error: `sem servidor WHOIS conhecido para .${tld}`, raw: ianaResult.text.slice(0, RAW_MAX_CHARS) }

  const primary = await whoisQuery(tldServer, domain, timeoutMs, activeSockets)
  if (!primary.ok) return { error: `${tldServer}: ${primary.reason}`, server: tldServer }

  const registrarServer = findReferral(primary.text)
  let finalText = primary.text
  let finalServer = tldServer
  if (registrarServer && registrarServer.toLowerCase() !== tldServer.toLowerCase()) {
    const secondary = await whoisQuery(registrarServer, domain, timeoutMs, activeSockets)
    if (secondary.ok && secondary.text.trim()) {
      finalText = `${primary.text}\n\n----- ${registrarServer} -----\n\n${secondary.text}`
      finalServer = registrarServer
    }
  }

  return {
    server: finalServer,
    raw: finalText.slice(0, RAW_MAX_CHARS),
    parsed: parseWhoisFields(finalText)
  }
}

// Mesmo shape do createRunner de securityHeaders.js/tlsCheck.js: uma única
// checagem (não uma varredura por wordlist), mas com dois estágios (DNS
// depois WHOIS) — onProgress reporta a troca de estágio pra UI mostrar o quê
// está rolando; onDone uma vez com o resumo; stop() cancela cooperativamente
// (sockets WHOIS em voo são destruídos na hora; lookups DNS em voo seguem em
// segundo plano e são descartados, mesma limitação do subdomainScan.js).
function createRunner({ domain, timeoutMs }, { onProgress, onDone }) {
  const cleanDomain = String(domain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
  const timeout = Math.max(1000, Math.min(20_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  const startedAt = Date.now()

  if (!cleanDomain || !cleanDomain.includes('.')) {
    setTimeout(() => onDone({ cancelled: false, error: 'domínio alvo inválido' }), 0)
    return { stop() {} }
  }

  let cancelled = false
  const activeSockets = new Set()

  onProgress?.({ stage: 'dns' })

  ;(async () => {
    const [records, dmarc, dkim] = await Promise.all([
      resolveRecords(cleanDomain, timeout),
      resolveDmarc(cleanDomain, timeout),
      probeDkimSelectors(cleanDomain, timeout)
    ])
    const spf = extractSpf(records.TXT)

    if (cancelled) {
      onDone({ cancelled: true, durationMs: Date.now() - startedAt })
      return
    }

    onProgress?.({ stage: 'whois' })
    const whois = await lookupWhois(cleanDomain, timeout, activeSockets)

    if (cancelled) {
      onDone({ cancelled: true, durationMs: Date.now() - startedAt })
      return
    }

    onDone({
      cancelled: false,
      domain: cleanDomain,
      records,
      spf,
      dmarc,
      dkim,
      whois,
      durationMs: Date.now() - startedAt
    })
  })()

  return {
    stop() {
      cancelled = true
      for (const s of activeSockets) s.destroy()
    }
  }
}

module.exports = { createRunner, RECORD_TYPES, COMMON_DKIM_SELECTORS }
