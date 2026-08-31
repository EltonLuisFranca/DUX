import { ref, watch } from 'vue'

// Toca um som curto quando o agente termina de responder — usa a mesma
// detecção de silêncio do TTS (WslClaudeTerminalNode.vue), mas serve como
// alternativa mais leve pra quem não quer a resposta lida em voz alta.
//
// Os arquivos vêm de public/sounds/ e em dev são servidos por http://localhost
// a partir da raiz do site, então um path absoluto "/sounds/x.wav" resolve
// certo. Em produção o Electron carrega o renderer via file://, onde um path
// absoluto vira raiz do sistema de arquivos (mesmo bug corrigido antes pro
// wasm do TTS em ttsWorker.js) — por isso resolvemos relativo a document.baseURI
// (a URL do próprio index.html, em out/renderer/), que funciona nos dois casos.
export const AVAILABLE_SOUNDS = [
  { id: 'chime-1', label: 'Chime 1', src: new URL('sounds/chime-1.wav', document.baseURI).href },
  { id: 'chime-2', label: 'Chime 2', src: new URL('sounds/chime-2.wav', document.baseURI).href }
]

const ENABLED_STORAGE_KEY = 'dux-notification-sound-enabled'
const SOUND_STORAGE_KEY = 'dux-notification-sound-id'

const storedSoundId = localStorage.getItem(SOUND_STORAGE_KEY)
const initialSoundId = AVAILABLE_SOUNDS.some((s) => s.id === storedSoundId)
  ? storedSoundId
  : AVAILABLE_SOUNDS[0].id

export const notificationSoundEnabled = ref(localStorage.getItem(ENABLED_STORAGE_KEY) === 'true')
export const selectedSoundId = ref(initialSoundId)

watch(notificationSoundEnabled, (value) => localStorage.setItem(ENABLED_STORAGE_KEY, String(value)))
watch(selectedSoundId, (id) => localStorage.setItem(SOUND_STORAGE_KEY, id))

let currentAudio = null

export function playNotificationSound({ force = false } = {}) {
  if (!notificationSoundEnabled.value && !force) return

  const sound = AVAILABLE_SOUNDS.find((s) => s.id === selectedSoundId.value) || AVAILABLE_SOUNDS[0]
  currentAudio?.pause()
  currentAudio = new Audio(sound.src)
  currentAudio.play().catch(() => {})
}
