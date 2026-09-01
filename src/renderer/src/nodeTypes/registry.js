import TerminalSettings from '../components/nodeSettings/TerminalSettings.vue'
import TerminalCreateForm from '../components/nodeCreate/TerminalCreateForm.vue'
import BrowserCreateForm from '../components/nodeCreate/BrowserCreateForm.vue'
import OllamaCreateForm from '../components/nodeCreate/OllamaCreateForm.vue'
import OllamaSettings from '../components/nodeSettings/OllamaSettings.vue'
import GitCreateForm from '../components/nodeCreate/GitCreateForm.vue'
import ImageCreateForm from '../components/nodeCreate/ImageCreateForm.vue'
import HttpCreateForm from '../components/nodeCreate/HttpCreateForm.vue'
import NotesCreateForm from '../components/nodeCreate/NotesCreateForm.vue'
import { createDefaultNote } from '../lib/bridgeClient'

const TERMINAL_ICON =
  '<rect x="2" y="3" width="16" height="14" rx="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M6 8l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 14h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'

const BROWSER_ICON =
  '<circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M2.5 10h15M10 2.5c2.2 2.1 3.4 4.8 3.4 7.5s-1.2 5.4-3.4 7.5c-2.2-2.1-3.4-4.8-3.4-7.5S7.8 4.6 10 2.5z" stroke="currentColor" stroke-width="1.3" fill="none"/>'

const OLLAMA_ICON =
  '<circle cx="10" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4 17.5c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/><circle cx="7.8" cy="6.5" r="0.9" fill="currentColor"/><circle cx="12.2" cy="6.5" r="0.9" fill="currentColor"/>'

const GIT_ICON =
  '<circle cx="10" cy="10" r="1.8" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="5" cy="4.5" r="1.8" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="5" cy="15.5" r="1.8" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M5 6.3V13.7M11.6 9.2C10 7.6 8 6.3 5 6.3" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>'

const IMAGE_ICON =
  '<rect x="2" y="3" width="16" height="14" rx="2.2" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="7" cy="8" r="1.6" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M3.5 15l4.5-4.5 2.5 2.5 3.5-4 3 3.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'

const HTTP_ICON =
  '<path d="M3 6.5h14M3 13.5h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M8 2.5L6 17.5M14 2.5l-2 15" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'

// registro de tipos de node: cada tipo novo entra aqui com seu próprio
// formulário de configurações (sidebar) e, opcionalmente, um formulário de
// criação (quando precisa de input do usuário antes de existir, ex: um caminho)
//
// wsl-claude-terminal e claude-terminal renderizam o mesmo componente de node
// (WslClaudeTerminalNode, ver templates no FleetCanvas) — só o form de criação/
// settings e o texto mudam; qual dos dois aparece no modal depende do SO (ver AddNodeModal.vue)
// category organiza a listagem em abas no AddNodeModal — agents (terminais
// de agente e chat com modelo), tools (utilitários de dev) e media (conteúdo
// visual estático). Nova categoria = só adicionar a chave em CATEGORY_LABELS.
export const CATEGORY_LABELS = {
  agents: 'Agentes',
  tools: 'Ferramentas',
  media: 'Mídia',
  utility: 'Utilitários'
}

export const nodeTypeRegistry = {
  'wsl-claude-terminal': {
    label: 'Terminal WSL · Claude Code',
    description: 'Sessão interativa do Claude Code rodando dentro do WSL.',
    category: 'agents',
    settingsComponent: TerminalSettings,
    settingsProps: { wslMode: true },
    createForm: TerminalCreateForm,
    createFormProps: { wslMode: true },
    icon: TERMINAL_ICON
  },
  'claude-terminal': {
    label: 'Terminal · Claude Code',
    description: 'Sessão interativa do Claude Code rodando localmente no Linux.',
    category: 'agents',
    settingsComponent: TerminalSettings,
    createForm: TerminalCreateForm,
    createFormProps: { command: 'claude' },
    icon: TERMINAL_ICON
  },
  'codex-terminal': {
    label: 'Terminal · Codex',
    description: 'Sessão interativa do Codex CLI rodando localmente no Linux.',
    category: 'agents',
    settingsComponent: TerminalSettings,
    createForm: TerminalCreateForm,
    createFormProps: { command: 'codex' },
    icon: TERMINAL_ICON
  },
  ollama: {
    label: 'Ollama',
    description: 'Chat com um modelo rodando localmente via Ollama.',
    category: 'agents',
    createForm: OllamaCreateForm,
    settingsComponent: OllamaSettings,
    icon: OLLAMA_ICON
  },
  browser: {
    label: 'Navegador',
    description: 'Uma página web dentro do canvas — abra o preview do seu projeto ali.',
    category: 'tools',
    createForm: BrowserCreateForm,
    icon: BROWSER_ICON
  },
  git: {
    label: 'Git',
    description: 'Status e diff de um repositório, atualizado automaticamente.',
    category: 'tools',
    createForm: GitCreateForm,
    icon: GIT_ICON
  },
  http: {
    label: 'HTTP',
    description: 'Testa endpoints — método, headers, body e resposta, sem sair do canvas.',
    category: 'tools',
    createForm: HttpCreateForm,
    icon: HTTP_ICON
  },
  image: {
    label: 'Imagem',
    description: 'Uma imagem de referência no canvas — mockup, screenshot, print de bug.',
    category: 'media',
    createForm: ImageCreateForm,
    icon: IMAGE_ICON
  },
  notes: {
    label: 'Nota',
    description: 'Nota em arquivo .md real no disco — conecte agentes via edge para compartilhar contexto entre sessões.',
    category: 'media',
    // dois caminhos de criação: arrastar da barra de zoom usa createData
    // (arquivo criado automaticamente em ~/.dux/notes/, sem perguntar nada —
    // ver ZoomControls.vue/FleetCanvas.handleDrop); o modal "Adicionar node"
    // usa createForm pra deixar escolher onde salvar (NotesCreateForm.vue)
    createData: async () => {
      const result = await createDefaultNote()
      if (result.error) {
        console.error('[notes] falha ao criar nota padrão:', result.error)
        return null
      }
      return { name: result.name, path: result.path }
    },
    createForm: NotesCreateForm,
    // fica sempre atrás dos outros tipos de node, mesmo padrão de antes
    defaultZIndex: -1,
    icon: '<path d="M3 2.5h7l3 3V13a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M10 2.5V5.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M5 8h6M5 10.5h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
  },
  pomodoro: {
    label: 'Pomodoro',
    description: 'Timer de foco/pausa com ciclos automáticos e notificação.',
    category: 'utility',
    createData: () => ({ name: 'Pomodoro' }),
    icon: '<circle cx="10" cy="11" r="7" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M10 7v4l3 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M8 2.5h4M10 2.5V4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'
  }
}
