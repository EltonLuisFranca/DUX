import { computed } from 'vue'
import { useVueFlow } from '@vue-flow/core'

// Diz se um handle específico (por id, ex: "left"/"right") de um node tem
// alguma edge conectada nele agora — reativo a getEdges do vue-flow, então
// atualiza sozinho quando uma conexão é criada ou removida no canvas.
export function useHandleConnection(nodeId) {
  const { getEdges } = useVueFlow()

  function isHandleConnected(handleId) {
    return computed(() =>
      getEdges.value.some(
        (edge) =>
          (edge.source === nodeId && edge.sourceHandle === handleId) ||
          (edge.target === nodeId && edge.targetHandle === handleId)
      )
    )
  }

  return { isHandleConnected }
}
