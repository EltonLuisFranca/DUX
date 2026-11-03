<template>
  <SettingsGroup title="Conexão com o modelo">
    <SettingsRow label="Endereço do Ollama" stacked>
      <input
        class="st-input"
        type="text"
        placeholder="http://localhost:11434"
        :value="duxiConfig.host"
        @change="onHostChange($event.target.value)"
      />
    </SettingsRow>
    <SettingsRow label="Token de autenticação" hint="Só se o servidor exigir (Bearer)." stacked>
      <input
        class="st-input"
        type="password"
        placeholder="Opcional"
        :value="duxiConfig.token"
        @change="onTokenChange($event.target.value)"
      />
    </SettingsRow>
    <SettingsRow label="Modelo">
      <template #hint>
        <span v-if="modelsStatus === 'checking'">Buscando modelos…</span>
        <span v-else-if="modelsStatus === 'error'" class="st-error-text">
          Não foi possível conectar em {{ duxiConfig.host }}. O Ollama está rodando?
        </span>
      </template>
      <select
        class="st-select"
        :value="duxiConfig.model"
        :disabled="modelsStatus === 'checking'"
        @change="updateDuxiConfig({ model: $event.target.value })"
      >
        <option v-if="!duxiConfig.model" value="" disabled>Escolha um modelo</option>
        <option v-if="duxiConfig.model && !models.includes(duxiConfig.model)" :value="duxiConfig.model">
          {{ duxiConfig.model }}
        </option>
        <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
      </select>
      <button class="st-btn st-btn--icon" title="Recarregar modelos" :disabled="modelsStatus === 'checking'" @click="refreshModels">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
        </svg>
      </button>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup title="Comportamento">
    <SettingsRow label="Falar respostas em voz alta">
      <ToggleSwitch
        :model-value="duxiConfig.voiceOutputEnabled"
        label="Falar respostas em voz alta"
        @update:model-value="updateDuxiConfig({ voiceOutputEnabled: $event })"
      />
    </SettingsRow>
    <SettingsRow label="Voz" :disabled="!duxiConfig.voiceOutputEnabled" hint="A mesma da leitura em Voz e sons.">
      <select
        class="st-select"
        :value="selectedVoiceId"
        :disabled="!duxiConfig.voiceOutputEnabled"
        @change="selectedVoiceId = $event.target.value"
      >
        <option v-for="voice in AVAILABLE_VOICES" :key="voice.id" :value="voice.id">{{ voice.label }}</option>
      </select>
      <button class="st-btn" :disabled="testDisabled" @click="testVoice">{{ testStatusLabel }}</button>
    </SettingsRow>
    <SettingsRow
      v-if="platform.features.lipSync"
      label="Sincronizar boca com a fala"
    >
      <ToggleSwitch
        :model-value="duxiConfig.lipSyncEnabled"
        label="Sincronizar boca com a fala"
        @update:model-value="updateDuxiConfig({ lipSyncEnabled: $event })"
      />
    </SettingsRow>
    <SettingsRow
      label='Ativar dizendo "Duxi"'
      hint='Com a Duxi desligada, o microfone fica aberto só esperando o nome dela. Diga "descansar Duxi" pra desligar de novo.'
    >
      <ToggleSwitch
        :model-value="duxiConfig.wakeWordEnabled"
        label="Ativar dizendo Duxi"
        @update:model-value="updateDuxiConfig({ wakeWordEnabled: $event })"
      />
    </SettingsRow>
    <SettingsRow label="Reagir à música do PC">
      <template #hint>
        <span v-if="duxiConfig.musicReactEnabled && systemAudioError" class="st-error-text">
          Não consegui ouvir o áudio do PC: {{ systemAudioError }}
        </span>
        <template v-else>
          Escuta o que o PC está tocando (só o nível do som, nada é gravado) e, quando tem música, a Duxi põe os fones e
          mostra as ondas do áudio.<template v-if="duxiConfig.musicReactEnabled && systemMusicPlaying"> Tocando agora.</template>
        </template>
      </template>
      <ToggleSwitch
        :model-value="duxiConfig.musicReactEnabled"
        label="Reagir à música do PC"
        @update:model-value="updateDuxiConfig({ musicReactEnabled: $event })"
      />
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup title="Personalidade">
    <SettingsRow label="Prompt de sistema" stacked>
      <textarea
        class="st-input st-textarea"
        rows="6"
        :value="duxiConfig.systemPrompt || DEFAULT_DUXI_SYSTEM_PROMPT"
        @change="updateDuxiConfig({ systemPrompt: $event.target.value })"
      ></textarea>
    </SettingsRow>
    <SettingsRow label="Conversa atual" hint="Clique na Duxi (barra do topo) pra ativar o microfone; botão direito abre esta aba.">
      <button class="st-btn" @click="clearDuxiConversation">Limpar conversa</button>
    </SettingsRow>
  </SettingsGroup>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { duxiConfig, updateDuxiConfig, clearDuxiConversation } from '../../store/duxiStore'
import { systemAudioError, systemMusicPlaying } from '../../store/systemAudioStore'
import { listModels } from '../../lib/ollamaClient'
import { DEFAULT_DUXI_SYSTEM_PROMPT } from '../../lib/duxiPrompt'
import { platform } from '../../lib/platform'
import { selectedVoiceId, AVAILABLE_VOICES } from '../../store/ttsStore'
import { useVoiceTest } from './useVoiceTest'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import ToggleSwitch from './ToggleSwitch.vue'

const { testStatusLabel, testDisabled, testVoice } = useVoiceTest()

// lista os modelos do Ollama configurado pra escolher
const models = ref([])
const modelsStatus = ref('idle') // idle | checking | ready | error

async function refreshModels() {
  const host = (duxiConfig.value.host || '').trim().replace(/\/+$/, '')
  if (!host) return
  modelsStatus.value = 'checking'
  try {
    const { api, models: list } = await listModels(host, (duxiConfig.value.token || '').trim())
    models.value = list
    modelsStatus.value = 'ready'
    updateDuxiConfig({ api })
    if (!duxiConfig.value.model && list.length) {
      updateDuxiConfig({ model: list.includes('qwen3:8b') ? 'qwen3:8b' : list[0] })
    }
  } catch (err) {
    console.error('[duxi] falha ao listar modelos', err)
    models.value = []
    modelsStatus.value = 'error'
  }
}

function onHostChange(value) {
  updateDuxiConfig({ host: value.trim().replace(/\/+$/, '') })
  refreshModels()
}

function onTokenChange(value) {
  updateDuxiConfig({ token: value.trim() })
  refreshModels()
}

onMounted(refreshModels)
</script>
