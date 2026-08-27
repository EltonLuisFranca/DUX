<template>
  <div ref="rootRef" class="workspace-switcher">
    <AppTooltip label="Workspaces">
      <button class="zoom-btn" @click="open = !open">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="8" height="8" rx="1.5" />
          <rect x="6" y="6" width="8" height="8" rx="1.5" />
        </svg>
      </button>
    </AppTooltip>

    <ul v-if="open" class="workspace-menu">
      <li
        v-for="ws in workspaces"
        :key="ws.id"
        class="workspace-item"
        :class="{ active: ws.id === activeWorkspaceId }"
      >
        <input
          v-if="renamingId === ws.id"
          class="rename-input"
          :value="ws.name"
          @click.stop
          @keyup.enter="commitRename(ws.id, $event.target.value)"
          @blur="commitRename(ws.id, $event.target.value)"
        />
        <button v-else class="workspace-name" @click="handleSwitch(ws.id)">{{ ws.name }}</button>

        <div class="workspace-actions">
          <button class="icon-btn" title="Renomear" @click.stop="startRename(ws.id)">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path
                d="M11.5 2.5l2 2L5 13l-2.6.6L3 11l8.5-8.5z"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
          </button>
          <button
            v-if="workspaces.length > 1"
            class="icon-btn danger"
            title="Excluir"
            @click.stop="requestDeleteWorkspace(ws.id)"
          >
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path
                d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M5 4.5l.5 8a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.5-8"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
          </button>
        </div>
      </li>

      <li class="divider" />

      <li class="workspace-new" @click="handleCreate">+ Novo workspace</li>
    </ul>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  workspaces,
  activeWorkspaceId,
  switchWorkspace,
  createWorkspace,
  renameWorkspace,
  requestDeleteWorkspace
} from '../store/flowStore'
import AppTooltip from './AppTooltip.vue'

const open = ref(false)
const rootRef = ref(null)
const renamingId = ref(null)

function focusRenameInput() {
  nextTick(() => {
    const el = rootRef.value?.querySelector('.rename-input')
    el?.focus()
    el?.select()
  })
}

function handleSwitch(id) {
  switchWorkspace(id)
  open.value = false
}

function handleCreate() {
  const id = createWorkspace()
  renamingId.value = id
  focusRenameInput()
}

function startRename(id) {
  renamingId.value = id
  focusRenameInput()
}

function commitRename(id, value) {
  renameWorkspace(id, value)
  renamingId.value = null
}

function handleClickOutside(event) {
  if (rootRef.value && !rootRef.value.contains(event.target)) {
    open.value = false
    renamingId.value = null
  }
}

// captura antes do Vue Flow (o pane do canvas intercepta mousedown pra pan/seleção
// e impede a propagação normal até o listener no document na fase de bubble)
onMounted(() => document.addEventListener('mousedown', handleClickOutside, { capture: true }))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside, { capture: true }))
</script>

<style scoped>
.workspace-switcher {
  position: relative;
}

.zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-quaternary);
  cursor: pointer;
}

.zoom-btn:hover {
  background: var(--color-hover);
}

.workspace-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  list-style: none;
  margin: 0;
  padding: 4px;
  width: 220px;
  max-height: 260px;
  overflow-y: auto;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px var(--color-shadow);
}

.workspace-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 4px 4px 8px;
  border-radius: 6px;
}

.workspace-item:hover {
  background: var(--color-hover);
}

.workspace-item.active .workspace-name {
  color: var(--color-text-primary);
  font-weight: 600;
}

.workspace-name {
  flex: 1;
  min-width: 0;
  padding: 6px 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 12px;
}

.rename-input:focus {
  outline: none;
}

.workspace-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--color-border);
  color: var(--color-text-primary);
}

.icon-btn.danger:hover {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.divider {
  height: 1px;
  margin: 4px 2px;
  background: var(--color-border);
}

.workspace-new {
  padding: 7px 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  border-radius: 6px;
  cursor: pointer;
}

.workspace-new:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}
</style>
