// bridge/ roda como Node puro (ELECTRON_RUN_AS_NODE=1 no spawn de
// src/main/index.js, e no Windows dentro do WSL) — sem `electron` no
// require.resolve, sem BrowserWindow, sem Chromium nenhum. Pra detectar login
// de SPAs que só desenham o form via JS (ver detectLoginForm em
// credentialTest.js), quem precisa renderizar de verdade é o processo main,
// que já tem um Chromium rodando dentro dele.
//
// Canal usado: os próprios pipes stdin/stdout que child_process.spawn() já
// mantém abertos entre main e bridge (usados hoje só pra log). Uma linha
// prefixada é uma requisição/resposta JSON; qualquer outra linha continua
// sendo só log e é ignorada aqui. Funciona igual em Linux/macOS e no Windows
// via WSL — wsl.exe repassa stdio do processo Linux de volta pro processo
// Windows que o spawnou, sem precisar de porta de rede nem depender de
// "localhost forwarding" do WSL.
const REQUEST_MARKER = '@@DUX_RENDER_REQUEST@@'
const RESPONSE_MARKER = '@@DUX_RENDER_RESPONSE@@'

const pending = new Map()
let listening = false

function ensureListening() {
  if (listening) return
  listening = true
  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buffer += chunk
    let idx
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      if (!line.startsWith(RESPONSE_MARKER)) continue
      let msg
      try {
        msg = JSON.parse(line.slice(RESPONSE_MARKER.length))
      } catch {
        continue
      }
      const resolve = pending.get(msg.id)
      if (resolve) {
        pending.delete(msg.id)
        resolve(msg.result)
      }
    }
  })
  // stdin nasce pausado — sem resume() os dados nunca chegam ao listener acima.
  process.stdin.resume()
}

// Se o processo main não responder a tempo (versão antiga sem esse canal,
// crash, timeout de verdade na renderização), resolve com found:false — o
// chamador (detectLoginForm/reflected-xss) trata isso igual a "não achou
// nada", nunca trava.
function sendRenderRequest(payload, timeoutMs) {
  ensureListening()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const budget = Math.max(3000, Math.min(60_000, Number(timeoutMs) || 20_000))
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve({ found: false })
    }, budget + 2000)
    pending.set(id, (result) => {
      clearTimeout(timer)
      resolve(result)
    })
    process.stdout.write(`${REQUEST_MARKER}${JSON.stringify({ id, timeoutMs: budget, ...payload })}\n`)
  })
}

function requestRenderLogin({ url, timeoutMs, paths }) {
  return sendRenderRequest({ action: 'detectLogin', url, paths }, timeoutMs)
}

// Mesma ponte do login, ação diferente: em vez de detectar/testar form,
// navega a página de verdade com um payload de XSS na query string e
// confere se ele EXECUTOU (não só se apareceu como texto na resposta) — ver
// renderCheckXssExecution em src/main/renderBridge.js.
function requestXssCheck({ url, timeoutMs, params }) {
  return sendRenderRequest({ action: 'checkXss', url, params }, timeoutMs)
}

module.exports = { requestRenderLogin, requestXssCheck }
