<template>
  <div ref="rootRef" class="duxi-top-bar" :class="{ engaged: duxiEngaged }" @click="handleBarClick">
    <div class="dock-surface" :style="dockMaskStyle" />
    <div ref="fillRef" class="focus-fill" :class="{ visible: duxiEngaged }">
      <canvas ref="particlesEl" class="particles" />
    </div>
    <div class="bar-row" :class="[`phase-${duxiPhase}`, { engaged: duxiEngaged, sleeping: duxiState === 'off' }]">
      <DuxiBot />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DuxiBot from './DuxiBot.vue'
import { duxiPhase, duxiEngaged, duxiState, hearingVoice, hitDuxi } from '../store/duxiStore'
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
  if (event.target.closest('.face-wrap')) return
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
