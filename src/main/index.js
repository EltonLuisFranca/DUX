import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { autoUpdater } from 'electron-updater'
import { registerWorkspacesIpc } from './ipc/workspaces'
import { registerAuthIpc, AUTH_PROTOCOL, handleAuthCallbackUrl } from './ipc/auth'
import { registerHttpNodeIpc } from './ipc/httpNode'
import { registerVoiceIpc } from './ipc/voice'
import { registerBrowserNodeIpc } from './ipc/browserNode'
import { registerImageNodeIpc } from './ipc/imageNode'

const WSL_DISTRO = 'Debian'
// bridge/ está listado em asarUnpack (precisa rodar como processo real, não
// dentro do arquivo virtual .asar), então empacotado ele vive em
// app.asar.unpacked/bridge, não em app.asar/../../bridge como o __dirname
// relativo sugeriria.
const BRIDGE_DIR = app.isPackaged
  ? join(__dirname, '../../bridge').replace('app.asar', 'app.asar.unpacked')
  : join(__dirname, '../../bridge')

// Traduz o path Windows (ex: C:\Users\x\dux-fleet\bridge) pro equivalente
// dentro do WSL (/mnt/c/Users/x/dux-fleet/bridge) — BRIDGE_DIR é resolvido
// pelo processo main rodando no Windows, mas quem executa server.js é o zsh
// dentro do WSL, então não dá pra usar o path Windows direto no `cd`.
function toWslPath(winPath) {
  const drive = winPath[0].toLowerCase()
  const rest = winPath.slice(2).replace(/\\/g, '/')
  return `/mnt/${drive}${rest}`
}

// `source ~/.zshrc` sozinho não garante node no PATH: o alias "default" do
// nvm pode apontar pra uma versão LTS que não está mais instalada
// localmente (ex: nvm atualizou a tabela de aliases remotos numa instalação
// posterior sem reinstalar essa versão), e nesse caso o `nvm use default`
// automático que o nvm.sh dispara ao ser sourced falha em silêncio, sem
// deixar node no PATH. "nvm use node" força a última versão *realmente
// instalada*, sidestepando esse alias — só roda se nvm existir, pra não
// quebrar em máquinas com node do sistema (sem nvm).
function buildBridgeCmd(wslDir) {
  return `source ~/.zshrc >/dev/null 2>&1; type nvm >/dev/null 2>&1 && nvm use --silent node >/dev/null 2>&1; cd '${wslDir}' && exec node server.js`
}

ipcMain.on('app:get-version-sync', (event) => {
  event.returnValue = app.getVersion()
})

registerWorkspacesIpc()
registerAuthIpc()
registerHttpNodeIpc()
registerVoiceIpc()
registerBrowserNodeIpc()
registerImageNodeIpc()

let mainWindowRef = null

// Checagem de atualização feita ANTES de abrir a janela principal: uma tela de
// splash mostra progresso enquanto baixa. Timeout curto pra nunca travar o
// startup se o GitHub estiver fora do ar ou sem internet — nesse caso segue
// direto pra janela principal, sem bloquear o usuário.
// Só cobre a checagem em si (uma requisição HTTP pequena pro latest.yml) —
// se o GitHub estiver fora do ar ou sem internet, não trava o startup.
const NO_UPDATE_TIMEOUT_MS = 6_000
// Cobre o download do instalador (~130-200MB): precisa de tempo real, não os
// mesmos 6s da checagem — do contrário o splash fecha e abre a versão antiga
// antes do download terminar, e como o usuário normalmente fecha o app antes
// dele completar em segundo plano, a atualização nunca chega a ser aplicada.
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000

function checkForUpdateBeforeLaunch() {
  return new Promise((resolve) => {
    if (!app.isPackaged) {
      resolve({ willInstall: false })
      return
    }

    const splash = new BrowserWindow({
      width: 320,
      height: 200,
      frame: false,
      resizable: false,
      show: true,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    })
    splash.loadFile(join(__dirname, 'splash.html'))

    const setStatus = (label, percent) => splash.webContents.send('splash:status', { label, percent })

    let settled = false
    let timeoutHandle
    const finish = (willInstall) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutHandle)
      if (!willInstall && !splash.isDestroyed()) splash.close()
      resolve({ willInstall })
    }

    timeoutHandle = setTimeout(() => finish(false), NO_UPDATE_TIMEOUT_MS)

    autoUpdater.autoDownload = true
    autoUpdater.once('update-not-available', () => finish(false))
    autoUpdater.once('error', () => finish(false))
    autoUpdater.once('update-available', () => {
      clearTimeout(timeoutHandle)
      timeoutHandle = setTimeout(() => finish(false), DOWNLOAD_TIMEOUT_MS)
    })
    autoUpdater.on('download-progress', (progress) => {
      setStatus('Baixando atualização...', progress.percent)
    })
    autoUpdater.once('update-downloaded', () => {
      setStatus('Atualização pronta, reiniciando...', 100)
      setTimeout(() => autoUpdater.quitAndInstall(), 600)
      finish(true)
    })

    setStatus('Verificando atualizações...')
    autoUpdater.checkForUpdates().catch(() => finish(false))
  })
}

let bridgeProcess = null

function startBridge() {
  if (process.platform === 'win32') {
    bridgeProcess = spawn('wsl.exe', [
      '-d',
      WSL_DISTRO,
      '--',
      'zsh',
      '-c',
      buildBridgeCmd(toWslPath(BRIDGE_DIR))
    ])
  } else {
    // spawn('node', ...) depende do PATH do processo que lançou o Electron
    // resolver "node" — funciona quando o Electron herda um shell com nvm/asdf
    // já carregado, mas falha silenciosamente (ENOENT) quando herda um PATH
    // mais restrito, ex: lançado direto do desktop/.desktop launcher, sem
    // nenhum shell profile no meio. process.execPath é o próprio binário que
    // já está rodando este processo main — sempre resolve, sem depender do
    // ambiente externo. ELECTRON_RUN_AS_NODE=1 é necessário só nesse spawn:
    // sem ela, execPath (o binário do Electron) tentaria abrir uma janela de
    // app em vez de rodar server.js como script Node puro.
    bridgeProcess = spawn(process.execPath, ['server.js'], {
      cwd: BRIDGE_DIR,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
  }

  bridgeProcess.stdout.on('data', (chunk) => console.log(`[bridge] ${chunk}`))
  bridgeProcess.stderr.on('data', (chunk) => console.error(`[bridge] ${chunk}`))
  bridgeProcess.on('exit', (code, signal) => console.log(`[bridge] exited with code ${code} signal ${signal}`))
  // sem isso, uma falha síncrona do spawn (ex: "node" não resolvido no PATH
  // deste contexto) emite só 'error', nunca 'exit' — sem handler, vira uma
  // exceção não tratada que o Electron engole silenciosamente, sem log
  // nenhum indicando por que o bridge nunca subiu.
  bridgeProcess.on('error', (err) => console.error('[bridge] failed to spawn', err))
}

function stopBridge() {
  bridgeProcess?.kill()
  bridgeProcess = null
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  mainWindowRef = win
  win.on('closed', () => {
    if (mainWindowRef === win) mainWindowRef = null
  })

  win.once('ready-to-show', () => win.show())

  // pt-BR primeiro (é o idioma do conteúdo dos nodes de nota deste app),
  // en-US como fallback pra termos técnicos/código colados ali — sem isso o
  // Electron detecta o idioma pelo locale do SO, o que nem sempre bate.
  win.webContents.session.setSpellCheckerLanguages(['pt-BR', 'en-US'])

  // Electron não tem menu de contexto nativo por padrão — sem este handler,
  // botão direito em qualquer campo editável (ex: o node de Nota) não mostra
  // nada, nem as sugestões de correção do sublinhado vermelho do spellcheck.
  win.webContents.on('context-menu', (_event, params) => {
    const template = []

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        template.push({
          label: suggestion,
          click: () => win.webContents.replaceMisspelling(suggestion)
        })
      }
      if (params.dictionarySuggestions.length === 0) {
        template.push({ label: 'Sem sugestões', enabled: false })
      }
      template.push({ type: 'separator' })
      template.push({
        label: 'Adicionar ao dicionário',
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
      template.push({ type: 'separator' })
    }

    if (params.isEditable) {
      template.push(
        { label: 'Cortar', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Colar', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Selecionar tudo', role: 'selectAll', enabled: params.editFlags.canSelectAll }
      )
    } else if (params.selectionText) {
      template.push({ label: 'Copiar', role: 'copy' })
    }

    if (template.length) Menu.buildFromTemplate(template).popup()
  })

  // Hardening for the browser-node <webview>: force nodeintegration off and
  // strip the preload regardless of what the guest tag's attributes request,
  // since it loads arbitrary user-supplied URLs.
  win.webContents.on('will-attach-webview', (_event, webPreferences) => {
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    delete webPreferences.preload
    delete webPreferences.preloadURL
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => win.close())
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [join(__dirname, '../../')])
  }
} else {
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL)
}

// Windows/Linux entregam o link dux://... como argv de uma segunda
// instância do app, não como evento — precisa de single-instance lock pra
// redirecionar esse argv pra instância já aberta em vez de abrir duas janelas.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const authUrl = argv.find((arg) => arg.startsWith(`${AUTH_PROTOCOL}://`))
    if (authUrl) handleAuthCallbackUrl(authUrl, mainWindowRef)

    if (mainWindowRef) {
      if (mainWindowRef.isMinimized()) mainWindowRef.restore()
      mainWindowRef.focus()
    }
  })

  // macOS entrega o link via este evento em vez de argv de segunda instância.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAuthCallbackUrl(url, mainWindowRef)
  })

  app.whenReady().then(async () => {
    const { willInstall } = await checkForUpdateBeforeLaunch()
    if (willInstall) return // quitAndInstall vai reiniciar o app na versão nova

    startBridge()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', stopBridge)
