import { ref } from 'vue'

export const isRecording = ref(false)
export const isTranscribing = ref(false)

// Cada node de terminal observa isto e, se o id bater com o próprio, envia o
// texto pro seu WebSocket e chama consumePendingVoiceInput() — evita precisar
// de uma referência direta de fora pra dentro de cada instância de terminal,
// que hoje não existe (cada node só fala com seu próprio WebSocket).
export const pendingVoiceInput = ref(null)

export function consumePendingVoiceInput() {
  pendingVoiceInput.value = null
}

const WHISPER_SAMPLE_RATE = 16000
const WAVE_BAR_COUNT = 5

// Amplitude real do áudio captado, uma por barra da waveform — atualizado a
// cada onaudioprocess, consumido pelo VoiceInputBadge pra desenhar o nível
// de volume de verdade em vez de uma animação genérica.
export const waveLevels = ref(new Array(WAVE_BAR_COUNT).fill(0))

let audioContext = null
let sourceNode = null
let processorNode = null
let mediaStream = null
let recordedSamples = []

// Grava PCM mono 16kHz direto via Web Audio API, em vez de MediaRecorder
// (webm/opus) — nodejs-whisper converteria webm pra wav via ffmpeg, uma
// dependência de sistema que não podemos garantir que o usuário tem
// instalada. Gravando já no formato exato que o whisper-cli espera, ele
// reconhece o arquivo como WAV válido e pula a conversão inteiramente.
export async function startRecording() {
  if (isRecording.value) return

  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  audioContext = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE })
  sourceNode = audioContext.createMediaStreamSource(mediaStream)

  // ScriptProcessorNode está deprecated mas ainda é o caminho mais simples
  // sem carregar um AudioWorklet module separado; buffer pequeno pra manter
  // a latência de captura baixa.
  processorNode = audioContext.createScriptProcessor(4096, 1, 1)
  recordedSamples = []

  processorNode.onaudioprocess = (event) => {
    const channelData = event.inputBuffer.getChannelData(0)
    recordedSamples.push(new Float32Array(channelData))

    // RMS (root mean square) do bloco atual como proxy de volume percebido —
    // mais estável visualmente que pegar o pico, que oscila muito quadro a
    // quadro. Desloca a janela de barras uma posição a cada bloco processado.
    let sumSquares = 0
    for (let i = 0; i < channelData.length; i++) sumSquares += channelData[i] * channelData[i]
    const rms = Math.sqrt(sumSquares / channelData.length)
    const level = Math.min(1, rms * 6)

    waveLevels.value = [...waveLevels.value.slice(1), level]
  }

  sourceNode.connect(processorNode)
  processorNode.connect(audioContext.destination)

  isRecording.value = true
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }

  return buffer
}

function stopCapture() {
  processorNode?.disconnect()
  sourceNode?.disconnect()
  mediaStream?.getTracks().forEach((track) => track.stop())
  audioContext?.close()
  processorNode = null
  sourceNode = null
  mediaStream = null
  audioContext = null
  waveLevels.value = new Array(WAVE_BAR_COUNT).fill(0)
}

export async function stopRecordingAndTranscribe(targetTerminalId) {
  if (!isRecording.value) return

  const chunks = recordedSamples
  recordedSamples = []
  stopCapture()
  isRecording.value = false

  if (!targetTerminalId || chunks.length === 0) return

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  isTranscribing.value = true
  try {
    const wavBuffer = encodeWav(merged, WHISPER_SAMPLE_RATE)
    const result = await window.voiceAPI.transcribe(wavBuffer)

    if (result.ok && result.text) {
      pendingVoiceInput.value = { terminalId: targetTerminalId, text: result.text }
    } else if (!result.ok) {
      console.error('[voice] transcription error', result.error)
    }
  } finally {
    isTranscribing.value = false
  }
}

export function cancelRecording() {
  if (!isRecording.value) return
  recordedSamples = []
  stopCapture()
  isRecording.value = false
}
