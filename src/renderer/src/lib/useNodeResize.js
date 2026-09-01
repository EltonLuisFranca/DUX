import { onBeforeUnmount, ref } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { updateNodeData } from '../store/flowStore'

// Resize por arraste do canto inferior direito, compartilhado por todos os
// node types: mede o delta do mouse já corrigido pelo zoom do canvas, aplica
// nos refs width/height (com piso mínimo por tipo) e persiste no fim do drag.
export function useNodeResize(props, { minWidth, minHeight, defaultWidth, defaultHeight }) {
  const { viewport } = useVueFlow()

  const nodeWidth = ref(props.data.width || defaultWidth)
  const nodeHeight = ref(props.data.height || defaultHeight)

  let resizeStartX = 0
  let resizeStartY = 0
  let resizeStartW = 0
  let resizeStartH = 0

  function onResizeMove(event) {
    const zoom = viewport.value.zoom || 1
    const dx = (event.clientX - resizeStartX) / zoom
    const dy = (event.clientY - resizeStartY) / zoom
    nodeWidth.value = Math.max(minWidth, Math.round(resizeStartW + dx))
    nodeHeight.value = Math.max(minHeight, Math.round(resizeStartH + dy))
  }

  function stopResize() {
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', stopResize)
    updateNodeData(props.id, { width: nodeWidth.value, height: nodeHeight.value })
  }

  function startResize(event) {
    resizeStartX = event.clientX
    resizeStartY = event.clientY
    resizeStartW = nodeWidth.value
    resizeStartH = nodeHeight.value
    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', stopResize)
    event.preventDefault()
    event.stopPropagation()
  }

  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', stopResize)
  })

  return { nodeWidth, nodeHeight, startResize }
}
