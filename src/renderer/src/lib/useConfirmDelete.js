import { ref } from 'vue'

// confirmação em dois cliques pra qualquer ação destrutiva: primeiro clique
// arma `pendingDeleteId` (o botão vira vermelho sólido / troca o texto),
// segundo clique dentro da janela confirma. Sem segundo clique, desarma
// sozinho — evita exclusão acidental de um clique só. Cada componente que
// precisa disso pega sua própria instância (Kanban e o modal de detalhes, por
// exemplo, não compartilham a mesma trava — armar uma exclusão de coluna no
// Kanban não deveria interferir no botão de excluir cartão do modal).
export function useConfirmDelete(timeoutMs = 2500) {
  const pendingDeleteId = ref(null)
  let timer = null

  function requestDelete(id, action) {
    clearTimeout(timer)
    if (pendingDeleteId.value === id) {
      pendingDeleteId.value = null
      action()
    } else {
      pendingDeleteId.value = id
      timer = setTimeout(() => {
        pendingDeleteId.value = null
      }, timeoutMs)
    }
  }

  function reset() {
    clearTimeout(timer)
    pendingDeleteId.value = null
  }

  return { pendingDeleteId, requestDelete, reset }
}
