import { computed, ref, watch } from 'vue'

const DEFAULT_WORKSPACE = {
  id: 'default',
  name: 'Workspace 1',
  nodes: [
    {
      id: 'posiflow',
      type: 'wsl-claude-terminal',
      position: { x: 80, y: 80 },
      data: { name: 'Posiflow', cwd: '/home/elton/posiflow' }
    }
  ],
  edges: []
}

const persisted = window.workspaceStore?.loadSync?.() ?? null

export const workspaces = ref(
  Array.isArray(persisted?.workspaces) && persisted.workspaces.length ? persisted.workspaces : [DEFAULT_WORKSPACE]
)

export const activeWorkspaceId = ref(
  workspaces.value.some((w) => w.id === persisted?.activeWorkspaceId)
    ? persisted.activeWorkspaceId
    : workspaces.value[0].id
)

export const activeWorkspace = computed(
  () => workspaces.value.find((w) => w.id === activeWorkspaceId.value) ?? workspaces.value[0]
)

export const activeSettingsNodeId = ref(null)

let saveTimer = null

function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.workspaceStore?.save?.({
      workspaces: workspaces.value,
      activeWorkspaceId: activeWorkspaceId.value
    })
  }, 400)
}

// deep watch pega mudanças em qualquer node/edge de qualquer workspace,
// já que todos ficam montados e rodando em paralelo, não só o ativo
watch(workspaces, persist, { deep: true })

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
  persist()
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

  persist()
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
