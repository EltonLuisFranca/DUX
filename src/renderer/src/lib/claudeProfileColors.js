// Cor de identificação de cada perfil de conta Claude — derivada da posição
// na lista (padrão sempre primeiro), então é estável sem precisar guardar
// nada e as primeiras contas ficam sempre com cores bem distintas entre si.
const PALETTE = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#84cc16']

export function profileColor(id, profiles) {
  const index = profiles.findIndex((p) => p.id === id)
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length]
}
