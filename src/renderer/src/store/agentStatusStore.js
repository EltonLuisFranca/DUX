import { computed, reactive, ref } from 'vue'

// Estado de cada agente (terminal) do app inteiro, pra barra de status do
// rodapé (AgentStatusBar) contar "N trabalhando · N aguardando" sem depender
// do workspace aberto. Cada WslClaudeTerminalNode publica o próprio estado
// aqui (ele é quem sabe, pela saída do PTY) e limpa ao desmontar.
//
// state: 'working' | 'waiting' | 'idle' | 'connecting' | 'offline'
// 'waiting' = o agente está parado esperando o usuário (ex: aprovação).
export const agentStatuses = reactive(new Map())

export function setAgentStatus(nodeId, status) {
  agentStatuses.set(nodeId, { ...agentStatuses.get(nodeId), ...status })
}

export function clearAgentStatus(nodeId) {
  agentStatuses.delete(nodeId)
}

function idsIn(state) {
  return [...agentStatuses].filter(([, s]) => s.state === state).map(([id]) => id)
}

export const workingAgentIds = computed(() => idsIn('working'))
export const waitingAgentIds = computed(() => idsIn('waiting'))

// Pedido de "leva a tela até este node" — cada FleetCanvas (um por
// workspace, todos montados) observa e só o que contém o node centraliza.
// `at` força o watch a disparar de novo pro mesmo node.
export const nodeFocusRequest = ref(null) // { nodeId, at } | null

export function requestNodeFocus(nodeId) {
  nodeFocusRequest.value = { nodeId, at: Date.now() }
}
