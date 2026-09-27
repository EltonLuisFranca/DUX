import { readFile, writeFile, listFiles, readNote, writeNote } from './bridgeClient'

// Formato JSON-Schema OpenAI-style — usado tanto pro Ollama nativo
// (/api/chat) quanto pro Open WebUI/OpenAI-compatible (/api/chat/completions),
// os dois aceitam a mesma forma de `tools` no request.
export const FILE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lê o conteúdo de um arquivo de texto do disco, dado um caminho absoluto ou relativo ao home do usuário (ex: ~/notas.md).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo a ler.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Escreve (substituindo o conteúdo atual) um arquivo de texto no disco. O diretório precisa já existir.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo a escrever.' },
          content: { type: 'string', description: 'Conteúdo completo a gravar no arquivo.' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Lista os arquivos e subpastas de um diretório, para explorar antes de decidir qual arquivo abrir.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do diretório a listar.' }
        },
        required: ['path']
      }
    }
  }
]

// Tools condicionais, geradas por node conectado — diferente de FILE_TOOLS
// (sempre presente e cego a qualquer path arbitrário do disco), estas só
// existem quando há uma edge nota->Ollama de verdade (ver connectedNotes em
// OllamaNode.vue) e já vêm com os nomes das notas conectadas embutidos na
// description, pro modelo não precisar adivinhar path nenhum.
export function buildNoteTools(connectedNotes) {
  if (!connectedNotes?.length) return []

  const noteList = connectedNotes.map((n) => `"${n.name}"`).join(', ')
  const noteParam =
    connectedNotes.length > 1
      ? { type: 'string', description: 'Nome da nota conectada a ler/escrever.', enum: connectedNotes.map((n) => n.name) }
      : { type: 'string', description: 'Nome da nota conectada (opcional, só existe uma).' }

  return [
    {
      type: 'function',
      function: {
        name: 'read_note',
        description: `Lê o conteúdo de uma nota conectada a este node via edge no canvas do DUX. Notas disponíveis: ${noteList}.`,
        parameters: {
          type: 'object',
          properties: { note: noteParam },
          required: connectedNotes.length > 1 ? ['note'] : []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'write_note',
        description: `Substitui o conteúdo de uma nota conectada a este node via edge no canvas do DUX. Notas disponíveis: ${noteList}.`,
        parameters: {
          type: 'object',
          properties: { note: noteParam, content: { type: 'string', description: 'Conteúdo completo (markdown) a gravar na nota.' } },
          required: connectedNotes.length > 1 ? ['note', 'content'] : ['content']
        }
      }
    }
  ]
}

function resolveNote(connectedNotes, noteName) {
  if (!connectedNotes?.length) return null
  if (!noteName) return connectedNotes.length === 1 ? connectedNotes[0] : null
  return connectedNotes.find((n) => n.name.toLowerCase() === String(noteName).toLowerCase()) || null
}

// Normaliza cada resultado numa string simples — é isso que vira o
// `content` da tool-result message enviada de volta ao modelo. Erros viram
// texto descritivo em vez de lançar exceção: o modelo lida bem com falhas
// relatadas em texto (tenta outro path, avisa o usuário etc.), e o loop de
// tool-calling em OllamaNode.vue não precisa de um caminho de erro separado.
// `context.connectedNotes` só é usado por read_note/write_note.
export async function executeTool(name, args, context = {}) {
  try {
    if (name === 'read_file') {
      const result = await readFile(args.path)
      return result.ok ? result.content : `Erro ao ler ${args.path}: ${result.error}`
    }

    if (name === 'write_file') {
      const result = await writeFile(args.path, args.content ?? '')
      return result.ok ? `Arquivo salvo em ${result.path}.` : `Erro ao escrever ${args.path}: ${result.error}`
    }

    if (name === 'list_files') {
      const result = await listFiles(args.path)
      if (!result.ok) return `Erro ao listar ${args.path}: ${result.error}`
      if (result.entries.length === 0) return `${result.path} está vazio.`
      return result.entries.map((e) => (e.isDirectory ? `${e.name}/` : e.name)).join('\n')
    }

    if (name === 'read_note') {
      const note = resolveNote(context.connectedNotes, args.note)
      if (!note) return `Nota "${args.note || ''}" não encontrada entre as notas conectadas.`
      const result = await readNote(note.path)
      return result.content ?? ''
    }

    if (name === 'write_note') {
      const note = resolveNote(context.connectedNotes, args.note)
      if (!note) return `Nota "${args.note || ''}" não encontrada entre as notas conectadas.`
      const result = await writeNote(note.path, args.content ?? '')
      return result.ok ? `Nota "${note.name}" atualizada.` : `Erro ao escrever na nota "${note.name}": ${result.error}`
    }

    return `Tool desconhecida: ${name}`
  } catch (err) {
    return `Erro ao executar ${name}: ${err.message}`
  }
}
