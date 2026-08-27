import { ref } from 'vue'

export const nodes = ref([
  {
    id: 'posiflow',
    type: 'wsl-claude-terminal',
    position: { x: 80, y: 80 },
    data: { name: 'Posiflow', cwd: '/home/elton/posiflow' }
  }
])

export const edges = ref([])

export const activeSettingsNodeId = ref(null)

export function openNodeSettings(id) {
  activeSettingsNodeId.value = id
}

export function closeNodeSettings() {
  activeSettingsNodeId.value = null
}

export function toggleNodeSettings(id) {
  activeSettingsNodeId.value = activeSettingsNodeId.value === id ? null : id
}

export function updateNodeData(id, patch) {
  const node = nodes.value.find((n) => n.id === id)
  if (node) Object.assign(node.data, patch)
}

const NODE_WIDTH = 480
const NODE_GAP = 60

export function addNode(type, data) {
  const maxX = nodes.value.reduce((max, n) => Math.max(max, n.position.x), 80 - NODE_WIDTH - NODE_GAP)
  const id = crypto.randomUUID()
  nodes.value.push({
    id,
    type,
    position: { x: maxX + NODE_WIDTH + NODE_GAP, y: 80 },
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
