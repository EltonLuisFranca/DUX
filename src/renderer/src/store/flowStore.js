import { computed, ref, toRaw, watch } from 'vue'
import { apiFetch, authToken } from './authStore'

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

// Timestamp da última vez que cada workspace foi sincronizado com sucesso
// (local ou remoto) — usado pra decidir, no merge, qual lado é mais novo.
// Guardado à parte (não dentro do workspace) pra não poluir o JSON que vai
// pro servidor nem pro arquivo local antigo.
const syncedAt = ref(persisted?.syncedAt && typeof persisted.syncedAt === 'object' ? { ...persisted.syncedAt } : {})

// IDs de workspaces apagados localmente que ainda não confirmaram a exclusão
// no servidor — sem isso, um workspace deletado localmente "ressuscitaria"
// no próximo pull remoto, porque o servidor ainda o teria.
const pendingDeletes = ref(new Set(Array.isArray(persisted?.pendingDeletes) ? persisted.pendingDeletes : []))

export const activeWorkspaceId = ref(
  workspaces.value.some((w) => w.id === persisted?.activeWorkspaceId)
    ? persisted.activeWorkspaceId
    : workspaces.value[0].id
)

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
    syncedAt: toRaw(syncedAt.value),
    pendingDeletes: [...pendingDeletes.value]
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

const remoteSyncTimers = new Map()

// Sincroniza um workspace por vez (não o array inteiro) — assim editar o
// Workspace A numa máquina e o Workspace B em outra nunca conflita, cada um
// tem seu próprio updated_at no servidor. Best-effort: falha de rede ou
// logout não pode quebrar o fluxo local, que continua sendo a fonte de
// verdade offline.
function syncWorkspaceToRemote(id) {
  if (!authToken.value) return
  clearTimeout(remoteSyncTimers.get(id))
  remoteSyncTimers.set(
    id,
    setTimeout(async () => {
      const ws = workspaces.value.find((w) => w.id === id)
      if (!ws) return
      try {
        const result = await apiFetch(`/api/v1/dux/workspaces/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ data: ws })
        })
        syncedAt.value = { ...syncedAt.value, [id]: result.updated_at }
        persistLocal()
      } catch (err) {
        console.error('[workspaces] remote sync failed', id, err)
      }
    }, 1500)
  )
}

function syncAllToRemote() {
  for (const ws of workspaces.value) syncWorkspaceToRemote(ws.id)
}

// deep watch pega mudanças em qualquer node/edge/nome de qualquer workspace,
// já que todos ficam montados e rodando em paralelo — é o único disparador
// de persist/sync, então funções como renameWorkspace não precisam chamar
// nada explicitamente depois de mutar workspaces.value.
watch(
  workspaces,
  () => {
    persistLocal()
    syncAllToRemote()
  },
  { deep: true }
)

// Sem isto, um app que abre sem nenhuma edição do usuário nunca grava
// workspaces.json (o watch acima só reage a mudanças subsequentes) — cada
// boot recomeça do zero (nada persistido pra carregar) e, se a migração de
// id "default" tiver rodado, gera um UUID novo a cada vez, duplicando o
// workspace no servidor a cada reinício.
persistLocal()

// Ao logar (ou reabrir o app já logado), busca todos os workspaces remotos e
// faz merge com os locais por id + updated_at — nunca substitui tudo de uma
// vez: cada workspace é comparado individualmente, então mudanças feitas
// offline numa máquina não são apagadas por um pull de outra.
async function pullFromRemote() {
  try {
    const { data: remoteWorkspaces } = await apiFetch('/api/v1/dux/workspaces')
    if (!Array.isArray(remoteWorkspaces)) return

    for (const remote of remoteWorkspaces) {
      const id = remote.workspace_id
      if (pendingDeletes.value.has(id)) continue

      const localIndex = workspaces.value.findIndex((w) => w.id === id)
      const localSyncedAt = syncedAt.value[id]
      const remoteIsNewer = !localSyncedAt || new Date(remote.updated_at) > new Date(localSyncedAt)

      if (localIndex === -1) {
        // Não existe local ainda (workspace criado em outra máquina)
        workspaces.value.push(remote.data)
      } else if (remoteIsNewer) {
        // Servidor tem uma versão mais nova que a última vez que este
        // cliente sincronizou — a mudança local (se houver) ainda não foi
        // vista pelo servidor, então o remoto vence.
        workspaces.value[localIndex] = remote.data
      }
      // else: local tem mudanças não sincronizadas ainda mais recentes —
      // mantém local, o watcher de push vai mandar pro servidor em breve.

      syncedAt.value = { ...syncedAt.value, [id]: remote.updated_at }
    }

    // Workspaces que existem localmente mas não vieram do servidor e nunca
    // foram sincronizados (criados offline) sobem no próximo push — não
    // fazemos nada aqui além de deixá-los como estão.
    if (!workspaces.value.some((w) => w.id === activeWorkspaceId.value)) {
      activeWorkspaceId.value = workspaces.value[0].id
    }

    persistLocal()
    syncAllToRemote()
  } catch (err) {
    console.error('[workspaces] remote pull failed', err)
  }
}

watch(
  authToken,
  (token) => {
    if (token) pullFromRemote()
  },
  { immediate: true }
)

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

  pendingDeletes.value.add(id)
  clearTimeout(remoteSyncTimers.get(id))
  delete syncedAt.value[id]
  persistLocal()
  deleteWorkspaceRemote(id)
}

// Best-effort, igual ao push/pull: se falhar (offline, deslogado), o id
// fica em pendingDeletes e a exclusão é retentada no próximo pull — o pull
// já ignora ids em pendingDeletes, então o workspace não ressuscita mesmo
// que o DELETE ainda não tenha chegado ao servidor.
async function deleteWorkspaceRemote(id) {
  if (!authToken.value) return
  try {
    await apiFetch(`/api/v1/dux/workspaces/${id}`, { method: 'DELETE' })
    pendingDeletes.value.delete(id)
    persistLocal()
  } catch (err) {
    console.error('[workspaces] remote delete failed', id, err)
  }
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
