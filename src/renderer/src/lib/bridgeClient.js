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

export function linkNoteToAgent(sessionId, path) {
  sendControlMessage({ type: 'noteLink', sessionId, path })
}

export function unlinkNoteFromAgent(sessionId, path) {
  sendControlMessage({ type: 'noteUnlink', sessionId, path })
}
