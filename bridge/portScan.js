const net = require('net')

const DEFAULT_CONNECT_TIMEOUT_MS = 1500
const BANNER_TIMEOUT_MS = 800
const BANNER_MAX_BYTES = 256
const MAX_CONCURRENCY = 200
const MAX_PORTS = 10_000

// Portas mais relevantes pra recon inicial, ordenadas por frequência real em
// serviços de rede/infra — não é a nmap-services inteira (milhares de
// entradas) de propósito: o card pede reconhecimento inicial, não um scan
// exaustivo. "Comuns" (preset top20) é o prefixo desta lista; "Estendida"
// (preset top100) é a lista toda.
const TOP_PORTS = [
  [21, 'ftp'], [22, 'ssh'], [23, 'telnet'], [25, 'smtp'], [53, 'dns'],
  [80, 'http'], [110, 'pop3'], [111, 'rpcbind'], [135, 'msrpc'], [139, 'netbios-ssn'],
  [143, 'imap'], [443, 'https'], [445, 'microsoft-ds'], [993, 'imaps'], [995, 'pop3s'],
  [3306, 'mysql'], [3389, 'rdp'], [5900, 'vnc'], [8080, 'http-proxy'], [9200, 'elasticsearch'],

  [37, 'time'], [88, 'kerberos'], [113, 'ident'], [119, 'nntp'],
  [123, 'ntp'], [137, 'netbios-ns'], [138, 'netbios-dgm'], [161, 'snmp'], [162, 'snmptrap'],
  [179, 'bgp'], [389, 'ldap'], [548, 'afp'], [554, 'rtsp'],
  [587, 'submission'], [631, 'ipp'], [636, 'ldaps'], [873, 'rsync'], [902, 'vmware-auth'],
  [989, 'ftps-data'], [990, 'ftps'], [992, 'telnets'], [1025, 'nfs-or-iis'], [1080, 'socks'],
  [1194, 'openvpn'], [1414, 'ibm-mq'], [1433, 'mssql'],
  [1521, 'oracle'], [1723, 'pptp'], [2049, 'nfs'],
  [2181, 'zookeeper'], [2222, 'ssh-alt'], [2375, 'docker'],
  [2376, 'docker-tls'], [2379, 'etcd-client'], [2380, 'etcd-peer'], [3000, 'dev-http'], [3128, 'squid-proxy'],
  [3268, 'ldap-gc'], [3690, 'svn'], [4040, 'spark-ui'], [4444, 'metasploit'],
  [4848, 'glassfish'], [5000, 'dev-http'], [5060, 'sip'], [5222, 'xmpp-client'],
  [5353, 'mdns'], [5432, 'postgresql'], [5601, 'kibana'], [5671, 'amqps'], [5672, 'amqp'],
  [5984, 'couchdb'], [6379, 'redis'], [6443, 'kubernetes-api'], [6667, 'irc'], [7001, 'weblogic'],
  [7077, 'spark-master'], [7199, 'cassandra-jmx'], [7474, 'neo4j'], [7687, 'neo4j-bolt'], [8000, 'http-alt'],
  [8009, 'ajp13'], [8069, 'odoo'], [8086, 'influxdb'], [8161, 'activemq'], [8200, 'vault'],
  [8443, 'https-alt'], [8500, 'consul'], [8888, 'http-alt'], [8983, 'solr'], [9000, 'http-alt'],
  [9042, 'cassandra'], [9090, 'prometheus'], [9092, 'kafka'], [9300, 'elasticsearch-node'], [9418, 'git'],
  [10000, 'webmin'], [10250, 'kubelet'], [11211, 'memcached'], [15672, 'rabbitmq-mgmt'], [27017, 'mongodb']
]

const SERVICE_BY_PORT = new Map(TOP_PORTS.map(([port, name]) => [port, name]))

function presetPorts(mode) {
  if (mode === 'top20') return TOP_PORTS.slice(0, 20).map(([port]) => port)
  return TOP_PORTS.map(([port]) => port)
}

function parsePortRange(token) {
  const [a, b] = token.split('-').map((s) => Number(s.trim()))
  if (!Number.isInteger(a) || a < 1 || a > 65535) return []
  if (b === undefined) return [a]
  if (!Number.isInteger(b) || b < a || b > 65535) return []
  const out = []
  for (let p = a; p <= b && out.length < MAX_PORTS; p++) out.push(p)
  return out
}

function parseCustomPorts(raw) {
  const seen = new Set()
  for (const token of String(raw || '').split(',')) {
    const trimmed = token.trim()
    if (!trimmed) continue
    for (const port of parsePortRange(trimmed)) {
      seen.add(port)
      if (seen.size >= MAX_PORTS) break
    }
    if (seen.size >= MAX_PORTS) break
  }
  return [...seen]
}

function parsePorts({ mode, customPorts } = {}) {
  const ports = mode === 'custom' ? parseCustomPorts(customPorts) : presetPorts(mode)
  return [...new Set(ports)].sort((a, b) => a - b).slice(0, MAX_PORTS)
}

// HEAD probe é mandado só quando ninguém "fala primeiro" na conexão (SSH,
// FTP, SMTP etc respondem sozinhos) — cobre o caso comum de um serviço
// HTTP-like que só responde a um request explícito, sem tentar simular
// protocolos binários (RDP, MySQL...) que a detecção por porta já nomeia.
function scanOnePort(host, port, { connectTimeoutMs, grabBanner, activeSockets }) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    activeSockets?.add(socket)
    let settled = false
    let bannerBuf = ''
    let probeSent = false
    let bannerTimer = null
    const startedAt = Date.now()

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(bannerTimer)
      activeSockets?.delete(socket)
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }

    // pega o destroy() externo do stop() do runner (cancelamento a qualquer
    // momento, mesmo requisito do credentialTest.js) — sem este listener a
    // promise nunca resolveria pras conexões em voo no momento do cancelamento
    socket.once('close', () => finish({ open: false, reason: 'cancelado pelo usuário' }))

    socket.setTimeout(connectTimeoutMs)

    socket.once('connect', () => {
      const latencyMs = Date.now() - startedAt
      if (!grabBanner) {
        finish({ open: true, latencyMs, banner: '' })
        return
      }

      socket.setTimeout(BANNER_TIMEOUT_MS)
      socket.on('data', (chunk) => {
        bannerBuf += chunk.toString('utf8')
        if (bannerBuf.length >= BANNER_MAX_BYTES) finish({ open: true, latencyMs, banner: bannerBuf.slice(0, BANNER_MAX_BYTES) })
      })

      bannerTimer = setTimeout(() => {
        if (!probeSent && !bannerBuf) {
          probeSent = true
          try {
            socket.write('HEAD / HTTP/1.0\r\n\r\n')
          } catch {
            finish({ open: true, latencyMs, banner: '' })
            return
          }
          bannerTimer = setTimeout(() => finish({ open: true, latencyMs, banner: bannerBuf.slice(0, BANNER_MAX_BYTES) }), BANNER_TIMEOUT_MS)
        } else {
          finish({ open: true, latencyMs, banner: bannerBuf.slice(0, BANNER_MAX_BYTES) })
        }
      }, BANNER_TIMEOUT_MS)
    })

    socket.once('timeout', () => finish({ open: false, reason: 'timeout' }))
    socket.once('error', (err) => finish({ open: false, reason: err.code || err.message }))

    socket.connect(port, host)
  })
}

function guessService(port, banner) {
  const firstLine = banner.split(/\r?\n/, 1)[0]?.trim()
  if (firstLine) {
    const httpMatch = firstLine.match(/^HTTP\/\d\.\d\s+(\d{3})/)
    if (httpMatch) return `http (${httpMatch[1]})`
    if (/^SSH-/.test(firstLine)) return firstLine.slice(0, 40)
    if (firstLine.length <= 60) return firstLine
  }
  return SERVICE_BY_PORT.get(port) || 'desconhecido'
}

// Mesmo shape do createRunner de credentialTest.js: onProgress a cada porta
// verificada (não só as abertas — a UI usa isso pra barra de progresso),
// onDone uma vez com o resumo; stop() cancela cooperativamente (workers em
// voo terminam a checagem atual e não pegam a próxima).
function createRunner({ host, ports: portsConfig, connectTimeoutMs, grabBanner, concurrency }, { onProgress, onDone }) {
  const ports = parsePorts(portsConfig)
  const total = ports.length
  const timeoutMs = Math.max(100, Math.min(10_000, Number(connectTimeoutMs) || DEFAULT_CONNECT_TIMEOUT_MS))
  const workers = Math.max(1, Math.min(MAX_CONCURRENCY, Number(concurrency) || 50, total || 1))

  let cancelled = false
  let nextIndex = 0
  let completed = 0
  const openPorts = []
  const activeSockets = new Set()
  const startedAt = Date.now()

  if (total === 0) {
    setTimeout(() => onDone({ cancelled: false, totalPorts: 0, openPorts: [], durationMs: 0 }), 0)
    return { stop() {} }
  }

  async function worker() {
    while (!cancelled) {
      const index = nextIndex++
      if (index >= total) return
      const port = ports[index]
      const result = await scanOnePort(host, port, { connectTimeoutMs: timeoutMs, grabBanner, activeSockets })
      completed += 1

      if (result.open) {
        const service = guessService(port, result.banner || '')
        openPorts.push({ port, service, banner: result.banner || '' })
        onProgress({ seq: completed, total, port, open: true, service, banner: result.banner || '', latencyMs: result.latencyMs })
      } else {
        onProgress({ seq: completed, total, port, open: false, reason: result.reason })
      }
    }
  }

  Promise.all(Array.from({ length: workers }, worker)).then(() => {
    onDone({
      cancelled,
      totalPorts: total,
      openPorts: openPorts.sort((a, b) => a.port - b.port),
      durationMs: Date.now() - startedAt
    })
  })

  return {
    stop() {
      cancelled = true
      for (const s of activeSockets) s.destroy()
    }
  }
}

module.exports = { createRunner, parsePorts, TOP_PORTS }
