import { ref, watch } from 'vue'
import { duxiConfig } from './duxiStore'
import { isSpeaking } from './ttsStore'
import { platform } from '../lib/platform'
import { analyzeAudio, BAND_COUNT } from '../../../shared/audioBands'

// Escuta o que o PC está tocando (opção "Reagir à música do PC", desligada
// por padrão) pra Duxi pôr os fones e mostrar barrinhas de áudio enquanto
// tem música. A captura muda por plataforma (ver main/ipc/systemAudio.js):
// no Windows o loopback chega aqui como MediaStream e a análise roda neste
// processo; no Linux o main já manda os números prontos.

// lido a cada frame pelo canvas da Duxi — não precisa ser reativo
export const systemAudio = { level: 0, bands: new Array(BAND_COUNT).fill(0) }
export const systemMusicPlaying = ref(false)
export const systemAudioError = ref('')

// "música" = som contínuo acima de um volume mínimo por um tempinho (barulho
// de notificação não conta); para depois de alguns segundos de silêncio
// (aguenta a pausa entre uma faixa e outra sem tirar os fones)
const LOUD_LEVEL = 0.01 // RMS
const START_AFTER_MS = 1500
const MAX_GAP_MS = 600 // buraco tolerado sem zerar a contagem do início
const STOP_AFTER_MS = 3500
const LOOPBACK_POLL_MS = 50

let loudSince = null
let lastLoudAt = -Infinity

function feed(frame) {
  const now = performance.now()
  // a voz da própria Duxi também sai pela saída do PC — não é música
  const speaking = isSpeaking.value
  systemAudio.level = speaking ? 0 : frame.level
  systemAudio.bands = speaking ? systemAudio.bands.map(() => 0) : frame.bands
  if (systemAudio.level > LOUD_LEVEL) {
    if (now - lastLoudAt > MAX_GAP_MS) loudSince = now
    lastLoudAt = now
    if (now - loudSince >= START_AFTER_MS) systemMusicPlaying.value = true
  } else if (now - lastLoudAt > STOP_AFTER_MS) {
    systemMusicPlaying.value = false
  }
}

let session = 0 // invalida starts antigos se a opção for desligada no meio
let cleanup = null

async function startLoopback(id) {
  await window.systemAudioAPI.armLoopback()
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  stream.getVideoTracks().forEach((track) => track.stop())
  if (id !== session) {
    stream.getTracks().forEach((track) => track.stop())
    return
  }
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((track) => track.stop())
    throw new Error('o sistema não entregou o áudio de loopback')
  }
  const audioCtx = new AudioContext()
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 2048
  // só analisa, não conecta na saída (senão tocaria a música de novo)
  audioCtx.createMediaStreamSource(stream).connect(analyser)
  audioCtx.resume()
  const buf = new Float32Array(analyser.fftSize)
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf)
    feed(analyzeAudio(buf, audioCtx.sampleRate))
  }, LOOPBACK_POLL_MS)
  cleanup = () => {
    clearInterval(timer)
    stream.getTracks().forEach((track) => track.stop())
    audioCtx.close()
  }
}

async function startPulseMonitor() {
  const offFrame = window.systemAudioAPI.onFrame(feed)
  const offError = window.systemAudioAPI.onError((message) => {
    systemAudioError.value = message
    stop()
  })
  cleanup = () => {
    offFrame()
    offError()
    window.systemAudioAPI.stop()
  }
  await window.systemAudioAPI.start()
}

// getDisplayMedia pode exigir um gesto do usuário: se falhar no boot, tenta
// de novo no próximo clique em qualquer lugar do app
let retryListener = null

function clearRetry() {
  if (retryListener) window.removeEventListener('pointerdown', retryListener, true)
  retryListener = null
}

async function start() {
  stop()
  const id = ++session
  systemAudioError.value = ''
  try {
    if (platform.systemAudio === 'loopback') await startLoopback(id)
    else await startPulseMonitor()
  } catch (err) {
    if (id !== session) return
    console.error('[system-audio] não conseguiu capturar o áudio do PC', err)
    systemAudioError.value = err?.message || String(err)
    stop()
    if (platform.systemAudio === 'loopback') {
      retryListener = () => {
        clearRetry()
        if (wantsSystemAudio()) start()
      }
      window.addEventListener('pointerdown', retryListener, true)
    }
  }
}

function stop() {
  session++
  clearRetry()
  cleanup?.()
  cleanup = null
  loudSince = null
  lastLoudAt = -Infinity
  systemMusicPlaying.value = false
  systemAudio.level = 0
  systemAudio.bands = systemAudio.bands.map(() => 0)
}

// só quem usa o áudio do PC é a Duxi — desabilitada, não tem por que escutar
function wantsSystemAudio() {
  return duxiConfig.value.enabled !== false && duxiConfig.value.musicReactEnabled
}

watch(
  wantsSystemAudio,
  (enabled) => {
    if (enabled) start()
    else {
      stop()
      systemAudioError.value = ''
    }
  },
  { immediate: true }
)
