import { apiFetch, authToken } from '../store/authStore'

// Sincroniza o CONTEÚDO de uma nota com a Uzuno, best-effort — separado do
// sync de workspace (flowStore.js). Lá o .md em disco é a fonte da verdade e
// o node.data de uma nota guarda só {name, path}, nunca o texto, justamente
// pra não duplicar conteúdo entre workspaces.json/servidor e o arquivo (que
// poderiam divergir — ver comentário em NotesNode.vue). Este módulo empurra
// uma CÓPIA do conteúdo pro backend sob demanda e nunca lê de volta; o
// arquivo local continua sendo a única fonte de verdade que o app de fato usa.
const debounceTimers = new Map()
const DEBOUNCE_MS = 1500

export function syncNoteContent({ nodeId, path, content }) {
  if (!authToken.value || !nodeId) return
  clearTimeout(debounceTimers.get(nodeId))
  debounceTimers.set(
    nodeId,
    setTimeout(async () => {
      try {
        await apiFetch(`/api/v1/dux/notes/${nodeId}`, {
          method: 'PUT',
          body: JSON.stringify({ path, content })
        })
      } catch (err) {
        console.error('[notes] remote content sync failed', nodeId, err)
      }
    }, DEBOUNCE_MS)
  )
}
