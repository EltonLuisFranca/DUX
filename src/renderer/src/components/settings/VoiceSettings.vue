<template>
  <SettingsGroup title="Microfone">
    <SettingsRow label="Dispositivo de entrada" hint="Se o escolhido for desconectado, a captura volta pro padrão do sistema.">
      <select class="st-select" :value="selectedMicrophoneId" @change="selectedMicrophoneId = $event.target.value">
        <option value="">Padrão do sistema</option>
        <option v-for="mic in availableMicrophones" :key="mic.deviceId" :value="mic.deviceId">{{ mic.label }}</option>
      </select>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup title="Leitura em voz">
    <SettingsRow label="Ler respostas do agente" hint="Lê em voz alta a resposta do terminal selecionado quando ele termina.">
      <ToggleSwitch v-model="ttsEnabled" label="Ler respostas do agente" />
    </SettingsRow>
    <SettingsRow label="Voz">
      <select class="st-select" :value="selectedVoiceId" @change="selectedVoiceId = $event.target.value">
        <option v-for="voice in AVAILABLE_VOICES" :key="voice.id" :value="voice.id">{{ voice.label }}</option>
      </select>
      <button class="st-btn" :disabled="testDisabled" @click="testVoice">{{ testStatusLabel }}</button>
    </SettingsRow>
    <p v-if="lastError" class="st-note st-note--error">Erro: {{ lastError }}</p>
    <p class="st-note">
      O catálogo oficial do Piper TTS só tem vozes masculinas em português. A "Dii" é uma voz feminina treinada pela
      comunidade (OpenVoiceOS) e baixada de um repositório à parte na primeira vez que for selecionada.
    </p>
  </SettingsGroup>

  <SettingsGroup title="Notificação sonora">
    <SettingsRow
      label="Som ao terminar resposta"
      hint="Toca quando o agente termina de responder — só com a leitura em voz desativada."
    >
      <ToggleSwitch v-model="notificationSoundEnabled" label="Som ao terminar resposta" />
    </SettingsRow>
    <SettingsRow label="Som" :disabled="!notificationSoundEnabled">
      <select
        class="st-select"
        :value="selectedSoundId"
        :disabled="!notificationSoundEnabled"
        @change="selectedSoundId = $event.target.value"
      >
        <option v-for="sound in AVAILABLE_SOUNDS" :key="sound.id" :value="sound.id">{{ sound.label }}</option>
      </select>
      <button class="st-btn" @click="playNotificationSound({ force: true })">Testar</button>
    </SettingsRow>
  </SettingsGroup>
</template>

<script setup>
import { onMounted } from 'vue'
import { ttsEnabled, selectedVoiceId, AVAILABLE_VOICES, lastError } from '../../store/ttsStore'
import { selectedMicrophoneId, availableMicrophones, refreshMicrophoneList } from '../../store/voiceStore'
import {
  notificationSoundEnabled,
  selectedSoundId,
  AVAILABLE_SOUNDS,
  playNotificationSound
} from '../../store/notificationSoundStore'
import { useVoiceTest } from './useVoiceTest'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import ToggleSwitch from './ToggleSwitch.vue'

const { testStatusLabel, testDisabled, testVoice } = useVoiceTest()

onMounted(refreshMicrophoneList)
</script>
