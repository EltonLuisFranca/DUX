// Tudo que muda entre o DUX no Linux e no Windows mora aqui — o resto do
// código não testa process.platform direto, lê o perfil. Assim dá pra ver de
// uma vez o que cada instalador faz de diferente, e portar algo de um lado
// pro outro (ex: whisper com GPU no Windows) é trocar um campo, não caçar
// `if (win32)` espalhado.
//
// Importado tanto pelo main quanto pelo renderer (que recebe o nome da
// plataforma via window.platformInfo, exposto no preload) — por isso é só
// dado puro, sem nada de Node/Electron.
const PROFILES = {
  linux: {
    // subpasta de resources/<binário>/ com os executáveis vendorados desta
    // plataforma (em dev; empacotado, extraResources achata pra resources/<binário>/)
    resourcesDir: 'linux',
    exeSuffix: '',
    // bridge (bridge/server.js) roda direto como processo filho
    bridge: { mode: 'native' },
    // whisper.cpp compilado na própria máquina com Vulkan (npm run
    // whisper:vulkan) — roda na GPU, então aguenta o modelo grande
    whisper: { model: 'large-v3-turbo', server: 'compiled' },
    features: {
      lipSync: true,
      // node "Terminal WSL · Claude Code" só faz sentido com um host Windows
      wslClaudeTerminal: false
    },
    duxiDefaults: { wakeWordEnabled: true }
  },
  win32: {
    resourcesDir: 'win',
    exeSuffix: '.exe',
    // bridge depende de node-pty/zsh, então roda dentro do WSL
    bridge: { mode: 'wsl', distro: 'Debian' },
    // whisper-server.exe oficial só-CPU vendorizado em resources/whisper/win
    // (a máquina de release não tem MSVC/cmake pra compilar) — o turbo
    // ficaria lento demais pro ditado ao vivo; small é o meio-termo que erra
    // bem menos que o base em português e ainda dá conta na CPU
    whisper: { model: 'small', server: 'bundled' },
    features: {
      // ainda não tem rhubarb.exe vendorizado — a boca só não sincroniza
      lipSync: false,
      wslClaudeTerminal: true
    },
    // whisper só-CPU + modelo menor: ouvir o nome o tempo todo custa CPU
    // contínuo e erra o "Duxi" com frequência — fica opt-in
    duxiDefaults: { wakeWordEnabled: false }
  }
}

// macOS e qualquer outro caem no perfil Linux (mesmo comportamento de antes,
// quando tudo que não era win32 seguia o caminho do Linux)
export function getPlatformProfile(platform) {
  return PROFILES[platform] ?? PROFILES.linux
}
