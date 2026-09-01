import { computed, ref, toRaw, watch } from 'vue'
import { createWorkspaceSync } from '../lib/workspaceSync'

// id precisa ser um UUID de verdade — a coluna workspace_id no backend é
// `uuid`, e o Postgres rejeita qualquer outro formato com erro 500 no sync.
function createDefaultWorkspace() {
  return {
    id: crypto.randomUUID(),
    name: 'Workspace 1',
    nodes: [],
    edges: []
  }
}

const persisted = window.workspaceStore?.loadSync?.() ?? null

// Instalações antigas (antes da sync por workspace) podem ter persistido o
// workspace inicial com id literal "default", que não é um UUID válido —
// gera um novo id real na primeira leitura pra parar de quebrar o sync,
// preservando nome/nodes/edges já existentes.
function migrateLegacyWorkspaceIds(list) {
  return list.map((w) => (w.id === 'default' ? { ...w, id: crypto.randomUUID() } : w))
}

export const workspaces = ref(
  Array.isArray(persisted?.workspaces) && persisted.workspaces.length
    ? migrateLegacyWorkspaceIds(persisted.workspaces)
    : [createDefaultWorkspace()]
)

export const activeWorkspaceId = ref(
  workspaces.value.some((w) => w.id === persisted?.activeWorkspaceId)
    ? persisted.activeWorkspaceId
    : workspaces.value[0].id
)

// Criado logo após os refs que ele precisa (workspaces/activeWorkspaceId),
// bem antes de snapshot()/persistLocal()/flushPersist() abaixo — essas três
// leem workspaceSync.syncedAt/pendingDeletes, e por ser um `const` ele tem
// TDZ: chamá-las antes desta linha rodar lançaria "Cannot access
// 'workspaceSync' before initialization". Mantendo a criação o mais cedo
// possível no módulo (nada entre aqui e o topo do arquivo chama essas
// funções), essa janela de risco fica praticamente inexistente.
const workspaceSync = createWorkspaceSync({ workspaces, activeWorkspaceId, persistLocal, persisted })

export const activeWorkspace = computed(
  () => workspaces.value.find((w) => w.id === activeWorkspaceId.value) ?? workspaces.value[0]
)

export const activeSettingsNodeId = ref(null)

// Terminal que recebe o texto ditado por voz — o último node de terminal
// clicado, não persistido (só faz sentido durante a sessão atual da janela).
export const activeTerminalId = ref(null)

export function setActiveTerminal(id) {
  activeTerminalId.value = id
}

let saveTimer = null

// toRaw() é essencial aqui: isto atravessa ipcRenderer.invoke, que usa
// structured clone internamente — o algoritmo não sabe lidar com o Proxy
// reativo do Vue e lança "could not be cloned" mesmo quando o conteúdo em si
// é serializável.
function snapshot() {
  return {
    workspaces: toRaw(workspaces.value),
    activeWorkspaceId: activeWorkspaceId.value,
    syncedAt: toRaw(workspaceSync.syncedAt.value),
    pendingDeletes: [...workspaceSync.pendingDeletes.value]
  }
}

function persistLocal() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.workspaceStore?.save?.(snapshot())
  }, 400)
}

// Chamado no beforeunload da janela: sem isso, fechar o app logo após uma
// mudança pode encerrar o renderer antes do debounce de 400ms rodar, perdendo
// a alteração — o save aqui é síncrono, então roda por completo antes de fechar.
export function flushPersist() {
  clearTimeout(saveTimer)
  window.workspaceStore?.saveSync?.(snapshot())
}

// deep watch pega mudanças em qualquer node/edge/nome de qualquer workspace,
// já que todos ficam montados e rodando em paralelo — é o único disparador
// de persist/sync, então funções como renameWorkspace não precisam chamar
// nada explicitamente depois de mutar workspaces.value.
watch(
  workspaces,
  () => {
    persistLocal()
    workspaceSync.syncAllToRemote()
  },
  { deep: true }
)

// Sem isto, um app que abre sem nenhuma edição do usuário nunca grava
// workspaces.json (o watch acima só reage a mudanças subsequentes) — cada
// boot recomeça do zero (nada persistido pra carregar) e, se a migração de
// id "default" tiver rodado, gera um UUID novo a cada vez, duplicando o
// workspace no servidor a cada reinício.
persistLocal()

export function switchWorkspace(id) {
  if (id === activeWorkspaceId.value) return
  activeWorkspaceId.value = id
  activeSettingsNodeId.value = null
}

export function createWorkspace() {
  const id = crypto.randomUUID()
  const name = `Workspace ${workspaces.value.length + 1}`
  workspaces.value.push({ id, name, nodes: [], edges: [] })
  switchWorkspace(id)
  return id
}

export function renameWorkspace(id, name) {
  const ws = workspaces.value.find((w) => w.id === id)
  if (ws && name.trim()) ws.name = name.trim()
}

export const workspacePendingDeleteId = ref(null)

export function requestDeleteWorkspace(id) {
  workspacePendingDeleteId.value = id
}

export function cancelDeleteWorkspace() {
  workspacePendingDeleteId.value = null
}

export function confirmDeleteWorkspace() {
  const id = workspacePendingDeleteId.value
  workspacePendingDeleteId.value = null
  if (!id || workspaces.value.length <= 1) return

  const index = workspaces.value.findIndex((w) => w.id === id)
  if (index === -1) return
  workspaces.value.splice(index, 1)

  if (activeWorkspaceId.value === id) {
    activeWorkspaceId.value = workspaces.value[0].id
    activeSettingsNodeId.value = null
  }

  workspaceSync.forgetWorkspace(id)
  persistLocal()
  workspaceSync.deleteWorkspaceRemote(id)
}

export function openNodeSettings(id) {
  activeSettingsNodeId.value = id
}

export function closeNodeSettings() {
  activeSettingsNodeId.value = null
}

export function toggleNodeSettings(id) {
  activeSettingsNodeId.value = activeSettingsNodeId.value === id ? null : id
}

// com a sidebar já aberta, clicar em outro node troca pra mostrar as
// configurações dele; se o tipo clicado não tem painel de configurações
// (ex: notas), só fecha em vez de tentar mostrar algo errado
export function onNodeClicked(id, hasSettings) {
  if (!activeSettingsNodeId.value || activeSettingsNodeId.value === id) return
  if (hasSettings) {
    activeSettingsNodeId.value = id
  } else {
    closeNodeSettings()
  }
}

export function updateNodeData(id, patch) {
  const node = activeWorkspace.value.nodes.find((n) => n.id === id)
  if (node) Object.assign(node.data, patch)
}

export function removeNode(id) {
  const index = activeWorkspace.value.nodes.findIndex((n) => n.id === id)
  if (index !== -1) activeWorkspace.value.nodes.splice(index, 1)
  if (activeSettingsNodeId.value === id) activeSettingsNodeId.value = null
}

export const nodePendingDeleteId = ref(null)

export function requestDeleteNode(id) {
  nodePendingDeleteId.value = id
}

export function cancelDeleteNode() {
  nodePendingDeleteId.value = null
}

export function confirmDeleteNode() {
  if (nodePendingDeleteId.value) removeNode(nodePendingDeleteId.value)
  nodePendingDeleteId.value = null
}

const NODE_WIDTH = 480
const NODE_GAP = 60

export function addNode(type, data, position, zIndex = 0) {
  const targetNodes = activeWorkspace.value.nodes
  let resolvedPosition = position
  if (!resolvedPosition) {
    const maxX = targetNodes.reduce((max, n) => Math.max(max, n.position.x), 80 - NODE_WIDTH - NODE_GAP)
    resolvedPosition = { x: maxX + NODE_WIDTH + NODE_GAP, y: 80 }
  }
  const id = crypto.randomUUID()
  targetNodes.push({
    id,
    type,
    position: resolvedPosition,
    zIndex,
    data
  })
  return id
}

export const isAddNodeModalOpen = ref(false)

export function openAddNodeModal() {
  isAddNodeModalOpen.value = true
}

export function closeAddNodeModal() {
  isAddNodeModalOpen.value = false
}

// Ctrl+P: busca por nodes do workspace ativo (DuxSearch.vue). Fica dentro do
// <VueFlow> do workspace ativo (montado por FleetCanvas), não em App.vue como
// os outros modais globais, porque precisa de useVueFlow() (setCenter) pra
// navegar até o node — cada workspace tem seu próprio contexto de Vue Flow.
export const isSearchOpen = ref(false)

export function openSearch() {
  isSearchOpen.value = true
}

export function closeSearch() {
  isSearchOpen.value = false
}
