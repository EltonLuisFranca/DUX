const { app } = require('electron')
const { join, dirname } = require('path')
// original-fs dá acesso ao fs real, sem o patch que o Electron aplica pra
// tratar caminhos com "app.asar" como um sistema de arquivos virtual — sem
// isso, copiar/ler o próprio app.asar do DUX (que faz parte dos arquivos
// sendo instalados) quebra com ENOENT, já que o Electron tenta interpretar
// esse caminho como entrada dentro do arquivo, não o arquivo em si.
const fs = require('original-fs')
const { execFile } = require('child_process')
const createDesktopShortcut = require('create-desktop-shortcuts')
const { extractFile } = require('@electron/asar')

const APP_NAME = 'DUX'
const APP_EXE_NAME = 'DUX.exe'
const UNINSTALL_REGISTRY_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DUX'

function getInstallDir() {
  // %LOCALAPPDATA%\Programs\DUX — mesma convenção que o NSIS/electron-builder
  // já usava, então usuários que reinstalarem por cima não ficam com duas
  // pastas soltas por aí.
  return join(app.getPath('appData'), '..', 'Local', 'Programs', APP_NAME)
}

// fs.cpSync não relata progresso, então caminhamos a árvore de arquivos uma
// vez pra somar o tamanho total, e copiamos arquivo a arquivo contabilizando
// bytes copiados — dá o progresso real que a UI precisa mostrar.
function walkFiles(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = join(base, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath, relPath))
    } else {
      files.push({ src: fullPath, rel: relPath, size: fs.statSync(fullPath).size })
    }
  }
  return files
}

function copyWithProgress(sourceDir, destDir, onProgress) {
  const files = walkFiles(sourceDir)
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0) || 1
  let copiedBytes = 0

  for (const file of files) {
    const destPath = join(destDir, file.rel)
    fs.mkdirSync(dirname(destPath), { recursive: true })
    fs.copyFileSync(file.src, destPath)
    copiedBytes += file.size
    onProgress(copiedBytes / totalBytes)
  }
}

// execFile roda reg.exe direto, sem shell/cmd.exe no meio interpretando o
// comando como uma string — cada argumento vai pro processo já separado,
// então um valor que precise conter aspas internas (ex: um caminho com
// espaço, que UninstallString exige entre aspas pra o Windows não cortar
// no espaço) chega intacto ao reg.exe sem uma segunda camada de escaping.
function runRegAdd(args) {
  return new Promise((resolve, reject) => {
    execFile('reg.exe', args, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout)
    })
  })
}

async function writeUninstallRegistry(installDir, uninstallerPath, version) {
  // UninstallString/QuietUninstallString precisam do caminho entre aspas
  // porque "Uninstall DUX.exe" tem espaço no nome — sem isso o Windows
  // interpretaria "Uninstall" como o executável e "DUX.exe" como argumento.
  const quotedExe = `"${uninstallerPath}"`
  const entries = {
    DisplayName: APP_NAME,
    DisplayVersion: version,
    InstallLocation: installDir,
    DisplayIcon: join(installDir, APP_EXE_NAME),
    UninstallString: quotedExe,
    QuietUninstallString: `${quotedExe} /S`,
    Publisher: 'Elton Franca',
    NoModify: 1,
    NoRepair: 1
  }

  for (const [name, value] of Object.entries(entries)) {
    const type = typeof value === 'number' ? 'REG_DWORD' : 'REG_SZ'
    await runRegAdd(['add', UNINSTALL_REGISTRY_KEY, '/v', name, '/t', type, '/d', String(value), '/f'])
  }
}

function createShortcuts(installDir) {
  const targetExe = join(installDir, APP_EXE_NAME)
  const startMenuPath = join(
    process.env.APPDATA || '',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    `${APP_NAME}.lnk`
  )
  const desktopPath = join(app.getPath('desktop'), `${APP_NAME}.lnk`)

  // windows espera um único objeto, não um array — passar um array faz a
  // lib ler `.filePath` do array inteiro (undefined) em vez do primeiro
  // item, por isso precisa de duas chamadas, uma por atalho.
  createDesktopShortcut({
    windows: { filePath: targetExe, outputPath: dirname(startMenuPath), name: APP_NAME }
  })
  createDesktopShortcut({
    windows: { filePath: targetExe, outputPath: dirname(desktopPath), name: APP_NAME }
  })
}

// Lê a versão do DUX que está sendo copiado, não a do próprio instalador
// (app.getVersion() aqui retornaria a versão do dux-installer, sempre 1.0.0) —
// o app.asar copiado carrega o package.json real do DUX buildado.
function readAppVersion(sourceDir) {
  const asarPath = join(sourceDir, 'resources', 'app.asar')
  const pkgBuffer = extractFile(asarPath, 'package.json')
  return JSON.parse(pkgBuffer.toString('utf-8')).version
}

async function runInstall(sourceDir, onProgress) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Arquivos de origem não encontrados em: ${sourceDir}`)
  }

  const version = readAppVersion(sourceDir)
  const installDir = getInstallDir()
  onProgress({ phase: 'copying', percent: 0 })

  fs.mkdirSync(installDir, { recursive: true })
  copyWithProgress(sourceDir, installDir, (fraction) => {
    onProgress({ phase: 'copying', percent: Math.round(fraction * 80) })
  })

  onProgress({ phase: 'shortcuts', percent: 85 })
  createShortcuts(installDir)

  onProgress({ phase: 'registry', percent: 92 })
  // O próprio instalador sabe rodar em modo desinstalação (ver main.js) —
  // copiamos o executável dele mesmo para dentro da pasta instalada, sob o
  // nome que o registro do Windows espera encontrar.
  const uninstallerPath = join(installDir, 'Uninstall DUX.exe')
  fs.copyFileSync(process.execPath, uninstallerPath)
  await writeUninstallRegistry(installDir, uninstallerPath, version)

  onProgress({ phase: 'done', percent: 100 })
  return { installDir }
}

module.exports = { runInstall, getInstallDir }
