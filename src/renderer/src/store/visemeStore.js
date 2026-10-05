import { ref } from 'vue'
import { platform } from '../lib/platform'

// Rhubarb Lip Sync analisa o WAV já sintetizado pelo Piper (a lib de TTS não
// expõe nenhuma timeline de fonema/palavra, ver comentário em ttsWorker.js) e
// devolve os formatos de boca (visemas A-H/X, padrão Rhubarb) com start/end
// em segundos. A análise roda no processo main (spawn de binário nativo, não
// dá pra rodar isso no renderer) via lipSyncAPI exposta no preload.
export const mouthCues = ref([]) // [{ start, end, value }] — vazio = sem lip-sync (fallback silencioso)

export async function analyzeSpeech(wavBlob) {
  mouthCues.value = []
  if (!platform.features.lipSync) return
  try {
    const buffer = await wavBlob.arrayBuffer()
    const { ok, mouthCues: cues } = await window.lipSyncAPI.analyze(buffer)
    console.log('[viseme] recebido', cues?.length ?? 0, 'cues', cues)
    if (ok) mouthCues.value = cues || []
  } catch (err) {
    // nunca deixa a falha de análise impedir a fala em si — só fica sem
    // sincronizar a boca, o vídeo idle normal continua tocando
    console.error('[viseme] análise falhou', err)
  }
}

// mouthCues é curto (poucos segundos de fala por vez), scan linear é
// suficiente — não vale a pena manter uma estrutura de busca binária pra isso
export function visemeAt(t) {
  const cues = mouthCues.value
  for (let i = 0; i < cues.length; i++) {
    if (t >= cues[i].start && t < cues[i].end) return cues[i].value
  }
  return null
}

export function clearVisemes() {
  mouthCues.value = []
}
