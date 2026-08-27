<template>
  <div class="window-shell">
    <TitleBar title="DUX Fleet" />
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
import TitleBar from './components/TitleBar.vue'
import FleetCanvas from './components/FleetCanvas.vue'
import NodeSettingsSidebar from './components/NodeSettingsSidebar.vue'
import AddNodeModal from './components/AddNodeModal.vue'
import ConfirmDeleteNodeModal from './components/ConfirmDeleteNodeModal.vue'
import ConfirmDeleteWorkspaceModal from './components/ConfirmDeleteWorkspaceModal.vue'
import { workspaces, activeWorkspaceId } from './store/flowStore'
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
