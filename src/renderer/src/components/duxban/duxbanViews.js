import DuxBanKanbanView from './DuxBanKanbanView.vue'
import DuxBanListView from './DuxBanListView.vue'

// Registro das visualizações do board — adicionar uma nova visualização no
// futuro é só criar o componente (mesmo contrato de props/emits das duas
// abaixo: `data`, `columns`, `tags`, `connectedAgents` / `open-detail`,
// `open-create`) e incluir uma entrada aqui. DuxBanNode.vue itera essa lista
// pros botões de troca de visualização e resolve o componente ativo por id,
// sem precisar saber quantas ou quais visualizações existem.
export const DUXBAN_VIEWS = [
  { id: 'kanban', label: 'Kanban', component: DuxBanKanbanView },
  { id: 'list', label: 'Lista', component: DuxBanListView }
]

export const DEFAULT_DUXBAN_VIEW = 'kanban'

export function resolveDuxBanView(viewId) {
  return DUXBAN_VIEWS.find((v) => v.id === viewId) || DUXBAN_VIEWS.find((v) => v.id === DEFAULT_DUXBAN_VIEW)
}
