import { ipcMain, app } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync, writeFileSync, unlinkSync, mkdirSync, renameSync, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'

// Modelo fica em userData, não empacotado no instalador nem em node_modules —
// é baixado sob demanda na primeira transcrição (~148MB pro modelo "base").
// O binário whisper-cli em si é que vai empacotado (via asarUnpack), porque
// nodejs-whisper resolve seu caminho de forma fixa relativa ao próprio
// node_modules, sem permitir apontar pra outro lugar.
const WHISPER_MODEL_DIR = join(app.getPath('userData'), 'whisper-models')
const WHISPER_MODEL_NAME = 'base'
const WHISPER_MODEL_FILE = 'ggml-base.bin'
const WHISPER_MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILE}`

// Baixado manualmente via fetch em vez de usar autoDownloadModelName do
// nodejs-whisper: essa opção dispara um shell script (download-ggml-model.sh)
// resolvido relativo ao cwd do processo, que só funciona por acaso quando o
// cwd é a pasta certa — dentro do Electron main process (cwd = raiz do app,
// não node_modules/nodejs-whisper/cpp/whisper.cpp) ele falha silenciosamente
// com "Cannot read properties of undefined (reading 'code')".
async function ensureWhisperModel() {
  const modelPath = join(WHISPER_MODEL_DIR, WHISPER_MODEL_FILE)
  if (existsSync(modelPath)) return modelPath

  mkdirSync(WHISPER_MODEL_DIR, { recursive: true })
  const response = await fetch(WHISPER_MODEL_URL)
  if (!response.ok) throw new Error(`falha ao baixar modelo: ${response.status}`)

  const tmpPath = `${modelPath}.download`
  const fileStream = createWriteStream(tmpPath)
  await pipeline(response.body, fileStream)
  renameSync(tmpPath, modelPath)
  return modelPath
}

// --- Ditado ao vivo: transcreve pedaço a pedaço enquanto o usuário ainda
// está falando, em vez de gravar tudo e transcrever de uma vez só no final.
//
// nodewhisper() (usado no handler voice:transcribe abaixo) spawna um
// processo whisper-cli NOVO a cada chamada, recarregando o modelo do zero
// sempre — inviável pra chunks curtos e frequentes (o carregamento sozinho
// já custa mais que os 2-3s de áudio que se quer transcrever). whisper-server
// é a peça que faltava: um processo HTTP de vida longa, com o modelo
// carregado uma única vez, que aceita múltiplas requisições de transcrição
// em sequência rápida. Ele já vem compilado junto do mesmo build do
// whisper-cli (nodejs-whisper builda o CMakeLists de examples/ inteiro, que
// inclui server/ incondicionalmente) — não precisa compilar nada novo, só
// descobrir o binário e subir como processo filho, do mesmo jeito que o
// bridge já faz.
// mesmo padrão do BRIDGE_DIR em index.js: empacotado, o binário mora dentro
// de app.asar.unpacked (nodejs-whisper está listado em asarUnpack, precisa
// rodar como processo real), não dentro do arquivo virtual .asar.
const WHISPER_CPP_ROOT = app.isPackaged
  ? join(app.getAppPath(), 'node_modules/nodejs-whisper/cpp/whisper.cpp').replace('app.asar', 'app.asar.unpacked')
  : join(app.getAppPath(), 'node_modules/nodejs-whisper/cpp/whisper.cpp')
const WHISPER_SERVER_BIN = join(WHISPER_CPP_ROOT, 'build/bin/whisper-server')
const WHISPER_SERVER_HOST = '127.0.0.1'
const WHISPER_SERVER_PORT = 4579
const WHISPER_SERVER_IDLE_SHUTDOWN_MS = 60_000

let whisperServerProcess = null
let whisperServerReady = null
let whisperServerIdleTimer = null

function scheduleWhisperServerShutdown() {
  clearTimeout(whisperServerIdleTimer)
  whisperServerIdleTimer = setTimeout(() => {
    whisperServerProcess?.kill()
    whisperServerProcess = null
    whisperServerReady = null
  }, WHISPER_SERVER_IDLE_SHUTDOWN_MS)
}

async function ensureWhisperServer() {
  clearTimeout(whisperServerIdleTimer)

  if (whisperServerReady) {
    scheduleWhisperServerShutdown()
    return whisperServerReady
  }

  whisperServerReady = (async () => {
    const modelPath = await ensureWhisperModel()

    whisperServerProcess = spawn(WHISPER_SERVER_BIN, [
      '--host',
      WHISPER_SERVER_HOST,
      '--port',
      String(WHISPER_SERVER_PORT),
      '--model',
      modelPath,
      '--language',
      'pt',
      '--no-timestamps'
    ])
    whisperServerProcess.stdout.on('data', (chunk) => console.log(`[whisper-server] ${chunk}`))
    whisperServerProcess.stderr.on('data', (chunk) => console.error(`[whisper-server] ${chunk}`))
    whisperServerProcess.on('exit', (code) => {
      console.log(`[whisper-server] exited with code ${code}`)
      whisperServerProcess = null
      whisperServerReady = null
    })

    // sem endpoint de health check dedicado — poll no /inference com um
    // corpo vazio até ele parar de recusar conexão (ECONNREFUSED), que é só
    // enquanto o processo ainda está de boot/carregando o modelo.
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      try {
        await fetch(`http://${WHISPER_SERVER_HOST}:${WHISPER_SERVER_PORT}/`)
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }
    throw new Error('whisper-server não respondeu a tempo')
  })()

  scheduleWhisperServerShutdown()
  return whisperServerReady
}

export function registerVoiceIpc() {
  ipcMain.handle('voice:transcribe', async (_event, { buffer }) => {
    const { nodewhisper } = await import('nodejs-whisper')
    const tmpWavPath = join(app.getPath('temp'), `dux-voice-${Date.now()}.wav`)

    try {
      await ensureWhisperModel()
      writeFileSync(tmpWavPath, Buffer.from(buffer))
      const transcript = await nodewhisper(tmpWavPath, {
        modelName: WHISPER_MODEL_NAME,
        modelRootPath: WHISPER_MODEL_DIR,
        removeWavFileAfterTranscription: true,
        whisperOptions: {
          outputInText: false,
          language: 'pt'
        }
      })
      // whisper.cpp devolve o texto com timestamps por linha
      // ([00:00:00.000 --> 00:00:02.000]  texto) — mantemos só o texto.
      const cleaned = transcript
        .split('\n')
        .map((line) => line.replace(/^\[[\d:.,\s>-]+\]\s*/, '').trim())
        .filter(Boolean)
        .join(' ')
      return { ok: true, text: cleaned }
    } catch (err) {
      console.error('[voice] transcription failed', err)
      return { ok: false, error: err.message }
    } finally {
      if (existsSync(tmpWavPath)) unlinkSync(tmpWavPath)
    }
  })

  ipcMain.handle('voice:transcribe-chunk', async (_event, { buffer }) => {
    try {
      await ensureWhisperServer()

      const form = new FormData()
      form.append('file', new Blob([buffer], { type: 'audio/wav' }), 'chunk.wav')
      form.append('response_format', 'json')

      const response = await fetch(`http://${WHISPER_SERVER_HOST}:${WHISPER_SERVER_PORT}/inference`, {
        method: 'POST',
        body: form
      })
      if (!response.ok) throw new Error(`whisper-server respondeu HTTP ${response.status}`)

      const { text } = await response.json()
      return { ok: true, text: (text || '').trim() }
    } catch (err) {
      console.error('[voice] chunk transcription failed', err)
      return { ok: false, error: err.message }
    }
  })
}
