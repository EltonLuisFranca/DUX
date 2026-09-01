<template>
  <div
    class="pomodoro-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6', '--phase-color': phaseColor }"
  >
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="pomodoro-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="pomodoro-handle"
      :class="{ connected: isRightConnected }"
    />

    <div class="pomodoro-header" :style="{ background: data.headerColor || undefined }">
      <span class="phase-dot" />
      <span class="pomodoro-title">{{ data.name }}</span>
      <button class="header-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <GearIcon />
      </button>
    </div>

    <div class="pomodoro-body nodrag nowheel nopan">
      <span class="phase-label" :style="{ color: phaseColor }">{{ phaseLabel }}</span>

      <div class="ring-wrap">
        <svg viewBox="0 0 100 100" class="ring-svg">
          <circle cx="50" cy="50" r="44" fill="none" stroke-width="6" class="ring-track" />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke-width="6"
            class="ring-progress"
            :style="{ stroke: phaseColor, strokeDasharray: ringCircumference, strokeDashoffset: ringOffset }"
          />
        </svg>
        <span class="time-label">{{ formattedTime }}</span>
      </div>

      <div class="controls-row">
        <button class="control-btn" @click="reset">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button class="control-btn primary" @click="toggleRunning">
          <svg v-if="!running" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M4 2.5l10 5.5-10 5.5V2.5z" />
          </svg>
          <svg v-else viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <rect x="3.5" y="2.5" width="3.5" height="11" rx="1" />
            <rect x="9" y="2.5" width="3.5" height="11" rx="1" />
          </svg>
        </button>
        <button class="control-btn" @click="skip">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M3 3v10l7-5-7-5zM11 3h2v10h-2z" />
          </svg>
        </button>
      </div>

      <span class="cycle-count">{{ cyclesCompleted }} {{ cyclesCompleted === 1 ? 'ciclo' : 'ciclos' }} completo{{ cyclesCompleted === 1 ? '' : 's' }}</span>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'

const FOCUS_COLOR = '#3b82f6'
const BREAK_COLOR = '#22c55e'
const LONG_BREAK_COLOR = '#8b5cf6'

const PHASE_DURATIONS = {
  focus: 25 * 60,
  break: 5 * 60,
  longBreak: 15 * 60
}

const PHASE_LABELS = {
  focus: 'Foco',
  break: 'Pausa',
  longBreak: 'Pausa longa'
}

const PHASE_COLORS = {
  focus: FOCUS_COLOR,
  break: BREAK_COLOR,
  longBreak: LONG_BREAK_COLOR
}

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')

const { nodeWidth, nodeHeight, startResize } = useNodeResize(props, {
  minWidth: 220,
  minHeight: 260,
  defaultWidth: 260,
  defaultHeight: 320
})

const phase = ref(props.data.phase || 'focus')
const secondsLeft = ref(props.data.secondsLeft ?? PHASE_DURATIONS.focus)
const running = ref(false)
const cyclesCompleted = ref(props.data.cyclesCompleted || 0)

const phaseLabel = computed(() => PHASE_LABELS[phase.value])
const phaseColor = computed(() => PHASE_COLORS[phase.value])

const formattedTime = computed(() => {
  const m = Math.floor(secondsLeft.value / 60)
    .toString()
    .padStart(2, '0')
  const s = (secondsLeft.value % 60).toString().padStart(2, '0')
  return `${m}:${s}`
})

const RING_RADIUS = 44
const ringCircumference = 2 * Math.PI * RING_RADIUS
const ringOffset = computed(() => {
  const total = PHASE_DURATIONS[phase.value]
  const fraction = total > 0 ? secondsLeft.value / total : 0
  return ringCircumference * (1 - fraction)
})

let intervalId = null

function persist() {
  updateNodeData(props.id, {
    phase: phase.value,
    secondsLeft: secondsLeft.value,
    cyclesCompleted: cyclesCompleted.value
  })
}

function notifyPhaseChange(newPhase) {
  try {
    // Beep curto via Web Audio, sem precisar de arquivo de som embutido.
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = newPhase === 'focus' ? 660 : 440
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // ambiente sem suporte a áudio — segue só com a notificação visual
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('DUX — Pomodoro', { body: `${PHASE_LABELS[newPhase]} começou` })
  }
}

function advancePhase() {
  if (phase.value === 'focus') {
    cyclesCompleted.value += 1
    phase.value = cyclesCompleted.value % 4 === 0 ? 'longBreak' : 'break'
  } else {
    phase.value = 'focus'
  }
  secondsLeft.value = PHASE_DURATIONS[phase.value]
  notifyPhaseChange(phase.value)
  persist()
}

function tick() {
  if (secondsLeft.value <= 0) {
    advancePhase()
    return
  }
  secondsLeft.value -= 1
  persist()
}

function toggleRunning() {
  running.value = !running.value
  if (running.value) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    intervalId = setInterval(tick, 1000)
  } else {
    clearInterval(intervalId)
  }
}

function reset() {
  running.value = false
  clearInterval(intervalId)
  phase.value = 'focus'
  secondsLeft.value = PHASE_DURATIONS.focus
  cyclesCompleted.value = 0
  persist()
}

function skip() {
  advancePhase()
}

onMounted(() => {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission()
  }
})

onBeforeUnmount(() => {
  clearInterval(intervalId)
})
</script>

<style scoped>
.pomodoro-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.pomodoro-node.selected {
  border-color: var(--selected-color);
}

.pomodoro-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.pomodoro-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.pomodoro-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: 34px;
  padding: 0 10px;
  background: var(--color-bg-surface-alt);
  border-bottom: 1px solid var(--color-border);
  border-radius: 9px 9px 0 0;
  cursor: grab;
}

.pomodoro-header:active {
  cursor: grabbing;
}

.phase-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--phase-color);
  flex-shrink: 0;
}

.pomodoro-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.header-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.pomodoro-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border-radius: 0 0 9px 9px;
}

.phase-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ring-wrap {
  position: relative;
  width: 60%;
  max-width: 160px;
  aspect-ratio: 1;
}

.ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-track {
  stroke: var(--color-border);
}

.ring-progress {
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s linear;
}

.time-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--color-border-strong);
  border-radius: 50%;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.control-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.control-btn.primary {
  width: 38px;
  height: 38px;
  background: var(--phase-color);
  border-color: transparent;
  color: #fff;
}

.control-btn.primary:hover {
  filter: brightness(1.1);
}

.cycle-count {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 3px;
  box-sizing: border-box;
  color: var(--color-text-tertiary);
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.pomodoro-node:hover .resize-handle {
  opacity: 1;
}
</style>
