// Desenhos extras do rosto da Duxi (DuxiBot.vue): caras e gestos das reações
// ao app (comemorar, erro, buscando, escrevendo, confusa) e das ações de
// quando está ociosa (chiclete, assobio, alongamento, cochilo). Funções puras
// de canvas — recebem o ctx e a geometria do frame (`g`, montada em
// drawRobotFace) e não guardam estado; quem decide QUANDO e com que
// intensidade desenhar é o DuxiBot.
//
// g = { cx, cy, ox, oy, boxW, boxH, eyeD, eyeW, eyeGapX, eyeY, lookOffsetX,
//       shellColor, clock }

const INK = '#000000'

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function rgb(c, alpha = 1) {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`
}

function starPath(ctx, x, y, r, rotation = 0, inner = 0.45) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = rotation - Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * inner
    const px = x + Math.cos(a) * rr
    const py = y + Math.sin(a) * rr
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

function eyeCenters(g) {
  return [-1, 1].map((sign) => ({ sign, x: g.cx + sign * g.eyeGapX + g.lookOffsetX, y: g.eyeY }))
}

// mãozinha redonda solta (mesmo estilo do tchau): esfera da cor do casco
export function drawHand(ctx, g, x, y, r, alpha = 1) {
  if (r <= 0.2 || alpha <= 0.01) return
  ctx.save()
  ctx.globalAlpha *= alpha
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
  grad.addColorStop(0, rgb(mix(g.shellColor, [255, 255, 255], 0.6)))
  grad.addColorStop(1, rgb(mix(g.shellColor, [0, 0, 0], 0.12)))
  ctx.shadowBlur = g.boxH * 0.06
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// --- comemorar: olhos de estrela dourados, girando e pulsando de leve
export function drawStarEyes(ctx, g, amount) {
  const r = g.eyeD * 0.5 * (1 + 0.08 * Math.sin(g.clock * 9))
  ctx.save()
  ctx.globalAlpha *= amount
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, g.boxH * 0.022)
  ctx.strokeStyle = '#7a4a00'
  ctx.fillStyle = '#fbbf24'
  ctx.shadowBlur = g.boxH * 0.08
  ctx.shadowColor = 'rgba(251, 191, 36, 0.8)'
  for (const e of eyeCenters(g)) {
    starPath(ctx, e.x, e.y, r, Math.sin(g.clock * 3 + e.sign) * 0.25)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

// confete: pedacinhos coloridos lançados pra cima, girando e caindo
const CONFETTI_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6']

export function spawnConfetti(g, count = 46) {
  return Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
    const speed = g.boxH * (1.6 + Math.random() * 2.2)
    return {
      x: g.cx + (Math.random() - 0.5) * g.boxW * 0.6,
      y: g.oy + g.boxH * 0.2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 14,
      w: g.boxH * (0.05 + Math.random() * 0.05),
      h: g.boxH * (0.025 + Math.random() * 0.03),
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      age: 0
    }
  })
}

// avança e desenha; devolve só os que ainda estão vivos
export function stepConfetti(ctx, g, pieces, dt, life = 1.8) {
  const gravity = g.boxH * 5.5
  const drag = Math.exp(-dt * 1.6)
  ctx.save()
  const alive = pieces.filter((p) => {
    p.age += dt
    if (p.age > life) return false
    p.vy += gravity * dt
    p.vx *= drag
    p.vy *= drag
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rot += p.vr * dt
    ctx.globalAlpha = Math.min(1, (life - p.age) / 0.5)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    // "vira" no ar: a largura pulsa como um papelzinho girando
    ctx.scale(Math.cos(p.rot * 1.7), 1)
    ctx.fillStyle = p.color
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
    ctx.restore()
    return true
  })
  ctx.restore()
  return alive
}

// --- erro: olhos em X + gota de suor escorrendo pela lateral
export function drawXEyes(ctx, g, amount) {
  const s = g.eyeD * 0.3
  ctx.save()
  ctx.globalAlpha *= amount
  ctx.strokeStyle = INK
  ctx.lineCap = 'round'
  ctx.lineWidth = g.eyeW * 0.5
  for (const e of eyeCenters(g)) {
    ctx.beginPath()
    ctx.moveTo(e.x - s, e.y - s)
    ctx.lineTo(e.x + s, e.y + s)
    ctx.moveTo(e.x + s, e.y - s)
    ctx.lineTo(e.x - s, e.y + s)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawSweatDrop(ctx, g, amount, age) {
  // nasce no alto da lateral direita e escorre até sumir
  const slide = Math.min(1, age / 1.8)
  const x = g.ox + g.boxW * 0.86
  const y = g.oy + g.boxH * (0.22 + 0.45 * slide * slide)
  const r = g.boxH * 0.065
  ctx.save()
  ctx.globalAlpha *= amount * (1 - Math.max(0, slide - 0.75) / 0.25)
  ctx.beginPath()
  ctx.moveTo(x, y - r * 2.1)
  ctx.bezierCurveTo(x + r * 0.2, y - r * 1.2, x + r, y - r * 0.4, x + r, y + r * 0.2)
  ctx.arc(x, y + r * 0.2, r, 0, Math.PI)
  ctx.bezierCurveTo(x - r, y - r * 0.4, x - r * 0.2, y - r * 1.2, x, y - r * 2.1)
  ctx.closePath()
  ctx.fillStyle = '#7dd3fc'
  ctx.fill()
  ctx.strokeStyle = '#0369a1'
  ctx.lineWidth = Math.max(1, g.boxH * 0.014)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.beginPath()
  ctx.arc(x - r * 0.35, y - r * 0.1, r * 0.25, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// --- buscando: lupa passando de um olho pro outro. Devolve a posição x da
// lente pra o DuxiBot aumentar o olho que estiver atrás dela.
export function lensX(g, age) {
  return g.cx + Math.sin(age * 1.8) * g.eyeGapX * 1.25 + g.lookOffsetX
}

export function drawLens(ctx, g, amount, age) {
  const x = lensX(g, age)
  const y = g.eyeY + g.eyeD * 0.05
  const r = g.eyeD * 0.62
  ctx.save()
  ctx.globalAlpha *= amount
  // cabo saindo pra baixo à direita
  ctx.strokeStyle = '#3f2a14'
  ctx.lineCap = 'round'
  ctx.lineWidth = g.boxH * 0.07
  ctx.beginPath()
  ctx.moveTo(x + r * 0.72, y + r * 0.72)
  ctx.lineTo(x + r * 1.55, y + r * 1.55)
  ctx.stroke()
  // vidro + reflexo + aro
  ctx.fillStyle = 'rgba(186, 230, 253, 0.28)'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.lineWidth = g.boxH * 0.022
  ctx.beginPath()
  ctx.arc(x, y, r * 0.68, Math.PI * 1.1, Math.PI * 1.45)
  ctx.stroke()
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = g.boxH * 0.04
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

// --- escrevendo: mãozinha com lápis rabiscando no ar, do lado direito
export function writingHandPos(g, age) {
  // rabisco: laço pequeno e rápido
  return {
    x: g.ox + g.boxW + g.boxH * 0.14 + Math.cos(age * 13) * g.boxH * 0.06,
    y: g.oy + g.boxH * 0.42 + Math.sin(age * 26) * g.boxH * 0.035
  }
}

export function drawWritingHand(ctx, g, amount, age) {
  const p = writingHandPos(g, age)
  const len = g.boxH * 0.62
  const w = g.boxH * 0.095
  ctx.save()
  ctx.globalAlpha *= amount
  // lápis segurado pelo meio: borracha pra cima/direita, ponta pra baixo/
  // esquerda, rabiscando
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(Math.PI * 0.72 + Math.sin(age * 13) * 0.08)
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, g.boxH * 0.016)
  ctx.strokeStyle = '#1f2937'
  const back = -len * 0.45
  const woodAt = len * 0.32
  const tipAt = len * 0.55
  ctx.fillStyle = '#f472b6' // borracha
  ctx.fillRect(back, -w / 2, len * 0.12, w)
  ctx.fillStyle = '#cbd5e1' // anel de metal
  ctx.fillRect(back + len * 0.12, -w / 2, len * 0.05, w)
  ctx.fillStyle = '#facc15' // corpo
  ctx.fillRect(back + len * 0.17, -w / 2, woodAt - back - len * 0.17, w)
  ctx.strokeRect(back, -w / 2, woodAt - back, w)
  ctx.beginPath() // ponta de madeira + grafite
  ctx.moveTo(woodAt, -w / 2)
  ctx.lineTo(tipAt, 0)
  ctx.lineTo(woodAt, w / 2)
  ctx.closePath()
  ctx.fillStyle = '#fde4c3'
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(tipAt - len * 0.07, -w * 0.18)
  ctx.lineTo(tipAt, 0)
  ctx.lineTo(tipAt - len * 0.07, w * 0.18)
  ctx.closePath()
  ctx.fillStyle = '#1f2937'
  ctx.fill()
  ctx.restore()
  drawHand(ctx, g, p.x, p.y, g.boxH * 0.13)
  ctx.restore()
}

// --- confusa (pergunta ambígua): "?" flutuando sobre o canto direito
export function drawQuestionMark(ctx, g, amount) {
  const size = g.boxH * 0.42
  const x = g.ox + g.boxW + g.boxH * 0.05
  const y = g.oy + g.boxH * 0.05 + Math.sin(g.clock * 3) * g.boxH * 0.04
  ctx.save()
  ctx.globalAlpha *= amount
  ctx.translate(x, y)
  ctx.rotate(0.18 + Math.sin(g.clock * 2) * 0.08)
  ctx.font = `800 ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowBlur = g.boxH * 0.08
  ctx.shadowColor = 'rgba(96, 165, 250, 0.7)'
  ctx.fillStyle = '#ffffff'
  ctx.fillText('?', 0, 0)
  ctx.restore()
}

// --- chiclete: bolha rosa saindo da boca, crescendo e estourando
export const GUM_POP_AT = 2.5

export function drawGum(ctx, g, age) {
  const mx = g.cx + g.boxH * 0.06
  const my = g.oy + g.boxH * 0.76
  ctx.save()
  if (age < GUM_POP_AT) {
    const grow = Math.min(1, age / (GUM_POP_AT - 0.2))
    const r = g.boxH * (0.05 + 0.22 * grow * grow) * (1 + 0.04 * Math.sin(age * 14))
    const bx = mx + r * 0.25
    const by = my + r * 0.15
    const grad = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r)
    grad.addColorStop(0, 'rgba(253, 186, 220, 0.95)')
    grad.addColorStop(1, 'rgba(236, 72, 153, 0.9)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(bx, by, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
    ctx.beginPath()
    ctx.ellipse(bx - r * 0.38, by - r * 0.42, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // estouro: pedacinhos voando + resto grudado na boca, sumindo
    const t = age - GUM_POP_AT
    ctx.globalAlpha *= Math.max(0, 1 - t / 0.9)
    ctx.fillStyle = '#ec4899'
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const d = g.boxH * (0.12 + t * 0.6)
      ctx.beginPath()
      ctx.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d * 0.7, g.boxH * 0.025, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.ellipse(mx, my + g.boxH * 0.01, g.boxH * 0.09, g.boxH * 0.035, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// --- assobio: boquinha em "o" de lado + notas musicais subindo e balançando
export function drawWhistle(ctx, g, amount, age) {
  const mx = g.cx + g.boxH * 0.14
  const my = g.oy + g.boxH * 0.76
  ctx.save()
  ctx.globalAlpha *= amount
  ctx.strokeStyle = INK
  ctx.lineWidth = g.boxH * 0.028
  ctx.beginPath()
  ctx.arc(mx, my, g.boxH * 0.04, 0, Math.PI * 2)
  ctx.stroke()
  ctx.font = `700 ${g.boxH * 0.24}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.shadowBlur = g.boxH * 0.06
  ctx.shadowColor = 'rgba(255, 255, 255, 0.6)'
  // uma nota nova a cada 0.7s, cada uma vive 1.6s
  for (let k = 0; k < 6; k++) {
    const born = k * 0.7
    const t = age - born
    if (t < 0 || t > 1.6) continue
    const p = t / 1.6
    const x = mx + g.boxH * (0.12 + p * 0.45) + Math.sin(t * 6 + k) * g.boxH * 0.05
    const y = my - g.boxH * (0.1 + p * 0.65)
    ctx.globalAlpha = amount * Math.sin(p * Math.PI)
    ctx.fillText(k % 2 ? '♫' : '♪', x, y)
  }
  ctx.restore()
}

// --- cochilo: "z" pequenininhos enquanto cabeceia; "!" no susto
export function drawNapMarks(ctx, g, nodding, startle) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  if (nodding > 0.02) {
    ctx.globalAlpha *= nodding
    ctx.font = `700 ${g.boxH * 0.18}px system-ui, sans-serif`
    for (let k = 0; k < 2; k++) {
      const t = (g.clock * 0.8 + k * 0.5) % 1
      ctx.globalAlpha = nodding * Math.sin(t * Math.PI)
      ctx.fillText('z', g.ox + g.boxW + g.boxH * (0.05 + t * 0.15), g.oy + g.boxH * (0.2 - t * 0.35))
    }
  }
  if (startle > 0.02) {
    ctx.globalAlpha = startle
    ctx.font = `900 ${g.boxH * 0.34}px system-ui, sans-serif`
    ctx.shadowBlur = g.boxH * 0.08
    ctx.shadowColor = 'rgba(251, 191, 36, 0.8)'
    ctx.fillStyle = '#fbbf24'
    ctx.fillText('!', g.ox + g.boxW + g.boxH * 0.08, g.oy + g.boxH * 0.02)
  }
  ctx.restore()
}
