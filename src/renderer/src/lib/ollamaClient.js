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

// Envia o chat e chama onToken(text) a cada pedaço de resposta recebido, ou
// onToolCalls(calls) se o modelo decidir chamar uma tool em vez de
// responder texto — nesse caso onToken não é chamado nesse turno (ver
// readNdjsonToolAwareStream/readSseToolAwareStream). Cada call normalizada:
// { id, name, arguments } — id é null no Ollama nativo (não usa esse
// conceito), preenchido no formato OpenAI-compatible.
// Detecta o formato pelo `api` retornado por listModels (guardado no node).
//
// `tools`, quando passado, é incluído no body da 1ª tentativa. Se o backend
// responder HTTP 400 (modelo/servidor sem suporte a tool calling — não é
// silencioso, confirmado pela documentação do Ollama), refaz a mesma
// chamada uma vez sem `tools`, caindo de volta pro chat de texto puro atual
// em vez de propagar o erro — quem chama fica sabendo que caiu no fallback
// através do valor de retorno (`{ toolsUnsupported: true }`), pra evitar
// tentar `tools` de novo nas próximas mensagens da mesma conversa.
export async function streamChat({ host, token, model, messages, api, tools, signal, onToken, onToolCalls }) {
  const headers = { 'Content-Type': 'application/json', ...authHeaders(token) }
  const isOpenWebui = api === 'openwebui'
  const url = isOpenWebui ? `${host}/api/chat/completions` : `${host}/api/chat`

  async function attempt(withTools) {
    const body = { model, messages, stream: true }
    if (withTools) body.tools = tools

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (res.status === 400 && withTools) return { retry: true }
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

    if (isOpenWebui) {
      await readSseToolAwareStream(res.body, onToken, onToolCalls)
    } else {
      await readNdjsonToolAwareStream(res.body, onToken, onToolCalls)
    }
    return { retry: false }
  }

  const withTools = Boolean(tools?.length)
  const first = await attempt(withTools)
  if (!first.retry) return { toolsUnsupported: false }

  await attempt(false)
  return { toolsUnsupported: true }
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

// Ollama nativo: tool_calls chega inteiro de uma vez em message.tool_calls
// (não fragmentado incrementalmente como o texto), com `arguments` já como
// objeto JSON parseado — normaliza pro mesmo formato { id, name, arguments }
// que o branch OpenAI-compatible entrega, id sempre null aqui (Ollama não
// tem esse conceito).
async function readNdjsonToolAwareStream(body, onToken, onToolCalls) {
  await readNdjsonStream(body, (payload) => {
    const toolCalls = payload?.message?.tool_calls
    if (toolCalls?.length) {
      onToolCalls?.(
        toolCalls.map((call) => ({ id: null, name: call.function.name, arguments: call.function.arguments || {} }))
      )
      return
    }
    const token = payload?.message?.content
    if (token) onToken?.(token)
  })
}

// OpenAI-compatible: delta.tool_calls[] chega fragmentado por índice —
// function.name costuma vir no primeiro delta daquele índice,
// function.arguments como string concatenada aos poucos ao longo de vários
// eventos SSE. Só é seguro fazer JSON.parse quando o stream sinalizar o fim
// (finish_reason: "tool_calls" ou [DONE] com acumulado não vazio).
async function readSseToolAwareStream(body, onToken, onToolCalls) {
  const accumulated = new Map() // index -> { id, name, arguments: string }

  await readSseStream(body, (payload) => {
    const choice = payload?.choices?.[0]
    const deltaCalls = choice?.delta?.tool_calls
    if (deltaCalls?.length) {
      for (const delta of deltaCalls) {
        const index = delta.index ?? 0
        const entry = accumulated.get(index) || { id: null, name: '', arguments: '' }
        if (delta.id) entry.id = delta.id
        if (delta.function?.name) entry.name = delta.function.name
        if (delta.function?.arguments) entry.arguments += delta.function.arguments
        accumulated.set(index, entry)
      }
      return
    }

    const token = choice?.delta?.content
    if (token) onToken?.(token)
  })

  if (accumulated.size > 0) {
    onToolCalls?.(
      [...accumulated.values()].map((entry) => {
        let parsedArgs = {}
        try {
          parsedArgs = entry.arguments ? JSON.parse(entry.arguments) : {}
        } catch {
          // argumentos incompletos/malformados — segue com objeto vazio em
          // vez de derrubar o turno inteiro; a tool vai reportar erro de
          // path ausente, o que já é um sinal legível pro modelo
        }
        return { id: entry.id, name: entry.name, arguments: parsedArgs }
      })
    )
  }
}
