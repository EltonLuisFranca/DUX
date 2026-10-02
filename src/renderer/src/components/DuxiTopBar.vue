<template>
  <div ref="rootRef" class="duxi-top-bar" :class="{ engaged: duxiEngaged }" @click="handleBarClick">
    <div class="dock-surface" :style="dockMaskStyle" />
    <div ref="fillRef" class="focus-fill" :class="{ visible: duxiEngaged }">
      <canvas ref="particlesEl" class="particles" />
    </div>
    <!-- faixa de ícones em cima do painel (barra aberta): à esquerda o
         histórico da conversa; à direita, espaço reservado pra ações futuras -->
    <Transition name="header-fade">
      <div v-if="duxiEngaged" class="bar-header">
        <div class="header-group">
          <AppTooltip :label="duxiHistoryOpen ? 'Voltar pra conversa atual' : 'Histórico da conversa'" placement="bottom">
            <button class="header-btn" :class="{ active: duxiHistoryOpen }" @click="toggleDuxiHistory">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
                <path d="M2.5 2.5v2.2h2.2" />
                <path d="M8 5.2V8l1.9 1.2" />
              </svg>
            </button>
          </AppTooltip>
          <AppTooltip :label="duxiTypingOpen ? 'Fechar digitação' : 'Digitar pra Duxi'" placement="bottom">
            <button class="header-btn" :class="{ active: duxiTypingOpen }" @click="toggleDuxiTyping">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1.5" y="4" width="13" height="8.5" rx="1.8" />
                <path d="M4 6.6h.01M6.3 6.6h.01M8.6 6.6h.01M10.9 6.6h.01M4.6 9.8h6.8" />
              </svg>
            </button>
          </AppTooltip>
        </div>
        <div class="header-group header-group-right" />
      </div>
    </Transition>
    <div class="bar-row" :class="[`phase-${duxiPhase}`, { engaged: duxiEngaged, sleeping: duxiState === 'off' }]">
      <DuxiBot />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DuxiBot from './DuxiBot.vue'
import AppTooltip from './AppTooltip.vue'
import {
  duxiPhase,
  duxiEngaged,
  duxiState,
  hearingVoice,
  hitDuxi,
  duxiGreetAt,
  duxiHistoryOpen,
  toggleDuxiHistory,
  duxiTypingOpen,
  toggleDuxiTyping
} from '../store/duxiStore'
import { waveLevels } from '../store/voiceStore'

// Barra da Duxi, grudada na borda de CIMA do canvas. Mesma técnica de
// máscara côncava da barra de baixo (ZoomControls.vue) e do ClaudeUsageDock,
// só que espelhada verticalmente: os fillets côncavos saem da borda de cima
// e os cantos convexos ficam embaixo. É uma só pro app inteiro (montada no
// App.vue), já que a Duxi é global — a barra de baixo é por workspace.
const rootRef = ref(null)
const barSize = ref({ width: 0, height: 0 })
const barResizeObserver = new ResizeObserver(([entry]) => {
  if (!entry) return
  const box = entry.borderBoxSize?.[0]
  if (box) {
    barSize.value = { width: box.inlineSize, height: box.blockSize }
  } else {
    const rect = entry.target.getBoundingClientRect()
    barSize.value = { width: rect.width, height: rect.height }
  }
})

watch(
  rootRef,
  (el, prevEl) => {
    if (prevEl) barResizeObserver.unobserve(prevEl)
    if (el) barResizeObserver.observe(el)
  },
  { immediate: true }
)

// menor que o da barra de baixo (40) — côncavo mais sutil, pedido do usuário
const FILLET_SPAN = 18
const CORNER_RADIUS = 16

// a barra muda de altura (compacta/foco/texto) — na compacta ela fica mais
// baixa que fillet + canto, e o path se cruzaria; encolhe os raios junto
const radii = computed(() => {
  const h = barSize.value.height
  const r = Math.min(CORNER_RADIUS, h / 2)
  const R = Math.max(0, Math.min(FILLET_SPAN, h - r))
  return { R, r }
})

const barPath = computed(() => {
  const { width: contentWidth, height: h } = barSize.value
  if (!contentWidth || !h) return null
  const { R, r } = radii.value
  const w = contentWidth + R * 2
  return (
    `M 0,0 A ${R},${R} 0 0 1 ${R},${R} L ${R},${h - r} A ${r},${r} 0 0 0 ${R + r},${h} ` +
    `L ${w - R - r},${h} A ${r},${r} 0 0 0 ${w - R},${h - r} L ${w - R},${R} ` +
    `A ${R},${R} 0 0 1 ${w},0 Z`
  )
})

const dockMaskStyle = computed(() => {
  if (!barPath.value) return {}
  const { width: contentWidth, height: h } = barSize.value
  const { R } = radii.value
  const w = contentWidth + R * 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${barPath.value}" fill="#000"/></svg>`
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  return {
    left: `-${R}px`,
    right: `-${R}px`,
    maskImage: url,
    WebkitMaskImage: url,
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskOrigin: 'border-box',
    WebkitMaskOrigin: 'border-box'
  }
})

// --- partículas no fundo cinza ---------------------------------------------
// Pontinhos bem pequenos espalhados pelo cinza inteiro, flutuando devagar em
// direções aleatórias (tipo poeira em suspensão), dando a volta nas bordas.
// Aparecem com fade enquanto o usuário fala (tom quente, aceleram com o
// volume da voz) e enquanto a Duxi responde — pensando ou falando — em
// verde. O loop só roda enquanto a barra está aberta.
const fillRef = ref(null)
const particlesEl = ref(null)
const PARTICLE_COUNT = 130
const COLOR_USER = [255, 214, 170]
const COLOR_REPLY = [110, 231, 150]
let pctx = null
let pw = 0
let ph = 0
let particleRaf = null
let particleLastTs = 0
let particlesAmount = 0
let replyMix = 0 // 0 = cor do usuário, 1 = verde da resposta
let particles = []

function seedParticle() {
  const angle = Math.random() * Math.PI * 2
  const speed = 6 + Math.random() * 16
  return {
    // posição normalizada (0..1) — sobrevive a resize da barra sem amontoar
    // tudo num canto (antes as partículas eram sorteadas com a barra ainda
    // baixa e ficavam presas na faixa de cima)
    nx: Math.random(),
    ny: Math.random(),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed * 0.6,
    r: 0.4 + Math.random() * 1.1,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.25 + Math.random() * 0.55
  }
}

function resizeParticles() {
  const el = fillRef.value
  const canvas = particlesEl.value
  if (!el || !canvas) return
  const dpr = window.devicePixelRatio || 1
  pw = el.clientWidth
  ph = el.clientHeight
  canvas.width = pw * dpr
  canvas.height = ph * dpr
  canvas.style.width = `${pw}px`
  canvas.style.height = `${ph}px`
  pctx = canvas.getContext('2d')
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (particles.length !== PARTICLE_COUNT) {
    particles = Array.from({ length: PARTICLE_COUNT }, seedParticle)
  }
}

// --- onda de partículas ao ativar --------------------------------------------
// Junto com o tchauzinho (duxiGreetAt): centenas de pontinhos minúsculos saem
// de trás do robô num anel elíptico (bem mais largo que alto) que se expande
// até as laterais do painel, com um brilho quente atrás dele. Cada ponto tem
// velocidade própria, então o anel vira uma faixa espessa e espalhada (poeira
// em onda), não uma linha. Dourados perto do centro, clareando e apagando
// conforme chegam nas bordas.
const BURST_COUNT = 900
const BURST_DURATION = 1.5 // s
const BURST_GOLD = [255, 196, 96]
const BURST_WHITE = [255, 246, 228]
let burst = [] // { theta, r0, reach, jitter, size, delay }
let burstAge = -1

function burstOrigin() {
  const face = rootRef.value?.querySelector('.face-wrap')
  const fill = fillRef.value
  if (!face || !fill) return { x: pw / 2, y: ph / 2 }
  const f = face.getBoundingClientRect()
  const b = fill.getBoundingClientRect()
  return { x: f.left + f.width / 2 - b.left, y: f.top + f.height / 2 - b.top }
}

function spawnBurst() {
  burstAge = 0
  burst = Array.from({ length: BURST_COUNT }, () => ({
    theta: Math.random() * Math.PI * 2,
    r0: 0.08 + Math.random() * 0.1, // nasce já fora do robô (atrás dele)
    reach: 0.55 + Math.random() * 0.6, // até onde vai (fração do raio do painel)
    jitter: (Math.random() - 0.5) * 0.12,
    size: 0.5 + Math.random() * 1.1,
    delay: Math.random() * 0.18
  }))
}

watch(duxiGreetAt, (at) => {
  if (at) spawnBurst()
})

function drawBurst(dt) {
  burstAge += dt
  if (burstAge > BURST_DURATION + 0.2) {
    burst = []
    burstAge = -1
    return
  }
  const origin = burstOrigin()
  // raio horizontal até a borda mais distante; vertical bem menor (elipse)
  const rx = Math.max(origin.x, pw - origin.x, 1)
  const ry = Math.max(ph * 0.75, 1)
  const t = burstAge

  // brilho quente atrás do robô: acende rápido e apaga devagar
  const glow = Math.min(1, t / 0.12) * Math.max(0, 1 - t / BURST_DURATION)
  if (glow > 0.01) {
    const gr = ph * (0.55 + 0.35 * Math.min(1, t / 0.5))
    const g = pctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, gr)
    g.addColorStop(0, `rgba(255, 236, 200, ${(0.35 * glow).toFixed(3)})`)
    g.addColorStop(0.45, `rgba(255, 190, 110, ${(0.12 * glow).toFixed(3)})`)
    g.addColorStop(1, 'rgba(255, 170, 80, 0)')
    pctx.fillStyle = g
    pctx.fillRect(origin.x - gr, origin.y - gr, gr * 2, gr * 2)
  }

  pctx.save()
  pctx.globalCompositeOperation = 'lighter'
  for (const p of burst) {
    const age = t - p.delay
    if (age <= 0) continue
    // sai rápido e desacelera chegando no alcance
    const k = 1 - Math.exp(-age * 3.2)
    const r = p.r0 + (p.reach - p.r0) * k + p.jitter * k
    if (r >= 1) continue
    const x = origin.x + Math.cos(p.theta) * r * rx
    const y = origin.y + Math.sin(p.theta) * r * ry
    const life = Math.max(0, 1 - age / BURST_DURATION)
    const alpha = Math.pow(1 - r, 0.8) * Math.min(1, life * 2.2) * Math.min(1, age / 0.08)
    if (alpha < 0.02) continue
    const mix = Math.min(1, r * 1.8)
    const c = BURST_GOLD.map((v, i) => Math.round(v + (BURST_WHITE[i] - v) * mix))
    pctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha.toFixed(3)})`
    pctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size)
  }
  pctx.restore()
}

function voiceLevel() {
  const levels = waveLevels.value
  if (!levels.length) return 0
  let sum = 0
  for (const l of levels) sum += l
  return Math.min(1, (sum / levels.length) * 1.4)
}

function particleFrame(ts) {
  const dt = particleLastTs ? Math.min(0.05, (ts - particleLastTs) / 1000) : 0
  particleLastTs = ts
  const st = duxiState.value
  const userTalking = st === 'active' || hearingVoice.value
  const replying = st === 'thinking' || st === 'speaking'
  const ease = Math.min(1, dt * 4)
  particlesAmount += ((userTalking || replying ? 1 : 0) - particlesAmount) * ease
  replyMix += ((replying ? 1 : 0) - replyMix) * ease

  if (pctx && pw && ph) {
    pctx.clearRect(0, 0, pw, ph)
    if (particlesAmount > 0.01) {
      const speed = userTalking ? 1 + voiceLevel() * 2.5 : 1.3
      const c = COLOR_USER.map((v, i) => Math.round(v + (COLOR_REPLY[i] - v) * replyMix))
      for (const p of particles) {
        // move em px e converte de volta pro espaço normalizado
        p.nx += (p.vx * speed * dt) / pw
        p.ny += (p.vy * speed * dt) / ph
        p.nx = ((p.nx % 1) + 1) % 1
        p.ny = ((p.ny % 1) + 1) % 1
        p.phase += dt * 2
        const twinkle = 0.65 + 0.35 * Math.sin(p.phase)
        pctx.beginPath()
        pctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(p.alpha * twinkle * particlesAmount).toFixed(3)})`
        pctx.arc(p.nx * pw, p.ny * ph, p.r, 0, Math.PI * 2)
        pctx.fill()
      }
    }
    if (burstAge >= 0) drawBurst(dt)
  }
  particleRaf = requestAnimationFrame(particleFrame)
}

const fillResizeObserver = new ResizeObserver(resizeParticles)
watch(fillRef, (el, prevEl) => {
  if (prevEl) fillResizeObserver.unobserve(prevEl)
  if (el) fillResizeObserver.observe(el)
})

watch(
  duxiEngaged,
  (engaged) => {
    if (engaged && !particleRaf) {
      particleLastTs = 0
      particleRaf = requestAnimationFrame(particleFrame)
    } else if (!engaged && particleRaf) {
      cancelAnimationFrame(particleRaf)
      particleRaf = null
      particlesAmount = 0
      pctx?.clearRect(0, 0, pw, ph)
    }
  },
  { immediate: true }
)

// clique no cinza (barra aberta) = batida no robô; clique no próprio robô
// continua sendo ligar/desligar o mic (tratado no DuxiBot)
function handleBarClick(event) {
  if (!duxiEngaged.value) return
  if (event.target.closest('.face-wrap, .bar-header')) return
  // rolando/selecionando o histórico não é batida
  if (event.target.closest('.duxi-history, .duxi-input')) return
  hitDuxi()
}

onBeforeUnmount(() => {
  barResizeObserver.disconnect()
  fillResizeObserver.disconnect()
  if (particleRaf) cancelAnimationFrame(particleRaf)
})
</script>

<style scoped>
.duxi-top-bar {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  width: fit-content;
  min-width: 0;
  transition: min-width 0.35s ease;
  /* nunca encosta no badge de usuário (canto esquerdo) nem na engrenagem
     (canto direito) — quem encolhe é o texto da Duxi, com reticências */
  max-width: calc(100% - 460px);
}

/* left/right vêm de dockMaskStyle (derivados do raio do fillet) — só o eixo
   horizontal transborda */
.dock-surface {
  position: absolute;
  top: 0;
  bottom: 0;
  background: #000;
  box-shadow: 0 3px 14px var(--color-shadow);
  pointer-events: none;
}

/* faixa dos ícones: no preto, acima do painel cinza (que desce pra abrir
   espaço pra ela, ver .engaged .focus-fill) */
.bar-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 6px 14px 0;
  box-sizing: border-box;
}

.header-group {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 24px;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

.header-btn.active {
  background: rgba(255, 255, 255, 0.9);
  color: #000000;
}

.header-fade-enter-active {
  transition: opacity 0.3s ease 0.15s;
}

.header-fade-leave-active {
  transition: opacity 0.12s ease;
}

.header-fade-enter-from,
.header-fade-leave-to {
  opacity: 0;
}

/* fundo cinza do foco (enquanto o usuário fala): ocupa a barra inteira, mas
   recuado alguns px das bordas — a faixa preta que sobra em volta vira a
   borda dele */
.focus-fill {
  position: absolute;
  inset: 6px;
  border-radius: 11px;
  background: #1c1c20;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.35s ease;
  pointer-events: none;
}

.particles {
  display: block;
}

.duxi-top-bar.engaged .focus-fill {
  top: 34px;
}

.focus-fill.visible {
  opacity: 1;
}

.bar-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 5px 8px;
  transition:
    padding 0.35s ease,
    min-width 0.35s ease;
}

/* desligada: espaço à direita pro "zZz" subindo da cabeça */
.bar-row.sleeping {
  padding-right: 20px;
}

/* engajada (até desativar no clique): barra grande — ~50% da largura da
   área do canvas. Foco = robô no meio; texto = robô no canto e o texto ao
   lado */
.duxi-top-bar.engaged {
  min-width: min(50%, calc(100% - 460px));
}

.bar-row.engaged {
  padding: 16px 24px;
}

.bar-row.engaged.phase-text {
  justify-content: flex-start;
}

/* compacta/desligada com erro: robô pequeno + mensagem ao lado */
.bar-row.phase-text:not(.engaged) {
  padding: 6px 10px;
}
</style>
