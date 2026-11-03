// Formatação compartilhada dos limites de plano do Claude (ClaudeUsageDock e
// aba Contas Claude das configurações).

export function usageSeverity(percent) {
  if (percent >= 90) return 'danger'
  if (percent >= 70) return 'warn'
  return ''
}

export function usageColor(percent) {
  if (percent >= 90) return '#ef4444'
  if (percent >= 70) return '#d97706'
  return '#10b981'
}

// "às 14:30" se for hoje, "qua., 07:59" se não
export function formatReset(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return `às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }
  return date.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

// "agora", "há 3 min", "há 2 h", "há 4 dias"
export function formatAgo(iso, now = Date.now()) {
  if (!iso) return null
  const ms = now - new Date(iso).getTime()
  if (Number.isNaN(ms)) return null
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return `há ${d} dia${d === 1 ? '' : 's'}`
}

// valores em unidade mínima (centavos) + casas decimais, como o endpoint manda
export function formatMoney(minor, currency, decimals = 2) {
  if (typeof minor !== 'number') return '—'
  const value = minor / 10 ** decimals
  try {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: currency || 'USD' })
  } catch {
    return value.toFixed(decimals)
  }
}
