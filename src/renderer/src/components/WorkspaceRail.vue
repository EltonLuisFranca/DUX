<template>
  <nav ref="rootRef" class="ws-rail" aria-label="Workspaces">
    <div class="ws-list">
      <AppTooltip
        v-for="ws in workspaces"
        :key="ws.id"
        :label="ws.name"
        placement="right"
      >
        <button
          class="ws-avatar"
          :class="{ active: ws.id === activeWorkspaceId }"
          :aria-label="`Workspace ${ws.name}`"
          @click="switchTo(ws.id)"
          @contextmenu.prevent="openContext(ws, $event)"
        >
          <span v-if="ws.id === activeWorkspaceId" class="ws-active-bar" />
          {{ initials(ws.name) }}
          <span
            v-if="isRoomConnected && ws.id === activeWorkspaceId"
            class="ws-room-badge"
            title="Em uma Room"
          >
            <svg viewBox="0 0 16 16" width="9" height="9" fill="none" stroke="var(--color-status-working)" stroke-width="1.7" aria-hidden="true">
              <circle cx="6" cy="6" r="2.4" />
              <circle cx="11" cy="9" r="1.9" />
              <path d="M2 14c.6-2.4 2.2-3.5 4-3.5s3.4 1.1 4 3.5" />
            </svg>
          </span>
        </button>
      </AppTooltip>

      <AppTooltip label="Novo workspace" placement="right">
        <button class="ws-add" aria-label="Novo workspace" @click="createNew">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </AppTooltip>

      <AppTooltip :label="isRoomConnected ? 'Room conectada' : 'Entrar em uma Room'" placement="right">
        <button class="ws-join" :class="{ connected: isRoomConnected }" aria-label="Entrar em uma Room" @click.stop="toggleJoin">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6.5 9.5a2.5 2.5 0 0 0 3.6.1l2-2a2.5 2.5 0 1 0-3.5-3.5l-.8.8" />
            <path d="M9.5 6.5a2.5 2.5 0 0 0-3.6-.1l-2 2a2.5 2.5 0 1 0 3.5 3.5l.8-.8" />
          </svg>
        </button>
      </AppTooltip>
    </div>

    <div class="ws-spacer" />

    <AppTooltip label="Configurações (Ctrl+,)" placement="right">
      <button class="ws-gear" :class="{ active: settingsSidebarOpen }" aria-label="Configurações" @click="toggleSettings">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </AppTooltip>

    <!-- menu de contexto do workspace -->
    <div v-if="menu === 'context'" class="ws-popover" :style="{ top: menuTop + 'px' }" @click.stop>
      <button class="pop-item" @click="startRename(ctxWs)">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5l2 2L5 13l-2.6.6L3 11l8.5-8.5z" /></svg>
        Renomear
      </button>
      <button class="pop-item" @click="doRoom(ctxWs)">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.5" cy="5.5" r="2.2" /><circle cx="11" cy="7.5" r="1.7" /><path d="M2 13c.4-2 1.8-3.2 3.5-3.2S8.6 11 9 13" /></svg>
        Convidar pra Room
      </button>
      <button v-if="workspaces.length > 1" class="pop-item danger" @click="doDelete(ctxWs)">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M5 4.5l.5 8a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.5-8" /></svg>
        Excluir
      </button>
    </div>

    <!-- renomear -->
    <div v-if="menu === 'rename'" class="ws-popover ws-popover-pad" :style="{ top: menuTop + 'px' }" @click.stop>
      <input
        ref="renameInput"
        v-model="renameValue"
        class="pop-input"
        type="text"
        @keyup.enter="commitRename"
        @keyup.esc="closeMenu"
      />
    </div>

    <!-- entrar em room -->
    <div v-if="menu === 'join'" class="ws-popover ws-popover-pad ws-join-pop" @click.stop>
      <template v-if="!isRoomConnected">
        <input
          ref="joinInput"
          v-model="code"
          class="pop-input"
          type="text"
          maxlength="6"
          placeholder="Código de 6 dígitos"
          @keyup.enter="handleJoin"
        />
        <button class="pop-btn" :disabled="joining || code.trim().length !== 6" @click="handleJoin">
          {{ joining ? 'Entrando…' : 'Entrar na Room' }}
        </button>
        <p v-if="joinError" class="pop-error">{{ joinError }}</p>
      </template>
      <template v-else>
        <div class="pop-connected">Conectado a uma Room</div>
        <button class="pop-btn danger" @click="handleLeave">Sair da Room</button>
      </template>
    </div>
  </nav>
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
import { openRoomInviteModal, isRoomConnected, joinRoomByCode, joinRoomById, leaveRoom } from '../store/roomStore'
import { settingsSidebarOpen, toggleSettings } from '../store/themeStore'
import AppTooltip from './AppTooltip.vue'

const rootRef = ref(null)
const renameInput = ref(null)
const joinInput = ref(null)

const menu = ref(null) // 'context' | 'rename' | 'join' | null
const menuTop = ref(0)
const ctxWs = ref(null)
const renameValue = ref('')
const code = ref('')
const joining = ref(false)
const joinError = ref('')

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'WS'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// y do popover: alinhado ao topo do botão clicado, relativo ao rail
function anchorTop(event) {
  const railTop = rootRef.value?.getBoundingClientRect().top ?? 0
  const btn = event.currentTarget.getBoundingClientRect()
  return Math.max(8, btn.top - railTop)
}

function switchTo(id) {
  switchWorkspace(id)
  closeMenu()
}

function openContext(ws, event) {
  ctxWs.value = ws
  menuTop.value = anchorTop(event)
  menu.value = 'context'
}

function startRename(ws) {
  ctxWs.value = ws
  renameValue.value = ws.name
  menu.value = 'rename'
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function commitRename() {
  if (ctxWs.value) renameWorkspace(ctxWs.value.id, renameValue.value)
  closeMenu()
}

function doDelete(ws) {
  requestDeleteWorkspace(ws.id)
  closeMenu()
}

function doRoom(ws) {
  openRoomInviteModal(ws)
  closeMenu()
}

function createNew() {
  const id = createWorkspace()
  const ws = workspaces.value.find((w) => w.id === id)
  if (ws) {
    switchWorkspace(id)
    // abre renomear ancorado no fim da lista (o novo avatar)
    menuTop.value = Math.max(8, (workspaces.value.length - 1) * 44)
    startRename(ws)
  }
}

function toggleJoin(event) {
  if (menu.value === 'join') {
    closeMenu()
    return
  }
  menuTop.value = anchorTop(event)
  menu.value = 'join'
  nextTick(() => joinInput.value?.focus())
}

async function handleJoin() {
  const trimmed = code.value.trim()
  if (trimmed.length !== 6) return
  joining.value = true
  joinError.value = ''
  try {
    const { room_id: roomId } = await joinRoomByCode(trimmed)
    joinRoomById(roomId)
    code.value = ''
    closeMenu()
  } catch (err) {
    joinError.value = 'Código inválido ou expirado.'
  } finally {
    joining.value = false
  }
}

function handleLeave() {
  leaveRoom()
  closeMenu()
}

function closeMenu() {
  menu.value = null
  ctxWs.value = null
  joinError.value = ''
}

function handleClickOutside(event) {
  if (rootRef.value && !rootRef.value.contains(event.target)) closeMenu()
}

// captura antes do Vue Flow (mesmo motivo do WorkspaceSwitcher antigo)
onMounted(() => document.addEventListener('mousedown', handleClickOutside, { capture: true }))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside, { capture: true }))
</script>

<style scoped>
.ws-rail {
  width: 56px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  background: var(--color-bg-surface-alt);
  border-right: 1px solid var(--color-border);
  position: relative;
  z-index: 6;
}

.ws-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.ws-avatar {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.12s ease, border-color 0.12s ease;
}

.ws-avatar:hover {
  color: var(--color-text-primary);
  border-color: var(--color-text-tertiary);
}

.ws-avatar.active {
  color: var(--color-text-primary);
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-surface));
}

.ws-active-bar {
  position: absolute;
  left: -12px;
  top: 8px;
  width: 3px;
  height: 20px;
  border-radius: 0 3px 3px 0;
  background: var(--color-accent);
}

.ws-room-badge {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 15px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-bg-surface-alt);
}

.ws-add,
.ws-join,
.ws-gear {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ws-add {
  border: 1px dashed var(--color-border-strong);
}

.ws-add:hover,
.ws-join:hover,
.ws-gear:hover {
  color: var(--color-text-primary);
  background: var(--color-hover);
}

.ws-join.connected {
  color: var(--color-status-working);
}

.ws-gear.active {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}

.ws-spacer {
  flex: 1;
}

/* ——— popovers (ancorados à direita do rail) ——— */
.ws-popover {
  position: absolute;
  left: calc(100% + 8px);
  min-width: 170px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 12px 32px var(--color-shadow);
  z-index: 20;
}

.ws-popover-pad {
  padding: 8px;
  gap: 8px;
}

.pop-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.pop-item:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.pop-item.danger:hover {
  background: color-mix(in srgb, var(--color-status-error) 16%, transparent);
  color: var(--color-status-error);
}

.pop-input {
  width: 100%;
  height: 30px;
  padding: 0 9px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 12.5px;
}

.pop-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.ws-join-pop {
  min-width: 190px;
}

.ws-join-pop .pop-input {
  letter-spacing: 2px;
  text-transform: uppercase;
}

.pop-btn {
  height: 30px;
  border: 0;
  border-radius: 7px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.pop-btn:disabled {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  cursor: default;
}

.pop-btn.danger {
  background: color-mix(in srgb, var(--color-status-error) 16%, transparent);
  color: var(--color-status-error);
}

.pop-connected {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
}

.pop-error {
  margin: 0;
  font-size: 11px;
  color: var(--color-status-error);
}
</style>
