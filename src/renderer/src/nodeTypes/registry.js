import WslClaudeTerminalSettings from '../components/nodeSettings/WslClaudeTerminalSettings.vue'
import WslClaudeTerminalCreateForm from '../components/nodeCreate/WslClaudeTerminalCreateForm.vue'
import ClaudeTerminalSettings from '../components/nodeSettings/ClaudeTerminalSettings.vue'
import ClaudeTerminalCreateForm from '../components/nodeCreate/ClaudeTerminalCreateForm.vue'
import CodexTerminalCreateForm from '../components/nodeCreate/CodexTerminalCreateForm.vue'
import BrowserCreateForm from '../components/nodeCreate/BrowserCreateForm.vue'
import OllamaCreateForm from '../components/nodeCreate/OllamaCreateForm.vue'
import OllamaSettings from '../components/nodeSettings/OllamaSettings.vue'

const TERMINAL_ICON =
  '<rect x="2" y="3" width="16" height="14" rx="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M6 8l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 14h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'

const BROWSER_ICON =
  '<circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M2.5 10h15M10 2.5c2.2 2.1 3.4 4.8 3.4 7.5s-1.2 5.4-3.4 7.5c-2.2-2.1-3.4-4.8-3.4-7.5S7.8 4.6 10 2.5z" stroke="currentColor" stroke-width="1.3" fill="none"/>'

const OLLAMA_ICON =
  '<circle cx="10" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4 17.5c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/><circle cx="7.8" cy="6.5" r="0.9" fill="currentColor"/><circle cx="12.2" cy="6.5" r="0.9" fill="currentColor"/>'

// registro de tipos de node: cada tipo novo entra aqui com seu próprio
// formulário de configurações (sidebar) e, opcionalmente, um formulário de
// criação (quando precisa de input do usuário antes de existir, ex: um caminho)
//
// wsl-claude-terminal e claude-terminal renderizam o mesmo componente de node
// (WslClaudeTerminalNode, ver templates no FleetCanvas) — só o form de criação/
// settings e o texto mudam; qual dos dois aparece no modal depende do SO (ver AddNodeModal.vue)
export const nodeTypeRegistry = {
  'wsl-claude-terminal': {
    label: 'Terminal WSL · Claude Code',
    description: 'Sessão interativa do Claude Code rodando dentro do WSL.',
    settingsComponent: WslClaudeTerminalSettings,
    createForm: WslClaudeTerminalCreateForm,
    icon: TERMINAL_ICON
  },
  'claude-terminal': {
    label: 'Terminal · Claude Code',
    description: 'Sessão interativa do Claude Code rodando localmente no Linux.',
    settingsComponent: ClaudeTerminalSettings,
    createForm: ClaudeTerminalCreateForm,
    icon: TERMINAL_ICON
  },
  'codex-terminal': {
    label: 'Terminal · Codex',
    description: 'Sessão interativa do Codex CLI rodando localmente no Linux.',
    settingsComponent: ClaudeTerminalSettings,
    createForm: CodexTerminalCreateForm,
    icon: TERMINAL_ICON
  },
  browser: {
    label: 'Navegador',
    description: 'Uma página web dentro do canvas — abra o preview do seu projeto ali.',
    createForm: BrowserCreateForm,
    icon: BROWSER_ICON
  },
  ollama: {
    label: 'Ollama',
    description: 'Chat com um modelo rodando localmente via Ollama.',
    createForm: OllamaCreateForm,
    settingsComponent: OllamaSettings,
    icon: OLLAMA_ICON
  },
  notes: {
    label: 'Nota',
    description: 'Bloco de notas simples, sem terminal — pra anotações e lembretes.',
    createData: () => ({ name: 'Nova nota', content: '' }),
    // criada arrastando o ícone da barra de zoom pro canvas, não pelo modal
    hideFromModal: true,
    // fica sempre atrás dos outros tipos de node
    defaultZIndex: -1,
    icon: '<path d="M3 2.5h7l3 3V13a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M10 2.5V5.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M5 8h6M5 10.5h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
  }
}
