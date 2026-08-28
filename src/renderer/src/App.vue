<template>
  <div class="window-shell">
    <TitleBar title="DUX" />
    <div class="canvas-area">
      <NodeSettingsSidebar />
      <div class="canvas-stack">
        <div v-for="ws in workspaces" :key="ws.id" v-show="ws.id === activeWorkspaceId" class="canvas-slot">
          <FleetCanvas :workspace="ws" />
        </div>
      </div>
    </div>
    <AddNodeModal />
    <ConfirmDeleteNodeModal />
    <ConfirmDeleteWorkspaceModal />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import TitleBar from './components/TitleBar.vue'
import FleetCanvas from './components/FleetCanvas.vue'
import NodeSettingsSidebar from './components/NodeSettingsSidebar.vue'
import AddNodeModal from './components/AddNodeModal.vue'
import ConfirmDeleteNodeModal from './components/ConfirmDeleteNodeModal.vue'
import ConfirmDeleteWorkspaceModal from './components/ConfirmDeleteWorkspaceModal.vue'
import { workspaces, activeWorkspaceId, switchWorkspace, flushPersist } from './store/flowStore'

function goToWorkspace(direction) {
  const currentIndex = workspaces.value.findIndex((w) => w.id === activeWorkspaceId.value)
  if (currentIndex === -1) return
  const nextIndex = (currentIndex + direction + workspaces.value.length) % workspaces.value.length
  switchWorkspace(workspaces.value[nextIndex].id)
}

// Ctrl+Seta cima/baixo navega entre workspaces (App.vue monta uma vez só,
// evitando disparo duplicado que aconteceria num componente por workspace)
function onKeydown(event) {
  if (!event.ctrlKey) return
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    goToWorkspace(1)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    goToWorkspace(-1)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, { capture: true })
  window.addEventListener('beforeunload', flushPersist)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, { capture: true })
  window.removeEventListener('beforeunload', flushPersist)
})
</script>

<style scoped>
.canvas-stack {
  flex: 1;
  min-width: 0;
  position: relative;
}

.canvas-slot {
  position: absolute;
  inset: 0;
}
</style>
