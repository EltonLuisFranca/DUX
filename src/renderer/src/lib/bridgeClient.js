const BRIDGE_URL = 'ws://127.0.0.1:4577'

export function checkWslPath(path) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ valid: false, error: 'timeout' }), 4000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'checkPath', path }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'pathCheck') finish(msg)
    }

    ws.onerror = () => finish({ valid: false, error: 'connection' })
  })
}

export function fetchGitStatus(path) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ valid: false, error: 'timeout' }), 8000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'gitStatus', path }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'gitStatusResult') finish(msg)
    }

    ws.onerror = () => finish({ valid: false, error: 'connection' })
  })
}

export function fetchDockerContainers(host) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    // Acima do timeout de 10s do execFile em bridge/dockerStatus.js — senão
    // este timeout sempre ganha a corrida primeiro e mostra o "timeout" cru
    // aqui em vez da mensagem melhor que o bridge devolveria (ex: "tempo
    // esgotado esperando o docker responder" ou o stderr real do docker).
    const timeout = setTimeout(() => finish({ valid: false, error: 'timeout' }), 12000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'dockerList', host }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'dockerListResult') finish(msg)
    }

    ws.onerror = () => finish({ valid: false, error: 'connection' })
  })
}

export function runDockerAction(containerId, action, host) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ ok: false, error: 'timeout' }), 15000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'dockerAction', containerId, action, host }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'dockerActionResult') finish(msg)
    }

    ws.onerror = () => finish({ ok: false, error: 'connection' })
  })
}

export function fetchDockerLogs(containerId, { tail, host } = {}) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    // Mesmo motivo do timeout de fetchDockerContainers: fica acima do
    // timeout de 10s do execFile em bridge/dockerStatus.js.
    const timeout = setTimeout(() => finish({ ok: false, error: 'timeout' }), 12000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'dockerLogs', containerId, tail, host }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'dockerLogsResult') finish(msg)
    }

    ws.onerror = () => finish({ ok: false, error: 'connection' })
  })
}

export function checkTerminalAvailability() {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ shell: false, wsl: false, powershell: false, cmd: false }), 4000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'checkTerminalAvailability' }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'terminalAvailability') finish(msg)
    }

    ws.onerror = () => finish({ shell: false, wsl: false, powershell: false, cmd: false })
  })
}

function sendControlMessage(message) {
  const ws = new WebSocket(BRIDGE_URL)
  ws.onopen = () => {
    ws.send(JSON.stringify(message))
    ws.close()
  }
}

export function linkAgents(sessionA, sessionB) {
  sendControlMessage({ type: 'link', sessionA, sessionB })
}

export function unlinkAgents(sessionA, sessionB) {
  sendControlMessage({ type: 'unlink', sessionA, sessionB })
}

export function checkNotePath(path) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ parentValid: false, error: 'timeout' }), 4000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'noteCheckPath', path }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'noteCheck') finish(msg)
    }

    ws.onerror = () => finish({ parentValid: false, error: 'connection' })
  })
}

export function readNote(path) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ content: '', error: 'timeout' }), 4000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'noteRead', path }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'noteContent') finish(msg)
    }

    ws.onerror = () => finish({ content: '', error: 'connection' })
  })
}

export function writeNote(path, content) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ ok: false, error: 'timeout' }), 4000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'noteWrite', path, content }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'noteWriteResult') finish(msg)
    }

    ws.onerror = () => finish({ ok: false, error: 'connection' })
  })
}

export function createDefaultNote() {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ error: 'timeout' }), 4000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'noteCreateDefault' }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'noteCreated') finish(msg)
    }

    ws.onerror = () => finish({ error: 'connection' })
  })
}

// Usadas pelas tools de arquivo do node Ollama (ollamaTools.js) — diferente
// de readNote/writeNote, que têm semântica própria de nota (criam o arquivo
// vazio se não existir); aqui um path inexistente é um erro reportado ao
// modelo, não algo a corrigir silenciosamente.
export function readFile(path) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ ok: false, error: 'timeout' }), 4000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'fileRead', path }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'fileReadResult') finish(msg)
    }

    ws.onerror = () => finish({ ok: false, error: 'connection' })
  })
}

export function writeFile(path, content) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ ok: false, error: 'timeout' }), 4000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'fileWrite', path, content }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'fileWriteResult') finish(msg)
    }

    ws.onerror = () => finish({ ok: false, error: 'connection' })
  })
}

export function listFiles(path) {
  return new Promise((resolve) => {
    let settled = false
    const ws = new WebSocket(BRIDGE_URL)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      ws.close()
    }

    const timeout = setTimeout(() => finish({ ok: false, error: 'timeout' }), 4000)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'fileList', path }))

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'fileListResult') finish(msg)
    }

    ws.onerror = () => finish({ ok: false, error: 'connection' })
  })
}

// Diferente das outras funções deste módulo (que abrem/fecham um WS por
// chamada): watchNote mantém a conexão viva enquanto o node estiver montado,
// pra receber noteChanged toda vez que o arquivo mudar em disco. Retorna uma
// função de unsubscribe — chamar no onBeforeUnmount do node.
export function watchNote(path, onChange) {
  const ws = new WebSocket(BRIDGE_URL)
  ws.onopen = () => ws.send(JSON.stringify({ type: 'noteWatch', path }))
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.type === 'noteChanged' && msg.path === path) onChange(msg)
  }
  return () => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'noteUnwatch', path }))
    ws.close()
  }
}

// Limite de uso do plano Claude Pro/Max (sessão de 5h + semana), o mesmo que
// o /usage da CLI mostra — é da conta inteira, não de um terminal específico,
// então (diferente das outras funções deste módulo) essa conexão é pra durar
// a vida inteira do app: quem chama guarda o unsubscribe só pra fechar junto
// com o processo, não a cada troca de tela.
export function watchAccountUsage(onUpdate) {
  let ws = null
  let retryTimer = null

  // No Windows o bridge sobe dentro do WSL (wsl.exe + shell de login + nvm,
  // ver startBridge() em src/main/index.js) — bem mais lento que o spawn
  // direto de node usado no Linux nativo. Essa conexão abre uma única vez, no
  // boot do app (accountUsageStore.js é singleton de módulo), então sem
  // retry a primeira tentativa perde a corrida contra o bridge ainda
  // subindo e o indicador some pro resto da sessão — mesmo reconnect do `ws`
  // do terminal em WslClaudeTerminalNode.vue.
  function connect() {
    ws = new WebSocket(BRIDGE_URL)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'watchAccountUsage' }))
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'accountUsageUpdate') onUpdate(msg)
    }
    ws.onclose = () => {
      retryTimer = setTimeout(connect, 1500)
    }
    ws.onerror = () => ws?.close()
  }

  connect()

  return () => {
    clearTimeout(retryTimer)
    if (ws) {
      ws.onclose = null
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'unwatchAccountUsage' }))
      ws.close()
    }
  }
}

export function linkNoteToAgent(sessionId, path) {
  sendControlMessage({ type: 'noteLink', sessionId, path })
}

export function unlinkNoteFromAgent(sessionId, path) {
  sendControlMessage({ type: 'noteUnlink', sessionId, path })
}

// Empurra uma tarefa despachada de um board DuxBan pro terminal do agente
// (escreve como mensagem no PTY dele, ver bridge/duxbanLink.js) — fire-and-
// forget como linkAgents/linkNoteToAgent, o board não espera confirmação
// aqui: o próprio agente reporta progresso de volta via as tools
// dux_kanban_* (bridge/mcp-server.mjs), tratadas em duxbanRequest/Response.
export function sendDuxbanTaskToAgent(sessionId, { boardName, columnTitle, cardId, cardText }) {
  sendControlMessage({ type: 'duxbanTaskToAgent', sessionId, boardName, columnTitle, cardId, cardText })
}

// Diferente das funções de request/response única deste módulo: o teste de
// força bruta de credenciais roda por vários segundos/minutos no bridge e
// precisa empurrar progresso tentativa-a-tentativa (não só um resultado no
// final) — por isso mantém a conexão viva, mesmo padrão de watchNote, só que
// disparada por credentialTestStart em vez de assinatura passiva.
export function runCredentialTest(payload, { onProgress, onResult, onConnectionError }) {
  const ws = new WebSocket(BRIDGE_URL)
  const requestId = crypto.randomUUID()
  let done = false

  const finish = (result) => {
    if (done) return
    done = true
    onResult(result)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  ws.onopen = () => ws.send(JSON.stringify({ type: 'credentialTestStart', requestId, ...payload }))

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.requestId !== requestId) return
    if (msg.type === 'credentialTestProgress') onProgress(msg)
    else if (msg.type === 'credentialTestResult') finish(msg)
  }

  ws.onerror = () => {
    onConnectionError?.()
    finish({ requestId, cancelled: false, error: 'connection', totalAttempts: 0, findings: [], rateLimit: null })
  }

  return {
    requestId,
    stop() {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'credentialTestStop', requestId }))
    }
  }
}

// Mesmo padrão de streaming de runCredentialTest (conexão viva, progresso
// porta-a-porta em vez de só o resultado final) — a varredura de portas roda
// no bridge (bridge/portScan.js) por poder levar segundos/minutos dependendo
// da quantidade de portas.
export function runPortScan(payload, { onProgress, onResult, onConnectionError }) {
  const ws = new WebSocket(BRIDGE_URL)
  const requestId = crypto.randomUUID()
  let done = false

  const finish = (result) => {
    if (done) return
    done = true
    onResult(result)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  ws.onopen = () => ws.send(JSON.stringify({ type: 'portScanStart', requestId, ...payload }))

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.requestId !== requestId) return
    if (msg.type === 'portScanProgress') onProgress(msg)
    else if (msg.type === 'portScanResult') finish(msg)
  }

  ws.onerror = () => {
    onConnectionError?.()
    finish({ requestId, cancelled: false, error: 'connection', totalPorts: 0, openPorts: [] })
  }

  return {
    requestId,
    stop() {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'portScanStop', requestId }))
    }
  }
}

// Mesmo padrão de streaming dos outros dois (runCredentialTest/runPortScan)
// — teste de carga roda no bridge (bridge/loadTest.js) por segundos/minutos,
// com progresso de RPS/latência/erro empurrado periodicamente, não só o
// resumo final.
export function runLoadTest(payload, { onProgress, onResult, onConnectionError }) {
  const ws = new WebSocket(BRIDGE_URL)
  const requestId = crypto.randomUUID()
  let done = false

  const finish = (result) => {
    if (done) return
    done = true
    onResult(result)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  ws.onopen = () => ws.send(JSON.stringify({ type: 'loadTestStart', requestId, ...payload }))

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.requestId !== requestId) return
    if (msg.type === 'loadTestProgress') onProgress(msg)
    else if (msg.type === 'loadTestResult') finish(msg)
  }

  ws.onerror = () => {
    onConnectionError?.()
    finish({ requestId, cancelled: false, error: 'connection', totalCompleted: 0 })
  }

  return {
    requestId,
    stop() {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'loadTestStop', requestId }))
    }
  }
}

// Mesmo padrão de streaming dos outros três (runCredentialTest/runPortScan/
// runLoadTest) — a varredura de subdomínios roda no bridge
// (bridge/subdomainScan.js) por poder levar segundos/minutos dependendo do
// tamanho da wordlist.
export function runSubdomainScan(payload, { onProgress, onResult, onConnectionError }) {
  const ws = new WebSocket(BRIDGE_URL)
  const requestId = crypto.randomUUID()
  let done = false

  const finish = (result) => {
    if (done) return
    done = true
    onResult(result)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  ws.onopen = () => ws.send(JSON.stringify({ type: 'subdomainScanStart', requestId, ...payload }))

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.requestId !== requestId) return
    if (msg.type === 'subdomainScanProgress') onProgress(msg)
    else if (msg.type === 'subdomainScanResult') finish(msg)
  }

  ws.onerror = () => {
    onConnectionError?.()
    finish({ requestId, cancelled: false, error: 'connection', totalSubdomains: 0, found: [] })
  }

  return {
    requestId,
    stop() {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'subdomainScanStop', requestId }))
    }
  }
}

// Mesmo padrão de streaming dos outros quatro (runCredentialTest/runPortScan/
// runLoadTest/runSubdomainScan) — o fuzzer de diretórios/endpoints roda no
// bridge (bridge/dirFuzz.js) por poder levar segundos/minutos dependendo do
// tamanho da wordlist.
export function runDirFuzz(payload, { onProgress, onResult, onConnectionError }) {
  const ws = new WebSocket(BRIDGE_URL)
  const requestId = crypto.randomUUID()
  let done = false

  const finish = (result) => {
    if (done) return
    done = true
    onResult(result)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  ws.onopen = () => ws.send(JSON.stringify({ type: 'dirFuzzStart', requestId, ...payload }))

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.requestId !== requestId) return
    if (msg.type === 'dirFuzzProgress') onProgress(msg)
    else if (msg.type === 'dirFuzzResult') finish(msg)
  }

  ws.onerror = () => {
    onConnectionError?.()
    finish({ requestId, cancelled: false, error: 'connection', totalPaths: 0, found: [] })
  }

  return {
    requestId,
    stop() {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'dirFuzzStop', requestId }))
    }
  }
}

// Diferente dos outros cinco: uma única requisição, não uma varredura por
// wordlist — mas mantém o mesmo formato de conexão viva + Start/Progress/
// Result/Stop pra encaixar sem mudanças no wsHandlers.js (bridge/securityHeaders.js).
export function runSecurityHeadersCheck(payload, { onProgress, onResult, onConnectionError }) {
  const ws = new WebSocket(BRIDGE_URL)
  const requestId = crypto.randomUUID()
  let done = false

  const finish = (result) => {
    if (done) return
    done = true
    onResult(result)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  ws.onopen = () => ws.send(JSON.stringify({ type: 'securityHeadersStart', requestId, ...payload }))

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.requestId !== requestId) return
    if (msg.type === 'securityHeadersProgress') onProgress?.(msg)
    else if (msg.type === 'securityHeadersResult') finish(msg)
  }

  ws.onerror = () => {
    onConnectionError?.()
    finish({ requestId, cancelled: false, error: 'connection' })
  }

  return {
    requestId,
    stop() {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'securityHeadersStop', requestId }))
    }
  }
}

// Mesmo padrão de runSecurityHeadersCheck: uma única checagem (conexão TLS),
// não uma varredura — mas mantém conexão viva + Start/Progress/Result/Stop
// pra encaixar sem mudanças no wsHandlers.js (bridge/tlsCheck.js).
export function runTlsCheck(payload, { onProgress, onResult, onConnectionError }) {
  const ws = new WebSocket(BRIDGE_URL)
  const requestId = crypto.randomUUID()
  let done = false

  const finish = (result) => {
    if (done) return
    done = true
    onResult(result)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  ws.onopen = () => ws.send(JSON.stringify({ type: 'tlsCheckStart', requestId, ...payload }))

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.requestId !== requestId) return
    if (msg.type === 'tlsCheckProgress') onProgress?.(msg)
    else if (msg.type === 'tlsCheckResult') finish(msg)
  }

  ws.onerror = () => {
    onConnectionError?.()
    finish({ requestId, cancelled: false, error: 'connection' })
  }

  return {
    requestId,
    stop() {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'tlsCheckStop', requestId }))
    }
  }
}
