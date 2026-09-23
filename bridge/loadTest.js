const REQUEST_TIMEOUT_MS = 10_000
const TICK_MS = 100
const PROGRESS_INTERVAL_MS = 500

// Não é ferramenta de ataque — é teste de carga CONTROLADO contra o próprio
// sistema do usuário (pedido explícito do card: origem única, RPS/duração
// definidos, nada de DDoS distribuído). Estes tetos existem por isso, não só
// por performance: 5000 RPS/10min já é um teste de carga sério pra qualquer
// serviço interno, sem chegar perto de escala de ataque real.
const MAX_RPS = 5000
const MAX_DURATION_SEC = 600
// backpressure de segurança: nunca deveria chegar perto disso com os tetos
// acima (5000 RPS * 10s de timeout = 50000 no pior caso teórico), mas evita
// acumular requisições em voo sem limite se o alvo travar respondendo
const MAX_CONCURRENT_REQUESTS = 60_000

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0))
}

function buildHeaderMap(target) {
  const headerMap = {}
  for (const h of target.headers || []) {
    if (h.key?.trim()) headerMap[h.key.trim()] = h.value
  }
  if (target.body && !Object.keys(headerMap).some((k) => k.toLowerCase() === 'content-type')) {
    headerMap['Content-Type'] = 'application/json'
  }
  return headerMap
}

function percentile(sortedLatencies, p) {
  if (sortedLatencies.length === 0) return 0
  const idx = Math.min(sortedLatencies.length - 1, Math.floor((p / 100) * sortedLatencies.length))
  return sortedLatencies[idx]
}

// Agendador por tick (token bucket, 10 ticks/s): a cada tick, acumula
// rpsAlvoNoInstante * (TICK_MS/1000) requisições "devidas" e dispara a parte
// inteira, carregando a fração pro próximo tick — evita o erro de
// arredondamento que rolaria se cada tick só disparasse Math.round(rps/10).
// rampUpSec faz o rpsAlvoNoInstante crescer linearmente de 0 até `rps` — é
// isso que dá o ramp-up pedido no card, que autocannon não oferece nativo.
function createRunner({ target, rps, durationSec, rampUpSec }, { onProgress, onDone }) {
  const url = target?.url || ''
  const method = (target?.method || 'GET').toUpperCase()
  const headerMap = buildHeaderMap(target || {})
  const hasBody = Boolean(target?.body) && !['GET', 'HEAD'].includes(method)

  const targetRps = clamp(rps, 1, MAX_RPS)
  const totalDurationSec = clamp(durationSec, 1, MAX_DURATION_SEC)
  const rampSec = clamp(rampUpSec, 0, totalDurationSec)

  let cancelled = false
  let finished = false
  let accumulator = 0
  let totalSent = 0
  let totalCompleted = 0
  let totalErrors = 0
  const allLatencies = []
  const activeControllers = new Set()
  const inFlight = new Set()

  let windowCompleted = 0
  let windowErrors = 0
  let windowLatencySum = 0

  const startedAt = Date.now()

  function currentTargetRps(elapsedMs) {
    if (rampSec <= 0) return targetRps
    const elapsedSec = elapsedMs / 1000
    if (elapsedSec >= rampSec) return targetRps
    return targetRps * (elapsedSec / rampSec)
  }

  function fireOne() {
    if (activeControllers.size >= MAX_CONCURRENT_REQUESTS) return
    const controller = new AbortController()
    activeControllers.add(controller)
    const timeout = setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS)
    const sentAt = Date.now()
    totalSent += 1

    const attempt = fetch(url, {
      method,
      headers: headerMap,
      body: hasBody ? target.body : undefined,
      signal: controller.signal
    })
      // consome o corpo (libera a conexão keep-alive pro undici reaproveitar
      // — importante em RPS alto) sem guardar o conteúdo, que não importa
      // pro load test
      .then((response) => response.arrayBuffer().then(() => response))
      .then((response) => {
        const latencyMs = Date.now() - sentAt
        const isError = response.status >= 400
        totalCompleted += 1
        windowCompleted += 1
        windowLatencySum += latencyMs
        allLatencies.push(latencyMs)
        if (isError) {
          totalErrors += 1
          windowErrors += 1
        }
      })
      .catch(() => {
        // erro de rede/timeout real conta; abort disparado pelo stop() do
        // usuário, não — senão parar o teste manualmente infla a taxa de
        // erro artificialmente com o último lote em voo
        if (!cancelled) {
          totalCompleted += 1
          totalErrors += 1
          windowCompleted += 1
          windowErrors += 1
        }
      })
      .finally(() => {
        clearTimeout(timeout)
        activeControllers.delete(controller)
        inFlight.delete(attempt)
      })

    inFlight.add(attempt)
  }

  function finishScheduling() {
    if (finished) return
    finished = true
    clearInterval(tickTimer)
    clearInterval(progressTimer)
    Promise.all(Array.from(inFlight)).then(() => {
      const sorted = [...allLatencies].sort((a, b) => a - b)
      const durationMs = Date.now() - startedAt
      onDone({
        cancelled,
        totalSent,
        totalCompleted,
        totalErrors,
        errorRate: totalCompleted ? totalErrors / totalCompleted : 0,
        achievedRps: durationMs > 0 ? totalCompleted / (durationMs / 1000) : 0,
        durationMs,
        latency: {
          avg: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          p99: percentile(sorted, 99)
        }
      })
    })
  }

  if (!url) {
    setTimeout(() => onDone({ error: 'URL alvo não informada' }), 0)
    return { stop() {} }
  }

  const tickTimer = setInterval(() => {
    const elapsedMs = Date.now() - startedAt
    if (elapsedMs / 1000 >= totalDurationSec) {
      finishScheduling()
      return
    }
    const rpsNow = currentTargetRps(elapsedMs)
    accumulator += rpsNow * (TICK_MS / 1000)
    const toFire = Math.floor(accumulator)
    accumulator -= toFire
    for (let i = 0; i < toFire; i++) fireOne()
  }, TICK_MS)

  const progressTimer = setInterval(() => {
    const elapsedMs = Date.now() - startedAt
    const windowRps = windowCompleted / (PROGRESS_INTERVAL_MS / 1000)
    onProgress({
      elapsedSec: Math.min(elapsedMs / 1000, totalDurationSec),
      targetRpsNow: Math.round(currentTargetRps(elapsedMs)),
      windowRps: Math.round(windowRps),
      avgLatencyMs: windowCompleted ? Math.round(windowLatencySum / windowCompleted) : null,
      errorRate: windowCompleted ? windowErrors / windowCompleted : 0,
      totalSent,
      totalCompleted
    })
    windowCompleted = 0
    windowErrors = 0
    windowLatencySum = 0
  }, PROGRESS_INTERVAL_MS)

  return {
    stop() {
      if (cancelled) return
      cancelled = true
      finishScheduling()
      for (const c of activeControllers) c.abort('stop')
    }
  }
}

module.exports = { createRunner, MAX_RPS, MAX_DURATION_SEC }
