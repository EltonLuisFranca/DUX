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
