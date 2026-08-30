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
const WAVE_BAR_COUNT = 24

// Amplitude real do áudio captado, uma por barra da waveform — atualizado a
// cada onaudioprocess, consumido pelo VoiceInputBadge pra desenhar o nível
// de volume de verdade em vez de uma animação genérica.
export const waveLevels = ref(new Array(WAVE_BAR_COUNT).fill(0))

// VAD (voice activity detection) bem simples baseado no mesmo RMS já
// calculado pra waveform — abaixo do threshold conta como silêncio. Não é
// robusto a ruído de fundo alto, mas cobre o caso comum (microfone normal,
// ambiente razoavelmente quieto) sem precisar de um modelo de VAD à parte.
const SILENCE_RMS_THRESHOLD = 0.012
const SILENCE_CUT_MS = 700
// Corta mesmo sem silêncio depois desse tanto de fala contínua — um chunk
// grande demais atrasa a resposta (o whisper-server processa em série) e
// aumenta a chance de erro de transcrição por frase longa demais.
const MAX_SEGMENT_MS = 12_000
// Pausa bem mais longa que o corte de segmento — trata como "terminei essa
// frase/comando" e manda Enter no terminal, sem parar de gravar (dá pra
// ditar vários comandos em sequência sem tocar no botão de novo).
const ENTER_SILENCE_MS = 2_500

let audioContext = null
let sourceNode = null
let processorNode = null
let mediaStream = null

let currentSegmentSamples = []
let hasSpeechInSegment = false
let silenceStartedAt = null
let segmentStartedAt = null
// Ao contrário de silenceStartedAt (resetado a cada cutSegmentIfAny, incluindo
// os cortes por SILENCE_CUT_MS no meio de uma pausa longa), este marca o
// início do silêncio contínuo real, sobrevivendo aos cortes de segmento — é o
// que permite detectar ENTER_SILENCE_MS mesmo quando essa pausa já causou um
// ou mais cortes de segmento por silêncio curto antes de completar.
let overallSilenceStartedAt = null
// Evita mandar Enter repetidamente a cada onaudioprocess enquanto o silêncio
// continua além de ENTER_SILENCE_MS — só volta a false quando fala real for
// detectada de novo.
let enterSentForCurrentSilence = false
let activeTerminalId = null
// Ordem de chegada não é garantida (chunks transcrevem em paralelo) — cada
// segmento recebe um índice sequencial e o texto só é liberado pro terminal
// depois que todos os índices anteriores já saíram, senão frases faladas em
// ordem podem chegar trocadas no terminal.
let nextSegmentIndex = 0
let nextSegmentToEmit = 0
const pendingSegmentTexts = new Map()
// Incrementado a cada start/cancel — chunks de uma gravação cancelada que
// ainda estejam "em voo" (já enviados pro whisper-server antes do cancelar)
// checam esse token ao terminar e descartam o resultado se ele mudou nesse
// meio tempo, em vez de injetar texto obsoleto num terminal que pode nem
// ser mais o activeTerminalId de uma gravação nova já em andamento.
let recordingSessionToken = 0

// Índice do segmento após o qual, assim que ele for emitido, o Enter deve ser
// disparado — evita que o Enter (síncrono) chegue no terminal antes do texto
// do segmento que a pausa longa acabou de fechar (a transcrição é async).
let enterPendingAfterSegment = null

function flushEmittableSegments() {
  while (pendingSegmentTexts.has(nextSegmentToEmit)) {
    const text = pendingSegmentTexts.get(nextSegmentToEmit)
    const emittedIndex = nextSegmentToEmit
    pendingSegmentTexts.delete(nextSegmentToEmit)
    nextSegmentToEmit += 1
    // espaço no final: cada segmento chega como um evento de "input" separado
    // digitado no terminal, sem Enter entre eles — sem esse espaço, o fim de
    // uma frase grudaria direto no começo da próxima ("...hojeamanhã...").
    if (text) pendingVoiceInput.value = { terminalId: activeTerminalId, text: `${text} ` }

    if (enterPendingAfterSegment !== null && emittedIndex >= enterPendingAfterSegment) {
      enterPendingAfterSegment = null
      pendingVoiceInput.value = { terminalId: activeTerminalId, text: '', sendEnter: true }
    }
  }
}

// Chamado quando o silêncio contínuo (que já pode ter atravessado um ou mais
// cortes de segmento) atinge ENTER_SILENCE_MS — confirma a frase mandando
// Enter no terminal ativo, sem parar a gravação, pra permitir ditar vários
// comandos em sequência sem tocar no botão de novo. O corte do segmento em
// aberto (se houver) acabou de acontecer em cutSegmentIfAny(); o Enter espera
// esse segmento (e qualquer um anterior ainda em voo) ser emitido primeiro.
function sendEnterSignal() {
  if (nextSegmentToEmit >= nextSegmentIndex) {
    // nada pendente pra transcrever — pode mandar na hora
    pendingVoiceInput.value = { terminalId: activeTerminalId, text: '', sendEnter: true }
    return
  }
  enterPendingAfterSegment = nextSegmentIndex - 1
}

async function transcribeSegment(samples, segmentIndex, sessionToken) {
  isTranscribing.value = true
  try {
    const wavBuffer = encodeWav(samples, WHISPER_SAMPLE_RATE)
    const result = await window.voiceAPI.transcribeChunk(wavBuffer)
    if (sessionToken !== recordingSessionToken) return // gravação foi cancelada/reiniciada
    pendingSegmentTexts.set(segmentIndex, result.ok ? result.text : '')
    if (!result.ok) console.error('[voice] chunk transcription error', result.error)
  } catch (err) {
    if (sessionToken !== recordingSessionToken) return
    pendingSegmentTexts.set(segmentIndex, '')
    console.error('[voice] chunk transcription failed', err)
  } finally {
    if (sessionToken === recordingSessionToken) {
      flushEmittableSegments()
      // isTranscribing reflete se AINDA há algum chunk em voo, não só o último
      isTranscribing.value = nextSegmentToEmit < nextSegmentIndex
    }
  }
}

function mergeSamples(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

function cutSegmentIfAny() {
  if (!hasSpeechInSegment || currentSegmentSamples.length === 0) {
    currentSegmentSamples = []
    hasSpeechInSegment = false
    silenceStartedAt = null
    segmentStartedAt = null
    return
  }

  const samples = mergeSamples(currentSegmentSamples)
  const segmentIndex = nextSegmentIndex
  nextSegmentIndex += 1

  currentSegmentSamples = []
  hasSpeechInSegment = false
  silenceStartedAt = null
  segmentStartedAt = null

  transcribeSegment(samples, segmentIndex, recordingSessionToken)
}

// Grava PCM mono 16kHz direto via Web Audio API, em vez de MediaRecorder
// (webm/opus) — nodejs-whisper/whisper-server converteriam webm pra wav via
// ffmpeg, uma dependência de sistema que não podemos garantir que o usuário
// tem instalada. Gravando já no formato exato que o whisper espera, ele
// reconhece o arquivo como WAV válido e pula a conversão inteiramente.
export async function startRecording(targetTerminalId) {
  if (isRecording.value) return

  recordingSessionToken += 1
  activeTerminalId = targetTerminalId
  nextSegmentIndex = 0
  nextSegmentToEmit = 0
  pendingSegmentTexts.clear()
  currentSegmentSamples = []
  hasSpeechInSegment = false
  silenceStartedAt = null
  segmentStartedAt = null
  overallSilenceStartedAt = null
  enterSentForCurrentSilence = false
  enterPendingAfterSegment = null

  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  audioContext = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE })
  sourceNode = audioContext.createMediaStreamSource(mediaStream)

  // ScriptProcessorNode está deprecated mas ainda é o caminho mais simples
  // sem carregar um AudioWorklet module separado; buffer pequeno pra manter
  // a latência de captura baixa e a waveform atualizando com mais frequência
  // (2048 amostras a 16kHz = ~128ms por chamada, contra ~256ms de um 4096).
  processorNode = audioContext.createScriptProcessor(2048, 1, 1)

  processorNode.onaudioprocess = (event) => {
    const channelData = event.inputBuffer.getChannelData(0)
    const now = Date.now()

    // RMS (root mean square) do bloco inteiro decide fala/silêncio (mais
    // estável que pico). Pra waveform, o bloco é fatiado em vários
    // sub-blocos menores — um único RMS por bloco de 4096 amostras (~256ms)
    // move a janela devagar demais pra parecer um espectro vivo; fatiando,
    // várias barras avançam a cada onaudioprocess e o desenho flui de verdade
    // conforme a fala acontece.
    let sumSquares = 0
    for (let i = 0; i < channelData.length; i++) sumSquares += channelData[i] * channelData[i]
    const rms = Math.sqrt(sumSquares / channelData.length)

    const subBlockCount = 6
    const subBlockSize = Math.floor(channelData.length / subBlockCount)
    const newLevels = []
    for (let b = 0; b < subBlockCount; b++) {
      let subSum = 0
      const start = b * subBlockSize
      const end = start + subBlockSize
      for (let i = start; i < end; i++) subSum += channelData[i] * channelData[i]
      const subRms = Math.sqrt(subSum / subBlockSize)
      // Abaixo do próprio limiar de silêncio do VAD, zera o nível visual —
      // sem isso, ruído de fundo fraco (mic aberto sem fala) ainda gerava um
      // valor pequeno e fazia a onda balançar sozinha mesmo "em silêncio".
      if (subRms < SILENCE_RMS_THRESHOLD) {
        newLevels.push(0)
        continue
      }
      // leve jitter determinístico por posição pra quebrar a uniformidade
      // entre barras vizinhas com volume parecido, dando aspecto orgânico em
      // vez de um bloco só subindo e descendo junto.
      const jitter = 0.85 + 0.3 * Math.abs(Math.sin(b * 12.9898 + now * 0.001))
      newLevels.push(Math.min(1, subRms * 7 * jitter))
    }
    waveLevels.value = [...waveLevels.value.slice(newLevels.length), ...newLevels]

    const isSpeech = rms >= SILENCE_RMS_THRESHOLD

    if (isSpeech) {
      if (!hasSpeechInSegment) segmentStartedAt = now
      hasSpeechInSegment = true
      silenceStartedAt = null
      overallSilenceStartedAt = null
      enterSentForCurrentSilence = false
      currentSegmentSamples.push(new Float32Array(channelData))
      return
    }

    // silêncio geral: rastreado independente de segmento/corte, pra detectar
    // uma pausa longa mesmo que ela já tenha causado um corte de segmento no
    // meio do caminho (SILENCE_CUT_MS é bem menor que ENTER_SILENCE_MS).
    if (overallSilenceStartedAt === null) overallSilenceStartedAt = now
    if (!enterSentForCurrentSilence && now - overallSilenceStartedAt >= ENTER_SILENCE_MS) {
      enterSentForCurrentSilence = true
      cutSegmentIfAny() // garante que a frase antes da pausa já foi despachada pra transcrever
      sendEnterSignal()
    }

    // silêncio: ainda acumula (a pausa em si faz parte do WAV do segmento,
    // sem cortar exatamente na borda), só decide se é hora de fechar
    if (hasSpeechInSegment) currentSegmentSamples.push(new Float32Array(channelData))

    if (!hasSpeechInSegment) return

    if (silenceStartedAt === null) silenceStartedAt = now

    const silenceElapsed = now - silenceStartedAt
    const segmentElapsed = now - segmentStartedAt

    if (silenceElapsed >= SILENCE_CUT_MS || segmentElapsed >= MAX_SEGMENT_MS) {
      cutSegmentIfAny()
    }
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

// Ao parar, fecha qualquer segmento de fala ainda em aberto (o usuário pode
// ter soltado o botão no meio de uma frase, antes de SILENCE_CUT_MS de
// silêncio acontecer sozinho) — sem isso, as últimas palavras faladas nunca
// seriam transcritas.
export function stopRecordingAndTranscribe() {
  if (!isRecording.value) return
  stopCapture()
  isRecording.value = false
  cutSegmentIfAny()
}

export function cancelRecording() {
  if (!isRecording.value) return
  recordingSessionToken += 1 // invalida qualquer chunk desta gravação ainda em voo
  currentSegmentSamples = []
  hasSpeechInSegment = false
  overallSilenceStartedAt = null
  enterSentForCurrentSilence = false
  enterPendingAfterSegment = null
  pendingSegmentTexts.clear()
  isTranscribing.value = false
  stopCapture()
  isRecording.value = false
}
