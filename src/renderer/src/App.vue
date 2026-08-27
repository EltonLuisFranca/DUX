<template>
  <div class="window-shell">
    <TitleBar title="DUX Fleet" />
    <div class="canvas-area">
      <NodeSettingsSidebar />
      <FleetCanvas />
    </div>
    <AddNodeModal />
    <ConfirmDeleteNodeModal />
  </div>
</template>

<script setup>
import TitleBar from './components/TitleBar.vue'
import FleetCanvas from './components/FleetCanvas.vue'
import NodeSettingsSidebar from './components/NodeSettingsSidebar.vue'
import AddNodeModal from './components/AddNodeModal.vue'
import ConfirmDeleteNodeModal from './components/ConfirmDeleteNodeModal.vue'
</script>
