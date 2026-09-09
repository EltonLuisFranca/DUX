import { ref } from 'vue'
import { checkTerminalAvailability } from '../lib/bridgeClient'

// Começa tudo fechado — a checagem real (via bridge, ver
// bridge/terminalAvailability.js) chega assim que a promise resolver.
// Módulo singleton: a consulta roda uma única vez por sessão do app, no
// import (disparado por AddNodeModal.vue), não a cada vez que o modal abre.
export const terminalAvailability = ref({ shell: true, wsl: false, powershell: false, cmd: false })

checkTerminalAvailability().then((result) => {
  terminalAvailability.value = result
})
