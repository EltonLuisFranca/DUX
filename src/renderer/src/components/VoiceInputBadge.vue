<template>
  <AppTooltip :label="tooltipLabel">
    <button
      class="voice-badge"
      :class="{ recording: isRecording, transcribing: isTranscribing, disabled: !activeTerminalId }"
      :disabled="isTranscribing"
      @click="handleClick"
    >
      <div v-if="isRecording" class="wave">
        <span
          v-for="(level, i) in waveLevels"
          :key="i"
          class="wave-bar"
          :style="{ height: `${8 + level * 18}px` }"
        />
      </div>
      <svg v-else-if="isTranscribing" class="spinner" viewBox="0 0 16 16" width="14" height="14">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="24 12" />
      </svg>
      <svg v-else viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" />
        <path d="M3 7.5a5 5 0 0 0 10 0" />
        <path d="M8 12.5v2" />
      </svg>
    </button>
  </AppTooltip>
</template>

<script setup>
import { computed } from 'vue'
import AppTooltip from './AppTooltip.vue'
import { activeTerminalId } from '../store/flowStore'
import { isRecording, isTranscribing, startRecording, stopRecordingAndTranscribe, waveLevels } from '../store/voiceStore'

const tooltipLabel = computed(() => {
  if (isTranscribing.value) return 'Transcrevendo...'
  if (isRecording.value) return 'Clique para parar e enviar'
  if (!activeTerminalId.value) return 'Clique num terminal antes de ditar'
  return 'Ditar comando por voz'
})

async function handleClick() {
  if (isTranscribing.value) return

  if (isRecording.value) {
    await stopRecordingAndTranscribe(activeTerminalId.value)
    return
  }

  if (!activeTerminalId.value) return
  await startRecording()
}
</script>

<style scoped>
.voice-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  cursor: pointer;
  box-shadow: 0 4px 16px var(--color-shadow);
  transition: width 0.15s ease, border-radius 0.15s ease;
}

.voice-badge:hover:not(.disabled):not(.transcribing) {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.voice-badge.disabled {
  opacity: 0.45;
  cursor: default;
}

.voice-badge.recording {
  width: 64px;
  border-radius: 20px;
  border-color: transparent;
  background: #18181b;
}

.voice-badge.transcribing {
  cursor: wait;
  color: var(--color-text-tertiary);
}

.spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.wave {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3.5px;
  height: 26px;
}

.wave-bar {
  width: 4px;
  min-height: 8px;
  border-radius: 999px;
  background: #3b82f6;
  transition: height 0.08s ease-out;
}
</style>
