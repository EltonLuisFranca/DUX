import WslClaudeTerminalSettings from '../components/nodeSettings/WslClaudeTerminalSettings.vue'
import WslClaudeTerminalCreateForm from '../components/nodeCreate/WslClaudeTerminalCreateForm.vue'

// registro de tipos de node: cada tipo novo entra aqui com seu próprio
// formulário de configurações (sidebar) e, opcionalmente, um formulário de
// criação (quando precisa de input do usuário antes de existir, ex: um caminho)
export const nodeTypeRegistry = {
  'wsl-claude-terminal': {
    label: 'Terminal WSL · Claude Code',
    description: 'Sessão interativa do Claude Code rodando dentro do WSL.',
    settingsComponent: WslClaudeTerminalSettings,
    createForm: WslClaudeTerminalCreateForm,
    icon: '<rect x="2" y="3" width="16" height="14" rx="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M6 8l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 14h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'
  }
}
