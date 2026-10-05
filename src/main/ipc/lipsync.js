import { ipcMain, app } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs'
import { platform, vendoredBinaryPath } from '../platform'

// Rhubarb Lip Sync analisa um WAV já pronto (não precisa de modelo/download,
// é DSP + reconhecimento fonético, não IA) e devolve uma timeline de visemas
// (formatos de boca A-H/X com start/end em segundos). Diferente do
// whisper-server em voice.js, aqui não vale a pena manter processo de vida
// longa: cada fala da Duxi é só alguns segundos, então spawn avulso por
// chamada (igual ao nodewhisper() do handler voice:transcribe) é simples e
// rápido o bastante.
//
// Empacotado via extraResources (não asarUnpack) porque não é um binário
// dentro de node_modules — é vendorado à mão em resources/rhubarb/. Isso
// significa que, ao contrário do whisper, não precisamos do truque
// .replace('app.asar', 'app.asar.unpacked'): extraResources nunca entra no
// .asar, process.resourcesPath já aponta direto pro lugar certo. Só existe
// pras plataformas com platform.features.lipSync.
const RHUBARB_BIN = vendoredBinaryPath('rhubarb', 'rhubarb')

const RHUBARB_TIMEOUT_MS = 5_000

function runRhubarb(wavPath, jsonPath) {
  return new Promise((resolve, reject) => {
    // recognizer "pocketSphinx" (padrão do binário) só reconhece inglês — o
    // Duxi fala pt_BR, então precisa do "phonetic" (reconhece só sons,
    // independente de idioma; menos preciso, mas é o único que funciona
    // aqui). Como bônus, phonetic não depende dos modelos de idioma em
    // res/sphinx/ (~65MB, específicos de en-us), então não precisamos
    // vendorar esse diretório — só o binário.
    const args = ['-r', 'phonetic', '-f', 'json', '-o', jsonPath, wavPath]

    const proc = spawn(RHUBARB_BIN, args)
    let stderr = ''

    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('rhubarb não respondeu a tempo'))
    }, RHUBARB_TIMEOUT_MS)

    proc.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`rhubarb saiu com código ${code}: ${stderr.trim()}`))
    })
  })
}

export function registerLipSyncIpc() {
  ipcMain.handle('lipsync:analyze', async (_event, { buffer }) => {
    const stamp = Date.now()
    const wavPath = join(app.getPath('temp'), `dux-lipsync-${stamp}.wav`)
    const jsonPath = join(app.getPath('temp'), `dux-lipsync-${stamp}.json`)

    if (!platform.features.lipSync) return { ok: true, mouthCues: [] }

    try {
      if (!existsSync(RHUBARB_BIN)) {
        console.error('[lipsync] binário não encontrado em', RHUBARB_BIN, '— sem lip-sync')
        return { ok: true, mouthCues: [] } // sem binário vendorado ainda — degrada pra sem lip-sync
      }

      writeFileSync(wavPath, Buffer.from(buffer))
      await runRhubarb(wavPath, jsonPath)

      const { mouthCues } = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      console.log('[lipsync] ok:', (mouthCues || []).length, 'cues')
      return { ok: true, mouthCues: mouthCues || [] }
    } catch (err) {
      console.error('[lipsync] análise falhou', err)
      return { ok: true, mouthCues: [] } // falha aqui nunca deve derrubar a fala, só perder o lip-sync
    } finally {
      if (existsSync(wavPath)) unlinkSync(wavPath)
      if (existsSync(jsonPath)) unlinkSync(jsonPath)
    }
  })
}
