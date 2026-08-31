const { app } = require('electron')
const { join, dirname } = require('path')
const fs = require('original-fs')
const { execFile, spawn } = require('child_process')
const { getInstallDir } = require('./install')

const APP_NAME = 'DUX'
const UNINSTALL_REGISTRY_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DUX'

function removeShortcuts() {
  const startMenuPath = join(
    process.env.APPDATA || '',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    `${APP_NAME}.lnk`
  )
  const desktopPath = join(app.getPath('desktop'), `${APP_NAME}.lnk`)
  for (const shortcut of [startMenuPath, desktopPath]) {
    if (fs.existsSync(shortcut)) fs.unlinkSync(shortcut)
  }
}

function removeRegistryKey() {
  return new Promise((resolve, reject) => {
    execFile('reg.exe', ['delete', UNINSTALL_REGISTRY_KEY, '/f'], (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout)
    })
  })
}

// O desinstalador é o próprio "Uninstall DUX.exe" dentro da pasta que ele
// precisa apagar — não pode se auto-deletar em execução no Windows (o
// arquivo fica travado enquanto o processo está de pé). Solução clássica:
// um script batch destacado espera o processo morrer (timeout) e só então
// apaga a pasta inteira, se auto-removendo em seguida com "del %~f0".
function scheduleSelfDelete(installDir) {
  const batPath = join(app.getPath('temp'), `dux-uninstall-${Date.now()}.bat`)
  // O processo do desinstalador (rodando de dentro de installDir) só morre
  // quando o usuário fecha a janela, o que pode acontecer bem depois do
  // "timeout" inicial — por isso o rmdir roda em loop até a pasta sumir de
  // verdade, em vez de tentar uma única vez e deixar lixo pra trás.
  const script = [
    '@echo off',
    ':retry',
    'timeout /t 1 /nobreak >nul',
    `rmdir /s /q "${installDir}" 2>nul`,
    `if exist "${installDir}" goto retry`,
    `del "%~f0"`
  ].join('\r\n')
  fs.writeFileSync(batPath, script)
  spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore', shell: false }).unref()
}

async function runUninstall(onProgress) {
  const installDir = getInstallDir()

  onProgress({ phase: 'shortcuts', percent: 20 })
  removeShortcuts()

  onProgress({ phase: 'registry', percent: 50 })
  await removeRegistryKey()

  onProgress({ phase: 'files', percent: 80 })
  scheduleSelfDelete(installDir)

  onProgress({ phase: 'done', percent: 100 })
}

module.exports = { runUninstall }
