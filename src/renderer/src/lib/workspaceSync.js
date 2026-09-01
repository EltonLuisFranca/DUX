import { ref, watch } from 'vue'
import { apiFetch, authToken } from '../store/authStore'

// Sincronização remota dos workspaces (push debounced por workspace, pull
// com merge por updated_at, exclusão best-effort) — extraído do flowStore
// pra isolar o que é falar com o backend do que é estado/ações locais do
// canvas. Best-effort em tudo: falha de rede ou logout nunca pode quebrar o
// fluxo local, que continua sendo a fonte de verdade offline.
//
// Recebe do flowStore os refs de estado local que precisa ler/mutar
// (workspaces, activeWorkspaceId) e o persistLocal já configurado por ele,
// pra não duplicar o debounce de disco aqui.
export function createWorkspaceSync({ workspaces, activeWorkspaceId, persistLocal, persisted }) {
  // Timestamp da última vez que cada workspace foi sincronizado com sucesso
  // (local ou remoto) — usado pra decidir, no merge, qual lado é mais novo.
  const syncedAt = ref(persisted?.syncedAt && typeof persisted.syncedAt === 'object' ? { ...persisted.syncedAt } : {})

  // IDs de workspaces apagados localmente que ainda não confirmaram a exclusão
  // no servidor — sem isso, um workspace deletado localmente "ressuscitaria"
  // no próximo pull remoto, porque o servidor ainda o teria.
  const pendingDeletes = ref(new Set(Array.isArray(persisted?.pendingDeletes) ? persisted.pendingDeletes : []))

  const remoteSyncTimers = new Map()

  // Sincroniza um workspace por vez (não o array inteiro) — assim editar o
  // Workspace A numa máquina e o Workspace B em outra nunca conflita, cada um
  // tem seu próprio updated_at no servidor.
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

  // Chamado ao apagar um workspace localmente: cancela um push pendente pra
  // ele e limpa o syncedAt, pra não reenviar/considerar sincronizado um
  // workspace que já não existe mais localmente.
  function forgetWorkspace(id) {
    pendingDeletes.value.add(id)
    clearTimeout(remoteSyncTimers.get(id))
    delete syncedAt.value[id]
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

  return { syncedAt, pendingDeletes, syncAllToRemote, forgetWorkspace, deleteWorkspaceRemote }
}
