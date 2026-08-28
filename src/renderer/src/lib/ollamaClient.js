// Fala tanto com o Ollama nativo (/api/tags, /api/chat, NDJSON) quanto com um
// Open WebUI na frente dele (/api/models, /api/chat/completions, SSE
// compatível com OpenAI) — muitos setups corporativos expõem só o segundo.
function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function listModels(host, token) {
  const headers = authHeaders(token)

  try {
    const res = await fetch(`${host}/api/tags`, { headers })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.models)) {
        return { api: 'ollama', models: data.models.map((m) => m.name) }
      }
    }
  } catch {
    // segue pro fallback Open WebUI
  }

  const res = await fetch(`${host}/api/models`, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const list = data.data || data.models || []
  return { api: 'openwebui', models: list.map((m) => m.id || m.name) }
}

// Envia o chat e chama onToken(text) a cada pedaço de resposta recebido.
// Detecta o formato pelo `api` retornado por listModels (guardado no node).
export async function streamChat({ host, token, model, messages, api, signal, onToken }) {
  const headers = { 'Content-Type': 'application/json', ...authHeaders(token) }

  if (api === 'openwebui') {
    const res = await fetch(`${host}/api/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, stream: true }),
      signal
    })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    await readSseStream(res.body, (payload) => {
      const token = payload?.choices?.[0]?.delta?.content
      if (token) onToken(token)
    })
    return
  }

  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: true }),
    signal
  })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  await readNdjsonStream(res.body, (payload) => {
    const token = payload?.message?.content
    if (token) onToken(token)
  })
}

async function readNdjsonStream(body, onChunk) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      onChunk(JSON.parse(line))
    }
  }
}

async function readSseStream(body, onChunk) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      if (!payload) continue
      onChunk(JSON.parse(payload))
    }
  }
}
