import { sendDuxbanTaskToAgent } from './bridgeClient'

// Mutações do board DuxBan, compartilhadas entre a UI do próprio node
// (DuxBanNode.vue) e as chamadas que chegam de um agente conectado via MCP
// (WslClaudeTerminalNode.vue, disparadas por bridge/duxbanLink.js). Cada
// função recebe `data` — o objeto `node.data` real (reativo, o mesmo lido
// pelo template do node) — e muta suas propriedades diretamente em vez de
// devolver um objeto novo: é assim que uma mudança feita pelo agente aparece
// sozinha na tela sem nenhum mecanismo extra de sincronização.

export function normalizeColumns(raw) {
  if (Array.isArray(raw) && raw.length) {
    return raw.map((col) => ({
      id: col.id || crypto.randomUUID(),
      title: col.title || 'Coluna',
      cards: Array.isArray(col.cards)
        ? col.cards.map((card) => ({
            id: card.id || crypto.randomUUID(),
            text: card.text || '',
            description: card.description || '',
            dueDate: card.dueDate || null,
            priority: PRIORITIES.includes(card.priority) ? card.priority : null,
            milestoneCurrent: Number.isFinite(card.milestoneCurrent) ? card.milestoneCurrent : 0,
            milestoneTotal: Number.isFinite(card.milestoneTotal) ? card.milestoneTotal : 0,
            assignedNodeId: card.assignedNodeId || null,
            taskState: card.taskState || 'unassigned',
            // boards antigos guardavam só um categoryId por cartão — migra pra
            // um array de tagIds (com no máximo essa mesma tag) na primeira
            // leitura, sem quebrar dado salvo antes dessa feature.
            tagIds: Array.isArray(card.tagIds)
              ? card.tagIds
              : card.categoryId
                ? [card.categoryId]
                : [],
            comments: Array.isArray(card.comments)
              ? card.comments.map((c) => ({
                  id: c.id || crypto.randomUUID(),
                  text: c.text || '',
                  createdAt: c.createdAt || Date.now(),
                  // comentários salvos antes do autor existir só podiam ter vindo
                  // da UI (nenhuma tool MCP escrevia comentário até essa feature)
                  author: c.author || 'Você'
                }))
              : []
          }))
        : []
    }))
  }
  return [
    { id: crypto.randomUUID(), title: 'A fazer', cards: [] },
    { id: crypto.randomUUID(), title: 'Fazendo', cards: [] },
    { id: crypto.randomUUID(), title: 'Em revisão / Bloqueado', cards: [] },
    { id: crypto.randomUUID(), title: 'Feito', cards: [] }
  ]
}

// Paleta fixa (em vez de color picker livre) pra manter a estética minimalista
// do resto do app — cada tag nova pega a próxima cor da lista, ciclando.
export const TAG_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#06b6d4', '#f97316', '#64748b']

export const PRIORITIES = ['low', 'medium', 'high']

export function normalizeTags(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((tag) => ({
    id: tag.id || crypto.randomUUID(),
    name: tag.name || 'Tag',
    color: tag.color || TAG_COLORS[0]
  }))
}

// boards antigos guardavam a lista em data.categories — lê o novo campo com
// fallback pro antigo, sem exigir migração explícita dos dados salvos.
export function boardTags(data) {
  return normalizeTags(data.tags || data.categories)
}

export function addTag(data, name, color) {
  const tags = boardTags(data)
  const tag = {
    id: crypto.randomUUID(),
    name: String(name || '').trim() || 'Tag',
    color: color || TAG_COLORS[tags.length % TAG_COLORS.length]
  }
  tags.push(tag)
  data.tags = tags
  return tag
}

export function renameTag(data, tagId, name) {
  const tags = boardTags(data)
  const tag = tags.find((t) => t.id === tagId)
  if (!tag) throw new Error(`tag não encontrada: ${tagId}`)
  tag.name = String(name || '').trim() || tag.name
  data.tags = tags
}

export function recolorTag(data, tagId, color) {
  const tags = boardTags(data)
  const tag = tags.find((t) => t.id === tagId)
  if (!tag) throw new Error(`tag não encontrada: ${tagId}`)
  tag.color = color
  data.tags = tags
}

// Some junto de qualquer cartão que apontava pra ela (tira do tagIds) — uma
// tag apagada não pode deixar cartão nenhum "orfão" apontando pra um id que
// não existe mais em data.tags.
export function removeTag(data, tagId) {
  data.tags = boardTags(data).filter((t) => t.id !== tagId)
  const columns = normalizeColumns(data.columns)
  let changed = false
  for (const col of columns) {
    for (const card of col.cards) {
      if (card.tagIds.includes(tagId)) {
        card.tagIds = card.tagIds.filter((id) => id !== tagId)
        changed = true
      }
    }
  }
  if (changed) data.columns = columns
}

// Liga/desliga uma tag num cartão (um cartão pode ter várias).
export function toggleCardTag(data, cardId, tagId) {
  const columns = normalizeColumns(data.columns)
  const found = findCardById(columns, cardId)
  if (!found) throw new Error(`cartão não encontrado: ${cardId}`)
  const tagIds = found.card.tagIds
  found.card.tagIds = tagIds.includes(tagId) ? tagIds.filter((id) => id !== tagId) : [...tagIds, tagId]
  data.columns = columns
}

// addCardTag/removeCardTag (em vez de reusar toggleCardTag) são de propósito
// idempotentes — um agente via MCP não tem como saber o estado atual antes de
// chamar, então "adicionar" e "remover" precisam ter resultado previsível
// mesmo chamados duas vezes seguidas, ao contrário do toggle usado pela UI
// (onde quem clica já vê o estado antes de clicar).
export function addCardTag(data, cardId, tagId) {
  const columns = normalizeColumns(data.columns)
  const found = findCardById(columns, cardId)
  if (!found) throw new Error(`cartão não encontrado: ${cardId}`)
  if (!found.card.tagIds.includes(tagId)) found.card.tagIds = [...found.card.tagIds, tagId]
  data.columns = columns
}

export function removeCardTag(data, cardId, tagId) {
  const columns = normalizeColumns(data.columns)
  const found = findCardById(columns, cardId)
  if (!found) throw new Error(`cartão não encontrado: ${cardId}`)
  found.card.tagIds = found.card.tagIds.filter((id) => id !== tagId)
  data.columns = columns
}

// Gestão de colunas — extraída pra cá (em vez de ficar só como closures locais
// em DuxBanNode.vue, como era antes) pra ser chamável tanto do node no canvas
// quanto da sidebar de configuração (DuxBanSettings.vue), do mesmo jeito que
// addTag/renameTag/removeTag já são.
export function addColumn(data, title) {
  const columns = normalizeColumns(data.columns)
  const col = { id: crypto.randomUUID(), title: String(title || '').trim() || 'Nova coluna', cards: [] }
  columns.push(col)
  data.columns = columns
  return col
}

export function renameColumn(data, colId, title) {
  const columns = normalizeColumns(data.columns)
  const col = columns.find((c) => c.id === colId)
  if (!col) return
  col.title = title
  data.columns = columns
}

export function moveColumn(data, colId, direction) {
  const columns = normalizeColumns(data.columns)
  const index = columns.findIndex((c) => c.id === colId)
  if (index === -1) return
  const target = index + direction
  if (target < 0 || target >= columns.length) return
  const [col] = columns.splice(index, 1)
  columns.splice(target, 0, col)
  data.columns = columns
}

// Reordenação por drag and drop: diferente de moveColumn (que só troca com o
// vizinho imediato, ±1), aqui o destino é um índice arbitrário — a posição
// onde o mouse soltou a coluna, calculada pela UI (DuxBanNode.vue /
// DuxBanSettings.vue) a partir da metade do card/row sob o cursor, contra o
// array AINDA COM a coluna arrastada dentro dele. Por isso, se o destino vem
// depois da posição original, precisa recuar 1 — a remoção logo abaixo desloca
// tudo que vinha depois dela.
export function reorderColumn(data, colId, targetIndex) {
  const columns = normalizeColumns(data.columns)
  const index = columns.findIndex((c) => c.id === colId)
  if (index === -1) return
  const [col] = columns.splice(index, 1)
  let insertAt = targetIndex > index ? targetIndex - 1 : targetIndex
  insertAt = Math.max(0, Math.min(insertAt, columns.length))
  columns.splice(insertAt, 0, col)
  data.columns = columns
}

// Remove a coluna inteira (com seus cards) num passo só — diferente de
// esvaziar via removeCard chamado card a card, libera a vaga de fila de cada
// card removido que estava com despacho ativo diretamente aqui, já que a
// coluna (e os cards nela) já saem de data.columns antes desse loop.
export function removeColumn(data, colId) {
  const columns = normalizeColumns(data.columns)
  const index = columns.findIndex((c) => c.id === colId)
  if (index === -1) return
  const [col] = columns.splice(index, 1)
  data.columns = columns
  for (const card of col.cards) {
    if (card.assignedNodeId && data.activeDispatch?.[card.assignedNodeId] === card.id) {
      clearActiveDispatch(data, card.assignedNodeId)
      tryDispatchNext(data, card.assignedNodeId)
    }
  }
}

// `author` é um nome de exibição livre — 'Você' pra quem comenta pela UI
// (default), ou o nome do terminal/agente pra quem comenta via MCP
// (dux_kanban_add_comment, ver WslClaudeTerminalNode.vue), do mesmo jeito que
// assigned_to já identifica agente por nome e não por nodeId.
export function addComment(data, cardId, text, author = 'Você') {
  const body = String(text || '').trim()
  if (!body) return null
  const columns = normalizeColumns(data.columns)
  const found = findCardById(columns, cardId)
  if (!found) throw new Error(`cartão não encontrado: ${cardId}`)
  const comment = { id: crypto.randomUUID(), text: body, createdAt: Date.now(), author: String(author || '').trim() || 'Você' }
  found.card.comments.push(comment)
  data.columns = columns
  return comment
}

export function removeComment(data, cardId, commentId) {
  const columns = normalizeColumns(data.columns)
  const found = findCardById(columns, cardId)
  if (!found) return
  found.card.comments = found.card.comments.filter((c) => c.id !== commentId)
  data.columns = columns
}

export function findColumnByRef(columns, ref) {
  if (!ref) return null
  return (
    columns.find((c) => c.id === ref) ||
    columns.find((c) => c.title.toLowerCase() === String(ref).toLowerCase()) ||
    null
  )
}

export function findCardById(columns, cardId) {
  for (const col of columns) {
    const idx = col.cards.findIndex((c) => c.id === cardId)
    if (idx !== -1) return { col, idx, card: col.cards[idx] }
  }
  return null
}

function clearActiveDispatch(data, nodeId) {
  if (!data.activeDispatch || data.activeDispatch[nodeId] == null) return
  const next = { ...data.activeDispatch }
  delete next[nodeId]
  data.activeDispatch = next
}

// ordem de fila = ordem de aparição no board (colunas na ordem declarada,
// cartões na ordem de cada coluna) — sem timestamp separado pra manter
export function findNextQueuedCard(columns, nodeId) {
  for (const col of columns) {
    for (const card of col.cards) {
      if (card.assignedNodeId === nodeId && card.taskState === 'queued') return card
    }
  }
  return null
}

// Escreve a notícia de tarefa no terminal do agente (bridge/duxbanLink.js) —
// extraído de tryDispatchNext pra ser reutilizável por assignCard no caso de
// reatribuição pro mesmo dono ativo (ver comentário lá).
function pushCardToAgent(data, nodeId, columns, card) {
  const col = columns.find((c) => c.cards.includes(card))
  sendDuxbanTaskToAgent(nodeId, {
    boardName: data.name || 'DuxBan',
    columnTitle: col?.title || '',
    cardId: card.id,
    cardText: card.text
  })
}

// Se o agente-alvo não tem tarefa ativa agora, pega a próxima da fila (se
// houver), marca como "active", registra em activeDispatch e escreve no
// terminal dele via bridge (writeAsMessage, ver bridge/duxbanLink.js).
// Chamado tanto ao atribuir um cartão quanto ao finalizar uma tarefa (pra
// liberar a vaga do próximo item da fila desse mesmo agente).
export function tryDispatchNext(data, nodeId) {
  if (!nodeId || data.activeDispatch?.[nodeId]) return false
  const columns = normalizeColumns(data.columns)
  const card = findNextQueuedCard(columns, nodeId)
  if (!card) return false

  card.taskState = 'active'
  data.columns = columns
  data.activeDispatch = { ...(data.activeDispatch || {}), [nodeId]: card.id }
  pushCardToAgent(data, nodeId, columns, card)
  return true
}

// `extra` é opcional — cobre os campos já preenchíveis na criação pelo modal
// da UI (description, dueDate, priority, tagIds, milestone*). Chamadas via
// bridge MCP (dux_kanban_create_card) continuam passando só `text` e caem
// nos defaults de sempre.
export function addCard(data, columnRef, text, extra = {}) {
  const columns = normalizeColumns(data.columns)
  const col = findColumnByRef(columns, columnRef) || columns[0]
  if (!col) throw new Error('board sem colunas')
  const card = {
    id: crypto.randomUUID(),
    text: String(text || '').trim(),
    description: String(extra.description || ''),
    dueDate: extra.dueDate || null,
    priority: PRIORITIES.includes(extra.priority) ? extra.priority : null,
    milestoneCurrent: Number.isFinite(extra.milestoneCurrent) ? extra.milestoneCurrent : 0,
    milestoneTotal: Number.isFinite(extra.milestoneTotal) ? extra.milestoneTotal : 0,
    assignedNodeId: null,
    taskState: 'unassigned',
    tagIds: Array.isArray(extra.tagIds) ? extra.tagIds : [],
    comments: []
  }
  col.cards.push(card)
  data.columns = columns
  return card
}

export function removeCard(data, cardId) {
  const columns = normalizeColumns(data.columns)
  const found = findCardById(columns, cardId)
  if (!found) return
  const { card } = found
  found.col.cards.splice(found.idx, 1)
  data.columns = columns
  if (card.assignedNodeId && data.activeDispatch?.[card.assignedNodeId] === cardId) {
    clearActiveDispatch(data, card.assignedNodeId)
    tryDispatchNext(data, card.assignedNodeId)
  }
}

// Move só a posição visual do cartão (coluna) — não mexe em fila/despacho.
// A coluna é status de trabalho de escolha livre do agente (Fazendo,
// Aguardando validação, etc); "liberar a vaga de fila" é um passo separado
// e explícito (finishTask), pra não depender de adivinhar o nome da coluna.
export function moveCard(data, cardId, columnRef, targetIndex = null) {
  const columns = normalizeColumns(data.columns)
  const found = findCardById(columns, cardId)
  if (!found) throw new Error(`cartão não encontrado: ${cardId}`)
  const targetCol = findColumnByRef(columns, columnRef)
  if (!targetCol) {
    throw new Error(
      `coluna não encontrada: "${columnRef}" (colunas disponíveis: ${columns.map((c) => c.title).join(', ')})`
    )
  }
  const [card] = found.col.cards.splice(found.idx, 1)
  const insertAt = targetIndex == null ? targetCol.cards.length : targetIndex
  targetCol.cards.splice(insertAt, 0, card)
  data.columns = columns
  return card
}

// Atribuir (ou, com nodeId null, remover atribuição) — dispara o despacho
// imediato se o agente estiver livre, ou deixa "queued" se já tiver uma
// tarefa ativa. Reatribuir um cartão que já estava ativo pra outro agente
// libera a vaga de fila do agente anterior.
export function assignCard(data, cardId, nodeId) {
  const columns = normalizeColumns(data.columns)
  const found = findCardById(columns, cardId)
  if (!found) throw new Error(`cartão não encontrado: ${cardId}`)
  const previousNodeId = found.card.assignedNodeId
  found.card.assignedNodeId = nodeId || null

  // Reatribuir ao MESMO agente que já é o dono ativo deste cartão (ex: o
  // Gerenciador reatribui só pra chamar atenção pra um comentário novo) não
  // é uma troca de dono de verdade. Sem este caso especial, o taskState
  // seria forçado de volta pra 'queued' logo abaixo e o tryDispatchNext no
  // fim da função se recusaria a despachar — data.activeDispatch[nodeId]
  // continua apontando pra ESTE MESMO cartão (só finishTask libera essa
  // vaga, moveCard não mexe nisso), então o nó aparece "ocupado" consigo
  // mesmo e o cartão fica preso em 'queued' pra sempre, sem nunca reenviar a
  // notificação pro terminal do agente.
  if (nodeId && nodeId === previousNodeId && data.activeDispatch?.[nodeId] === cardId) {
    data.columns = columns
    pushCardToAgent(data, nodeId, columns, found.card)
    return
  }

  found.card.taskState = nodeId ? 'queued' : 'unassigned'
  data.columns = columns

  if (previousNodeId && previousNodeId !== nodeId && data.activeDispatch?.[previousNodeId] === cardId) {
    clearActiveDispatch(data, previousNodeId)
    tryDispatchNext(data, previousNodeId)
  }
  if (nodeId) tryDispatchNext(data, nodeId)
}

export function unassignCard(data, cardId) {
  assignCard(data, cardId, null)
}

// Chamado quando o próprio agente reporta que terminou (tool
// dux_kanban_finish_task) — libera a vaga de fila do agente pra despachar a
// próxima tarefa atribuída a ele, se houver.
// mesma heurística de nome de coluna do columnMeta em duxbanCardUi.js (não
// importada de lá pra não criar dependência circular — esse módulo já é
// importado por duxbanCardUi.js) — usada só aqui pra achar onde mover o
// cartão ao finalizar.
const DONE_COLUMN_PATTERN = /(conclu|feito|complet|done)/i

export function finishTask(data, cardId, requesterNodeId) {
  const columns = normalizeColumns(data.columns)
  const found = findCardById(columns, cardId)
  if (!found) throw new Error(`cartão não encontrado: ${cardId}`)
  if (requesterNodeId && found.card.assignedNodeId !== requesterNodeId) {
    throw new Error('este cartão não está atribuído a este terminal')
  }
  found.card.taskState = 'done'
  data.columns = columns

  const nodeId = found.card.assignedNodeId
  if (nodeId && data.activeDispatch?.[nodeId] === cardId) {
    clearActiveDispatch(data, nodeId)
    tryDispatchNext(data, nodeId)
  }

  // finalizar só marcava o status internamente (taskState = 'done') sem
  // mexer na posição do cartão — ele ficava com aparência de concluído mas
  // visualmente preso na coluna onde estava (ex: "Fazendo"), obrigando o
  // agente a lembrar de chamar dux_kanban_move_card à parte. Move pra
  // primeira coluna cujo título bater com a mesma heurística usada pro
  // ícone/cor de "concluído"; sem coluna assim (board todo renomeado, por
  // exemplo), deixa o cartão onde está em vez de adivinhar errado.
  const doneCol = columns.find((c) => DONE_COLUMN_PATTERN.test(c.title || ''))
  if (doneCol && doneCol.id !== found.col.id) {
    moveCard(data, cardId, doneCol.id)
  }

  return found.card
}

// Limpa atribuições apontando pra um agente que deixou de estar conectado
// (edge removida ou node apagado) — evita cartão preso esperando por um
// agente que já era. Chamado por FleetCanvas/flowStore.removeNode e pelo
// handler de remoção de edge.
export function unassignAllForNode(data, nodeId) {
  const columns = normalizeColumns(data.columns)
  let changed = false
  for (const col of columns) {
    for (const card of col.cards) {
      if (card.assignedNodeId === nodeId) {
        card.assignedNodeId = null
        card.taskState = 'unassigned'
        changed = true
      }
    }
  }
  if (changed) data.columns = columns
  clearActiveDispatch(data, nodeId)
}

// Board inteiro em formato plano pra tool dux_kanban_list — `agentNames`
// resolve nodeId->nome pra não expor o uuid interno do node pro agente, e
// `viewerNodeId` marca quais cartões pertencem a quem está perguntando.
export function serializeBoard(data, agentNames, viewerNodeId) {
  const columns = normalizeColumns(data.columns)
  const tags = boardTags(data)
  return {
    board: data.name || 'DuxBan',
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    columns: columns.map((col) => ({
      title: col.title,
      cards: col.cards.map((card) => ({
        id: card.id,
        text: card.text,
        description: card.description || undefined,
        due_date: card.dueDate || undefined,
        priority: card.priority || undefined,
        milestone: card.milestoneTotal ? `${card.milestoneCurrent}/${card.milestoneTotal}` : undefined,
        tags: card.tagIds.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean),
        comments: card.comments.map((c) => ({
          author: c.author,
          text: c.text,
          created_at: new Date(c.createdAt).toISOString()
        })),
        assigned_to: card.assignedNodeId ? agentNames?.[card.assignedNodeId] || card.assignedNodeId : null,
        mine: card.assignedNodeId === viewerNodeId,
        status: card.taskState
      }))
    }))
  }
}
