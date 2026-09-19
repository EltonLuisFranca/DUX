import { TAG_COLORS } from './duxbanOps'

// Constantes e helpers de apresentação de cartão/coluna compartilhados entre
// as visualizações do DuxBan (Kanban, Lista, e as que vierem depois) — vivem
// aqui em vez de dentro de um view específico pra não duplicar a mesma lógica
// em cada novo arquivo de visualização.

export const STATUS_LABELS = {
  queued: 'Na fila — aguardando o agente ficar livre',
  active: 'Em andamento',
  done: 'Concluído'
}

export const PRIORITY_META = {
  high: { label: 'Alta', color: '#ef4444' },
  medium: { label: 'Média', color: '#eab308' },
  low: { label: 'Baixa', color: '#3b82f6' }
}
export const PRIORITY_ORDER = ['high', 'medium', 'low']

// "Due: 14 dez 2026" a partir do value cru de <input type="date"> (sempre
// yyyy-mm-dd) — monta a Date com componentes locais em vez de new Date(str)
// pra não sofrer o shift de fuso horário do parse ISO em UTC.
export function formatDueDate(value) {
  if (!value) return ''
  const [y, m, d] = String(value).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function milestonePercent(card) {
  if (!card.milestoneTotal) return 0
  return Math.min(100, Math.max(0, Math.round((card.milestoneCurrent / card.milestoneTotal) * 100)))
}

// hash simples do id só pra escolher uma cor estável da paleta pro avatar do
// agente — não precisa ser criptográfico, só determinístico entre renders.
export function avatarColor(id) {
  let hash = 0
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return TAG_COLORS[hash % TAG_COLORS.length]
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

// dot/ícone da coluna é só cosmético e derivado do título (sem campo novo
// persistido) — casa palavras-chave comuns de board kanban; sem match, cai
// num dot cinza cor da paleta ciclando pelo índice, igual as tags. Usado
// tanto pelo header de coluna do Kanban quanto pelo chip de status da Lista.
export function columnMeta(col, index) {
  const t = (col.title || '').toLowerCase()
  if (/(conclu|feito|complet|done)/.test(t)) return { icon: 'done', color: '#22c55e' }
  if (/(revis|review)/.test(t)) return { icon: 'review', color: '#ef4444' }
  if (/(andamento|process|fazendo|progress)/.test(t)) return { icon: 'process', color: '#eab308' }
  if (/(fazer|todo|to.?do|backlog)/.test(t)) return { icon: 'todo', color: '#3b82f6' }
  return { icon: 'todo', color: TAG_COLORS[index % TAG_COLORS.length] }
}

export function cardTags(card, tags) {
  return card.tagIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean)
}

export function agentName(nodeId, connectedAgents) {
  return connectedAgents.find((a) => a.id === nodeId)?.name || ''
}
