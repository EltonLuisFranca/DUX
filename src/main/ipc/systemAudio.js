import { ipcMain, desktopCapturer } from 'electron'
import { spawn } from 'child_process'
import { platform } from '../platform'
import { analyzeAudio } from '../../shared/audioBands'

// Áudio do sistema (o que o PC está tocando) pra Duxi pôr os fones quando
// tem música — opção "Reagir à música do PC", desligada por padrão. Dois
// caminhos, escolhidos por platform.systemAudio:
// - 'loopback' (Windows): o renderer chama getDisplayMedia e o handler abaixo
//   responde com o loopback do sistema (WASAPI). A API exige vídeo junto — o
//   renderer descarta a trilha de vídeo na hora. Toda a análise fica lá.
// - 'pulse-monitor' (Linux): parec gravando o monitor da saída padrão do
//   PulseAudio/PipeWire. A análise (volume + faixas) roda aqui e só os
//   números vão pro renderer, ~20x por segundo.

// getDisplayMedia só vira loopback logo depois do renderer pedir
// (system-audio:arm-loopback) — qualquer outra chamada (ex: página aberta
// num node de browser) continua sendo recusada, como era sem handler.
const ARM_WINDOW_MS = 5_000
let loopbackArmedUntil = 0

export function attachSystemAudioLoopback(win) {
  if (platform.systemAudio !== 'loopback') return
  win.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
    const main = win.isDestroyed() ? null : win.webContents.mainFrame
    const fromApp =
      main && request.frame && request.frame.processId === main.processId && request.frame.routingId === main.routingId
    const armed = Date.now() < loopbackArmedUntil
    loopbackArmedUntil = 0
    if (!fromApp || !armed) {
      callback({})
      return
    }
    try {
      const [screen] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      if (!screen) {
        callback({})
        return
      }
      callback({ video: screen, audio: 'loopback' })
    } catch (err) {
      console.error('[system-audio] loopback falhou', err)
      callback({})
    }
  })
}

const PAREC_RATE = 11025
const PAREC_WINDOW = 512 // ~46ms por análise
let parec = null

function stopParec() {
  if (!parec) return
  const proc = parec
  parec = null
  proc.kill()
}

function startParec(sender) {
  stopParec()
  const proc = spawn('parec', [
    '--device=@DEFAULT_MONITOR@',
    '--format=float32le',
    `--rate=${PAREC_RATE}`,
    '--channels=1',
    '--latency-msec=50',
    '--client-name=DUX',
    '--stream-name=Duxi (música do PC)'
  ])
  parec = proc
  const send = (channel, payload) => {
    if (!sender.isDestroyed()) sender.send(channel, payload)
  }
  const fail = (message) => {
    if (parec !== proc) return // parado de propósito
    parec = null
    send('system-audio:error', message)
  }

  const samples = new Float32Array(PAREC_WINDOW)
  let filled = 0
  let leftover = Buffer.alloc(0)
  let stderr = ''
  proc.stdout.on('data', (chunk) => {
    const buf = leftover.length ? Buffer.concat([leftover, chunk]) : chunk
    const count = Math.floor(buf.length / 4)
    let latest = null
    for (let i = 0; i < count; i++) {
      samples[filled++] = buf.readFloatLE(i * 4)
      if (filled === PAREC_WINDOW) {
        latest = analyzeAudio(samples, PAREC_RATE)
        filled = 0
      }
    }
    leftover = buf.subarray(count * 4)
    // chegou mais de uma janela de uma vez: só a mais recente interessa
    if (latest) send('system-audio:frame', latest)
  })
  proc.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-500)
  })
  proc.on('error', (err) => {
    fail(err.code === 'ENOENT' ? 'parec não encontrado — instale o pacote pulseaudio-utils' : err.message)
  })
  proc.on('exit', (code) => {
    fail(`parec saiu (código ${code})${stderr.trim() ? `: ${stderr.trim()}` : ''}`)
  })
  sender.once('destroyed', () => {
    if (parec === proc) stopParec()
  })
}

export function registerSystemAudioIpc() {
  ipcMain.handle('system-audio:arm-loopback', () => {
    loopbackArmedUntil = Date.now() + ARM_WINDOW_MS
  })
  ipcMain.handle('system-audio:start', (event) => {
    if (platform.systemAudio === 'pulse-monitor') startParec(event.sender)
  })
  ipcMain.handle('system-audio:stop', () => stopParec())
}
