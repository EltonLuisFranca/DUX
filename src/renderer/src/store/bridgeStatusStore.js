import { ref } from 'vue'

// O bridge (Node no WSL/local, ver src/main/index.js) é quem roda os
// terminais, git, notas... Se ele cai, tudo para — vale mostrar no rodapé.
// Mantém uma conexão WebSocket ociosa só pra saber se ele está de pé, e
// tenta de novo a cada RETRY_MS enquanto estiver fora (inclusive no boot,
// quando o bridge ainda está subindo).
const BRIDGE_URL = 'ws://127.0.0.1:4577'
const RETRY_MS = 3000

export const bridgeState = ref('connecting') // 'connecting' | 'online' | 'offline'

let ws = null
let retryTimer = null

function connect() {
  clearTimeout(retryTimer)
  try {
    ws = new WebSocket(BRIDGE_URL)
  } catch {
    scheduleRetry()
    return
  }
  ws.onopen = () => {
    bridgeState.value = 'online'
  }
  ws.onclose = () => {
    ws = null
    // primeira tentativa falhando no boot continua "conectando" até a
    // próxima; depois de já ter estado online, cair é "offline"
    if (bridgeState.value === 'online') bridgeState.value = 'offline'
    else if (bridgeState.value === 'connecting') bridgeState.value = 'offline'
    scheduleRetry()
  }
  ws.onerror = () => {
    // onclose vem logo em seguida e trata
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(connect, RETRY_MS)
}

connect()
