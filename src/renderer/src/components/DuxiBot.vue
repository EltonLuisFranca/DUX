<template>
  <div class="duxi-bot nodrag nowheel nopan" :class="[`phase-${duxiPhase}`, { engaged: duxiEngaged }]">
    <AppTooltip :label="micTitle" placement="bottom">
      <div class="face-wrap" @click="toggleDuxiMic" @contextmenu.prevent="openSettings('duxi')">
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
      <div v-if="duxiPhase === 'text'" class="duxi-text">
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
  duxiState,
  duxiConfig,
  duxiPhase,
  duxiEngaged,
  hearingVoice,
  duxiLastHitAt,
  duxiDizzyUntil,
  userText,
  replyText,
  errorText,
  pendingChoice,
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

const micTitle = computed(() =>
  duxiState.value === 'off' ? 'Ativar Duxi (botão direito: configurações)' : 'Desativar Duxi'
)

const canvasEl = ref(null)

let ctx = null
let dpr = 1
let cw = 0
let ch = 0
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
  ctx.clearRect(0, 0, cw, ch)
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
// espaço reservado de cada lado do casco pras ondas de áudio (fração de boxH)
const WAVE_SIDE_ROOM = 0.32
const FACE_ASPECT = 1.457 // boxW / boxH

const SHELL_WHITE = [255, 255, 255]
const SHELL_GRAY = [150, 152, 158]

let accentAmount = 0 // intensidade do degradê/brilho
let replyMix = 0 // 0 = laranja (usuário), 1 = verde (Duxi respondendo)
let thinkAmount = 0 // 0..1, suavizado — olhar de "pensando" enquanto processa
let dizzyAmount = 0 // 0..1, suavizado — tonto depois da 3ª batida (ver hitDuxi)
const DIZZY_RED = '#ef4444'

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
  const radius = boxH * 0.34

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
  const recoil = duxiLastHitAt.value && hitAge < 0.45 ? Math.exp(-hitAge * 9) : 0
  dizzyAmount += ((nowMs < duxiDizzyUntil.value ? 1 : 0) - dizzyAmount) * 0.15

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

  // --- geometria

  // olhos: elipses mais estreitas que altas, achatadas quase a zero na ALTURA
  // durante a piscada (fica uma linha fina, não some de vez)
  const eyeD = boxH * 0.177
  const eyeW = eyeD * 0.62
  const squint = 1 - 0.28 * thinkAmount
  const eyeH = Math.max(eyeD * 0.08, eyeD * squint * (1 - closedAmount * 0.94))
  // deslocamento do olhar limitado pra os olhos nunca saírem do casco
  const eyeY = oy + boxH * 0.46 + lookY * boxH * 0.13
  const eyeGapX = boxH * 0.3
  const lookOffsetX = lookX * boxH * 0.12
  // pálpebra caída quando desligado: esconde até 60% do olho, de cima pra baixo
  const lidCover = 0.6 * offAmount

  const shellColor = mixColor(SHELL_WHITE, SHELL_GRAY, offAmount)
  const neonColor = mixColor(ACCENT_ORANGE, ACCENT_GREEN, replyMix)
  const [nr, ng, nb] = neonColor.map(Math.round)

  function paint() {
    // casco: fundo sem borda, degradê laranja bem leve subindo de baixo pra
    // cima — clip() no formato arredondado pra não vazar dos cantos. Falando,
    // ganha um brilho neon laranja em volta (shadow).
    ctx.save()
    roundRectPath(ctx, ox, oy, boxW, boxH, radius)
    ctx.shadowBlur = boxH * 0.3 * accentAmount
    ctx.shadowColor = rgb(neonColor, 0.85 * accentAmount)
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

    ctx.save()
    ctx.fillStyle = '#000000'
    ctx.globalAlpha = 1 - dizzyAmount
    for (const sign of [-1, 1]) {
      const eyeCx = cx + sign * eyeGapX + lookOffsetX
      const eyeTop = eyeY - eyeH / 2
      ctx.save()
      if (lidCover > 0.01) {
        ctx.beginPath()
        ctx.rect(eyeCx - eyeW, eyeTop + eyeH * lidCover, eyeW * 2, eyeH)
        ctx.clip()
      }
      roundRectPath(ctx, eyeCx - eyeW / 2, eyeTop, eyeW, eyeH, Math.min(eyeW, eyeH) / 2)
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

    if (dizzyAmount > 0.02) paintDizzy()

    // ondas de áudio: arcos concêntricos "(((" / ")))" nas laterais do casco
    if (waveLevel > 0.02) {
      ctx.save()
      ctx.strokeStyle = rgb(neonColor)
      ctx.shadowBlur = boxH * 0.08
      ctx.shadowColor = rgb(neonColor)
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(1.5, boxH * 0.035)
      for (const sign of [-1, 1]) {
        // meio-círculo virado pra fora do rosto, de -90° a 90°: à esquerda
        // passa pelo lado esquerdo (180°, ccw=true), à direita pelo direito
        // (0°, ccw=false)
        const earCx = sign < 0 ? ox - boxH * 0.06 : ox + boxW + boxH * 0.06
        for (let i = 0; i < 3; i++) {
          const arcLevel = Math.max(0, waveLevel - i * 0.22)
          if (arcLevel <= 0.02) continue
          ctx.globalAlpha = Math.min(0.95, arcLevel * 1.2)
          ctx.beginPath()
          ctx.arc(earCx, cy, boxH * (0.07 + i * 0.075), -Math.PI * 0.5, Math.PI * 0.5, sign < 0)
          ctx.stroke()
        }
      }
      ctx.restore()
    }
  }

  // tonto: olhos em espiral girando (sentidos opostos), sobrancelhas retas,
  // boca ondulada (preto, igual ao resto do rosto) + efeitos vermelhos
  // pulsando de leve — estrelinhas e riscos de movimento em cima à esquerda,
  // 💢 em cima à direita, risquinhos de estresse nas laterais
  function paintDizzy() {
    const leftX = cx - eyeGapX
    const rightX = cx + eyeGapX
    const baseEyeY = oy + boxH * 0.46
    const pulse = 1 + 0.08 * Math.sin(clock * 5)
    ctx.save()
    ctx.globalAlpha = dizzyAmount
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.strokeStyle = '#000000'
    ctx.lineWidth = eyeD * 0.16
    drawSpiral(ctx, leftX, baseEyeY, eyeD * 0.62, clock * 7)
    drawSpiral(ctx, rightX, baseEyeY, eyeD * 0.62, -clock * 7)

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
  ctx.scale(1 + 0.08 * recoil, 1 - 0.08 * recoil)
  ctx.translate(-cx, -(oy + boxH))

  // --- reflexo no chão espelhado (desenhado primeiro, fica "atrás")
  const floorY = oy + boxH + boxH * FLOOR_GAP
  ctx.save()
  ctx.globalAlpha = REFLECTION_ALPHA
  ctx.translate(0, floorY * 2)
  ctx.scale(1, -1)
  paint()
  ctx.restore()

  // o reflexo vai sumindo pra baixo: destination-out apaga cada vez mais
  // conforme desce. Só mexe na área abaixo do chão, onde só tem o reflexo.
  const fade = ctx.createLinearGradient(0, floorY, 0, floorY + boxH * REFLECTION_VISIBLE)
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)')
  fade.addColorStop(1, 'rgba(0, 0, 0, 1)')
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = fade
  ctx.fillRect(0, floorY, cw, ch - floorY)
  ctx.restore()

  // --- rosto de verdade, por cima
  paint()

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
  draw()
  rafId = requestAnimationFrame(frame)
}

function resizeCanvas() {
  const wrap = canvasEl.value?.parentElement
  if (!wrap || !canvasEl.value) return
  // clientWidth/Height = tamanho de layout, sem o zoom do vue-flow aplicado
  cw = wrap.clientWidth
  ch = wrap.clientHeight
  dpr = window.devicePixelRatio || 1
  canvasEl.value.width = cw * dpr
  canvasEl.value.height = ch * dpr
  canvasEl.value.style.width = `${cw}px`
  canvasEl.value.style.height = `${ch}px`
  ctx = canvasEl.value.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
