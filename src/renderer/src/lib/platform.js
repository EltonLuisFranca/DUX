import { getPlatformProfile } from '../../../shared/platformProfile'

// mesmo perfil que o main usa (ver shared/platformProfile.js) — o nome da
// plataforma vem do preload, já que o renderer não tem process.platform
export const platform = getPlatformProfile(window.platformInfo?.platform)
