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

// No Linux, nodejs-whisper compila o whisper.cpp sob demanda na primeira
// transcrição (precisa de cmake + gcc, que a máquina de dev/o usuário Linux
// costuma ter) — depois disso build/bin/whisper-server já existe e os
// candidatos abaixo acham ele. No Windows isso não dá: a máquina que gera o
// instalador não tem MSVC/cmake (de propósito, ver release-dux), e um
// usuário final muito menos — não existe "compilar na primeira vez" viável
// aí. Por isso a build oficial pré-compilada do próprio projeto whisper.cpp
// (ggml-org/whisper.cpp, release v1.9.1 — mesma versão vendorizada pelo
// nodejs-whisper, então o formato do modelo ggml bate certinho) vai
// vendorizada em resources/whisper/win e embutida no instalador via
// build.win.extraResources no package.json, em vez de depender de compilação.
function resolveWhisperServerBin() {
  const execName = process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server'

  const bundled = app.isPackaged
    ? join(process.resourcesPath, 'whisper', execName)
    : join(app.getAppPath(), 'resources', 'whisper', 'win', execName)
  if (process.platform === 'win32' && existsSync(bundled)) return bundled

  // Mesma lógica de busca que o nodejs-whisper usa internamente pro
  // whisper-cli (WhisperHelper.js: getExecutablePath) — CMake multi-config
  // (MSVC) joga o binário em build/bin/Release ou build/bin/Debug em vez de
  // build/bin direto como no Unix Makefile-based build, e o executável leva
  // ".exe". Sem isso, em qualquer build Windows o spawn() abaixo apontaria
  // pra um caminho que nunca existe, e falharia calado (ver comentário no
  // 'error' handler mais abaixo).
  const candidates = [
    join(WHISPER_CPP_ROOT, 'build/bin', execName),
    join(WHISPER_CPP_ROOT, 'build/bin/Release', execName),
    join(WHISPER_CPP_ROOT, 'build/bin/Debug', execName),
    join(WHISPER_CPP_ROOT, 'build', execName)
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}
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

    const serverBin = resolveWhisperServerBin()
    if (!serverBin) {
      throw new Error(
        `binário whisper-server não encontrado em ${WHISPER_CPP_ROOT} (whisper.cpp não foi compilado/empacotado para ${process.platform} nesta instalação)`
      )
    }

    whisperServerProcess = spawn(serverBin, [
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
    whisperServerProcess.on('error', (err) => console.error('[whisper-server][spawn-error]', err))
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

// sem isso o whisper-server sobrevive ao app (fechar a janela ou o
// electron-vite reiniciar o main em dev) e fica órfão segurando a porta —
// a próxima execução sobe outro que nem consegue abrir a porta, e os órfãos
// vão se acumulando
function killWhisperServer() {
  clearTimeout(whisperServerIdleTimer)
  whisperServerProcess?.kill()
  whisperServerProcess = null
  whisperServerReady = null
}
app.on('will-quit', killWhisperServer)
process.on('exit', killWhisperServer)

// Com música de fundo/barulho o whisper anota o que ouviu em vez de fala —
// "[Música]", "(risos)", "*aplausos*", "♪", "[BLANK_AUDIO]" — e às vezes
// alucina frases de legenda de vídeo em trechos sem fala. Nada disso é o
// usuário falando, então sai do texto (e um trecho só de ruído vira '').
const NON_SPEECH_TAG = /\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|[♪♫🎵🎶]+/gu
const HALLUCINATED_PHRASES = [
  /legendas? (pela|por) .*$/i,
  /amara\.org/i,
  /obrigad[oa] por assistir\.?/i,
  /inscreva-se no canal\.?/i
]

function stripNonSpeech(text) {
  let cleaned = text.replace(NON_SPEECH_TAG, ' ')
  for (const phrase of HALLUCINATED_PHRASES) cleaned = cleaned.replace(phrase, ' ')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  // sobrou só pontuação solta ("...", "-")
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : ''
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
      return { ok: true, text: stripNonSpeech(cleaned) }
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
      return { ok: true, text: stripNonSpeech(text || '') }
    } catch (err) {
      console.error('[voice] chunk transcription failed', err)
      return { ok: false, error: err.message }
    }
  })
}
