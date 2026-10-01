import { activeWorkspace, AGENT_TERMINAL_TYPES } from '../store/flowStore'
import { readNote, writeNote } from './bridgeClient'
import { splitTabs, joinTabs } from './noteMarkdown'
import { addCard, moveCard, assignCard, addComment, serializeBoard } from './duxbanOps'

// Tools da Duxi — mesmo padrão de ollamaTools.js (schema JSON-Schema estilo
// OpenAI + executor), mas escopadas ao workspace ATIVO do canvas (ver
// activeWorkspace em flowStore.js) em vez de só nodes conectados por edge:
// a Duxi é global, não vive dentro de um node específico, então ela já "vê"
// o workspace inteiro sem precisar de uma edge apontando pra cada coisa.
export const DUXI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_nodes',
      description: 'Lista os nodes do workspace (aba) atualmente aberto no canvas — terminais, notas, boards DuxBan, etc.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description: 'Lê o conteúdo de uma nota do workspace atual.',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'Nome da nota a ler. Omita se houver só uma nota no workspace, ou se não estiver claro qual — não adivinhe.' },
          tab: { type: 'string', description: 'Título exato da aba a ler. Omita para ler todas as abas da nota.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_note',
      description: 'Substitui o conteúdo de uma aba de uma nota do workspace atual. As outras abas da mesma nota não são afetadas.',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'Nome da nota a escrever. Omita se houver só uma nota no workspace, ou se não estiver claro qual — não adivinhe.' },
          tab: { type: 'string', description: 'Título exato da aba a escrever. Obrigatório se a nota tiver mais de uma aba.' },
          content: { type: 'string', description: 'Conteúdo completo (markdown) a gravar na aba.' }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_duxban_board',
      description: 'Lista as colunas, cartões (com id), responsável e status de um board DuxBan do workspace atual — use antes de mover/atribuir/comentar um cartão, pra saber o id certo.',
      parameters: {
        type: 'object',
        properties: {
          board: { type: 'string', description: 'Nome do board. Omita se houver só um board DuxBan no workspace, ou se não estiver claro qual — não adivinhe.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_duxban_card',
      description: 'Cria uma tarefa (cartão) numa coluna de um board DuxBan do workspace atual.',
      parameters: {
        type: 'object',
        properties: {
          board: { type: 'string', description: 'Nome do board. Omita se houver só um board DuxBan no workspace, ou se não estiver claro qual — não adivinhe.' },
          column: { type: 'string', description: 'Título exato da coluna (ex: "A fazer").' },
          text: { type: 'string', description: 'Título curto da tarefa.' },
          description: { type: 'string', description: 'Descrição mais longa, opcional.' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Prioridade, opcional.' }
        },
        required: ['column', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_duxban_card',
      description: 'Move um cartão existente pra outra coluna de um board DuxBan do workspace atual.',
      parameters: {
        type: 'object',
        properties: {
          board: { type: 'string', description: 'Nome do board. Omita se houver só um board DuxBan no workspace, ou se não estiver claro qual — não adivinhe.' },
          cardId: { type: 'string', description: 'Id do cartão (ver list_duxban_board).' },
          column: { type: 'string', description: 'Título exato da coluna de destino.' }
        },
        required: ['cardId', 'column']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assign_duxban_card',
      description: 'Atribui um cartão de um board DuxBan do workspace atual a um agente (terminal Claude Code/Codex) pelo nome.',
      parameters: {
        type: 'object',
        properties: {
          board: { type: 'string', description: 'Nome do board. Omita se houver só um board DuxBan no workspace, ou se não estiver claro qual — não adivinhe.' },
          cardId: { type: 'string', description: 'Id do cartão (ver list_duxban_board).' },
          agentName: { type: 'string', description: 'Nome do agente (terminal) a atribuir. Omita se houver só um agente no workspace.' }
        },
        required: ['cardId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_duxban_comment',
      description: 'Adiciona um comentário a um cartão de um board DuxBan do workspace atual.',
      parameters: {
        type: 'object',
        properties: {
          board: { type: 'string', description: 'Nome do board. Omita se houver só um board DuxBan no workspace, ou se não estiver claro qual — não adivinhe.' },
          cardId: { type: 'string', description: 'Id do cartão (ver list_duxban_board).' },
          text: { type: 'string', description: 'Texto do comentário.' }
        },
        required: ['cardId', 'text']
      }
    }
  }
]

function listNoteCandidates() {
  return (activeWorkspace.value?.nodes || [])
    .filter((n) => n.type === 'notes' && n.data?.path)
    .map((n) => ({ id: n.id, label: n.data.name || n.id, path: n.data.path }))
}

function listBoardCandidates() {
  return (activeWorkspace.value?.nodes || [])
    .filter((n) => n.type === 'duxban')
    .map((n) => ({ id: n.id, label: n.data?.name || 'DuxBan', node: n }))
}

function listAgentCandidates() {
  return (activeWorkspace.value?.nodes || [])
    .filter((n) => AGENT_TERMINAL_TYPES.includes(n.type))
    .map((n) => ({ id: n.id, label: n.data?.name || n.id, node: n }))
}

// Resolve um hint (nome dito pelo modelo, ou o id de uma escolha feita pelo
// usuário nos botões de ambiguidade — ver duxiStore.js/askDuxiChoice) contra
// uma lista de candidatos. Usado tanto pra notas quanto (tools de DuxBan) pra
// boards. 0 candidatos = erro direto; 1 = resolve sem perguntar nada; 2+ sem
// hint que bata = ambíguo, o chamador decide o que fazer (ver
// executeDuxiTool) — aqui não se pergunta nada, só se reporta o estado.
export function resolveCandidate(candidates, hint) {
  if (!candidates.length) return { error: true }
  if (candidates.length === 1) return { resolved: candidates[0] }
  if (hint) {
    // o retry pós-escolha (duxiStore.js) manda o id do candidato clicado, não
    // um nome — checa isso primeiro antes de cair pro match por label
    const byId = candidates.find((c) => c.id === hint)
    if (byId) return { resolved: byId }
    const lower = String(hint).toLowerCase()
    const exact = candidates.find((c) => c.label.toLowerCase() === lower)
    if (exact) return { resolved: exact }
    const partial = candidates.filter((c) => c.label.toLowerCase().includes(lower))
    if (partial.length === 1) return { resolved: partial[0] }
  }
  return { ambiguous: true, candidates }
}

function listNodesSummary() {
  const nodes = activeWorkspace.value?.nodes || []
  if (!nodes.length) return 'O workspace atual não tem nenhum node.'
  return nodes.map((n) => `- ${n.data?.name || n.type} (tipo: ${n.type}, id: ${n.id})`).join('\n')
}

async function readNoteContent(note, tab) {
  const result = await readNote(note.path)
  const tabs = splitTabs(result.content ?? '')
  if (!tab) {
    if (tabs.length === 1) return tabs[0].markdown
    return tabs.map((t) => `## ${t.title}\n${t.markdown}`).join('\n\n')
  }
  const found = tabs.find((t) => t.title.toLowerCase() === tab.toLowerCase())
  if (!found) return `Aba "${tab}" não encontrada na nota "${note.label}". Abas disponíveis: ${tabs.map((t) => t.title).join(', ')}.`
  return found.markdown
}

// Resolve o parâmetro `board` de uma tool de DuxBan contra os boards do
// workspace atual. Shape de retorno pensado pra ser espalhado direto num
// `{ type: 'ambiguous', ... }` quando for o caso (ver chamadores abaixo).
function resolveBoard(args) {
  const candidates = listBoardCandidates()
  const resolution = resolveCandidate(candidates, args.board)
  if (resolution.error) return { error: 'Não há nenhum board DuxBan no workspace atual.' }
  if (resolution.ambiguous) return { ambiguous: { candidates: resolution.candidates, retryKey: 'board' } }
  return { node: resolution.resolved.node }
}

async function writeNoteContent(note, tab, content) {
  const result = await readNote(note.path)
  const tabs = splitTabs(result.content ?? '')
  if (tabs.length > 1 && !tab) {
    return `Erro: a nota "${note.label}" tem mais de uma aba — diga qual (abas: ${tabs.map((t) => t.title).join(', ')}).`
  }
  const idx = tab ? tabs.findIndex((t) => t.title.toLowerCase() === tab.toLowerCase()) : 0
  if (idx === -1) {
    return `Erro: aba "${tab}" não encontrada na nota "${note.label}". Abas disponíveis: ${tabs.map((t) => t.title).join(', ')}.`
  }
  tabs[idx].markdown = content
  const writeResult = await writeNote(note.path, joinTabs(tabs))
  return writeResult.ok ? `Nota "${note.label}" atualizada.` : `Erro ao escrever na nota "${note.label}": ${writeResult.error}`
}

// Contrato de retorno:
//   { type: 'result', content: '<string pro modelo>' }
//   { type: 'ambiguous', candidates: [{id,label}], retryKey: 'note' }
// Nunca lança — erros viram `content` descritivo, igual ollamaTools.js, pro
// loop de tool-calling em duxiStore.js não precisar de um caminho separado.
export async function executeDuxiTool(name, args = {}) {
  try {
    if (name === 'list_nodes') {
      return { type: 'result', content: listNodesSummary() }
    }

    if (name === 'read_note' || name === 'write_note') {
      const candidates = listNoteCandidates()
      const resolution = resolveCandidate(candidates, args.note)
      if (resolution.error) return { type: 'result', content: 'Não há nenhuma nota no workspace atual.' }
      if (resolution.ambiguous) return { type: 'ambiguous', candidates: resolution.candidates, retryKey: 'note' }
      const note = resolution.resolved

      if (name === 'read_note') return { type: 'result', content: await readNoteContent(note, args.tab) }
      return { type: 'result', content: await writeNoteContent(note, args.tab, args.content ?? '') }
    }

    if (name === 'list_duxban_board') {
      const board = resolveBoard(args)
      if (board.error) return { type: 'result', content: board.error }
      if (board.ambiguous) return { type: 'ambiguous', ...board.ambiguous }
      const agentNames = Object.fromEntries(listAgentCandidates().map((a) => [a.id, a.label]))
      return { type: 'result', content: JSON.stringify(serializeBoard(board.node.data, agentNames, null)) }
    }

    if (name === 'create_duxban_card') {
      const board = resolveBoard(args)
      if (board.error) return { type: 'result', content: board.error }
      if (board.ambiguous) return { type: 'ambiguous', ...board.ambiguous }
      try {
        const card = addCard(board.node.data, args.column, args.text, {
          description: args.description,
          priority: args.priority
        })
        return { type: 'result', content: `Cartão "${card.text}" (id: ${card.id}) criado na coluna "${args.column}".` }
      } catch (err) {
        return { type: 'result', content: `Erro ao criar cartão: ${err.message}` }
      }
    }

    if (name === 'move_duxban_card') {
      const board = resolveBoard(args)
      if (board.error) return { type: 'result', content: board.error }
      if (board.ambiguous) return { type: 'ambiguous', ...board.ambiguous }
      try {
        moveCard(board.node.data, args.cardId, args.column)
        return { type: 'result', content: `Cartão movido para "${args.column}".` }
      } catch (err) {
        return { type: 'result', content: `Erro ao mover cartão: ${err.message}` }
      }
    }

    if (name === 'assign_duxban_card') {
      const board = resolveBoard(args)
      if (board.error) return { type: 'result', content: board.error }
      if (board.ambiguous) return { type: 'ambiguous', ...board.ambiguous }
      const agents = listAgentCandidates()
      const agentResolution = resolveCandidate(agents, args.agentName)
      if (agentResolution.error) {
        return { type: 'result', content: 'Não há nenhum agente (terminal Claude Code/Codex) no workspace atual pra atribuir.' }
      }
      if (agentResolution.ambiguous) {
        return { type: 'ambiguous', candidates: agentResolution.candidates, retryKey: 'agentName' }
      }
      try {
        assignCard(board.node.data, args.cardId, agentResolution.resolved.id)
        return { type: 'result', content: `Cartão atribuído a "${agentResolution.resolved.label}".` }
      } catch (err) {
        return { type: 'result', content: `Erro ao atribuir cartão: ${err.message}` }
      }
    }

    if (name === 'add_duxban_comment') {
      const board = resolveBoard(args)
      if (board.error) return { type: 'result', content: board.error }
      if (board.ambiguous) return { type: 'ambiguous', ...board.ambiguous }
      try {
        addComment(board.node.data, args.cardId, args.text, 'Duxi')
        return { type: 'result', content: 'Comentário adicionado.' }
      } catch (err) {
        return { type: 'result', content: `Erro ao comentar: ${err.message}` }
      }
    }

    return { type: 'result', content: `Tool desconhecida: ${name}` }
  } catch (err) {
    return { type: 'result', content: `Erro ao executar ${name}: ${err.message}` }
  }
}
