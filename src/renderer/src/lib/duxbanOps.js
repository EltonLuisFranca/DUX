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
            assignedNodeId: card.assignedNodeId || null,
            taskState: card.taskState || 'unassigned'
          }))
        : []
    }))
  }
  return [
    { id: crypto.randomUUID(), title: 'A fazer', cards: [] },
    { id: crypto.randomUUID(), title: 'Fazendo', cards: [] },
    { id: crypto.randomUUID(), title: 'Feito', cards: [] }
  ]
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

  const col = columns.find((c) => c.cards.includes(card))
  sendDuxbanTaskToAgent(nodeId, {
    boardName: data.name || 'DuxBan',
    columnTitle: col?.title || '',
    cardId: card.id,
    cardText: card.text
  })
  return true
}

export function addCard(data, columnRef, text) {
  const columns = normalizeColumns(data.columns)
  const col = findColumnByRef(columns, columnRef) || columns[0]
  if (!col) throw new Error('board sem colunas')
  const card = { id: crypto.randomUUID(), text: String(text || '').trim(), assignedNodeId: null, taskState: 'unassigned' }
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
  return {
    board: data.name || 'DuxBan',
    columns: columns.map((col) => ({
      title: col.title,
      cards: col.cards.map((card) => ({
        id: card.id,
        text: card.text,
        assigned_to: card.assignedNodeId ? agentNames?.[card.assignedNodeId] || card.assignedNodeId : null,
        mine: card.assignedNodeId === viewerNodeId,
        status: card.taskState
      }))
    }))
  }
}
