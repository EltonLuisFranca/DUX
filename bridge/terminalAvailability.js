const fs = require('fs')
const { execFileSync } = require('child_process')

// O processo do bridge roda em Linux tanto quando instalado nativamente
// quanto quando o Electron o lança dentro do WSL num host Windows (ver
// startBridge() em src/main/index.js) — process.platform é 'linux' nos dois
// casos, então não dá pra distinguir por aí. WSL_DISTRO_NAME/WSL_INTEROP são
// setadas pelo próprio WSL no ambiente; /proc/version citando "microsoft" é o
// fallback padrão quando essas env vars não estão presentes por algum motivo.
function isInsideWsl() {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true
  try {
    return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'))
  } catch {
    return false
  }
}

function commandExists(bin) {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// SO e distro são fixos pra vida do processo — cacheia pra não rodar `which`
// de novo toda vez que o modal "Adicionar node" abre.
let cached = null

function detectTerminalAvailability() {
  if (cached) return cached

  const wsl = isInsideWsl()
  cached = {
    // shell puro (zsh) sempre disponível — é o mesmo binário que já roda os
    // terminais de agente
    shell: true,
    // "Terminal WSL" só faz sentido como opção distinta quando o bridge está
    // de fato dentro do WSL (host Windows); numa instalação Linux nativa isso
    // já É o terminal normal, não precisa de uma entrada separada
    wsl,
    // PowerShell/CMD são binários do Windows alcançados via interop do WSL —
    // só existem quando dentro do WSL E o binário resolve no PATH herdado
    powershell: wsl && (commandExists('powershell.exe') || commandExists('pwsh.exe')),
    cmd: wsl && commandExists('cmd.exe')
  }
  return cached
}

module.exports = { detectTerminalAvailability }
