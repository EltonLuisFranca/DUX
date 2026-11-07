#!/usr/bin/env node
// Hook PermissionRequest do Claude Code, injetado pelo bridge em cada sessão
// aberta pelo DUX (--settings inline, ver wsHandlers.js). Roda quando o
// Claude ia mostrar o diálogo de permissão de uma ferramenta: em vez dele,
// aparece o cartão "Aguardando você" no node do terminal (approvals.js), e a
// escolha volta pra cá como decisão do hook.
//
// Qualquer falha (bridge fora, sessão desconhecida, timeout, "responder no
// terminal") termina SEM imprimir nada: sem decisão, o Claude segue o fluxo
// normal e mostra o diálogo dele no terminal. O hook nunca pode travar o
// agente nem decidir sozinho.
const http = require('http')

const sessionId = process.env.DUX_SESSION_ID
const agentPort = Number(process.env.DUX_AGENT_PORT || '4578')
// abaixo do timeout padrão de 600s dos hooks do Claude Code: desistimos
// antes dele, e o diálogo normal aparece
const WAIT_MS = 570_000

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
  })
}

function truncate(text, max) {
  const s = String(text ?? '')
  return s.length > max ? `${s.slice(0, max)}…` : s
}

// Título curto + detalhe do que o Claude quer fazer, no vocabulário do app
function describe(toolName, input = {}) {
  const json = () => truncate(JSON.stringify(input, null, 2), 1500)
  switch (toolName) {
    case 'Bash':
      return { title: 'Rodar comando?', detail: [input.description, input.command].filter(Boolean).join('\n\n') }
    case 'Write':
      return { title: 'Criar/sobrescrever arquivo?', detail: input.file_path }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { title: 'Editar arquivo?', detail: input.file_path || input.notebook_path }
    case 'WebFetch':
      return { title: 'Acessar página?', detail: input.url }
    case 'WebSearch':
      return { title: 'Pesquisar na web?', detail: input.query }
    default: {
      const mcp = /^mcp__(.+?)__(.+)$/.exec(toolName || '')
      if (mcp) return { title: `Usar ${mcp[2]} (${mcp[1]})?`, detail: json() }
      return { title: `Usar ${toolName || 'ferramenta'}?`, detail: json() }
    }
  }
}

function askBridge(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload)
    const req = http.request(
      {
        host: '127.0.0.1',
        port: agentPort,
        path: '/approval',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: WAIT_MS
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data).choice ?? null)
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
    req.on('error', () => resolve(null))
    req.end(body)
  })
}

async function main() {
  if (!sessionId) return
  let event
  try {
    event = JSON.parse(await readStdin())
  } catch {
    return
  }

  const { title, detail } = describe(event.tool_name, event.tool_input)
  const choice = await askBridge({
    sessionId,
    source: 'permission',
    title,
    detail: truncate(detail, 4000),
    options: [
      { id: 'allow', label: 'Permitir', tone: 'primary' },
      { id: 'deny', label: 'Negar', tone: 'danger' },
      { id: 'terminal', label: 'Responder no terminal' }
    ]
  })

  if (choice === 'allow') {
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } })
    )
  } else if (choice === 'deny') {
    // interrupt: mesmo efeito do "No" no diálogo — o Claude para e espera o
    // usuário dizer o que fazer, em vez de sair tentando outro caminho
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'deny', message: 'O usuário negou esta ação pelo app DUX.', interrupt: true }
        }
      })
    )
  }
  // 'terminal' / null: sem saída -> diálogo normal do Claude no terminal
}

main().finally(() => process.exit(0))
