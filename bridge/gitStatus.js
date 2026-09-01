const { execFile } = require('child_process')

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

module.exports = { getGitInfo }
