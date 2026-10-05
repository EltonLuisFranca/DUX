import { app } from 'electron'
import { join } from 'path'
import { getPlatformProfile } from '../shared/platformProfile'

export const platform = getPlatformProfile(process.platform)

// Caminho de algo listado em asarUnpack (bridge/, binários do whisper.cpp):
// empacotado precisa rodar como arquivo real, então mora em
// app.asar.unpacked, não dentro do arquivo virtual .asar.
export function unpackedAppPath(...segments) {
  const path = join(app.getAppPath(), ...segments)
  return app.isPackaged ? path.replace('app.asar', 'app.asar.unpacked') : path
}

// Executável vendorado à mão em resources/<name>/<linux|win>/ e embutido no
// instalador via extraResources (que já achata pra resources/<name>/ e nunca
// entra no .asar). Só monta o caminho — quem chama checa existsSync.
export function vendoredBinaryPath(name, binary) {
  const file = `${binary}${platform.exeSuffix}`
  return app.isPackaged
    ? join(process.resourcesPath, name, file)
    : join(app.getAppPath(), 'resources', name, platform.resourcesDir, file)
}
