const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

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

// Linhas +/− por arquivo, contadas do próprio `git diff HEAD` que já é
// buscado pro painel de diff — um `--numstat` à parte seria outra passada
// completa do git, e em repositório no /mnt/c cada uma custa segundos
// (o node estourava o timeout). Só conta depois do primeiro "@@" de cada
// arquivo, senão o cabeçalho ("--- a/x", "+++ b/x") entraria na conta.
// Binário não tem hunk e fica sem contagem.
function diffStats(diff) {
  const stats = {}
  let current = null
  let inHunk = false
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = line.match(/ b\/(.+)$/)
      current = match ? (stats[match[1]] = { added: 0, deleted: 0 }) : null
      inHunk = false
    } else if (line.startsWith('@@')) {
      inHunk = true
    } else if (inHunk && current) {
      if (line[0] === '+') current.added++
      else if (line[0] === '-') current.deleted++
    }
  }
  return stats
}

// arquivo novo (untracked) não aparece no diff — conta as linhas na mão,
// como o git contaria (+N, -0). Pula pasta (o porcelain agrupa "dir/"),
// arquivo grande e binário (tem byte nulo).
const MAX_COUNT_BYTES = 512 * 1024
function countLines(file) {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > MAX_COUNT_BYTES) return null
    const buf = fs.readFileSync(file)
    if (buf.includes(0)) return null
    if (!buf.length) return 0
    let lines = 0
    for (const byte of buf) if (byte === 10) lines++
    return buf[buf.length - 1] === 10 ? lines : lines + 1
  } catch {
    return null
  }
}

// commits à frente/atrás do upstream; sem upstream configurado (branch só
// local) não há com o que comparar — null.
async function getAheadBehind(cwd) {
  const result = await runGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd)
  if (!result.ok) return null
  const [ahead, behind] = result.stdout.trim().split(/\s+/).map(Number)
  return { ahead: ahead || 0, behind: behind || 0 }
}

async function getGitInfo(cwd) {
  const branchResult = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  if (!branchResult.ok) {
    return { valid: false, error: branchResult.stderr.trim() || 'não é um repositório git' }
  }

  const [statusResult, diffResult, upstream] = await Promise.all([
    runGit(['status', '--porcelain=v1'], cwd),
    runGit(['diff', 'HEAD'], cwd),
    getAheadBehind(cwd)
  ])

  const stats = diffStats(diffResult.stdout)
  const files = parsePorcelainStatus(statusResult.stdout).map((f) => {
    if (stats[f.file]) return { ...f, ...stats[f.file] }
    if (f.status === 'untracked') {
      const lines = countLines(path.join(cwd, f.file))
      if (lines !== null) return { ...f, added: lines, deleted: 0 }
    }
    return f
  })
  const totals = files.reduce(
    (acc, f) => ({ added: acc.added + (f.added || 0), deleted: acc.deleted + (f.deleted || 0) }),
    { added: 0, deleted: 0 }
  )

  return {
    valid: true,
    branch: branchResult.stdout.trim(),
    ahead: upstream?.ahead ?? null,
    behind: upstream?.behind ?? null,
    files,
    totals,
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
