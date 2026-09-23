import TerminalSettings from '../components/nodeSettings/TerminalSettings.vue'
import TerminalCreateForm from '../components/nodeCreate/TerminalCreateForm.vue'
import BrowserCreateForm from '../components/nodeCreate/BrowserCreateForm.vue'
import OllamaCreateForm from '../components/nodeCreate/OllamaCreateForm.vue'
import OllamaSettings from '../components/nodeSettings/OllamaSettings.vue'
import MerlinCreateForm from '../components/nodeCreate/MerlinCreateForm.vue'
import MerlinSettings from '../components/nodeSettings/MerlinSettings.vue'
import DuxBanSettings from '../components/nodeSettings/DuxBanSettings.vue'
import DockerSettings from '../components/nodeSettings/DockerSettings.vue'
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

const MERLIN_ICON =
  '<path d="M10 2.3c.7 3.2 2.4 4.9 5.5 5.5-3.1.6-4.8 2.3-5.5 5.5-.7-3.2-2.4-4.9-5.5-5.5 3.1-.6 4.8-2.3 5.5-5.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none"/><circle cx="15.7" cy="15.3" r="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/>'

const GIT_ICON =
  '<circle cx="10" cy="10" r="1.8" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="5" cy="4.5" r="1.8" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="5" cy="15.5" r="1.8" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M5 6.3V13.7M11.6 9.2C10 7.6 8 6.3 5 6.3" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>'

const IMAGE_ICON =
  '<rect x="2" y="3" width="16" height="14" rx="2.2" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="7" cy="8" r="1.6" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M3.5 15l4.5-4.5 2.5 2.5 3.5-4 3 3.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'

const HTTP_ICON =
  '<path d="M3 6.5h14M3 13.5h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M8 2.5L6 17.5M14 2.5l-2 15" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'

// pilha de caixas (não a baleia do Docker, que é marca registrada) — mesmo
// estilo stroke=currentColor dos outros ícones deste registry
const DOCKER_ICON =
  '<rect x="2.5" y="11" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><rect x="9" y="11" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><rect x="9" y="4.5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><rect x="15.5" y="11" width="2.5" height="6" rx="0.8" stroke="currentColor" stroke-width="1.2" fill="none"/>'

// chave: círculo do bocal + haste + dentes — mesmo estilo stroke=currentColor dos outros ícones
const CREDENTIAL_TEST_ICON =
  '<circle cx="6" cy="10" r="3.3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M9.1 10H17M13.8 10v3M16.2 10v2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'

// radar de varredura: círculos concêntricos + agulha + um "ping" (porta
// aberta encontrada) — mesmo estilo stroke=currentColor dos outros ícones
const PORT_SCAN_ICON =
  '<circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="10" cy="10" r="3.8" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M10 10L14.5 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="15" cy="5" r="1.4" fill="currentColor"/>'

// medidor tipo velocímetro (carga/RPS) — mesmo estilo stroke=currentColor dos outros ícones
const LOAD_TEST_ICON =
  '<path d="M3 14a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M10 14L14 7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="14" r="1.3" fill="currentColor"/><path d="M4.5 14h-1M16.5 14h-1M6 8.5l-.7-.7M14 8.5l.7-.7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>'

// árvore de domínio: nó raiz ramificando em subdomínios — mesmo estilo stroke=currentColor dos outros ícones
const SUBDOMAIN_SCAN_ICON =
  '<circle cx="4" cy="10" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="16" cy="4" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="16" cy="10" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="16" cy="16" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M6 10h2M10 10V4h4M10 10h4M10 10v6h4" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>'

// pasta com lupa: fuzzing de diretórios/endpoints escondidos — mesmo estilo stroke=currentColor dos outros ícones
const DIR_FUZZ_ICON =
  '<path d="M2.5 6.5a1.3 1.3 0 0 1 1.3-1.3h3.4l1.3 1.6h6.7a1.3 1.3 0 0 1 1.3 1.3v6.1a1.3 1.3 0 0 1-1.3 1.3H3.8a1.3 1.3 0 0 1-1.3-1.3V6.5z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><circle cx="12.3" cy="12.3" r="2.3" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M14 14l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'

// escudo com check: analisa os headers de resposta e reporta o nível de
// proteção — mesmo estilo stroke=currentColor dos outros ícones
const SECURITY_HEADERS_ICON =
  '<path d="M10 2.5l6 2.2v5c0 4-2.6 6.8-6 7.8-3.4-1-6-3.8-6-7.8v-5l6-2.2z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M7 10l2 2 4-4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'

// cadeado: verificação de certificado/conexão TLS — mesmo estilo
// stroke=currentColor dos outros ícones
const TLS_CHECK_ICON =
  '<rect x="4" y="9" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="10" cy="13" r="1.2" fill="currentColor"/>'

// registro de tipos de node: cada tipo novo entra aqui com seu próprio
// formulário de configurações (sidebar) e, opcionalmente, um formulário de
// criação (quando precisa de input do usuário antes de existir, ex: um caminho)
//
// todo tipo terminado em "-terminal" renderiza o mesmo componente de node
// (WslClaudeTerminalNode, ver templates no FleetCanvas e TERMINAL_TYPES lá) —
// só o form de criação/settings, o texto e o `command` enviado ao bridge
// mudam; qual aparece no modal depende do SO (wsl-claude-terminal, ver
// AddNodeModal.vue) ou de detecção em runtime pelo bridge (wsl-terminal,
// powershell-terminal, cmd-terminal — via requiresAvailability, checado
// contra terminalAvailabilityStore.js)
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
  'shell-terminal': {
    label: 'Terminal',
    description: 'Shell interativo (zsh) local, sem agente de IA.',
    category: 'tools',
    settingsComponent: TerminalSettings,
    createForm: TerminalCreateForm,
    createFormProps: { command: 'shell' },
    icon: TERMINAL_ICON
  },
  'wsl-terminal': {
    label: 'Terminal WSL',
    description: 'Shell interativo (zsh) dentro do WSL, sem agente de IA.',
    category: 'tools',
    settingsComponent: TerminalSettings,
    settingsProps: { wslMode: true },
    createForm: TerminalCreateForm,
    createFormProps: { wslMode: true, command: 'shell' },
    // só aparece na lista quando o bridge detecta que está rodando dentro do
    // WSL (ver terminalAvailabilityStore.js/AddNodeModal.vue)
    requiresAvailability: 'wsl',
    icon: TERMINAL_ICON
  },
  'powershell-terminal': {
    label: 'PowerShell',
    description: 'Sessão do PowerShell rodando no Windows.',
    category: 'tools',
    settingsComponent: TerminalSettings,
    createForm: TerminalCreateForm,
    createFormProps: { command: 'powershell' },
    requiresAvailability: 'powershell',
    icon: TERMINAL_ICON
  },
  'cmd-terminal': {
    label: 'Prompt de Comando (CMD)',
    description: 'Sessão do cmd.exe do Windows.',
    category: 'tools',
    settingsComponent: TerminalSettings,
    createForm: TerminalCreateForm,
    createFormProps: { command: 'cmd' },
    requiresAvailability: 'cmd',
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
  merlin: {
    label: 'Merlin',
    description: 'Assistente de voz: diga "Merlin" para chamar, converse e ele responde falando — respostas curtas, estilo Jarvis.',
    category: 'agents',
    createForm: MerlinCreateForm,
    settingsComponent: MerlinSettings,
    icon: MERLIN_ICON
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
  docker: {
    label: 'Docker',
    description: 'Dashboard de containers Docker: listar, iniciar/parar/reiniciar e ver logs.',
    category: 'tools',
    createData: () => ({ name: 'Docker', host: '' }),
    settingsComponent: DockerSettings,
    icon: DOCKER_ICON
  },
  'credential-test': {
    label: 'Força Bruta de Credenciais',
    description: 'Testa uma lista de credenciais contra um endpoint de login e reporta credencial fraca + ausência de rate limit/lockout.',
    category: 'tools',
    createData: () => ({ name: 'Força Bruta' }),
    icon: CREDENTIAL_TEST_ICON
  },
  'port-scan': {
    label: 'Varredura de Portas',
    description: 'Recon inicial: varre portas TCP de um host e tenta identificar o serviço de cada porta aberta — sem depender de nmap instalado.',
    category: 'tools',
    createData: () => ({ name: 'Varredura de Portas' }),
    icon: PORT_SCAN_ICON
  },
  'load-test': {
    label: 'Teste de Carga',
    description: 'Gera carga controlada (RPS alvo, duração, ramp-up) contra um endpoint próprio e reporta throughput, latência (p50/p95/p99) e taxa de erro.',
    category: 'tools',
    createData: () => ({ name: 'Teste de Carga' }),
    icon: LOAD_TEST_ICON
  },
  'subdomain-scan': {
    label: 'Scanner de Subdomínios',
    description: 'Recon inicial: testa uma wordlist de subdomínios comuns contra um domínio via DNS (com fallback HTTP) e reporta os que existem, com IP e status HTTP.',
    category: 'tools',
    createData: () => ({ name: 'Scanner de Subdomínios' }),
    icon: SUBDOMAIN_SCAN_ICON
  },
  'dir-fuzz': {
    label: 'Fuzzer de Diretórios/Endpoints',
    description: 'Testa uma wordlist de paths comuns (admin, api, .env, .git, backup...) contra uma URL e reporta os que não retornam 404, com status code e tamanho da resposta.',
    category: 'tools',
    createData: () => ({ name: 'Fuzzer de Diretórios' }),
    icon: DIR_FUZZ_ICON
  },
  'security-headers': {
    label: 'Detector de Headers de Segurança',
    description: 'Analisa os headers de resposta HTTP de uma URL (CSP, HSTS, X-Frame-Options, cookies...) e reporta o que está presente, ausente ou mal configurado, com um score geral de proteção.',
    category: 'tools',
    createData: () => ({ name: 'Headers de Segurança' }),
    icon: SECURITY_HEADERS_ICON
  },
  'tls-check': {
    label: 'Verificador de SSL/TLS',
    description: 'Conecta via TLS num host:porta e reporta validade do certificado, cadeia, protocolo negociado e cifra — com alertas de expiração, certificado inválido ou protocolo obsoleto.',
    category: 'tools',
    createData: () => ({ name: 'Verificador SSL/TLS' }),
    icon: TLS_CHECK_ICON
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
  },
  duxban: {
    label: 'DuxBan',
    description: 'Central de tarefas: conecte agentes e o DuxBan distribui, enfileira e acompanha o que cada um está fazendo.',
    category: 'utility',
    createData: () => ({
      name: 'DuxBan',
      columns: [
        { id: crypto.randomUUID(), title: 'A fazer', cards: [] },
        { id: crypto.randomUUID(), title: 'Fazendo', cards: [] },
        { id: crypto.randomUUID(), title: 'Em revisão / Bloqueado', cards: [] },
        { id: crypto.randomUUID(), title: 'Feito', cards: [] }
      ],
      tags: []
    }),
    icon: '<rect x="2" y="3" width="4.5" height="14" rx="1.3" stroke="currentColor" stroke-width="1.3" fill="none"/><rect x="7.8" y="3" width="4.5" height="9" rx="1.3" stroke="currentColor" stroke-width="1.3" fill="none"/><rect x="13.6" y="3" width="4.5" height="11" rx="1.3" stroke="currentColor" stroke-width="1.3" fill="none"/>',
    settingsComponent: DuxBanSettings
  }
}
