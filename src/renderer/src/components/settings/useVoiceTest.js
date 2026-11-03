import { computed } from 'vue'
import { isSpeaking, isDownloadingVoice, speak } from '../../store/ttsStore'

// Botão "testar voz" compartilhado pelas abas Voz e sons e Duxi — mesma voz
// (ttsStore.selectedVoiceId) nas duas.
export function useVoiceTest() {
  const testStatusLabel = computed(() => {
    if (isDownloadingVoice.value) return 'Baixando voz…'
    if (isSpeaking.value) return 'Falando…'
    return 'Testar'
  })

  const testDisabled = computed(() => isSpeaking.value || isDownloadingVoice.value)

  function testVoice() {
    speak('Olá! Esta é a voz que vai ler as respostas do agente pra você.', { forceSpeak: true })
  }

  return { testStatusLabel, testDisabled, testVoice }
}
