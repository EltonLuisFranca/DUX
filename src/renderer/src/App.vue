<template>
  <div class="window-shell">
    <TitleBar title="DUX" />
    <div class="canvas-area">
      <NodeSettingsSidebar />
      <div class="canvas-stack">
        <div v-for="ws in workspaces" :key="ws.id" v-show="ws.id === activeWorkspaceId" class="canvas-slot">
          <FleetCanvas :workspace="ws" />
        </div>
        <button class="settings-corner" title="Configurações" @click="toggleSettings">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </button>
        <div class="user-badge-corner">
          <UserBadge />
          <RoomPresenceBadge />
        </div>
      </div>
      <SettingsSidebar />
    </div>
    <AddNodeModal />
    <ConfirmDeleteNodeModal />
    <ConfirmDeleteWorkspaceModal />
    <RoomInviteModal />
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
import SettingsSidebar from './components/SettingsSidebar.vue'
import UserBadge from './components/UserBadge.vue'
import RoomPresenceBadge from './components/RoomPresenceBadge.vue'
import RoomInviteModal from './components/RoomInviteModal.vue'
import { workspaces, activeWorkspaceId, switchWorkspace, flushPersist } from './store/flowStore'
import { toggleSettings } from './store/themeStore'

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

.settings-corner {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  cursor: pointer;
  box-shadow: 0 2px 8px var(--color-shadow);
}

.settings-corner:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.user-badge-corner {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
