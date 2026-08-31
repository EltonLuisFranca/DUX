import { readFile, writeFile, listFiles } from './bridgeClient'

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

// Normaliza cada resultado numa string simples — é isso que vira o
// `content` da tool-result message enviada de volta ao modelo. Erros viram
// texto descritivo em vez de lançar exceção: o modelo lida bem com falhas
// relatadas em texto (tenta outro path, avisa o usuário etc.), e o loop de
// tool-calling em OllamaNode.vue não precisa de um caminho de erro separado.
export async function executeTool(name, args) {
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

    return `Tool desconhecida: ${name}`
  } catch (err) {
    return `Erro ao executar ${name}: ${err.message}`
  }
}
