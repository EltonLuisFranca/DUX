<template>
  <div
    class="merlin-node"
    :class="[selected ? 'selected' : '', `state-${state}`]"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px' }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @contextmenu.prevent="menuOpen = true"
  >
    <Handle id="left" type="target" :position="Position.Left" class="merlin-handle" :class="{ connected: isLeftConnected }" />
    <Handle id="right" type="source" :position="Position.Right" class="merlin-handle" :class="{ connected: isRightConnected }" />

    <div v-if="menuOpen" class="context-menu nodrag" @click.stop>
      <button class="menu-item" @click="openSettings">
        <GearIcon />
        Configurações
      </button>
      <button class="menu-item menu-danger" @click="handleDelete">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path
            d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M5 4.5l.5 8a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.5-8"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
        Excluir
      </button>
    </div>

    <div class="ring-wrap nodrag nowheel nopan" :title="ringTitle" @click="toggleMic">
      <canvas ref="canvasEl" class="ring-canvas"></canvas>
    </div>

    <div class="merlin-caption nodrag nowheel nopan">
      <p v-if="errorText" class="caption-line caption-error">{{ errorText }}</p>
      <p v-else-if="displayText" class="caption-line">{{ displayText }}</p>
      <p v-else class="caption-line caption-hint">{{ hintText }}</p>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import { toggleNodeSettings, updateNodeData, requestDeleteNode } from '../store/flowStore'
import { streamChat } from '../lib/ollamaClient'
import { DEFAULT_MERLIN_SYSTEM_PROMPT, matchWakeWord } from '../lib/merlinPrompt'
import { pendingVoiceInput, consumePendingVoiceInput, startRecording, cancelRecording, waveLevels } from '../store/voiceStore'
import { speak, isSpeaking, stopSpeaking } from '../store/ttsStore'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'

// mantém só as últimas N mensagens (user+assistant) no histórico enviado ao
// modelo — o Merlin é feito pra troca curta e contínua por voz, não pra reter
// uma conversa inteira; sem isso o prompt cresceria sem limite a cada troca.
const MAX_HISTORY = 16

const STATE_COLORS = {
  off: [100, 116, 139],
  passive: [34, 211, 238],
  active: [96, 165, 250],
  thinking: [167, 139, 250],
  speaking: [232, 121, 249]
}

// passive/active são os estados "ligados no áudio": em vez de uma cor fixa,
// cada partícula pega um tom entre esses dois conforme sua altura no anel
// (topo mais claro, base mais profunda) — degradê espacial, não uma troca
// no tempo, e sempre dentro do mesmo tom de azul (nada de roxo/verde/etc).
const AUDIO_BLUE_TOP = [147, 219, 255]
const AUDIO_BLUE_BOTTOM = [22, 78, 189]

// enquanto o Merlin fala a resposta (TTS tocando), o mesmo degradê espacial
// muda pra tons de laranja — reforça visualmente "agora é ele falando", bem
// diferente do azul de "estou ouvindo você".
const SPEAKING_ORANGE_TOP = [255, 200, 140]
const SPEAKING_ORANGE_BOTTOM = [214, 96, 20]

const GRADIENT_BY_STATE = {
  passive: [AUDIO_BLUE_TOP, AUDIO_BLUE_BOTTOM],
  active: [AUDIO_BLUE_TOP, AUDIO_BLUE_BOTTOM],
  speaking: [SPEAKING_ORANGE_TOP, SPEAKING_ORANGE_BOTTOM]
}

function lerpColor(c0, c1, t) {
  return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]
}

// mistura na direção do branco — usado tanto pro brilho de hover quanto pro
// brilho reagindo ao volume, sem nunca desviar de tom (só clareia/escurece).
function brighten(c, amount) {
  return [c[0] + (255 - c[0]) * amount, c[1] + (255 - c[1]) * amount, c[2] + (255 - c[2]) * amount]
}

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

// Sem título/engrenagem/toolbar visíveis (pedido: só as partículas) —
// configurações e exclusão ficam atrás do botão direito, e a cor só reage
// ao hover do mouse, não mais à seleção.
const isHovered = ref(false)
const menuOpen = ref(false)

function openSettings() {
  menuOpen.value = false
  toggleNodeSettings(props.id)
}

function handleDelete() {
  menuOpen.value = false
  requestDeleteNode(props.id)
}

function closeMenuOnOutsideEvent(event) {
  if (event.key === 'Escape' || event.type === 'mousedown') menuOpen.value = false
}

watch(menuOpen, (open) => {
  if (open) {
    window.addEventListener('mousedown', closeMenuOnOutsideEvent, { capture: true })
    window.addEventListener('keydown', closeMenuOnOutsideEvent)
  } else {
    window.removeEventListener('mousedown', closeMenuOnOutsideEvent, { capture: true })
    window.removeEventListener('keydown', closeMenuOnOutsideEvent)
  }
})

const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')

const { nodeWidth, nodeHeight, startResize } = useNodeResize(props, {
  minWidth: 220,
  minHeight: 300,
  defaultWidth: 300,
  defaultHeight: 380
})

// off: mic desligado, nada acontece. passive: ouvindo em segundo plano só
// pra reconhecer a wake word "Merlin", nunca envia nada pro modelo sozinho.
// active: wake word detectada, capturando o pedido. thinking: esperando
// resposta do modelo. speaking: tocando a resposta em voz alta (mic
// desligado nesse meio tempo, pra não se ouvir).
const state = ref('off')
const passiveBuffer = ref('')
const commandBuffer = ref('')
const captionText = ref('')
const errorText = ref('')
let abortController = null
let stopVoiceWatch = null

const displayText = computed(() => captionText.value)

const hintText = computed(() => {
  switch (state.value) {
    case 'off':
      return 'Clique para ativar o Merlin'
    case 'passive':
      return 'Diga "Merlin" para chamar'
    case 'thinking':
      return 'Pensando...'
    default:
      return ''
  }
})

const ringTitle = computed(() => (state.value === 'off' ? 'Ativar microfone' : 'Clique para desativar'))

// --- ciclo de escuta / wake word ---------------------------------------

async function toggleMic() {
  if (state.value === 'off') {
    await enableListening()
  } else {
    disableListening()
  }
}

async function enableListening() {
  errorText.value = ''
  passiveBuffer.value = ''
  commandBuffer.value = ''
  captionText.value = ''
  try {
    await startRecording(props.id)
    state.value = 'passive'
  } catch (err) {
    console.error('[merlin] falha ao acessar microfone', err)
    errorText.value = 'Não foi possível acessar o microfone.'
    state.value = 'off'
  }
}

function disableListening() {
  abortController?.abort()
  abortController = null
  stopSpeaking()
  cancelRecording()
  state.value = 'off'
  passiveBuffer.value = ''
  commandBuffer.value = ''
}

function handleVoiceSignal(pending) {
  if (state.value === 'passive') {
    if (pending.text) {
      passiveBuffer.value += pending.text
      const remainder = matchWakeWord(passiveBuffer.value)
      if (remainder !== null) {
        passiveBuffer.value = ''
        state.value = 'active'
        commandBuffer.value = remainder ? `${remainder} ` : ''
        captionText.value = remainder
      }
    }
    // silêncio longo sem wake word: só reseta o buffer, continua ouvindo em
    // segundo plano — não é pra acontecer nada sozinho sem "Merlin".
    if (pending.sendEnter) passiveBuffer.value = ''
    return
  }

  if (state.value === 'active') {
    if (pending.text) {
      commandBuffer.value += pending.text
      captionText.value = commandBuffer.value.trim()
    }
    if (pending.sendEnter) {
      const query = commandBuffer.value.trim()
      commandBuffer.value = ''
      // mic desliga já aqui, antes de chamar o modelo — evita captar a
      // própria voz do Merlin quando a resposta for falada.
      cancelRecording()
      if (query) {
        submitQuery(query)
      } else {
        // disse "Merlin" e não completou o pedido — volta a ouvir em
        // segundo plano em vez de ficar preso esperando pra sempre.
        state.value = 'passive'
        startRecording(props.id).catch(() => {})
      }
    }
    return
  }
}

async function submitQuery(query) {
  state.value = 'thinking'
  errorText.value = ''
  captionText.value = query

  const systemPrompt = props.data.systemPrompt || DEFAULT_MERLIN_SYSTEM_PROMPT
  const history = [...(props.data.messages || []), { role: 'user', content: query }]
  updateNodeData(props.id, { messages: history.slice(-MAX_HISTORY) })

  abortController = new AbortController()
  let fullText = ''
  try {
    const host = (props.data.host || 'http://localhost:11434').replace(/\/+$/, '')
    await streamChat({
      host,
      token: props.data.token,
      model: props.data.model,
      api: props.data.api,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      signal: abortController.signal,
      onToken: (chunk) => {
        fullText += chunk
        captionText.value = fullText
      }
    })

    const finalHistory = [...history, { role: 'assistant', content: fullText }].slice(-MAX_HISTORY)
    updateNodeData(props.id, { messages: finalHistory })
    captionText.value = fullText.trim()
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[merlin] falha ao conversar com o modelo', err)
      errorText.value = `Erro ao conectar com ${props.data.host}. O Ollama está rodando?`
    }
  } finally {
    abortController = null
  }

  if (state.value === 'off') return // usuário desativou enquanto pensava

  if (fullText.trim() && (props.data.voiceOutputEnabled ?? true)) {
    await speakResponse(fullText.trim())
  }

  if (state.value === 'off') return // usuário desativou enquanto falava
  state.value = 'passive'
  startRecording(props.id).catch(() => {})
}

function waitForSpeechEnd() {
  if (!isSpeaking.value) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = watch(isSpeaking, (speaking) => {
      if (!speaking) {
        stop()
        resolve()
      }
    })
  })
}

async function speakResponse(text) {
  state.value = 'speaking'
  await speak(text, { forceSpeak: true })
  await waitForSpeechEnd()
}

stopVoiceWatch = watch(pendingVoiceInput, (pending) => {
  if (!pending || pending.terminalId !== props.id) return
  handleVoiceSignal(pending)
  consumePendingVoiceInput()
})

// --- animação do anel de partículas -------------------------------------

const canvasEl = ref(null)
const PARTICLE_COUNT = 1100
// duas partículas mais próximas do que isso (em fração do tamanho do
// canvas) ganham uma linha entre elas — o resto do efeito "rede neural" é
// só isso: nada de grafo/vizinhança pré-computada, é reavaliado a cada frame
// com a posição atual de cada uma.
const CONNECT_DISTANCE_RATIO = 0.075
// só uma fração das partículas participa da malha de linhas — o resto fica
// sempre solto, pra não virar uma teia cobrindo o anel inteiro.
const CONNECTABLE_RATIO = 0.15

// eleva um valor uniforme (-1..1) a uma potência preservando o sinal —
// como |x|<1, isso empurra a maioria dos valores pra perto de zero e deixa
// só uma cauda mais rara perto de -1/1: distribuição concentrada no centro
// em vez de uniforme, sem cortar o alcance máximo do jitter.
function centeredRandom(power) {
  const x = Math.random() * 2 - 1
  return Math.sign(x) * Math.abs(x) ** power
}

// uma minoria bem pequena "escapa" da linha — cada uma pousa num raio
// aleatório independente (não numa faixa compartilhada, senão elas mesmas
// formam um segundo anel visível), espalhada livremente por dentro do
// círculo ou bem por fora dele. Não entram na malha de linhas.
const STRAY_RATIO = 0.05
const particles = Array.from({ length: PARTICLE_COUNT }, () => {
  const stray = Math.random() < STRAY_RATIO
  // fração de baseR: 0–0.8 pousa em qualquer raio dentro do círculo,
  // 1.2–2.2 pousa espalhada bem além do anel — cada partícula sorteia a
  // sua própria posição dentro dessas faixas, sem faixa comum entre elas.
  const strayRadiusFrac = stray ? (Math.random() < 0.5 ? Math.random() * 0.8 : 1.2 + Math.random() * 1) : 0
  return {
    angle: Math.random() * Math.PI * 2,
    radiusJitter: centeredRandom(2.4),
    stray,
    strayRadiusFrac,
    sizeBase: 0.35 + Math.random() * 2.35,
    speed: 0.6 + Math.random() * 1.8,
    phase: Math.random() * Math.PI * 2,
    connectable: !stray && Math.random() < CONNECTABLE_RATIO
  }
})

let ctx = null
let dpr = 1
let size = 0
let resizeObserver = null
let rafId = null
let lastTs = 0
let clock = 0
let rotationAngle = 0

function avgWaveLevel() {
  const levels = waveLevels.value
  if (!levels.length) return 0
  let sum = 0
  for (const level of levels) sum += level
  return sum / levels.length
}

// mesma ideia do waveform em VoiceInputBadge.vue, só que "dobrada" numa
// circunferência em vez de uma barra reta: cada ângulo ao redor do anel
// amostra (com interpolação) um ponto do waveLevels real — é isso que cria
// picos desiguais ao redor do círculo em vez de todo mundo respirar junto.
function sampleWaveAtAngle(angle) {
  const levels = waveLevels.value
  const n = levels.length
  if (!n) return 0
  const norm = (((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)
  const idx = norm * n
  const i0 = Math.floor(idx) % n
  const i1 = (i0 + 1) % n
  const frac = idx - Math.floor(idx)
  return levels[i0] + (levels[i1] - levels[i0]) * frac
}

function ampAndRotationSpeed() {
  switch (state.value) {
    // passivo já está com o mic ligado (só não manda nada sem a wake word) —
    // usa o volume real captado pra reagir a qualquer som, não só depois de
    // "Merlin" ser reconhecido; sem som, sobra só a respiração base.
    case 'passive': {
      const level = Math.min(1, avgWaveLevel() * 1.4)
      return { amp: 0.06 + 0.03 * Math.sin(clock * 0.9) + level * 0.85, rot: 0.08 + level * 0.35 }
    }
    case 'active': {
      const level = Math.min(1, avgWaveLevel() * 1.3)
      return { amp: Math.max(0.12, level), rot: 0.15 + level * 0.5 }
    }
    case 'thinking':
      return { amp: 0.3 + 0.18 * Math.sin(clock * 4), rot: 0.7 }
    case 'speaking':
      return { amp: 0.32 + 0.3 * Math.abs(Math.sin(clock * 7)), rot: 0.25 }
    default:
      return { amp: 0.04 + 0.02 * Math.sin(clock * 0.6), rot: 0.04 }
  }
}

function draw() {
  if (!ctx || !size) return
  const { amp } = ampAndRotationSpeed()
  const isAudioState = state.value === 'passive' || state.value === 'active'
  const gradient = GRADIENT_BY_STATE[state.value] || null
  const flatColor = STATE_COLORS[state.value] || STATE_COLORS.off
  const cx = size / 2
  const cy = size / 2
  const baseR = size * 0.32
  const thickness = size * 0.045

  // sem título/borda pra indicar estado, o hover é o único feedback visual
  // de "isso aqui é interativo" — cor clareia e fica mais intensa; nos
  // estados com degradê (ouvindo ou falando), o nível de amp clareia junto
  // (mesmo tom, só mais brilhante), reforçando que é o áudio "acendendo" o anel.
  const hovered = isHovered.value
  const brightAmount = Math.min(0.7, (hovered ? 0.3 : 0) + (gradient ? amp * 0.15 : 0))
  const alphaBoost = hovered ? 1.5 : 1
  const sizeBoost = hovered ? 1.2 : 1

  ctx.clearRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'lighter'

  // raios tipo "equalizador circular" — em vez de deslocar cada partícula
  // (isso já foi tentado e destruía o contorno do círculo), desenha traços
  // curtos em posições fixas ao redor do anel, cujo comprimento é o
  // waveform real amostrado naquele ângulo. O círculo de partículas continua
  // estável por baixo; só esses raios "respiram" com a voz.
  if (isAudioState) {
    const RAY_COUNT = 280
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(0.4, size * 0.0014)
    for (let i = 0; i < RAY_COUNT; i++) {
      const rayAngle = (i / RAY_COUNT) * Math.PI * 2 + rotationAngle
      const level = sampleWaveAtAngle(rayAngle)
      const rayLen = size * 0.006 + level * size * 0.09
      const innerR = baseR - thickness * 0.4
      const outerR = innerR + rayLen
      const midY = cy + Math.sin(rayAngle) * ((innerR + outerR) / 2)
      const t = Math.min(1, Math.max(0, midY / size))
      const [rr, rg, rb] = brighten(lerpColor(AUDIO_BLUE_TOP, AUDIO_BLUE_BOTTOM, t), brightAmount)
      const rayAlpha = Math.min(0.7, 0.12 + level * 0.5)
      ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${rayAlpha.toFixed(3)})`
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(rayAngle) * innerR, cy + Math.sin(rayAngle) * innerR)
      ctx.lineTo(cx + Math.cos(rayAngle) * outerR, cy + Math.sin(rayAngle) * outerR)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
  }

  // posição (e cor) de cada partícula computada uma vez, reusada tanto pras
  // linhas quanto pros pontos. Nos estados de áudio a cor é um degradê pela
  // altura (y) da partícula no anel — topo mais claro, base mais funda —
  // em vez de uma cor só; fora deles é a cor fixa do estado, como antes.
  const connectablePositions = []
  const positions = particles.map((p) => {
    const angle = p.angle + rotationAngle
    const wobble = Math.sin(clock * p.speed + p.phase)
    const radius = p.stray
      ? baseR * p.strayRadiusFrac + wobble * thickness * 0.3
      : baseR + p.radiusJitter * thickness + wobble * thickness * (0.35 + amp * 0.3)
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    const t = gradient ? Math.min(1, Math.max(0, y / size)) : 0
    const color = brighten(gradient ? lerpColor(gradient[0], gradient[1], t) : flatColor, brightAmount)
    const pos = { x, y, sizeBase: p.sizeBase, color }
    if (p.connectable) connectablePositions.push(pos)
    return pos
  })

  // linhas primeiro (ficam atrás dos pontos) — só entre pares realmente
  // próximos e só entre partículas marcadas "connectable" (~metade delas),
  // então o custo real é bem menor que N² apesar do loop duplo: a maioria
  // dos pares está espalhada pelo anel e sai no continue cedo.
  const maxDist = size * CONNECT_DISTANCE_RATIO
  const maxDistSq = maxDist * maxDist
  ctx.lineWidth = Math.max(0.5, size * 0.0018)
  for (let i = 0; i < connectablePositions.length; i++) {
    const a = connectablePositions[i]
    for (let j = i + 1; j < connectablePositions.length; j++) {
      const b2 = connectablePositions[j]
      const dx = a.x - b2.x
      const dy = a.y - b2.y
      const distSq = dx * dx + dy * dy
      if (distSq > maxDistSq) continue
      const proximity = 1 - Math.sqrt(distSq) / maxDist
      const lineAlpha = proximity * proximity * 0.55 * alphaBoost
      if (lineAlpha < 0.02) continue
      const [lr, lg, lb] = lerpColor(a.color, b2.color, 0.5)
      ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${lineAlpha.toFixed(3)})`
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b2.x, b2.y)
      ctx.stroke()
    }
  }

  for (const pos of positions) {
    const [r, g, b] = pos.color
    const px = pos.sizeBase * (0.7 + amp * 1.6) * sizeBoost
    const alpha = Math.min(1, (0.25 + amp * 0.75) * (0.5 + pos.sizeBase / 2.4) * alphaBoost)

    ctx.beginPath()
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
    ctx.shadowBlur = px * 3
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * 1.2).toFixed(3)})`
    ctx.arc(pos.x, pos.y, px, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.shadowBlur = 0
  drawFace(cx, cy, gradient, flatColor, brightAmount)
  ctx.globalCompositeOperation = 'source-over'
}

function inEllipse(px, py, ex, ey, rx, ry) {
  const dx = (px - ex) / rx
  const dy = (py - ey) / ry
  return dx * dx + dy * dy < 1
}

// hash bem simples — sem precisar guardar estado por célula, dá um caractere
// "aleatório" estável por (linha, coluna) que só troca quando `tick` muda,
// criando o efeito de dígitos piscando aos poucos (tipo Matrix) sem virar
// ruído ilegível a 60fps.
function faceChar(row, col, tick) {
  const h = (row * 928371 + col * 123457 + tick * 39916801) >>> 0
  return h % 2 === 0 ? '1' : '0'
}

// rosto feito de 0s e 1s, no vazio no centro do anel — contorno oval, dois
// "furos" ovais pros olhos, e uma faixa embaixo pra boca que só se abre de
// verdade (cresce pra baixo) enquanto o Merlin está no estado "falando";
// fora disso fica como uma linha fina fechada. Deriva bem devagar (drift)
// pra não ficar estático, mas sem se afastar muito do centro.
function drawFace(cx, cy, gradient, flatColor, brightAmount) {
  const isSpeakingNow = state.value === 'speaking'
  const mouthOpen = isSpeakingNow ? Math.abs(Math.sin(clock * 9)) : 0

  const driftX = Math.sin(clock * 0.17) * size * 0.012
  const driftY = Math.cos(clock * 0.13) * size * 0.009
  const faceCx = cx + driftX
  const faceCy = cy + driftY

  const faceW = size * 0.36
  const faceH = size * 0.44
  const cols = 18
  const rows = 22
  const cellH = faceH / rows
  const tick = Math.floor(clock * 2.5)

  ctx.shadowBlur = 0
  ctx.font = `${Math.max(6, cellH * 0.95).toFixed(1)}px "Menlo", "Consolas", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const mouthTop = 0.32
  const mouthBottom = mouthTop + 0.08 + mouthOpen * 0.35

  for (let row = 0; row < rows; row++) {
    const ny = (row / (rows - 1)) * 2 - 1
    for (let col = 0; col < cols; col++) {
      const nx = (col / (cols - 1)) * 2 - 1

      if (nx * nx + (ny / 1.12) ** 2 > 1) continue // fora do contorno oval do rosto
      if (inEllipse(nx, ny, 0.35, -0.15, 0.16, 0.12) || inEllipse(nx, ny, -0.35, -0.15, 0.16, 0.12)) continue // olhos
      if (ny > mouthTop && ny < mouthBottom && Math.abs(nx) < 0.34) continue // boca

      const px = faceCx + nx * (faceW / 2)
      const py = faceCy + ny * (faceH / 2)
      const t = Math.min(1, Math.max(0, (ny + 1) / 2))
      const [r, g, b] = brighten(gradient ? lerpColor(gradient[0], gradient[1], t) : flatColor, Math.min(0.85, brightAmount + 0.1))
      const alpha = 0.3 + (1 - Math.min(1, Math.abs(nx * ny) * 2)) * 0.3
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
      ctx.fillText(faceChar(row, col, tick), px, py)
    }
  }
}

function frame(ts) {
  if (!lastTs) lastTs = ts
  const dt = Math.min(0.05, (ts - lastTs) / 1000)
  lastTs = ts
  clock += dt
  rotationAngle += ampAndRotationSpeed().rot * dt
  draw()
  rafId = requestAnimationFrame(frame)
}

function resizeCanvas() {
  const wrap = canvasEl.value?.parentElement
  if (!wrap || !canvasEl.value) return
  const rect = wrap.getBoundingClientRect()
  size = Math.min(rect.width, rect.height)
  dpr = window.devicePixelRatio || 1
  canvasEl.value.width = size * dpr
  canvasEl.value.height = size * dpr
  canvasEl.value.style.width = `${size}px`
  canvasEl.value.style.height = `${size}px`
  ctx = canvasEl.value.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

onMounted(() => {
  nextTick(() => {
    resizeCanvas()
    resizeObserver = new ResizeObserver(resizeCanvas)
    if (canvasEl.value?.parentElement) resizeObserver.observe(canvasEl.value.parentElement)
    rafId = requestAnimationFrame(frame)
  })
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
  stopVoiceWatch?.()
  abortController?.abort()
  stopSpeaking()
  cancelRecording()
  window.removeEventListener('mousedown', closeMenuOnOutsideEvent, { capture: true })
  window.removeEventListener('keydown', closeMenuOnOutsideEvent)
})
</script>

<style scoped>
.merlin-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: transparent;
  border: none;
}

.merlin-handle {
  width: 8px;
  height: 8px;
  opacity: 0;
}

.context-menu {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: 0 4px 16px var(--color-shadow);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11.5px;
  white-space: nowrap;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.menu-danger:hover {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.ring-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
}

.ring-canvas {
  display: block;
}

.merlin-caption {
  flex-shrink: 0;
  min-height: 44px;
  max-height: 96px;
  overflow-y: auto;
  padding: 10px 16px 14px;
  text-align: center;
}

.caption-line {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--color-text-primary);
  word-break: break-word;
}

.caption-hint {
  color: var(--color-text-tertiary);
  font-size: 11.5px;
}

.caption-error {
  color: #ff6b6b;
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

.merlin-node:hover .resize-handle {
  opacity: 1;
}
</style>
