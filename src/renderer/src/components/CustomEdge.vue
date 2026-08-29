<template>
  <defs>
    <linearGradient :id="gradientId" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#7c3aed" />
    </linearGradient>
  </defs>

  <BaseEdge :id="id" :path="path" :marker-end="markerEnd" :marker-start="markerStart" :style="edgeStyleAttrs" />

  <!-- path invisível mais largo só pra capturar hover em toda a extensão da
  linha — a linha visível (2px) é fina demais pra ser um alvo confortável de
  mouse, e é isso que decide quando mostrar o botão de excluir -->
  <path
    :d="path"
    fill="none"
    stroke="transparent"
    stroke-width="20"
    class="nopan"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  />

  <EdgeLabelRenderer>
    <div
      class="edge-delete-btn nodrag nopan"
      :class="{ visible: hovered }"
      :style="{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
      @click="removeEdge(id)"
    >
      <svg viewBox="0 0 16 16" width="11" height="11">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </div>
  </EdgeLabelRenderer>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useVueFlow
} from '@vue-flow/core'

const props = defineProps({
  id: { type: String, required: true },
  sourceX: { type: Number, required: true },
  sourceY: { type: Number, required: true },
  targetX: { type: Number, required: true },
  targetY: { type: Number, required: true },
  sourcePosition: { type: String, required: true },
  targetPosition: { type: String, required: true },
  type: { type: String, default: 'default' },
  markerEnd: { type: String, default: undefined },
  markerStart: { type: String, default: undefined }
})

const { removeEdges } = useVueFlow()

const hovered = ref(false)

const PATH_BUILDERS = {
  default: getBezierPath,
  smoothstep: getSmoothStepPath,
  step: (params) => getSmoothStepPath({ ...params, borderRadius: 0 }),
  straight: getStraightPath
}

const pathResult = computed(() => {
  const build = PATH_BUILDERS[props.type] || getBezierPath
  return build({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition
  })
})

const path = computed(() => pathResult.value[0])
const labelX = computed(() => pathResult.value[1])
const labelY = computed(() => pathResult.value[2])

// id do gradiente precisa ser único por edge — todas compartilham o mesmo
// <svg> pai do vue-flow, então um id fixo faria a primeira edge "vencer" e
// as outras referenciarem o gradiente errado (ou nenhum).
const gradientId = computed(() => `dux-edge-gradient-${props.id}`)

const edgeStyleAttrs = computed(() => ({
  stroke: `url(#${gradientId.value})`,
  strokeWidth: hovered.value ? 2.5 : 2,
  filter: 'drop-shadow(0 0 4px rgba(124, 58, 237, 0.45))',
  transition: 'stroke-width 0.12s ease'
}))

function removeEdge(id) {
  removeEdges([id])
}
</script>

<style scoped>
.edge-delete-btn {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  color: var(--color-text-secondary);
  opacity: 0;
  pointer-events: none;
  cursor: pointer;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.edge-delete-btn.visible {
  opacity: 1;
  pointer-events: all;
}

.edge-delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  color: #ef4444;
}
</style>
