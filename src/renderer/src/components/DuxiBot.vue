<template>
  <div class="duxi-bot nodrag nowheel nopan" :class="[`phase-${duxiPhase}`, { engaged: duxiEngaged }]">
    <AppTooltip :label="micTitle" placement="bottom">
      <div
        class="face-wrap"
        @click="toggleDuxiMic"
        @pointerdown="onFacePointerDown"
        @contextmenu.prevent="openSettings('duxi')"
      >
        <canvas ref="canvasEl" class="face-canvas"></canvas>
        <!-- desligada = cochilando: "zZz" subindo do canto de cima da cabeça -->
        <Transition name="zzz-fade">
          <div v-if="duxiState === 'off'" class="zzz" aria-hidden="true">
            <span>z</span>
            <span>z</span>
            <span>Z</span>
          </div>
        </Transition>
      </div>
    </AppTooltip>

    <Transition name="text-in">
      <div v-if="duxiPhase === 'text'" class="duxi-col">
        <div v-if="duxiHistoryOpen" ref="historyEl" class="duxi-text duxi-history">
          <p v-if="!historyLog.length" class="line line-empty">Nenhuma conversa ainda.</p>
          <template v-for="(msg, i) in historyLog" :key="i">
            <p v-if="msg.role === 'user'" class="line line-user line-wrap" :class="{ 'turn-start': i > 0 }">{{ msg.content }}</p>
            <p v-else class="line line-reply line-history">{{ msg.content }}</p>
          </template>
        </div>
        <div v-else class="duxi-text">
          <p v-if="userText" class="line line-user">{{ userText }}</p>
          <p v-if="errorText" class="line line-error">{{ errorText }}</p>
          <p v-else-if="replyText" ref="replyEl" class="line line-reply">{{ replyText }}</p>
          <div v-if="pendingChoice" class="line-options">
            <button
              v-for="opt in pendingChoice.options"
              :key="opt.id"
              class="option-btn"
              @click.stop="chooseDuxiOption(opt.id)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <!-- digitação (ícone de teclado na barra): pedido escrito em vez de falado -->
        <Transition name="input-in" appear>
          <form v-if="duxiTypingOpen" class="duxi-input" :class="{ busy: duxiBusy }" @submit.prevent="sendTyped">
            <div class="duxi-input-row">
              <textarea
                ref="inputEl"
                v-model="typedText"
                class="duxi-textarea"
                rows="1"
                :placeholder="inputPlaceholder"
                @input="autoGrow"
                @keydown="onInputKeydown"
              ></textarea>
              <AppTooltip :label="duxiBusy ? 'Parar resposta' : 'Enviar (Enter)'" placement="bottom">
                <button
                  v-if="duxiBusy"
                  class="duxi-send stop"
                  type="button"
                  @click="stopDuxiReply"
                >
                  <svg viewBox="0 0 16 16" width="10" height="10"><rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" /></svg>
                </button>
                <button v-else class="duxi-send" type="submit" :disabled="!typedText.trim()">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
                  </svg>
                </button>
              </AppTooltip>
            </div>
            <div class="duxi-input-hint">
              <span v-if="duxiBusy" class="hint-status">
                <span class="hint-dot" />{{ duxiState === 'thinking' ? 'Duxi está pensando…' : 'Duxi está respondendo…' }}
              </span>
              <span v-else-if="duxiMicUnavailable" class="hint-status warn">Microfone indisponível</span>
              <span class="hint-keys">
                <kbd>Enter</kbd> envia <span class="hint-sep">·</span> <kbd>Shift</kbd>+<kbd>Enter</kbd> nova linha
                <span class="hint-sep">·</span> <kbd>Esc</kbd> fecha
              </span>
            </div>
          </form>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppTooltip from './AppTooltip.vue'
import { waveLevels } from '../store/voiceStore'
import { getCurrentAudioTime } from '../store/ttsStore'
import { visemeAt } from '../store/visemeStore'
import { openSettings } from '../store/themeStore'
import {
  drawHand,
  drawStarEyes,
  spawnConfetti,
  stepConfetti,
  drawXEyes,
  drawSweatDrop,
  lensX,
  drawLens,
  drawWritingHand,
  drawQuestionMark,
  drawGum,
  GUM_POP_AT,
  drawWhistle,
  drawNapMarks
} from '../lib/duxiFaceExtras'
import {
  duxiState,
  duxiConfig,
  duxiPhase,
  duxiEngaged,
  hearingVoice,
  duxiLastHitAt,
  duxiDizzyUntil,
  duxiRage,
  duxiGreetAt,
  duxiReaction,
  userText,
  replyText,
  errorText,
  pendingChoice,
  duxiHistoryOpen,
  duxiTypingOpen,
  duxiMicUnavailable,
  toggleDuxiTyping,
  submitDuxiText,
  stopDuxiReply,
  chooseDuxiOption,
  toggleDuxiMic
} from '../store/duxiStore'

// Só a parte visual da Duxi (rosto + texto da última troca), montada dentro
// da barra do topo (ZoomControls). O cérebro — mic, modelo, voz — é um
// singleton em duxiStore.js, então este componente pode ser montado e
// desmontado (troca de workspace) sem perder a conversa.

// resposta aparece inteira (quebrando linha); se passar da altura máxima vira
// rolagem — e acompanha o fim enquanto o texto chega em streaming
const replyEl = ref(null)
watch(replyText, () => {
  nextTick(() => {
    const el = replyEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
})

// histórico: abre já no fim (conversa mais recente) — scroll pra cima volta
// no tempo
const historyEl = ref(null)
const historyLog = computed(() => duxiConfig.value.log || [])
watch(
  [duxiHistoryOpen, () => historyLog.value.length],
  () => {
    nextTick(() => {
      const el = historyEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
  { flush: 'post', immediate: true }
)

// --- digitação
const inputEl = ref(null)
const typedText = ref('')
const duxiBusy = computed(() => duxiState.value === 'thinking' || duxiState.value === 'speaking')
const inputPlaceholder = computed(() =>
  duxiMicUnavailable.value ? 'Escreva pra Duxi…' : 'Escreva pra Duxi… (ou só fale)'
)
// cresce com o texto até ~4 linhas, depois rola
const INPUT_MAX_HEIGHT = 84
// ↑ com o campo vazio traz de volta o último pedido digitado (corrigir/repetir)
let lastSent = ''

function autoGrow() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT)}px`
  el.style.overflowY = el.scrollHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
}

function focusInput() {
  nextTick(() => {
    inputEl.value?.focus()
    autoGrow()
  })
}

function sendTyped() {
  // ocupada: o rascunho fica no campo, só não envia ainda
  if (duxiBusy.value) return
  const text = typedText.value
  if (submitDuxiText(text)) {
    lastSent = text.trim()
    typedText.value = ''
    nextTick(autoGrow)
  }
}

function onInputKeydown(event) {
  // isComposing: Enter que confirma acento/IME não envia
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    sendTyped()
  } else if (event.key === 'Escape') {
    event.stopPropagation()
    toggleDuxiTyping()
  } else if (event.key === 'ArrowUp' && !typedText.value && lastSent) {
    event.preventDefault()
    typedText.value = lastSent
    nextTick(() => {
      autoGrow()
      const el = inputEl.value
      el?.setSelectionRange(el.value.length, el.value.length)
    })
  }
}

watch(duxiTypingOpen, (open) => open && focusInput())

const micTitle = computed(() =>
  duxiState.value === 'off'
    ? duxiConfig.value.wakeWordEnabled
      ? 'Ativar Duxi — ou diga "Duxi" (botão direito: configurações)'
      : 'Ativar Duxi (botão direito: configurações)'
    : duxiConfig.value.wakeWordEnabled
      ? 'Desativar Duxi — ou diga "descansar Duxi"'
      : 'Desativar Duxi'
)

const canvasEl = ref(null)

let ctx = null
let dpr = 1
let cw = 0
let ch = 0
// O canvas transborda o .face-wrap em `pad` px de cada lado: os brilhos em
// volta do casco (neon falando, vermelho do impacto) passam da área do rosto
// e eram cortados na borda do canvas. O desenho continua nas coordenadas do
// wrap (cw x ch) — draw() só desloca a origem pra dentro da margem.
const GLOW_PAD_FRAC = 0.45 // fração da altura do wrap
let pad = 0
let resizeObserver = null
let rafId = null
let lastTs = 0
let clock = 0

// --- rosto da Duxi: painel desenhado 100% por código no canvas — depois
// de tentar sincronizar boca sobre foto/vídeo várias vezes (drift de câmera,
// a boca própria do vídeo brigando com o overlay, seam de recorte mesmo com
// feather), trocamos de estratégia: sem foto por baixo não tem "encaixe"
// nenhum pra desalinhar, é só forma geométrica. Estilo de referência: pacote
// de robô do usuário (segments(1)/ na raiz).

// abertura de boca (0..1) por código de visema do Rhubarb (A-H/X) — só usado
// no estado 'speaking'. Suavizado frame a frame (ver currentAperture em
// drawRobotFace) pra não saltar duro entre visemas.
const VISEME_APERTURE = {
  X: 0.05,
  A: 0.05,
  B: 0.25,
  G: 0.25,
  H: 0.25,
  C: 0.55,
  E: 0.55,
  F: 0.8,
  D: 1.0
}
let currentAperture = 0

function avgWaveLevel() {
  const levels = waveLevels.value
  if (!levels.length) return 0
  let sum = 0
  for (const level of levels) sum += level
  return sum / levels.length
}

function draw() {
  if (!ctx || !cw || !ch) return
  ctx.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr)
  ctx.clearRect(-pad, -pad, cw + pad * 2, ch + pad * 2)
  drawRobotFace()
}

// desenha um retângulo arredondado — Path2D.roundRect existe em navegadores
// recentes, mas o Electron empacotado pode rodar um Chromium mais velho;
// implementa na mão pra não depender disso.
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

// próxima piscada (clock-relativo) + quando a atual começou — estado
// persistente entre frames, igual currentAperture. Intervalo aleatório curto
// (1.5-5s) entre piscadas, cada uma bem rápida (140ms). Às vezes (~30%) a
// piscada vem dupla: uma segunda logo em seguida (DOUBLE_BLINK_GAP).
let nextBlinkAt = 1.5 + Math.random() * 2
let blinkStart = -1
let extraBlinksQueued = 0
const BLINK_DURATION = 0.14
const DOUBLE_BLINK_CHANCE = 0.3
const DOUBLE_BLINK_GAP = 0.09

// --- ociosa: ouvindo (passive) sem ninguém falar -----------------------------
// De tempos em tempos (intervalo aleatório, nunca no mesmo ritmo) faz uma
// "ação de ociosa", sorteada sem repetir as duas últimas:
// - coffee: a xícara entra pelo lado, sobe até a boca, gole de olhos fechados
// - gum: bolha de chiclete crescendo até estourar
// - peek: espia os cantos (barra de baixo, canvas), curiosa
// - whistle: assobia com notinhas subindo
// - stretch: mãozinhas pra cima, se esticando
// - nap: (só cansada) cabeceia de sono, acorda assustada e olha em volta
// Ociosa por muito tempo, vai ficando cansada/desanimada (pálpebras caídas,
// olhar pro chão, boquinha triste, suspiros) — café, cochilo ou qualquer fala
// reanima.
const IDLE_MIN_GAP = 18 // s
const IDLE_MAX_GAP = 45
const IDLE_ACTIONS = { coffee: 4.4, gum: 3.4, peek: 4.2, whistle: 4.4, stretch: 3.2, nap: 5.6 }
const COFFEE_DURATION = IDLE_ACTIONS.coffee
const TIRED_AFTER = 120 // s ociosa até começar a cansar
const TIRED_RAMP = 20 // s até ficar cansada de todo
const SIGH_DURATION = 1.6
let idleSince = null // clock em que ficou ociosa (null = não está)
let nextIdleAt = Infinity
let idleAction = null // { type, start }
let recentIdle = [] // últimas ações, pra não repetir
let tiredAmount = 0
let nextSighAt = Infinity
let sighStart = -1

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function pickIdleAction(tired) {
  const pool = tired > 0.5 ? ['coffee', 'nap', 'stretch'] : ['coffee', 'gum', 'peek', 'whistle', 'stretch']
  const fresh = pool.filter((type) => !recentIdle.includes(type))
  const choices = fresh.length ? fresh : pool
  const type = choices[Math.floor(Math.random() * choices.length)]
  recentIdle = [type, ...recentIdle].slice(0, 2)
  return type
}

// --- reações ao app (duxiReaction no store) + pergunta ambígua (pendingChoice)
let celebrateAmt = 0
let errorAmt = 0
let searchAmt = 0
let writeAmt = 0
let confusedAmt = 0
let confetti = []
let confettiFor = 0 // `at` da reação que já soltou confete

// --- arrastar: segurar e puxar estica o robô como gelatina; ao soltar ele
// volta com efeito de mola (passa do ponto e balança)
let dragStart = null // { x, y, moved } — pointerdown no rosto
let dragTarget = null // deslocamento do ponteiro (px) enquanto arrasta
let dragOff = { x: 0, y: 0 }
let dragVel = { x: 0, y: 0 }
let dragAmt = 0
let frameDt = 1 / 60
const DRAG_THRESHOLD = 5 // px até virar arrasto (abaixo disso é clique)

function onFacePointerDown(event) {
  if (event.button !== 0) return
  dragStart = { x: event.clientX, y: event.clientY, moved: false }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd, { once: true })
}

function onDragMove(event) {
  if (!dragStart) return
  const dx = event.clientX - dragStart.x
  const dy = event.clientY - dragStart.y
  if (!dragStart.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) dragStart.moved = true
  if (dragStart.moved) dragTarget = { x: dx, y: dy }
}

function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove)
  if (dragStart?.moved) {
    // o clique que o navegador dispara depois do pointerup não é "ligar/
    // desligar" (no rosto) nem batida (se soltou em cima da barra) — engole
    const swallow = (e) => {
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
  }
  dragStart = null
  dragTarget = null
}

// fase 0..1 de `t` dentro da janela [a, b], suavizada nas pontas
function window01(t, a, b) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

// olhar acompanhando o mouse: última posição do cursor na tela (clientX/Y,
// null até o primeiro movimento) e o deslocamento atual dos olhos (-1..1 em
// cada eixo), suavizado frame a frame em direção ao alvo.
let mouseClient = null
let lookX = 0
let lookY = 0

function trackMouse(event) {
  mouseClient = { x: event.clientX, y: event.clientY }
}

// alvo do olhar (-1..1) a partir da posição do mouse relativa ao centro do
// canvas NA TELA — getBoundingClientRect já inclui zoom/pan do vue-flow, então
// o alcance escala junto com o node. Satura (olhar no máximo) quando o cursor
// está a ~1.5 larguras do rosto de distância.
function lookTarget() {
  if (!mouseClient || !canvasEl.value) return { x: 0, y: 0 }
  const rect = canvasEl.value.getBoundingClientRect()
  if (!rect.width) return { x: 0, y: 0 }
  // o robô é pequeno (fica na barra) — alcance fixo em px de tela, senão o
  // olhar saturava com o cursor quase em cima dele
  const range = Math.max(rect.width * 1.5, 360)
  let nx = (mouseClient.x - (rect.left + rect.width / 2)) / range
  let ny = (mouseClient.y - (rect.top + rect.height / 2)) / range
  const len = Math.hypot(nx, ny)
  if (len > 1) {
    nx /= len
    ny /= len
  }
  return { x: nx, y: ny }
}

// painel: casco arredondado + olhos pretos (piscam e seguem o mouse) + boca
// preta (só falando, aberta conforme o visema atual) + ondas de áudio nas
// laterais — tudo formas geométricas desenhadas direto no ctx, nada de
// imagem/composição. Proporção inicial calibrada no pacote de referência do
// usuário (segments(1)/surprised-robot-face), depois alargada a pedido dele.
// Olhos/boca/ondas são dimensionados pela ALTURA do casco, então mexer só na
// largura não muda o tamanho/espaçamento deles.
//
// Cor do casco por estado (transição suave, ver accentAmount/replyMix/
// offAmount): branco em repouso com um degradê laranja bem leve embaixo;
// usuário falando = base do degradê em laranja sutil + ondas de áudio nas
// laterais; Duxi respondendo (pensando ou falando) = base do degradê em
// VERDE, com brilho, e sem ondas; cinza com olhos sonolentos (pálpebra
// caída) quando desligado.
//
// Por baixo, um reflexo espelhado (como se estivesse num chão espelhado):
// o mesmo rosto desenhado de novo, invertido no eixo Y em torno da linha do
// chão, com opacidade baixa e sumindo rápido num degradê pra baixo.
const REFLECTION_ALPHA = 0.16
const FLOOR_GAP = 0.01 // fração de boxH entre o casco e o reflexo
const REFLECTION_VISIBLE = 0.18 // quanto do reflexo aparece, fração de boxH
// espaço reservado de cada lado do casco (ondas de voz, mãos do tchau), fração de boxH
const WAVE_SIDE_ROOM = 0.32
const FACE_ASPECT = 1.457 // boxW / boxH

const SHELL_WHITE = [255, 255, 255]
const SHELL_GRAY = [150, 152, 158]

let accentAmount = 0 // intensidade do degradê/brilho
let replyMix = 0 // 0 = laranja (usuário), 1 = verde (Duxi respondendo)
let thinkAmount = 0 // 0..1, suavizado — olhar de "pensando" enquanto processa
let dizzyAmount = 0 // 0..1, suavizado — tonto depois da 3ª batida (ver hitDuxi)
const DIZZY_RED = '#ef4444'
// impacto acumulado (batidas com ela já tonta): casco tingido de vermelho
let rageAmount = 0
const SHELL_RAGE = [248, 113, 113]

// tchauzinho ao ser ativada: duas mãozinhas redondas soltas do lado do casco
// (sem braço, estilo Rayman), a direita levantada acenando
// ondas de voz: enquanto o usuário fala, contornos no formato do casco saem
// do corpo inteiro e se expandem sumindo (sonar) — mais frequentes e fortes
// quanto mais alto. Substituiu os arcos "((( )))" dos lados, que pareciam
// orelhas.
const RIPPLE_LIFE = 1.1 // s
const RIPPLE_GROW = 0.32 // quanto cresce até sumir, fração de boxH
let ripples = [] // { born, strength } — born no relógio `clock`
let lastRippleAt = -Infinity
let voiceLevel = 0 // waveLevel suavizado, pro casco "respirar" com a voz

const GREET_MS = 2000 // duração do aceno com as mãos
// o aceno vem um pouco depois da onda de partículas da ativação (DuxiTopBar)
// — primeiro o "brilho" com olhinhos felizes, depois o tchau
const GREET_DELAY_MS = 2000
const BURST_HAPPY_MS = 1600 // olhinhos felizes durante a onda de partículas
const GREET_POP_MS = 260
const GREET_FADE_MS = 350

// 0..1 com um leve overshoot no fim — as mãos "saltam" pra fora
function easeOutBack(t) {
  const c = 1.9
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

// --- desenhos do estado "tonto" (referência mandada pelo usuário: olhos em
// espiral, estrelinhas, símbolo de raiva, risquinhos de estresse, boca ondulada)

function drawSpiral(c, x, y, r, rotation) {
  const turns = 2.6
  const steps = 60
  c.beginPath()
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = rotation + t * turns * Math.PI * 2
    const rr = r * t
    const px = x + Math.cos(a) * rr
    const py = y + Math.sin(a) * rr
    if (i === 0) c.moveTo(px, py)
    else c.lineTo(px, py)
  }
  c.stroke()
}

function drawStar(c, x, y, r) {
  c.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.45
    const px = x + Math.cos(a) * rr
    const py = y + Math.sin(a) * rr
    if (i === 0) c.moveTo(px, py)
    else c.lineTo(px, py)
  }
  c.closePath()
  c.fill()
}

// 💢: quatro cantinhos curvos apontando pro centro
function drawAngerVein(c, x, y, s) {
  for (let k = 0; k < 4; k++) {
    c.save()
    c.translate(x, y)
    c.rotate((k * Math.PI) / 2)
    c.beginPath()
    c.moveTo(s * 0.18, s * 0.75)
    c.quadraticCurveTo(s * 0.18, s * 0.18, s * 0.75, s * 0.18)
    c.stroke()
    c.restore()
  }
}

function drawWavyMouth(c, x, y, w, amp) {
  const waves = 3
  const steps = 40
  c.beginPath()
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const px = x - w / 2 + t * w
    const py = y - Math.sin(t * waves * Math.PI * 2) * amp
    if (i === 0) c.moveTo(px, py)
    else c.lineTo(px, py)
  }
  c.stroke()
}
const ACCENT_ORANGE = [255, 140, 40]
const ACCENT_GREEN = [60, 214, 120]
let offAmount = 1 // começa desligado

function mixColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function rgb(c, alpha = 1) {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`
}

function drawRobotFace() {
  ctx.globalCompositeOperation = 'source-over'

  // encaixa o bloco inteiro (casco + ondas dos lados + reflexo embaixo) no
  // canvas, que ocupa o node todo — sem sobra de "padding" em volta
  const blockHFactor = 1 + FLOOR_GAP + REFLECTION_VISIBLE
  const blockWFactor = FACE_ASPECT + WAVE_SIDE_ROOM * 2
  const boxH = Math.min((ch * 0.96) / blockHFactor, (cw * 0.98) / blockWFactor)
  const boxW = boxH * FACE_ASPECT
  const cx = cw / 2
  const oy = (ch - boxH * blockHFactor) / 2
  const ox = cx - boxW / 2
  const cy = oy + boxH / 2
  const radius = boxH * 0.42

  // --- estado (atualizado UMA vez por frame, antes de pintar rosto + reflexo)

  const isOff = duxiState.value === 'off'
  // usuário falando: laranja sutil, já a partir do primeiro som captado
  // (hearingVoice), sem esperar a transcrição. Duxi respondendo: verde —
  // mais forte enquanto fala, um pouco menos enquanto pensa
  const userTalking = duxiState.value === 'active' || hearingVoice.value
  const replying = duxiState.value === 'thinking' || duxiState.value === 'speaking'
  const accentTarget = duxiState.value === 'speaking' ? 1 : replying ? 0.6 : userTalking ? 0.45 : 0
  accentAmount += (accentTarget - accentAmount) * 0.12
  replyMix += ((replying ? 1 : 0) - replyMix) * 0.12
  offAmount += ((isOff ? 1 : 0) - offAmount) * 0.08

  // batida (clique no cinza da barra): tranco lateral amortecido + achatada +
  // olhos fechando, ~0.45s. Tonto: 4s depois da 3ª batida seguida.
  const nowMs = performance.now()
  const hitAge = (nowMs - duxiLastHitAt.value) / 1000
  const dizzyNow = nowMs < duxiDizzyUntil.value
  dizzyAmount += ((dizzyNow ? 1 : 0) - dizzyAmount) * 0.15
  // sobe rápido a cada batida, desce devagar quando passa a tontura
  const rageTarget = dizzyNow ? duxiRage.value : 0
  rageAmount += (rageTarget - rageAmount) * (rageTarget > rageAmount ? 0.25 : 0.03)
  const recoil = (duxiLastHitAt.value && hitAge < 0.45 ? Math.exp(-hitAge * 9) : 0) * (1 + rageAmount * 0.8)

  // piscada: dispara sozinha num intervalo curto e aleatório (ver
  // nextBlinkAt/blinkStart, módulo acima). closedAmount vai de 0 (aberto) a
  // 1 (fechado) e volta, num arco suave (seno) dentro da janela da piscada.
  if (clock >= nextBlinkAt && blinkStart < 0) {
    blinkStart = clock
  }
  let closedAmount = 0
  if (blinkStart >= 0) {
    const phase = (clock - blinkStart) / BLINK_DURATION
    if (phase >= 1) {
      blinkStart = -1
      if (extraBlinksQueued > 0) {
        extraBlinksQueued--
        nextBlinkAt = clock + DOUBLE_BLINK_GAP
      } else {
        nextBlinkAt = clock + 1.5 + Math.random() * 3.5
        extraBlinksQueued = Math.random() < DOUBLE_BLINK_CHANCE ? 1 : 0
      }
    } else {
      closedAmount = Math.sin(Math.min(1, Math.max(0, phase)) * Math.PI)
    }
  }
  closedAmount = Math.max(closedAmount, Math.min(1, recoil * 1.4))

  // reações ao app: cada uma acende/apaga suave
  const reaction = duxiReaction.value
  const reactionOn = reaction && nowMs < reaction.until
  const reactionAge = reaction ? (nowMs - reaction.at) / 1000 : 0
  const ease = (amt, on, k = 0.2) => amt + ((on ? 1 : 0) - amt) * k
  celebrateAmt = ease(celebrateAmt, reactionOn && reaction.type === 'celebrate')
  errorAmt = ease(errorAmt, reactionOn && reaction.type === 'error')
  searchAmt = ease(searchAmt, reactionOn && reaction.type === 'search', 0.15)
  writeAmt = ease(writeAmt, reactionOn && reaction.type === 'write', 0.15)
  confusedAmt = ease(confusedAmt, Boolean(pendingChoice.value), 0.12)

  // arrastar: segue o ponteiro com resistência (tanh — quanto mais longe,
  // mais duro de puxar); solto, mola amortecida de volta pro lugar
  const dt = Math.min(0.05, frameDt) || 1 / 60
  const maxDrag = boxH * 0.5
  if (dragTarget) {
    const len = Math.hypot(dragTarget.x, dragTarget.y)
    const k = len > 0 ? (maxDrag * Math.tanh(len / maxDrag)) / len : 0
    const nx = dragOff.x + (dragTarget.x * k - dragOff.x) * 0.35
    const ny = dragOff.y + (dragTarget.y * k - dragOff.y) * 0.35
    dragVel = { x: (nx - dragOff.x) / dt, y: (ny - dragOff.y) / dt }
    dragOff = { x: nx, y: ny }
  } else if (Math.abs(dragOff.x) + Math.abs(dragOff.y) + Math.abs(dragVel.x) + Math.abs(dragVel.y) > 0.05) {
    dragVel.x += (-240 * dragOff.x - 7 * dragVel.x) * dt
    dragVel.y += (-240 * dragOff.y - 7 * dragVel.y) * dt
    dragOff.x += dragVel.x * dt
    dragOff.y += dragVel.y * dt
  } else {
    dragOff = { x: 0, y: 0 }
    dragVel = { x: 0, y: 0 }
  }
  dragAmt = ease(dragAmt, Boolean(dragTarget), 0.25)
  const dragLen = Math.hypot(dragOff.x, dragOff.y)

  // ociosa: ouvindo sem voz, sem estar tonta, acenando, reagindo ou sendo
  // arrastada
  const idleNow =
    duxiState.value === 'passive' &&
    !hearingVoice.value &&
    !dizzyNow &&
    !reactionOn &&
    !pendingChoice.value &&
    !dragTarget &&
    dragLen < 1 &&
    nowMs - duxiGreetAt.value > GREET_DELAY_MS + GREET_MS
  if (idleNow && idleSince === null) {
    idleSince = clock
    nextIdleAt = clock + randomBetween(IDLE_MIN_GAP, IDLE_MAX_GAP)
  } else if (!idleNow && idleSince !== null) {
    idleSince = null
    nextIdleAt = Infinity
    nextSighAt = Infinity
    idleAction = null
    sighStart = -1
  }
  if (idleSince !== null && !idleAction && clock >= nextIdleAt) {
    idleAction = { type: pickIdleAction(tiredAmount), start: clock }
  }
  let idleT = idleAction ? clock - idleAction.start : -1
  if (idleAction && idleT >= IDLE_ACTIONS[idleAction.type]) {
    // café e cochilo reanimam: o relógio do cansaço recomeça
    if (idleAction.type === 'coffee' || idleAction.type === 'nap') idleSince = clock
    idleAction = null
    idleT = -1
    nextIdleAt = clock + randomBetween(IDLE_MIN_GAP, IDLE_MAX_GAP)
  }
  const act = idleAction?.type
  const coffeeT = act === 'coffee' ? idleT : -1
  const gumT = act === 'gum' ? idleT : -1
  const peekT = act === 'peek' ? idleT : -1
  const whistleT = act === 'whistle' ? idleT : -1
  const stretchT = act === 'stretch' ? idleT : -1
  const napT = act === 'nap' ? idleT : -1
  const whistleAmt = whistleT >= 0 ? window01(whistleT, 0, 0.3) * (1 - window01(whistleT, 4.0, 4.4)) : 0
  const stretchAmt = stretchT >= 0 ? window01(stretchT, 0.15, 0.9) * (1 - window01(stretchT, 2.3, 3.1)) : 0
  const napNod = napT >= 0 ? window01(napT, 0, 1.8) * (1 - window01(napT, 2.2, 2.32)) : 0
  const napStartle = napT >= 0 ? window01(napT, 2.2, 2.32) * (1 - window01(napT, 3.0, 3.6)) : 0
  const gumPop = gumT >= 0 ? window01(gumT, GUM_POP_AT, GUM_POP_AT + 0.05) * (1 - window01(gumT, GUM_POP_AT + 0.1, GUM_POP_AT + 0.35)) : 0
  const idleFor = idleSince === null ? 0 : clock - idleSince
  const tiredTarget = Math.min(1, Math.max(0, (idleFor - TIRED_AFTER) / TIRED_RAMP)) * (coffeeT >= 0 ? 0 : 1)
  tiredAmount += (tiredTarget - tiredAmount) * (tiredTarget > tiredAmount ? 0.01 : 0.08)
  // suspiro de vez em quando, só cansada
  if (tiredAmount > 0.6 && sighStart < 0 && nextSighAt === Infinity) nextSighAt = clock + randomBetween(6, 14)
  if (sighStart < 0 && clock >= nextSighAt) {
    sighStart = clock
    nextSighAt = Infinity
  }
  const sighT = sighStart >= 0 ? (clock - sighStart) / SIGH_DURATION : -1
  if (sighT >= 1) sighStart = -1
  const sigh = sighT >= 0 && sighT < 1 ? Math.sin(sighT * Math.PI) : 0
  // gole: olhos fechados curtindo enquanto a xícara está na boca
  const sipClose = coffeeT >= 0 ? window01(coffeeT, 0.9, 1.3) * (1 - window01(coffeeT, 2.7, 3.0)) : 0
  closedAmount = Math.max(closedAmount, sipClose * 0.9, sigh * 0.6, napNod, gumPop)

  // desligado = sonolento, não fica acompanhando o mouse
  // pensando (esperando o modelo): olhar pra cima, varrendo devagar de um lado
  // pro outro, com os olhos um pouco apertados — em vez de seguir o mouse
  thinkAmount += ((duxiState.value === 'thinking' ? 1 : 0) - thinkAmount) * 0.08
  const mouseTarget = lookTarget()
  const thinkX = 0.65 * Math.sin(clock * 0.9)
  const thinkY = -0.85
  const target = {
    x: mouseTarget.x + (thinkX - mouseTarget.x) * thinkAmount,
    y: mouseTarget.y + (thinkY - mouseTarget.y) * thinkAmount
  }
  // cansada: olhar caído pro chão
  target.x += (0 - target.x) * tiredAmount * 0.8
  target.y += (0.75 - target.y) * tiredAmount * 0.8
  // olhar puxado por ações/reações (cada uma com sua intensidade)
  const pull = (x, y, amt) => {
    if (amt <= 0.01) return
    target.x += (x - target.x) * amt
    target.y += (y - target.y) * amt
  }
  pull(0.85, 0.55, writeAmt) // olhando o lápis
  pull(0.1, 0.7, gumT >= 0 && gumT < GUM_POP_AT ? 1 : 0) // olhando a bolha
  if (peekT >= 0) {
    // espia: canto de baixo à esquerda, à direita, em cima, e volta
    const spot = peekT < 1.2 ? [-0.95, 0.85] : peekT < 2.4 ? [0.95, 0.85] : peekT < 3.4 ? [-0.6, -0.8] : [0, 0]
    pull(spot[0], spot[1], window01(peekT, 0, 0.3) * (1 - window01(peekT, 3.6, 4.2)))
  }
  if (napT >= 2.4 && napT < 4.8) pull(Math.sin((napT - 2.4) * 5) * 0.9, -0.1, 1) // acordou: olha em volta
  if (dragLen > 1) pull(dragOff.x / maxDrag, dragOff.y / maxDrag, Math.min(1, dragLen / (maxDrag * 0.4))) // olha pra onde é puxada
  const attention = 1 - offAmount
  lookX += (target.x * attention - lookX) * 0.12
  lookY += (target.y * attention - lookY) * 0.12

  // boca: só em 'speaking', altura = abertura do visema atual suavizada
  // (evita saltar duro entre visemas)
  const lipSyncOn = duxiConfig.value.lipSyncEnabled ?? true
  const targetAperture = lipSyncOn && duxiState.value === 'speaking' ? (VISEME_APERTURE[visemeAt(getCurrentAudioTime())] ?? 0.05) : 0
  currentAperture += (targetAperture - currentAperture) * 0.35

  // nível das ondas: voz do microfone quando é o usuário falando; quando é a
  // Duxi falando o mic fica desligado, então usa a própria abertura da boca
  // ondas de áudio só pra voz do usuário — quando é a Duxi respondendo, não
  let waveLevel = 0
  if (duxiState.value === 'passive' || duxiState.value === 'active') waveLevel = Math.min(1, avgWaveLevel() * 1.4)
  waveLevel *= Math.min(1, accentAmount * 2.5) * (1 - replyMix)
  voiceLevel += (waveLevel - voiceLevel) * 0.25
  if (waveLevel > 0.12 && clock - lastRippleAt > 0.6 - 0.25 * waveLevel) {
    ripples.push({ born: clock, strength: Math.min(1, 0.3 + waveLevel) })
    lastRippleAt = clock
  }
  ripples = ripples.filter((r) => clock - r.born < RIPPLE_LIFE)

  // --- geometria

  // olhos: pílulas pretas altas e próximas (referência do usuário: robô
  // "bolinha" com olhos grandes juntos no meio), achatadas quase a zero na
  // ALTURA durante a piscada (fica uma linha fina, não some de vez)
  const eyeD = boxH * 0.32
  const eyeW = eyeD * 0.46
  const squint = 1 - 0.28 * thinkAmount
  const eyeH = Math.max(eyeD * 0.08, eyeD * squint * (1 - closedAmount * 0.94))
  // deslocamento do olhar limitado pra os olhos nunca saírem do casco
  const eyeY = oy + boxH * 0.47 + lookY * boxH * 0.1
  const eyeGapX = boxH * 0.16
  const lookOffsetX = lookX * boxH * 0.14
  // pálpebra caída quando desligado: esconde até 60% do olho, de cima pra baixo
  // cansada: pálpebras caídas até a metade
  const lidCover = Math.max(
    0.6 * offAmount + 0.45 * tiredAmount * (1 - offAmount),
    0.3 * whistleAmt // assobiando, relaxada
  ) * (1 - Math.max(celebrateAmt, errorAmt, napStartle))

  const shellColor = mixColor(mixColor(SHELL_WHITE, SHELL_RAGE, rageAmount * 0.85), SHELL_GRAY, offAmount * (1 - rageAmount))
  const neonColor = mixColor(ACCENT_ORANGE, ACCENT_GREEN, replyMix)
  const [nr, ng, nb] = neonColor.map(Math.round)

  const activatedAge = duxiGreetAt.value ? nowMs - duxiGreetAt.value : Infinity
  const greetAge = activatedAge - GREET_DELAY_MS
  const greeting = greetAge >= 0 && greetAge < GREET_MS
  const greetPop = greeting ? easeOutBack(Math.min(1, greetAge / GREET_POP_MS)) : 0
  const greetAlpha = greeting ? Math.min(1, (GREET_MS - greetAge) / GREET_FADE_MS) : 0
  const greetT = greetAge / 1000
  // olhos felizes (arquinhos "◠ ◠") na onda de partículas e no tchau
  const happyBurst =
    activatedAge < BURST_HAPPY_MS ? window01(activatedAge, 60, 260) * (1 - window01(activatedAge, BURST_HAPPY_MS - 300, BURST_HAPPY_MS)) : 0
  const happyWave = greeting ? window01(greetAge, 60, 260) * (1 - window01(greetAge, GREET_MS - 500, GREET_MS - 200)) : 0
  const happyAmount = Math.max(happyBurst, happyWave, stretchAmt)

  // geometria pros desenhos extras (lib/duxiFaceExtras)
  const g = { cx, cy, ox, oy, boxW, boxH, eyeD, eyeW, eyeGapX, eyeY, lookOffsetX, shellColor, clock }
  const lensAt = searchAmt > 0.01 ? lensX(g, reactionAge) : null
  if (reactionOn && reaction.type === 'celebrate' && confettiFor !== reaction.at) {
    confetti = spawnConfetti(g)
    confettiFor = reaction.at
  }

  // corpo: pulinho (comemorar), tremida (erro), cabeça inclinada (confusa),
  // balanço (assobio), esticada (alongamento), cabeceando (cochilo), susto
  const hop =
    (celebrateAmt > 0.01 && reactionAge < 1.5 ? Math.abs(Math.sin(reactionAge * Math.PI * 2.4)) * (1 - reactionAge / 1.5) * 0.16 : 0) +
    napStartle * 0.06
  const bodyX =
    (errorAmt > 0.01 ? Math.sin(reactionAge * 40) * Math.exp(-reactionAge * 5) * 0.035 * errorAmt : 0) +
    (peekT >= 0 ? (peekT < 1.2 ? -1 : peekT < 2.4 ? 1 : 0) * 0.03 * window01(peekT, 0, 0.4) * (1 - window01(peekT, 3.2, 4)) : 0)
  const tilt = -0.14 * confusedAmt + Math.sin(clock * 3) * 0.05 * whistleAmt + 0.06 * napNod
  const stretchX = 1 - 0.05 * stretchAmt
  const stretchY = 1 + 0.1 * stretchAmt - 0.04 * napNod

  function bodyTransform() {
    ctx.translate(cx + bodyX * boxH, oy + boxH + (napNod * 0.04 - hop) * boxH)
    ctx.rotate(tilt)
    ctx.scale(stretchX, stretchY)
    ctx.translate(-cx, -(oy + boxH))
    if (dragLen > 0.5) {
      // gelatina: desloca na direção do puxão e estica nesse eixo
      // (afinando no perpendicular, mantendo o "volume")
      const angle = Math.atan2(dragOff.y, dragOff.x)
      const st = 1 + (dragLen / boxH) * 0.55
      ctx.translate(dragOff.x * 0.55, dragOff.y * 0.55)
      ctx.translate(cx, cy)
      ctx.rotate(angle)
      ctx.scale(st, 1 / Math.sqrt(st))
      ctx.rotate(-angle)
      ctx.translate(-cx, -cy)
    }
  }

  // tamanho de cada olho: confusa (um maior que o outro), susto, surpresa ao
  // ser arrastada, e aumentado atrás da lupa
  function eyeScale(sign, eyeCx) {
    let sc = 1 + 0.3 * napStartle + 0.15 * dragAmt
    sc *= sign < 0 ? 1 + 0.22 * confusedAmt : 1 - 0.14 * confusedAmt
    if (lensAt !== null) sc *= 1 + 0.4 * searchAmt * Math.max(0, 1 - Math.abs(eyeCx - lensAt) / (eyeGapX * 1.2))
    return sc
  }

  function paint(isReflection = false) {
    ctx.save()
    bodyTransform()
    if (ripples.length && !isReflection) paintRipples()

    // casco: fundo sem borda, degradê laranja bem leve subindo de baixo pra
    // cima — clip() no formato arredondado pra não vazar dos cantos. Falando,
    // ganha um brilho neon laranja em volta (shadow).
    ctx.save()
    roundRectPath(ctx, ox, oy, boxW, boxH, radius)
    // impacto: brilho vermelho pulsando em volta, no lugar do neon
    const ragePulse = rageAmount * (0.75 + 0.25 * Math.sin(clock * (6 + rageAmount * 6)))
    ctx.shadowBlur = boxH * Math.max(0.3 * accentAmount, 0.45 * ragePulse)
    ctx.shadowColor = ragePulse > accentAmount ? `rgba(239, 68, 68, ${0.9 * ragePulse})` : rgb(neonColor, 0.85 * accentAmount)
    ctx.fillStyle = rgb(shellColor)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.clip()
    // falando: a base do degradê vai de 16% pra ~85% de laranja e sobe mais
    // (a parada do meio empurra o laranja até perto da metade do casco)
    const gradBase = (0.16 + 0.69 * accentAmount) * (1 - offAmount)
    const shellGrad = ctx.createLinearGradient(0, oy + boxH, 0, oy)
    shellGrad.addColorStop(0, `rgba(${nr}, ${ng}, ${nb}, ${gradBase})`)
    shellGrad.addColorStop(0.55, `rgba(${nr}, ${ng}, ${nb}, ${gradBase * 0.25 * accentAmount})`)
    shellGrad.addColorStop(1, `rgba(${nr}, ${ng}, ${nb}, 0)`)
    ctx.fillStyle = shellGrad
    ctx.fillRect(ox, oy, boxW, boxH)
    ctx.restore()

    if (greeting) paintHands()
    if (stretchAmt > 0.01) paintStretchHands()

    if (happyAmount > 0.01) paintHappyEyes()

    ctx.save()
    ctx.fillStyle = '#000000'
    ctx.globalAlpha = (1 - dizzyAmount) * (1 - happyAmount) * (1 - celebrateAmt) * (1 - errorAmt)
    for (const sign of [-1, 1]) {
      const eyeCx = cx + sign * eyeGapX + lookOffsetX
      const sc = eyeScale(sign, eyeCx)
      const w = eyeW * sc
      const h = eyeH * sc
      const eyeTop = eyeY - h / 2
      ctx.save()
      if (lidCover > 0.01) {
        ctx.beginPath()
        ctx.rect(eyeCx - w, eyeTop + h * lidCover, w * 2, h)
        ctx.clip()
      }
      roundRectPath(ctx, eyeCx - w / 2, eyeTop, w, h, Math.min(w, h) / 2)
      ctx.fill()
      ctx.restore()
    }

    if (currentAperture > 0.01) {
      const mouthW = boxH * 0.34
      const mouthH = Math.max(boxH * 0.02, boxH * 0.16 * currentAperture)
      // acompanha o olhar (mouse), mas menos que os olhos — dá a sensação do
      // rosto inteiro virando, com os olhos na frente
      const mouthCx = cx + lookX * boxH * 0.07
      const mouthY = oy + boxH * 0.72 + lookY * boxH * 0.05
      roundRectPath(ctx, mouthCx - mouthW / 2, mouthY - mouthH / 2, mouthW, mouthH, Math.min(mouthW, mouthH) / 2)
      ctx.fill()
    }
    ctx.restore()

    if (tiredAmount > 0.05 && currentAperture <= 0.01 && gumT < 0 && whistleAmt < 0.05) paintTiredMouth()
    if (celebrateAmt > 0.01) drawStarEyes(ctx, g, celebrateAmt)
    if (errorAmt > 0.01) {
      drawXEyes(ctx, g, errorAmt)
      drawSweatDrop(ctx, g, errorAmt, reactionAge)
    }
    if (searchAmt > 0.01) drawLens(ctx, g, searchAmt, reactionAge)
    if (writeAmt > 0.01) drawWritingHand(ctx, g, writeAmt, reactionAge)
    if (gumT >= 0) drawGum(ctx, g, gumT)
    if (whistleAmt > 0.01) drawWhistle(ctx, g, whistleAmt, whistleT)
    if (coffeeT >= 0) paintCoffee()
    if (dizzyAmount > 0.02) paintDizzy()
    ctx.restore()
  }

  // alongamento: as duas mãos sobem acima da cabeça, balançando de leve
  function paintStretchHands() {
    const r = boxH * 0.15 * stretchAmt
    const lift = boxH * 0.3 * stretchAmt
    const wiggle = Math.sin(clock * 8) * boxH * 0.02
    drawHand(ctx, g, ox + boxW * 0.18 - wiggle, oy - lift * 0.55, r, stretchAmt)
    drawHand(ctx, g, ox + boxW * 0.82 + wiggle, oy - lift * 0.55, r, stretchAmt)
  }

  function paintHappyEyes() {
    const w = eyeD * 0.62
    ctx.save()
    ctx.globalAlpha = happyAmount * (1 - dizzyAmount)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = eyeW * 0.55
    ctx.lineCap = 'round'
    for (const sign of [-1, 1]) {
      const ex = cx + sign * eyeGapX * 1.1 + lookOffsetX * 0.5
      const ey = oy + boxH * 0.5
      ctx.beginPath()
      ctx.moveTo(ex - w / 2, ey + w * 0.12)
      ctx.quadraticCurveTo(ex, ey - w * 0.55, ex + w / 2, ey + w * 0.12)
      ctx.stroke()
    }
    ctx.restore()
  }

  // boquinha triste (arco pra baixo), acompanhando o olhar caído
  function paintTiredMouth() {
    const w = boxH * 0.16
    const mx = cx + lookX * boxH * 0.07
    const my = oy + boxH * 0.76 + lookY * boxH * 0.04
    ctx.save()
    ctx.globalAlpha = Math.min(1, tiredAmount * 1.3) * (1 - dizzyAmount)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = boxH * 0.03
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(mx - w / 2, my + boxH * 0.03)
    ctx.quadraticCurveTo(mx, my - boxH * 0.035, mx + w / 2, my + boxH * 0.03)
    ctx.stroke()
    ctx.restore()
  }

  // xícara: entra pela direita, sobe inclinando até a boca, gole (com vapor),
  // desce e sai
  function paintCoffee() {
    const t = coffeeT
    const enter = window01(t, 0, 0.55)
    const lift = window01(t, 0.55, 1.0) * (1 - window01(t, 2.8, 3.3))
    const leave = window01(t, 3.5, COFFEE_DURATION)
    const cupW = boxH * 0.42
    const cupH = boxH * 0.37
    // parado ao lado do casco -> na frente da boca, à direita
    const restX = ox + boxW + boxH * 0.08
    const restY = oy + boxH * 0.72
    const sipX = cx + boxH * 0.24
    const sipY = oy + boxH * 0.74
    const x = restX + (sipX - restX) * lift + boxH * 0.5 * (1 - enter) + boxH * 0.5 * leave
    const y = restY + (sipY - restY) * lift
    const tilt = -0.45 * lift

    ctx.save()
    ctx.globalAlpha = enter * (1 - leave)
    ctx.translate(x, y)
    ctx.rotate(tilt)
    ctx.lineWidth = Math.max(1, boxH * 0.022)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineJoin = 'round'
    // alça
    ctx.beginPath()
    ctx.arc(cupW / 2, 0, cupH * 0.26, -Math.PI / 2, Math.PI / 2)
    ctx.stroke()
    // corpo (cantos de baixo arredondados) + café no topo
    const r = cupH * 0.28
    ctx.beginPath()
    ctx.moveTo(-cupW / 2, -cupH / 2)
    ctx.lineTo(cupW / 2, -cupH / 2)
    ctx.lineTo(cupW / 2, cupH / 2 - r)
    ctx.arcTo(cupW / 2, cupH / 2, cupW / 2 - r, cupH / 2, r)
    ctx.lineTo(-cupW / 2 + r, cupH / 2)
    ctx.arcTo(-cupW / 2, cupH / 2, -cupW / 2, cupH / 2 - r, r)
    ctx.closePath()
    ctx.fillStyle = '#f4f4f5'
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = '#6b3f22'
    ctx.fillRect(-cupW / 2, -cupH / 2, cupW, cupH * 0.26)
    ctx.restore()
    ctx.stroke()

    // vapor: dois fiozinhos subindo e ondulando (some durante o gole)
    const steam = (1 - lift * 0.8) * 0.55
    if (steam > 0.05) {
      ctx.rotate(-tilt)
      ctx.strokeStyle = `rgba(255, 255, 255, ${steam})`
      ctx.lineWidth = Math.max(1, boxH * 0.018)
      ctx.lineCap = 'round'
      for (const dx of [-cupW * 0.15, cupW * 0.15]) {
        ctx.beginPath()
        for (let i = 0; i <= 10; i++) {
          const k = i / 10
          const sy = -cupH * 0.6 - k * cupH * 0.7
          const sx = dx + Math.sin(k * 6 + clock * 4 + dx) * cupW * 0.07
          if (i === 0) ctx.moveTo(sx, sy)
          else ctx.lineTo(sx, sy)
        }
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  function paintRipples() {
    ctx.save()
    // some em direção à base: o rosto é recortado na linha do chão, e o anel
    // cortado seco ali parecia quebrado
    const fade = ctx.createLinearGradient(0, oy - boxH * RIPPLE_GROW, 0, oy + boxH)
    fade.addColorStop(0, rgb(neonColor))
    fade.addColorStop(0.55, rgb(neonColor, 0.8))
    fade.addColorStop(1, rgb(neonColor, 0))
    ctx.strokeStyle = fade
    ctx.shadowBlur = boxH * 0.06
    ctx.shadowColor = rgb(neonColor, 0.6)
    for (const ripple of ripples) {
      const t = (clock - ripple.born) / RIPPLE_LIFE
      const grow = boxH * RIPPLE_GROW * (1 - Math.pow(1 - t, 3)) // sai rápido, desacelera
      ctx.globalAlpha = ripple.strength * Math.pow(1 - t, 2) * 0.7
      ctx.lineWidth = Math.max(1, boxH * 0.022 * (1 - t * 0.5))
      roundRectPath(ctx, ox - grow, oy - grow, boxW + grow * 2, boxH + grow * 2, radius + grow)
      ctx.stroke()
    }
    ctx.restore()
  }

  // mãos: saem de perto do casco (pop com overshoot) até a posição final; a
  // direita, levantada, balança num arco em volta de um "pulso" imaginário
  // (tchau), a esquerda, mais baixa, só sobe e desce de leve
  function paintHands() {
    const handR = boxH * 0.17
    const out = boxH * 0.16 * greetPop
    const wave = Math.sin(greetT * 15) * 0.55
    const swing = boxH * 0.2
    const rightPivotX = ox + boxW + out * 0.6
    const rightPivotY = oy + boxH * 0.42
    const hands = [
      { x: ox - out, y: oy + boxH * 0.78 + Math.sin(greetT * 7) * boxH * 0.03, r: handR * 0.9 },
      {
        x: rightPivotX + Math.sin(wave + 0.5) * swing * greetPop,
        y: rightPivotY - Math.cos(wave + 0.5) * swing * greetPop,
        r: handR
      }
    ]
    ctx.save()
    ctx.globalAlpha = greetAlpha
    for (const hand of hands) {
      const r = hand.r * Math.max(0.01, greetPop)
      const grad = ctx.createRadialGradient(hand.x - r * 0.35, hand.y - r * 0.35, r * 0.1, hand.x, hand.y, r)
      grad.addColorStop(0, rgb(mixColor(shellColor, [255, 255, 255], 0.6)))
      grad.addColorStop(1, rgb(mixColor(shellColor, [0, 0, 0], 0.12)))
      ctx.shadowBlur = boxH * 0.06
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(hand.x, hand.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // tonto: olhos em espiral girando (sentidos opostos), sobrancelhas retas,
  // boca ondulada (preto, igual ao resto do rosto) + efeitos vermelhos
  // pulsando de leve — estrelinhas e riscos de movimento em cima à esquerda,
  // 💢 em cima à direita, risquinhos de estresse nas laterais
  function paintDizzy() {
    // medidas próprias: espirais e efeitos foram desenhados pra olhos menores
    // e mais afastados — com os olhos normais (grandes e juntos) se embolavam
    const eyeD = boxH * 0.177
    const leftX = cx - boxH * 0.3
    const rightX = cx + boxH * 0.3
    const baseEyeY = oy + boxH * 0.46
    const pulse = 1 + (0.08 + 0.12 * rageAmount) * Math.sin(clock * (5 + rageAmount * 5))
    const spin = clock * (7 + rageAmount * 8)
    ctx.save()
    ctx.globalAlpha = dizzyAmount
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.strokeStyle = '#000000'
    ctx.lineWidth = eyeD * 0.16
    drawSpiral(ctx, leftX, baseEyeY, eyeD * 0.62, spin)
    drawSpiral(ctx, rightX, baseEyeY, eyeD * 0.62, -spin)

    ctx.lineWidth = eyeD * 0.2
    for (const x of [leftX, rightX]) {
      ctx.beginPath()
      ctx.moveTo(x - eyeD * 0.6, baseEyeY - eyeD * 1.05)
      ctx.lineTo(x + eyeD * 0.6, baseEyeY - eyeD * 1.12)
      ctx.stroke()
    }

    ctx.lineWidth = boxH * 0.03
    drawWavyMouth(ctx, cx, oy + boxH * 0.74, boxH * 0.3, boxH * 0.03)

    ctx.globalAlpha = dizzyAmount * (0.85 + 0.15 * Math.sin(clock * 5))
    ctx.strokeStyle = DIZZY_RED
    ctx.fillStyle = DIZZY_RED
    ctx.shadowBlur = boxH * 0.06
    ctx.shadowColor = 'rgba(239, 68, 68, 0.8)'
    ctx.lineWidth = boxH * 0.022

    drawStar(ctx, leftX - eyeD * 1.35, baseEyeY - eyeD * 0.55, eyeD * 0.36 * pulse)
    drawStar(ctx, leftX - eyeD * 0.55, baseEyeY - eyeD * 1.55, eyeD * 0.3 * pulse)
    ctx.beginPath()
    ctx.arc(leftX - eyeD * 0.3, baseEyeY - eyeD * 0.2, eyeD * 1.25, Math.PI * 1.02, Math.PI * 1.3)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(leftX - eyeD * 0.3, baseEyeY - eyeD * 0.2, eyeD * 1.6, Math.PI * 1.08, Math.PI * 1.22)
    ctx.stroke()

    drawAngerVein(ctx, rightX + eyeD * 1.35, baseEyeY - eyeD * 1.15, eyeD * 0.42 * pulse)

    for (let i = 0; i < 2; i++) {
      const dx = i * eyeD * 0.32
      ctx.beginPath()
      ctx.moveTo(rightX + eyeD * 1.1 + dx, baseEyeY + eyeD * 0.15)
      ctx.lineTo(rightX + eyeD * 0.9 + dx, baseEyeY + eyeD * 0.55)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(leftX - eyeD * 1.2 + dx, baseEyeY + eyeD * 0.75)
      ctx.lineTo(leftX - eyeD * 1.35 + dx, baseEyeY + eyeD * 1.05)
      ctx.stroke()
    }
    ctx.restore()
  }

  // batida: o rosto inteiro (e o reflexo) sacode de lado e achata um pouco,
  // ancorado na base do casco
  const hitShakeX = Math.sin(hitAge * 45) * recoil * boxH * 0.07
  ctx.save()
  ctx.translate(cx + hitShakeX, oy + boxH)
  // + "respira" com a voz do usuário (cresce um pouco por igual)
  const breathe = 1 + 0.045 * voiceLevel
  // cansada: um pouco murcha, e mais ainda no suspiro
  const slump = 1 - 0.025 * tiredAmount - 0.035 * sigh
  ctx.scale((1 + 0.08 * recoil) * breathe * (2 - slump), (1 - 0.08 * recoil) * breathe * slump)
  ctx.translate(-cx, -(oy + boxH))

  // --- reflexo no chão espelhado (desenhado primeiro, fica "atrás")
  const floorY = oy + boxH + boxH * FLOOR_GAP
  ctx.save()
  ctx.globalAlpha = REFLECTION_ALPHA
  ctx.translate(0, floorY * 2)
  ctx.scale(1, -1)
  paint(true)
  ctx.restore()

  // o reflexo vai sumindo pra baixo: destination-out apaga cada vez mais
  // conforme desce. Só mexe na área abaixo do chão, onde só tem o reflexo.
  const fade = ctx.createLinearGradient(0, floorY, 0, floorY + boxH * REFLECTION_VISIBLE)
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)')
  fade.addColorStop(1, 'rgba(0, 0, 0, 1)')
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = fade
  // folga além da borda: o corpo encolhido (cansada/suspiro) escala este
  // retângulo junto e ele deixava de cobrir a última linha do canvas
  ctx.fillRect(-pad * 2, floorY, cw + pad * 4, ch + pad * 3 - floorY)
  ctx.restore()

  // --- rosto de verdade, por cima. Recortado na linha do chão: o brilho em
  // volta (neon/impacto) segue livre em cima e dos lados (margem `pad`), mas
  // embaixo ocupava o vão até o reflexo e deixava ele parecendo descolado,
  // longe do rosto.
  ctx.save()
  ctx.beginPath()
  ctx.rect(-pad, -pad, cw + pad * 2, floorY + pad)
  ctx.clip()
  paint()
  ctx.restore()

  // fora do corpo (sem reflexo nem transformações): confete, "?", marcas do
  // cochilo
  if (confetti.length) confetti = stepConfetti(ctx, g, confetti, dt)
  if (confusedAmt > 0.01) drawQuestionMark(ctx, g, confusedAmt)
  if (napNod > 0.02 || napStartle > 0.02) drawNapMarks(ctx, g, napNod, napStartle)

  // pensando: badge azul no canto superior esquerdo do casco, com 3 pontos
  // acendendo em sequência (loading). Fora do paint() pra não aparecer no
  // reflexo.
  if (thinkAmount > 0.02) {
    const badgeR = boxH * 0.14
    const bx = ox + boxH * 0.15
    const by = oy + boxH * 0.15
    ctx.save()
    ctx.globalAlpha = thinkAmount
    ctx.fillStyle = '#3b82f6'
    ctx.shadowBlur = boxH * 0.12
    ctx.shadowColor = 'rgba(59, 130, 246, 0.7)'
    ctx.beginPath()
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    const dotR = badgeR * 0.17
    const gap = badgeR * 0.46
    for (let i = 0; i < 3; i++) {
      const pulse = Math.max(0, Math.sin(clock * 6 - i * 0.9))
      ctx.globalAlpha = thinkAmount * (0.3 + 0.7 * pulse)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(bx + (i - 1) * gap, by, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  ctx.restore() // transform da batida
}

function frame(ts) {
  if (!lastTs) lastTs = ts
  const dt = Math.min(0.05, (ts - lastTs) / 1000)
  lastTs = ts
  clock += dt
  frameDt = dt
  draw()
  rafId = requestAnimationFrame(frame)
}

function resizeCanvas() {
  const wrap = canvasEl.value?.parentElement
  if (!wrap || !canvasEl.value) return
  // clientWidth/Height = tamanho de layout, sem o zoom do vue-flow aplicado
  cw = wrap.clientWidth
  ch = wrap.clientHeight
  pad = Math.ceil(ch * GLOW_PAD_FRAC)
  dpr = window.devicePixelRatio || 1
  canvasEl.value.width = (cw + pad * 2) * dpr
  canvasEl.value.height = (ch + pad * 2) * dpr
  canvasEl.value.style.width = `${cw + pad * 2}px`
  canvasEl.value.style.height = `${ch + pad * 2}px`
  canvasEl.value.style.left = `${-pad}px`
  canvasEl.value.style.top = `${-pad}px`
  ctx = canvasEl.value.getContext('2d')
  // redimensionar o canvas apaga o conteúdo — redesenha na hora em vez de
  // esperar o próximo frame (a barra anima de tamanho, isso roda a cada passo)
  draw()
}

onMounted(() => {
  window.addEventListener('mousemove', trackMouse, { passive: true })
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
  window.removeEventListener('mousemove', trackMouse)
})
</script>

<style scoped>
.duxi-bot {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 4px;
}

.face-wrap {
  width: 60px;
  height: 38px;
  flex-shrink: 0;
  cursor: pointer;
  transition:
    width 0.35s ease,
    height 0.35s ease;
}

/* engajada (conversa começou, até desativar): robô grande — o tamanho não
   muda entre foco e texto, só a posição (centro → canto) */
.engaged .face-wrap {
  width: 132px;
  height: 84px;
}

.text-in-enter-active {
  transition: opacity 0.3s ease 0.15s;
}

.text-in-enter-from {
  opacity: 0;
}

.face-canvas {
  display: block;
  position: absolute;
  /* a margem do brilho é só visual — o clique continua sendo no rosto */
  pointer-events: none;
}

/* zZz: três letras subindo do canto superior direito do rosto, cada vez
   maiores, aparecendo e sumindo em sequência (fora do canvas, em HTML, pra
   poder passar da borda do rosto — o canvas não tem espaço acima da cabeça) */
.face-wrap {
  position: relative;
}

.zzz {
  position: absolute;
  top: 0;
  right: -12px;
  width: 22px;
  height: 100%;
  pointer-events: none;
}

.zzz span {
  position: absolute;
  left: 0;
  bottom: 30%;
  color: #9ca3af;
  font-weight: 700;
  line-height: 1;
  opacity: 0;
  animation: zzz-float 3s ease-in-out infinite;
}

.zzz span:nth-child(1) {
  font-size: 7px;
  animation-delay: 0s;
}

.zzz span:nth-child(2) {
  font-size: 9px;
  animation-delay: 1s;
}

.zzz span:nth-child(3) {
  font-size: 11px;
  animation-delay: 2s;
}

@keyframes zzz-float {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  20% {
    opacity: 0.9;
  }
  80% {
    opacity: 0.6;
  }
  100% {
    transform: translate(8px, -20px);
    opacity: 0;
  }
}

.zzz-fade-enter-active,
.zzz-fade-leave-active {
  transition: opacity 0.4s ease;
}

.zzz-fade-enter-from,
.zzz-fade-leave-to {
  opacity: 0;
}

/* última troca: o que ela entendeu em cima, a resposta embaixo — uma linha
   cada, cortada com reticências (a barra continua fina) */
.duxi-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 400px;
}

/* coluna da direita: troca atual ou histórico + campo de digitação */
.duxi-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.phase-text.engaged .duxi-col {
  flex: 1 1 auto;
}

.duxi-input {
  margin: 10px 0 0 6px;
}

.duxi-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 6px 6px 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.045);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

/* foco: borda e brilho laranja, a cor do usuário falando */
.duxi-input-row:focus-within {
  border-color: rgba(255, 160, 70, 0.55);
  background: rgba(255, 255, 255, 0.065);
  box-shadow:
    0 0 0 3px rgba(255, 140, 40, 0.12),
    0 0 18px rgba(255, 140, 40, 0.12);
}

.duxi-textarea {
  flex: 1 1 auto;
  min-width: 0;
  height: 22px;
  max-height: 84px;
  padding: 2px 0;
  border: none;
  outline: none;
  resize: none;
  overflow-y: hidden;
  background: transparent;
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}

.duxi-textarea::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.duxi-send {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 999px;
  background: #ffffff;
  color: #000000;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    background 0.15s ease,
    opacity 0.15s ease;
}

.duxi-send:hover:not(:disabled) {
  transform: scale(1.08);
}

.duxi-send:active:not(:disabled) {
  transform: scale(0.94);
}

.duxi-send:disabled {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.35);
  cursor: default;
}

.duxi-send.stop {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2) inset;
}

.duxi-send.stop:hover {
  background: rgba(255, 107, 107, 0.85);
}

.duxi-input-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 18px;
  margin-top: 5px;
  padding: 0 6px;
  font-size: 10.5px;
  line-height: 18px;
  color: rgba(255, 255, 255, 0.32);
  white-space: nowrap;
  overflow: hidden;
}

.hint-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(110, 231, 150, 0.85);
}

.hint-status.warn {
  color: rgba(255, 180, 90, 0.85);
}

.hint-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  animation: hint-pulse 1s ease-in-out infinite;
}

@keyframes hint-pulse {
  50% {
    opacity: 0.3;
  }
}

.hint-keys {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint-sep {
  margin: 0 3px;
  opacity: 0.6;
}

kbd {
  display: inline-block;
  padding: 0 4px;
  line-height: 13px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  font-family: inherit;
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.5);
}

.input-in-enter-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.input-in-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.input-in-enter-from,
.input-in-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* com texto, o bloco ocupa todo o resto da barra (sem limite de 400px) */
.phase-text.engaged {
  flex: 1 1 auto;
}

.phase-text.engaged .duxi-text {
  flex: 1 1 auto;
  max-width: none;
}

.engaged .duxi-text {
  padding-left: 6px;
}

.line {
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11.5px;
  line-height: 1.35;
}

.line-user {
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
}

.line-reply {
  color: #34b866;
  /* inteira: quebra linha em vez de cortar com reticências; rola se for
     muito longa (altura máxima ~6 linhas) */
  white-space: normal;
  text-overflow: clip;
  overflow-y: auto;
  max-height: 7.2em;
}

.line-error {
  color: #ff6b6b;
}

/* histórico: mesmas linhas da troca atual (pedido branco, resposta verde),
   uma embaixo da outra, rolando — nada cortado com reticências */
.duxi-history {
  /* bloco normal, não flex: num flex com altura máxima, as linhas com
     overflow:hidden encolhiam até altura zero em vez de rolar */
  display: block;
  max-height: 150px;
  overflow-y: auto;
  padding-right: 6px;
  /* só a barra, sem setas/trilho chamando atenção no fundo escuro */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}

.line-wrap {
  white-space: normal;
  text-overflow: clip;
}

.line-history {
  max-height: none;
  overflow: visible;
}

.duxi-history .line-history {
  margin-top: 2px;
}

.duxi-history .turn-start {
  margin-top: 12px;
}

.line-empty {
  color: rgba(255, 255, 255, 0.45);
}

/* escolha ambígua (ex: 2 notas candidatas) — fora do .line-reply de
   propósito, pra não ficar cortado/rolando junto do texto da resposta */
.line-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.option-btn {
  padding: 3px 10px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 11.5px;
  line-height: 1.35;
  cursor: pointer;
  white-space: nowrap;
}

.option-btn:hover {
  background: rgba(255, 255, 255, 0.18);
}
</style>
