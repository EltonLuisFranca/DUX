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
import {
  TERMINAL_ICON,
  BROWSER_ICON,
  OLLAMA_ICON,
  MERLIN_ICON,
  GIT_ICON,
  IMAGE_ICON,
  HTTP_ICON,
  DOCKER_ICON,
  CREDENTIAL_TEST_ICON,
  PORT_SCAN_ICON,
  LOAD_TEST_ICON,
  SUBDOMAIN_SCAN_ICON,
  DIR_FUZZ_ICON,
  SECURITY_HEADERS_ICON,
  TLS_CHECK_ICON,
  TECH_FINGERPRINT_ICON,
  VULN_SCAN_ICON,
  DNS_WHOIS_ICON
} from './nodeIcons'

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
    label: 'Themis',
    description: 'Assistente de voz: clique pra ativar, converse e ela responde falando — respostas curtas, estilo Jarvis.',
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
  'tech-fingerprint': {
    label: 'Detector de Tecnologias',
    description: 'Identifica CMS, framework, linguagem, bibliotecas JS, servidor web e CDN/WAF de uma URL analisando headers, cookies e HTML — sem depender de Wappalyzer instalado.',
    category: 'tools',
    createData: () => ({ name: 'Detector de Tecnologias' }),
    icon: TECH_FINGERPRINT_ICON
  },
  'vuln-scan': {
    label: 'Scanner de Vulnerabilidades',
    description: 'Suíte completa de pentest: roda DNS/WHOIS, fingerprint de tecnologias, headers de segurança, SSL/TLS, portas, subdomínios, diretórios, checklist de vulnerabilidades e credenciais fracas contra uma URL, cada um na configuração padrão, e consolida tudo num relatório único por severidade (Crítico/Alto/Médio/Baixo).',
    category: 'tools',
    createData: () => ({ name: 'Scanner de Vulnerabilidades' }),
    icon: VULN_SCAN_ICON
  },
  'dns-whois': {
    label: 'DNS / WHOIS',
    description: 'Consulta registros DNS completos (A/AAAA/MX/TXT/NS/CNAME/SOA/CAA), SPF/DMARC/DKIM e dados de registro WHOIS de um domínio — sem depender de cliente whois instalado.',
    category: 'tools',
    createData: () => ({ name: 'DNS / WHOIS' }),
    icon: DNS_WHOIS_ICON
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
