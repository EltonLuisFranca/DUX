const { execFile } = require('child_process')

// Cada terminal aberto roda o git nesse intervalo, e em /mnt/c ele é lento:
// o suficiente pra troca de branch aparecer logo sem pesar com vários nodes.
const BRANCH_POLL_MS = 5000

const GIT_STATUS_CODE_MAP = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'unmerged',
  '?': 'untracked'
}

// execFile (não exec/spawn com shell) evita injeção de comando — cwd vem de
// um path que o usuário já escolheu/validou no node, mas nunca interpolamos
// ele numa string de shell.
function runGit(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout || '', stderr: stderr || '' })
    })
  })
}

function parsePorcelainStatus(stdout) {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const indexCode = line[0]
      const worktreeCode = line[1]
      const file = line.slice(3)
      const code = indexCode !== ' ' && indexCode !== '?' ? indexCode : worktreeCode
      return {
        file,
        status: GIT_STATUS_CODE_MAP[code] || 'unknown',
        staged: indexCode !== ' ' && indexCode !== '?'
      }
    })
}

async function getGitInfo(cwd) {
  const branchResult = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  if (!branchResult.ok) {
    return { valid: false, error: branchResult.stderr.trim() || 'não é um repositório git' }
  }

  const [statusResult, diffResult] = await Promise.all([
    runGit(['status', '--porcelain=v1'], cwd),
    runGit(['diff', 'HEAD'], cwd)
  ])

  return {
    valid: true,
    branch: branchResult.stdout.trim(),
    files: parsePorcelainStatus(statusResult.stdout),
    diff: diffResult.stdout
  }
}

// Nome da branch; em HEAD destacado, o hash curto. symbolic-ref vem primeiro
// porque também responde num repositório ainda sem commits, onde o
// rev-parse falha. Fora de um repositório: null.
async function getBranch(cwd) {
  const named = await runGit(['symbolic-ref', '--short', '-q', 'HEAD'], cwd)
  if (named.ok) return named.stdout.trim()
  const detached = await runGit(['rev-parse', '--short', 'HEAD'], cwd)
  return detached.ok ? detached.stdout.trim() : null
}

// A branch pode mudar a qualquer momento por dentro do terminal (git checkout
// do agente ou do usuário), e o git não tem como avisar: precisa consultar.
// onChange só dispara quando muda, e sempre na primeira leitura. getCwd é
// função porque um shell pode dar cd no meio da sessão. Retorna a função de parar.
function watchBranch(getCwd, onChange) {
  let last
  let stopped = false
  let timer = null

  async function tick() {
    const branch = await getBranch(getCwd())
    if (stopped) return
    if (branch !== last) {
      last = branch
      onChange(branch)
    }
    timer = setTimeout(tick, BRANCH_POLL_MS)
  }

  tick()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

module.exports = { getGitInfo, watchBranch }
