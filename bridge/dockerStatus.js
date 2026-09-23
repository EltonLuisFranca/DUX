const { execFile } = require('child_process')

const ALLOWED_ACTIONS = new Set(['start', 'stop', 'restart'])

// execFile (não exec/spawn com shell) evita injeção de comando — container id
// e host vêm de mensagens do WS/HTTP local, nunca interpolados numa string de
// shell. Mesmo cuidado documentado em gitStatus.js.
//
// timeout é essencial aqui (git não precisa): com o daemon do Docker parado
// ou um host remoto inalcançável, o CLI `docker` trava esperando resposta em
// vez de falhar rápido (confirmado rodando local sem o daemon ativo) — sem
// isso, cada poll do DockerNode (a cada 15s) deixaria um processo `docker`
// pendurado pra sempre, se acumulando.
function runDocker(args, host) {
  const fullArgs = host ? ['-H', host, ...args] : args
  return new Promise((resolve) => {
    execFile(
      'docker',
      fullArgs,
      { maxBuffer: 10 * 1024 * 1024, timeout: 10_000 },
      (error, stdout, stderr) => {
        const timedOut = Boolean(error?.killed && error.signal)
        resolve({
          ok: !error,
          stdout: stdout || '',
          stderr: timedOut ? 'tempo esgotado esperando o docker responder' : stderr || ''
        })
      }
    )
  })
}

async function listContainers(host) {
  const result = await runDocker(['ps', '-a', '--format', '{{json .}}'], host)
  if (!result.ok) {
    return { valid: false, error: result.stderr.trim() || 'docker indisponível' }
  }
  try {
    const containers = result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    return { valid: true, containers }
  } catch (err) {
    return { valid: false, error: `resposta inesperada do docker: ${err.message}` }
  }
}

async function containerAction(containerId, action, host) {
  if (!containerId || !ALLOWED_ACTIONS.has(action)) {
    return { ok: false, error: 'ação inválida' }
  }
  const result = await runDocker([action, containerId], host)
  return { ok: result.ok, error: result.ok ? null : result.stderr.trim() || 'falha na ação' }
}

async function containerLogs(containerId, { tail = 200, host } = {}) {
  if (!containerId) return { ok: false, error: 'container inválido' }
  const result = await runDocker(['logs', '--tail', String(Number(tail) || 200), containerId], host)
  return { ok: result.ok, logs: result.stdout + result.stderr, error: result.ok ? null : result.stderr.trim() }
}

module.exports = { listContainers, containerAction, containerLogs }
