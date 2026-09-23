const tls = require('tls')

const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_PORT = 443
const NEAR_EXPIRY_DAYS = 30

// mensagens legíveis pros códigos de erro de verificação mais comuns do
// OpenSSL/Node (tlsSocket.authorizationError) — o resto cai no código bruto
const AUTH_ERROR_LABELS = {
  SELF_SIGNED_CERT_IN_CHAIN: 'certificado autoassinado presente na cadeia',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'certificado autoassinado (sem CA reconhecida)',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'não foi possível verificar a assinatura (CA intermediária ausente)',
  UNABLE_TO_GET_ISSUER_CERT: 'não foi possível obter o certificado do emissor',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'emissor não está na lista de CAs confiáveis',
  CERT_HAS_EXPIRED: 'certificado expirado',
  CERT_NOT_YET_VALID: 'certificado ainda não é válido',
  HOSTNAME_MISMATCH: 'hostname não corresponde ao certificado (CN/SAN)'
}

function cleanHost(raw) {
  return String(raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
}

// nome dos campos (CN, O, OU...) na ordem em que normalmente se lê um
// certificado — o resto dos campos que aparecerem vai depois, na ordem que vier
function formatName(name) {
  if (!name || typeof name !== 'object') return ''
  const order = ['CN', 'O', 'OU', 'L', 'ST', 'C']
  const parts = []
  for (const key of order) if (name[key]) parts.push(`${key}=${name[key]}`)
  for (const key of Object.keys(name)) if (!order.includes(key) && name[key]) parts.push(`${key}=${name[key]}`)
  return parts.join(', ')
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((date.getTime() - Date.now()) / 86_400_000)
}

function parseProtocolVersion(protocol) {
  if (!protocol) return null
  const match = /TLSv(\d)(?:\.(\d))?/i.exec(protocol)
  if (match) return Number(match[1]) + (match[2] ? Number(match[2]) / 10 : 0)
  if (/SSL/i.test(protocol)) return 0
  return null
}

// getPeerCertificate(true) devolve a cadeia inteira encadeada via
// issuerCertificate — segue até o topo (root aponta issuerCertificate pra si
// mesmo, ou vem vazio); seenFingerprints corta qualquer loop.
function buildChain(peerCert) {
  const chain = []
  let current = peerCert
  const seen = new Set()
  while (current && current.subject && !seen.has(current.fingerprint)) {
    seen.add(current.fingerprint)
    const subject = formatName(current.subject)
    const issuer = formatName(current.issuer)
    chain.push({
      subject,
      issuer,
      validFrom: current.valid_from || null,
      validTo: current.valid_to || null,
      daysRemaining: daysUntil(current.valid_to),
      selfSigned: Boolean(subject) && subject === issuer
    })
    if (!current.issuerCertificate || current.issuerCertificate === current) break
    current = current.issuerCertificate
  }
  return chain
}

function buildAlerts({ chain, authorized, authorizationError, protocol }) {
  const alerts = []
  const leaf = chain[0]

  if (leaf?.daysRemaining !== null && leaf?.daysRemaining !== undefined) {
    if (leaf.daysRemaining < 0) {
      alerts.push({ level: 'danger', text: `Certificado expirado há ${Math.abs(leaf.daysRemaining)} dia(s).` })
    } else if (leaf.daysRemaining < NEAR_EXPIRY_DAYS) {
      alerts.push({ level: 'warn', text: `Certificado expira em ${leaf.daysRemaining} dia(s).` })
    }
  }

  if (!authorized) {
    const label = AUTH_ERROR_LABELS[authorizationError] || authorizationError || 'motivo desconhecido'
    alerts.push({ level: 'danger', text: `Cadeia de certificados não confiável: ${label}.` })
  }

  const version = parseProtocolVersion(protocol)
  if (version !== null && version < 1.2) {
    alerts.push({ level: 'danger', text: `Protocolo negociado (${protocol || 'desconhecido'}) é considerado obsoleto/inseguro.` })
  }

  return alerts
}

// Diferente de portScan.js/dirFuzz.js: uma única conexão TLS, não um scan —
// mas mantém a mesma forma createRunner(payload,{onProgress,onDone})->{stop()}
// pra encaixar sem mudanças no wiring do wsHandlers.js (mesmo motivo do
// securityHeaders.js). rejectUnauthorized:false é proposital: queremos
// inspecionar o certificado mesmo quando a cadeia é inválida/autoassinada —
// authorized/authorizationError continuam preenchidos corretamente pelo Node
// mesmo com essa opção, só não derruba a conexão.
function createRunner({ host, port, timeoutMs }, { onProgress, onDone }) {
  const targetHost = cleanHost(host)
  const targetPort = Number(port) > 0 && Number(port) <= 65535 ? Number(port) : DEFAULT_PORT
  const timeout = Math.max(1000, Math.min(20_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  const startedAt = Date.now()

  if (!targetHost) {
    setTimeout(() => onDone({ cancelled: false, error: 'Host alvo não informado' }), 0)
    return { stop() {} }
  }

  let cancelled = false
  let settled = false

  onProgress?.({ status: 'connecting' })

  const socket = tls.connect({
    host: targetHost,
    port: targetPort,
    servername: targetHost,
    rejectUnauthorized: false,
    timeout
  })

  const finish = (result) => {
    if (settled) return
    settled = true
    socket.removeAllListeners()
    socket.destroy()
    onDone(result)
  }

  socket.once('secureConnect', () => {
    if (cancelled) {
      finish({ cancelled: true, durationMs: Date.now() - startedAt })
      return
    }
    const peerCert = socket.getPeerCertificate(true)
    const protocol = socket.getProtocol()
    const cipher = socket.getCipher()
    const authorized = socket.authorized
    const authorizationError = socket.authorizationError ? String(socket.authorizationError) : null
    const chain = buildChain(peerCert)
    const alerts = buildAlerts({ chain, authorized, authorizationError, protocol })

    finish({
      cancelled: false,
      host: targetHost,
      port: targetPort,
      protocol: protocol || null,
      cipher: cipher ? { name: cipher.name, version: cipher.version } : null,
      authorized,
      authorizationError,
      chain,
      alerts,
      durationMs: Date.now() - startedAt
    })
  })

  socket.once('timeout', () => {
    finish({ cancelled: false, error: 'tempo esgotado esperando o handshake TLS', durationMs: Date.now() - startedAt })
  })

  socket.once('error', (err) => {
    finish({ cancelled: false, error: err.message || 'erro de conexão', durationMs: Date.now() - startedAt })
  })

  // socket.destroy() sem erro (caminho do stop() abaixo) não emite 'error' —
  // só 'close'. Sem este listener, cancelar antes do handshake terminar
  // nunca chamaria onDone e o node ficaria "rodando" pra sempre (mesmo
  // cuidado do socket.once('close', ...) em portScan.js). finish() é
  // idempotente (guardado por `settled`), então isso não duplica o resultado
  // quando o 'close' chega depois de um secureConnect/timeout/error normal.
  socket.once('close', () => {
    finish({ cancelled: true, durationMs: Date.now() - startedAt })
  })

  return {
    stop() {
      cancelled = true
      socket.destroy()
    }
  }
}

module.exports = { createRunner }
