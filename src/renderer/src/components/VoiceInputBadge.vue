<template>
  <AppTooltip :label="tooltipLabel">
    <button
      class="voice-badge"
      :class="{ recording: isRecording, transcribing: isTranscribing && !isRecording, disabled: !activeTerminalId }"
      :disabled="isTranscribing && !isRecording"
      @click="handleClick"
    >
      <svg v-if="isRecording" class="wave" :viewBox="`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`" preserveAspectRatio="none">
        <defs>
          <linearGradient id="waveGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#22d3ee" />
            <stop offset="45%" stop-color="#60a5fa" />
            <stop offset="75%" stop-color="#a78bfa" />
            <stop offset="100%" stop-color="#e879f9" />
          </linearGradient>
        </defs>
        <path
          v-for="(d, i) in wavePaths"
          :key="i"
          :d="d"
          fill="none"
          stroke="url(#waveGradient)"
          stroke-linecap="round"
          stroke-linejoin="round"
          :stroke-width="i === 0 ? 2.2 : 1"
          :stroke-opacity="i === 0 ? 0.95 : 0.35"
        />
      </svg>
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
import { computed, onUnmounted, ref, watch } from 'vue'
import AppTooltip from './AppTooltip.vue'
import { activeTerminalId } from '../store/flowStore'
import { isRecording, isTranscribing, startRecording, stopRecordingAndTranscribe, waveLevels } from '../store/voiceStore'

// Gera algumas curvas senoidais sobrepostas, cada uma moduladas pelo mesmo
// nível de áudio real (waveLevels) mas com fase/frequência levemente
// diferentes — o resultado visual é um "mesh" de linhas que se cruzam,
// parecido com o espectro de referência, em vez de barras isoladas.
const VIEWBOX_WIDTH = 420
const VIEWBOX_HEIGHT = 100
const CENTER_Y = VIEWBOX_HEIGHT / 2
const CURVE_CONFIGS = [
  { amp: 0.7, freq: 1, phase: 0, speed: 1.6, sampleMul: 1 },
  { amp: 0.5, freq: 1.4, phase: 1.1, speed: 2.1, sampleMul: 0.85 },
  { amp: 0.4, freq: 0.8, phase: 2.4, speed: 1.3, sampleMul: 0.6 },
  { amp: 0.3, freq: 1.9, phase: 4.2, speed: 2.5, sampleMul: 0.4 }
]

// waveLevels só ganha valor novo a cada onaudioprocess (~128ms) — animar só
// nesses ticks faz o desenho "engasgar" entre eles. Um relógio de fase
// contínuo via requestAnimationFrame roda a 60fps independente da chegada de
// áudio, deslocando as curvas o tempo todo; o nível real (volume) continua
// vindo do waveLevels, só a posição da onda que fica sempre fluida.
const clockTime = ref(0)
let rafId = null
let rafStartedAt = 0

function tick(now) {
  if (!rafStartedAt) rafStartedAt = now
  clockTime.value = (now - rafStartedAt) / 1000
  rafId = requestAnimationFrame(tick)
}

watch(
  isRecording,
  (recording) => {
    if (recording) {
      rafStartedAt = 0
      rafId = requestAnimationFrame(tick)
    } else if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
})

function buildWavePath({ amp, freq, phase, speed, sampleMul }) {
  const levels = waveLevels.value
  const n = levels.length
  const points = []
  const segments = n * 3 // mais pontos que barras, pra curva ficar suave
  const t0 = clockTime.value * speed
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const x = t * VIEWBOX_WIDTH
    const levelIdx = Math.min(n - 1, Math.floor(t * n))
    const level = levels[levelIdx] * sampleMul
    const envelope = Math.sin(Math.PI * t) // sobe e desce nas pontas, sem cortar seco
    // Piso baixo (quase reto) em silêncio real — o movimento perceptível só
    // aparece quando há volume de fala de verdade; sem isso a curva balança
    // sozinha o tempo todo, mesmo com o microfone mudo.
    const y =
      CENTER_Y +
      Math.sin(t * Math.PI * 8 * freq + phase + t0) * (1 + level * 38 * amp) * envelope
    points.push({ x, y })
  }

  // Liga os pontos com curvas suaves (Bézier quadrática passando pelo ponto
  // médio entre vizinhos) em vez de segmentos retos — retas fazem os picos da
  // senoide aparecerem como "V" pontudos; assim os topos ficam arredondados
  // de verdade, não só visualmente disfarçados pelo stroke-linejoin.
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const midX = (prev.x + curr.x) / 2
    const midY = (prev.y + curr.y) / 2
    d += ` Q${prev.x.toFixed(1)},${prev.y.toFixed(1)} ${midX.toFixed(1)},${midY.toFixed(1)}`
  }
  const last = points[points.length - 1]
  d += ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`
  return d
}

const wavePaths = computed(() => CURVE_CONFIGS.map(buildWavePath))

const tooltipLabel = computed(() => {
  if (isRecording.value) return 'Ditando ao vivo — clique para parar'
  if (isTranscribing.value) return 'Finalizando transcrição...'
  if (!activeTerminalId.value) return 'Clique num terminal antes de ditar'
  return 'Ditar comando por voz'
})

function handleClick() {
  if (isRecording.value) {
    stopRecordingAndTranscribe()
    return
  }

  if (isTranscribing.value || !activeTerminalId.value) return
  startRecording(activeTerminalId.value)
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
  width: 420px;
  height: 120px;
  border-radius: 24px;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  position: relative;
  z-index: 1000;
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
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.45));
  /* fade nas pontas em vez de um corte reto — as curvas somem suavemente nas
     bordas em vez de bater num retângulo visível */
  mask-image: linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%);
}

</style>
