const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const pty = require('node-pty')
const { WebSocket } = require('ws')
const agentLink = require('./agentLink')
const noteLink = require('./noteLink')
const { resolveCwd, isDirectory, isFile, listSubdirectories, listDirEntries } = require('./fsHelpers')
const { getGitInfo } = require('./gitStatus')
const { startWatchingNote, stopWatchingNote, stopAllNoteWatches, readNoteFile } = require('./noteWatch')
const { detectTerminalAvailability } = require('./terminalAvailability')

const BIN_DIR = path.join(__dirname, 'bin')

// allowlist de CLIs de agente que os nodes podem pedir pro bridge spawnar —
// evita que uma mensagem WebSocket arbitrária execute qualquer comando no host
const ALLOWED_COMMANDS = {
  claude: 'claude',
  codex: 'codex'
}

// binários do Windows alcançados via interop do WSL — spawnados direto, sem
// passar por zsh (ver ramo abaixo em 'start')
const WINDOWS_SHELL_BINARIES = {
  powershell: 'powershell.exe',
  cmd: 'cmd.exe'
}

// Filtra do env herdado tudo que é específico de COMO este próprio bridge foi
// lançado, não algo que o terminal do usuário deveria ver:
// - CLAUDE_*: se o DUX foi aberto de dentro de uma sessão Claude Code (ex: um
//   dev rodando `npm run dev` a partir de um terminal do Claude Code/VSCode),
//   o Electron herda CLAUDE_CODE_SESSION_ID/CLAUDE_CODE_CHILD_SESSION/etc
//   dessa sessão externa — sem filtrar, o Claude Code recém-aberto DENTRO do
//   DUX se identifica incorretamente como sessão-filha daquela outra sessão
//   (ex: "Transcript saving is off" por herdar CLAUDE_CODE_CHILD_SESSION).
// - ELECTRON_RUN_AS_NODE: o main process do Electron seta essa var só pra
//   este próprio processo bridge rodar como Node puro em vez de tentar abrir
//   uma janela de app (ver startBridge() em src/main/index.js) — não deve
//   vazar pro zsh/claude do usuário, que não tem nada a ver com Electron.
// Nenhum desses prefixos é usado pelo próprio DUX (usa DUX_*), então não há
// nada legítimo pra perder.
const ENV_PREFIXES_TO_STRIP = ['CLAUDE_', 'ELECTRON_RUN_AS_NODE']

function buildAgentEnv(extra) {
  const filtered = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !ENV_PREFIXES_TO_STRIP.some((prefix) => key.startsWith(prefix)))
  )
  return { ...filtered, ...extra }
}

// Fábrica do handler de conexão WS — recebe agentPort pra repassar como env
// (DUX_AGENT_PORT) e montar o --mcp-config do Claude Code, sem precisar
// duplicar a constante de porta aqui e em server.js.
function createConnectionHandler({ agentPort }) {
  return function handleConnection(ws) {
    let ptyProcess = null
    let sessionId = null

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw)
      } catch {
        return
      }

      if (msg.type === 'start') {
        if (ptyProcess) return

        const cwd = resolveCwd(msg.cwd)
        if (!isDirectory(cwd)) {
          ws.send(JSON.stringify({ type: 'error', message: `Diretório não encontrado: ${cwd}` }))
          ws.close()
          return
        }

        sessionId = msg.sessionId || null

        try {
          if (msg.command === 'shell') {
            // terminal WSL puro: shell interativo, sem nenhum agente de IA —
            // sem -c, pra não se comportar como os terminais de agente
            // (que rodam um único comando e saem quando ele sai); aqui o
            // pty É o próprio zsh, então só termina com exit/Ctrl+D
            ptyProcess = pty.spawn('zsh', ['-li'], {
              name: 'xterm-256color',
              cols: msg.cols || 80,
              rows: msg.rows || 24,
              cwd,
              env: buildAgentEnv({ PATH: `${BIN_DIR}${path.delimiter}${process.env.PATH}` })
            })
          } else if (WINDOWS_SHELL_BINARIES[msg.command]) {
            // PowerShell/CMD rodam no Windows host, alcançados via interop do
            // WSL — spawna o .exe direto (sem zsh no meio) pra não complicar
            // quoting/PATH à toa
            ptyProcess = pty.spawn(WINDOWS_SHELL_BINARIES[msg.command], [], {
              name: 'xterm-256color',
              cols: msg.cols || 80,
              rows: msg.rows || 24,
              cwd,
              env: buildAgentEnv({})
            })

            // cmd.exe recusa iniciar direto num caminho UNC (o que o interop
            // do WSL gera pra qualquer cwd fora de /mnt/c, ex: \\wsl.localhost\
            // Debian\home\user) — ignora o cwd em silêncio e abre em
            // C:\Windows. PowerShell lida com UNC nativamente (provider
            // FileSystem::), só cmd precisa do empurrão: `pushd` (ao contrário
            // de `cd`) mapeia uma drive temporária pra UNC, então funciona.
            // Passar isso via argv (`cmd /K pushd ...`) falha silenciosamente
            // — a citação da linha de comando se perde ao atravessar o
            // interop do WSL. Precisa ser digitado como input mesmo, e só
            // depois que o prompt inicial realmente aparece (escrever cedo
            // demais atropela o handshake ANSI do início da sessão) — por
            // isso espera o padrão "X:\...>" aparecer na saída em vez de usar
            // um temporizador arbitrário.
            if (msg.command === 'cmd') {
              try {
                const winPath = execFileSync('wslpath', ['-w', cwd], { encoding: 'utf8' }).trim()
                let buffered = ''
                let pushed = false
                const promptWatcher = ptyProcess.onData((chunk) => {
                  if (pushed) return
                  buffered = (buffered + chunk).slice(-4000)
                  const plain = buffered
                    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
                    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
                  if (/[A-Za-z]:\\[^>\r\n]*>\s*$/.test(plain)) {
                    pushed = true
                    ptyProcess.write(`pushd "${winPath}"\r\n`)
                    promptWatcher.dispose()
                  }
                })
              } catch {
                // sem wslpath: não deveria acontecer (cmd só fica disponível
                // na lista quando detectTerminalAvailability confirma que
                // está rodando dentro do WSL) — segue sem forçar o diretório
              }
            }
          } else {
            const command = ALLOWED_COMMANDS[msg.command] || ALLOWED_COMMANDS.claude

            // Só o Claude Code entende --mcp-config (Codex tem seu próprio
            // mecanismo de MCP, tratado à parte se algum dia precisar). O JSON
            // inline evita mexer em qualquer .mcp.json do projeto do usuário — o
            // servidor MCP (mcp-server.mjs) é um processo próprio por sessão, que
            // fala com este bridge via HTTP local pra resolver dux_ask.
            const mcpConfigFlag =
              command === 'claude' && sessionId
                ? ` --mcp-config '${JSON.stringify({
                    mcpServers: {
                      dux: {
                        type: 'stdio',
                        command: 'node',
                        args: [path.join(__dirname, 'mcp-server.mjs')],
                        env: { DUX_SESSION_ID: sessionId, DUX_AGENT_PORT: String(agentPort) }
                      }
                    }
                  })}'`
                : ''

            // -i (além de -l) é necessário: alguns setups de dotfiles (nvm.sh
            // incluso, aqui) só rodam sua inicialização de PATH quando o shell é
            // interativo — um simples "zsh -lc claude" spawnado por um processo pai
            // não-interativo (como o Electron) acaba sem PATH nenhum de nvm/asdf/
            // etc., e comandos instalados por eles somem com "command not found".
            ptyProcess = pty.spawn('zsh', ['-lic', `${command}${mcpConfigFlag}`], {
              name: 'xterm-256color',
              cols: msg.cols || 80,
              rows: msg.rows || 24,
              cwd,
              env: buildAgentEnv({
                PATH: `${BIN_DIR}${path.delimiter}${process.env.PATH}`,
                DUX_SESSION_ID: sessionId || '',
                DUX_AGENT_PORT: String(agentPort)
              })
            })
          }
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: `Não foi possível iniciar o terminal: ${err.message}` }))
          ws.close()
          return
        }

        if (sessionId) {
          agentLink.registerSession(sessionId, { name: msg.name || sessionId, cwd, ptyProcess })
          noteLink.registerSession(sessionId, { ptyProcess })
        }

        ptyProcess.onData((data) => {
          if (sessionId) {
            agentLink.onSessionData(sessionId, data)
            noteLink.onSessionData(sessionId)
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'data', data }))
          }
        })

        ptyProcess.onExit(({ exitCode, signal }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'exit', exitCode, signal }))
          }
          if (sessionId) {
            agentLink.unregisterSession(sessionId)
            noteLink.unregisterSession(sessionId)
          }
          ptyProcess = null
          // Fecha o socket pra acionar o retry automático que o cliente já usa
          // pra queda de conexão (connect() em WslClaudeTerminalNode.vue). Sem
          // isso o processo morre (ex: Ctrl+C encerrando o Claude Code) mas o
          // socket segue aberto — o node fica travado em "offline" pra sempre,
          // sem nenhum jeito de reconectar a não ser trocar o cwd.
          ws.close()
        })
      } else if (msg.type === 'input') {
        ptyProcess?.write(msg.data)
      } else if (msg.type === 'resize') {
        if (ptyProcess && msg.cols > 0 && msg.rows > 0) {
          ptyProcess.resize(msg.cols, msg.rows)
        }
      } else if (msg.type === 'checkTerminalAvailability') {
        ws.send(JSON.stringify({ type: 'terminalAvailability', ...detectTerminalAvailability() }))
      } else if (msg.type === 'checkPath') {
        const resolved = resolveCwd(msg.path)
        const valid = isDirectory(resolved)
        const entries = valid ? listSubdirectories(resolved) : []
        ws.send(JSON.stringify({ type: 'pathCheck', path: msg.path, resolved, valid, entries }))
      } else if (msg.type === 'gitStatus') {
        const resolved = resolveCwd(msg.path)
        getGitInfo(resolved).then((info) => {
          ws.send(JSON.stringify({ type: 'gitStatusResult', requestId: msg.requestId, ...info }))
        })
      } else if (msg.type === 'link') {
        agentLink.linkSessions(msg.sessionA, msg.sessionB)
      } else if (msg.type === 'unlink') {
        agentLink.unlinkSessions(msg.sessionA, msg.sessionB)
      } else if (msg.type === 'rename') {
        agentLink.renameSession(msg.sessionId, msg.name)
      } else if (msg.type === 'noteCheckPath') {
        // path pode terminar em nome de arquivo (ainda não existente) — resolve
        // relativo ao diretório pai pra permitir digitar o nome do .md a criar,
        // mesmo padrão de resolveCwd usado pelo terminal/git.
        const resolved = resolveCwd(msg.path)
        const parentDir = path.dirname(resolved)
        const parentValid = isDirectory(parentDir)
        const exists = isFile(resolved)
        const entries = parentValid ? listSubdirectories(parentDir) : []
        ws.send(
          JSON.stringify({ type: 'noteCheck', path: msg.path, resolved, parentValid, exists, entries })
        )
      } else if (msg.type === 'noteRead') {
        const resolved = resolveCwd(msg.path)
        if (!isFile(resolved) && isDirectory(path.dirname(resolved))) {
          try {
            fs.writeFileSync(resolved, '')
          } catch {
            // segue e reporta como leitura vazia — noteWrite futuro reportará o erro real
          }
        }
        const stat = (() => {
          try {
            return fs.statSync(resolved)
          } catch {
            return null
          }
        })()
        ws.send(
          JSON.stringify({ type: 'noteContent', path: resolved, content: readNoteFile(resolved), mtime: stat ? stat.mtimeMs : null })
        )
      } else if (msg.type === 'noteWrite') {
        const resolved = resolveCwd(msg.path)
        let ok = true
        try {
          fs.writeFileSync(resolved, msg.content ?? '')
        } catch {
          ok = false
        }
        ws.send(JSON.stringify({ type: 'noteWriteResult', path: resolved, ok }))
      } else if (msg.type === 'noteCreateDefault') {
        const dir = resolveCwd('~/.dux/notes')
        try {
          fs.mkdirSync(dir, { recursive: true })
        } catch {
          ws.send(JSON.stringify({ type: 'noteCreated', error: 'não foi possível criar ~/.dux/notes' }))
          return
        }

        // Date.now() sozinho pode colidir se duas notas forem arrastadas no
        // mesmo milissegundo — tenta sufixos incrementais até achar um nome livre.
        let resolved = path.join(dir, `nota-${Date.now()}.md`)
        let suffix = 1
        while (isFile(resolved)) {
          resolved = path.join(dir, `nota-${Date.now()}-${suffix}.md`)
          suffix += 1
        }

        try {
          fs.writeFileSync(resolved, '')
        } catch {
          ws.send(JSON.stringify({ type: 'noteCreated', error: 'não foi possível criar o arquivo da nota' }))
          return
        }

        ws.send(JSON.stringify({ type: 'noteCreated', path: resolved, name: path.basename(resolved) }))
      } else if (msg.type === 'noteWatch') {
        startWatchingNote(ws, resolveCwd(msg.path))
      } else if (msg.type === 'noteUnwatch') {
        stopWatchingNote(ws, resolveCwd(msg.path))
      } else if (msg.type === 'noteLink') {
        noteLink.linkNote(msg.sessionId, resolveCwd(msg.path))
      } else if (msg.type === 'noteUnlink') {
        noteLink.unlinkNote(msg.sessionId, resolveCwd(msg.path))
      } else if (msg.type === 'fileRead') {
        // usado pela tool read_file do node Ollama — diferente de noteRead,
        // NÃO cria o arquivo silenciosamente: o modelo pediu um path achando
        // que existe, então "não encontrado" é uma resposta válida pra ele
        // reagir (pedir o path certo, avisar o usuário etc.), não um bug.
        const resolved = resolveCwd(msg.path)
        if (!isFile(resolved)) {
          ws.send(JSON.stringify({ type: 'fileReadResult', path: resolved, ok: false, error: 'arquivo não encontrado' }))
          return
        }
        try {
          const content = fs.readFileSync(resolved, 'utf8')
          ws.send(JSON.stringify({ type: 'fileReadResult', path: resolved, ok: true, content }))
        } catch (err) {
          ws.send(JSON.stringify({ type: 'fileReadResult', path: resolved, ok: false, error: err.message }))
        }
      } else if (msg.type === 'fileWrite') {
        // diferente de noteWrite: não cria diretório nenhum — se a pasta pai
        // não existe, é mais provável que o modelo tenha inventado um path do
        // que a intenção real de criar uma árvore de pastas nova
        const resolved = resolveCwd(msg.path)
        if (!isDirectory(path.dirname(resolved))) {
          ws.send(JSON.stringify({ type: 'fileWriteResult', path: resolved, ok: false, error: 'diretório não encontrado' }))
          return
        }
        try {
          fs.writeFileSync(resolved, msg.content ?? '')
          ws.send(JSON.stringify({ type: 'fileWriteResult', path: resolved, ok: true }))
        } catch (err) {
          ws.send(JSON.stringify({ type: 'fileWriteResult', path: resolved, ok: false, error: err.message }))
        }
      } else if (msg.type === 'fileList') {
        const resolved = resolveCwd(msg.path)
        if (!isDirectory(resolved)) {
          ws.send(JSON.stringify({ type: 'fileListResult', path: resolved, ok: false, error: 'diretório não encontrado' }))
          return
        }
        ws.send(JSON.stringify({ type: 'fileListResult', path: resolved, ok: true, entries: listDirEntries(resolved) }))
      }
    })

    ws.on('close', () => {
      ptyProcess?.kill()
      ptyProcess = null
      if (sessionId) {
        agentLink.unregisterSession(sessionId)
        noteLink.unregisterSession(sessionId)
      }
      stopAllNoteWatches(ws)
    })
  }
}

module.exports = { createConnectionHandler }
