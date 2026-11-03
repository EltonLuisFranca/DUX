// Análise leve de um trecho de áudio (amostras float -1..1): volume (RMS) e
// energia em BAND_COUNT faixas de frequência espaçadas em escala log (graves
// primeiro) — é o que a Duxi usa pra saber se tem música tocando no PC e pra
// desenhar as barrinhas de áudio. Só dado puro, sem Node/DOM: roda no main
// (Linux, áudio vindo do parec) e no renderer (Windows, loopback via
// AnalyserNode), igual ao platformProfile.
export const BAND_COUNT = 6
const MIN_HZ = 50
const MAX_HZ = 5000
// faixa de dB mapeada pra 0..1 em cada banda (abaixo = 0, acima = 1)
const FLOOR_DB = -75
const CEIL_DB = -25

// magnitude de cada bin (0..n/2) com janela de Hann — FFT radix-2 iterativa,
// `samples.length` tem que ser potência de 2
function fftMagnitudes(samples) {
  const n = samples.length
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let j = 0
    for (let bit = 1, k = i; bit < n; bit <<= 1, k >>= 1) j = (j << 1) | (k & 1)
    re[j] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)))
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const step = (-2 * Math.PI) / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(step * k)
        const wi = Math.sin(step * k)
        const a = start + k
        const b = a + half
        const tr = re[b] * wr - im[b] * wi
        const ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
  const mags = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) mags[k] = Math.hypot(re[k], im[k]) / n
  return mags
}

// { level: RMS 0..1, bands: BAND_COUNT valores 0..1 }
export function analyzeAudio(samples, sampleRate) {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  const level = Math.sqrt(sum / samples.length)

  const mags = fftMagnitudes(samples)
  const binHz = sampleRate / samples.length
  const bands = []
  for (let b = 0; b < BAND_COUNT; b++) {
    const lo = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, b / BAND_COUNT)
    const hi = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, (b + 1) / BAND_COUNT)
    const from = Math.max(1, Math.floor(lo / binHz))
    const to = Math.min(mags.length, Math.max(from + 1, Math.ceil(hi / binHz)))
    let peak = 0
    for (let k = from; k < to; k++) peak = Math.max(peak, mags[k])
    const db = 20 * Math.log10(peak + 1e-9)
    bands.push(Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB))))
  }
  return { level, bands }
}
