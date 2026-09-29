const os = require('os')
const dns = require('dns')
const { execFile } = require('child_process')

const MAX_CONCURRENCY = 64
const MAX_HOSTS = 1024

// Interfaces que normalmente não representam "a rede local" do usuário
// (bridges de container, VPN, virtualização) — ignoradas na detecção
// automática pra não escanear a rede interna do Docker por engano.
const IGNORED_IFACE_PREFIXES = ['docker', 'br-', 'veth', 'vmnet', 'utun', 'tun', 'tap', 'virbr']

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
}

function intToIp(int) {
  return [24, 16, 8, 0].map((shift) => (int >>> shift) & 255).join('.')
}

function detectLocalInterface() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    if (IGNORED_IFACE_PREFIXES.some((prefix) => name.startsWith(prefix))) continue
    for (const iface of interfaces[name] || []) {
      if (!iface.internal && (iface.family === 'IPv4' || iface.family === 4)) {
        return { name, address: iface.address, netmask: iface.netmask }
      }
    }
  }
  return null
}

// Só aceita /22 a /30 (até ~1000 hosts) — evita que um CIDR digitado errado
// (ex: /8) mande o worker pool tentar enumerar milhões de IPs.
function parseCidr(cidr) {
  const match = String(cidr || '').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
  if (!match) return null
  const octets = match.slice(1, 5).map(Number)
  const prefix = Number(match[5])
  if (octets.some((o) => o < 0 || o > 255)) return null
  if (prefix < 22 || prefix > 30) return null
  return { baseInt: ipToInt(octets.join('.')), prefix }
}

function hostsForRange({ baseInt, prefix }) {
  const hostBits = 32 - prefix
  const size = 2 ** hostBits
  const networkInt = (baseInt >>> hostBits) << hostBits
  const hosts = []
  // pula endereço de rede (.0) e broadcast (último da faixa) — não são hosts
  for (let i = 1; i < size - 1 && hosts.length < MAX_HOSTS; i++) {
    hosts.push(intToIp(networkInt + i))
  }
  return hosts
}

// Sem CIDR informado, assume /24 ancorado no IP da interface local ativa —
// cobre a imensa maioria das redes domésticas/escritório sem precisar ler a
// netmask real (que em VPN/corporativa pode ser bem maior que o razoável pra
// varrer aqui).
function resolveTargets(cidr) {
  if (cidr && String(cidr).trim()) {
    const parsed = parseCidr(cidr)
    if (!parsed) return { error: 'CIDR inválido — use algo como 192.168.1.0/24 (de /22 a /30)' }
    return { hosts: hostsForRange(parsed) }
  }

  const iface = detectLocalInterface()
  if (!iface) return { error: 'Nenhuma interface de rede local ativa foi encontrada' }
  const [a, b, c] = iface.address.split('.')
  const parsed = parseCidr(`${a}.${b}.${c}.0/24`)
  return { hosts: hostsForRange(parsed), localAddress: iface.address, interfaceName: iface.name }
}

// Usa o `ping` do próprio SO (sem depender de nmap) e delega o timeout ao
// Node via `timeout`/killSignal — as flags de timeout do ping (-W) variam de
// unidade entre Linux (segundos) e macOS/BSD (ms), então confiar nelas
// diretamente exigiria detectar a plataforma; matar o processo do lado de cá
// funciona igual nas duas.
function pingHost(ip, { timeoutMs, activeChildren }) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = execFile('ping', ['-c', '1', ip], { timeout: timeoutMs, killSignal: 'SIGKILL' }, (error) => {
      activeChildren?.delete(child)
      resolve({ alive: !error, latencyMs: error ? null : Date.now() - startedAt })
    })
    activeChildren?.add(child)
  })
}

function parseIpNeighborOutput(output) {
  const map = new Map()
  for (const line of output.split('\n')) {
    const m = line.match(/^(\d{1,3}(?:\.\d{1,3}){3})\s+dev\s+\S+\s+lladdr\s+([0-9a-fA-F:]{17})/)
    if (m) map.set(m[1], m[2].toLowerCase())
  }
  return map
}

function parseArpOutput(output) {
  const map = new Map()
  for (const line of output.split('\n')) {
    const m = line.match(/\((\d{1,3}(?:\.\d{1,3}){3})\)\s+at\s+([0-9a-fA-F]{1,2}(?::[0-9a-fA-F]{1,2}){5})/)
    if (m) map.set(m[1], m[2].toLowerCase())
  }
  return map
}

// `ip neighbor` (iproute2, padrão no Linux moderno/WSL) primeiro, com
// fallback pro `arp -a` clássico (net-tools no Linux, nativo no macOS) —
// cobre as duas famílias de SO onde o bridge roda sem exigir nenhum pacote
// extra instalado.
function readArpTable() {
  return new Promise((resolve) => {
    execFile('ip', ['neighbor', 'show'], { timeout: 3000 }, (err, stdout) => {
      if (!err && stdout) return resolve(parseIpNeighborOutput(stdout))
      execFile('arp', ['-a'], { timeout: 3000 }, (err2, stdout2) => {
        resolve(err2 ? new Map() : parseArpOutput(stdout2))
      })
    })
  })
}

async function reverseLookup(ip) {
  try {
    const names = await dns.promises.reverse(ip)
    return names[0] || null
  } catch {
    return null
  }
}

// Mesmo shape do createRunner de portScan.js: onProgress a cada host testado
// (vivo ou não, pra barra de progresso), onDone uma vez com a lista final;
// stop() mata os `ping` em voo e o worker loop para na próxima checagem.
function createRunner({ cidr, pingTimeoutMs, concurrency }, { onProgress, onDone }) {
  const resolved = resolveTargets(cidr)
  if (resolved.error) {
    setTimeout(() => onDone({ cancelled: false, error: resolved.error, devices: [], totalHosts: 0, durationMs: 0 }), 0)
    return { stop() {} }
  }

  const hosts = resolved.hosts
  const total = hosts.length
  const timeoutMs = Math.max(200, Math.min(5000, Number(pingTimeoutMs) || 1000))
  const workers = Math.max(1, Math.min(MAX_CONCURRENCY, Number(concurrency) || 32, total || 1))

  let cancelled = false
  let nextIndex = 0
  let completed = 0
  const alive = []
  const activeChildren = new Set()
  const startedAt = Date.now()

  if (total === 0) {
    setTimeout(() => onDone({ cancelled: false, devices: [], totalHosts: 0, durationMs: 0 }), 0)
    return { stop() {} }
  }

  async function worker() {
    while (!cancelled) {
      const index = nextIndex++
      if (index >= total) return
      const ip = hosts[index]
      const result = await pingHost(ip, { timeoutMs, activeChildren })
      completed += 1
      if (result.alive) alive.push({ ip, latencyMs: result.latencyMs })
      onProgress({ seq: completed, total, ip, alive: result.alive })
    }
  }

  Promise.all(Array.from({ length: workers }, worker)).then(async () => {
    const arpTable = cancelled ? new Map() : await readArpTable()
    const devices = await Promise.all(
      alive
        .sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip))
        .map(async (entry) => ({
          ip: entry.ip,
          mac: arpTable.get(entry.ip) || null,
          hostname: cancelled ? null : await reverseLookup(entry.ip),
          latencyMs: entry.latencyMs,
          isSelf: entry.ip === resolved.localAddress
        }))
    )
    onDone({
      cancelled,
      devices,
      totalHosts: total,
      localAddress: resolved.localAddress || null,
      interfaceName: resolved.interfaceName || null,
      durationMs: Date.now() - startedAt
    })
  })

  return {
    stop() {
      cancelled = true
      for (const child of activeChildren) {
        try {
          child.kill('SIGKILL')
        } catch {
          // processo já pode ter terminado sozinho entre o check e o kill
        }
      }
    }
  }
}

module.exports = { createRunner, parseCidr, detectLocalInterface }
