// Roda a síntese Piper TTS isolada da thread principal do renderer — a
// inferência WASM (mesmo com numThreads: 1) é pesada o bastante pra travar a
// UI inteira por vários segundos a cada resposta, reproduzido na prática
// direto no processo principal. Um Worker dedicado paga esse custo sem
// congelar o canvas/terminal enquanto sintetiza.
let ttsSessionPromise = null
let ttsSessionVoiceId = null

const LOCAL_ONNX_WASM_BASE = `${self.location.origin}/onnxruntime-web/`

async function configureOnnxRuntimeSingleThread() {
  const ort = await import('onnxruntime-web/wasm')
  const env = ort.env ?? ort.default?.env
  // Ver nota equivalente no ttsStore.js: numThreads: 1 evita o caminho
  // multi-thread via SharedArrayBuffer que travou a CPU por minutos nesta
  // máquina quando múltiplas sínteses concorriam.
  if (env?.wasm) env.wasm.numThreads = 1
}

async function getTtsSession(voiceId) {
  if (ttsSessionPromise && ttsSessionVoiceId === voiceId) return ttsSessionPromise
  await configureOnnxRuntimeSingleThread()
  const tts = await import('@mintplex-labs/piper-tts-web')
  ttsSessionVoiceId = voiceId
  ttsSessionPromise = tts.TtsSession.create({
    voiceId,
    wasmPaths: {
      onnxWasm: LOCAL_ONNX_WASM_BASE,
      piperData: tts.TtsSession.WASM_LOCATIONS.piperData,
      piperWasm: tts.TtsSession.WASM_LOCATIONS.piperWasm
    }
  }).catch((err) => {
    ttsSessionPromise = null
    ttsSessionVoiceId = null
    throw err
  })
  return ttsSessionPromise
}

self.onmessage = async (event) => {
  const { id, voiceId, text } = event.data
  try {
    const session = await getTtsSession(voiceId)
    const wavBlob = await session.predict(text)
    self.postMessage({ id, ok: true, wavBlob })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) })
  }
}
