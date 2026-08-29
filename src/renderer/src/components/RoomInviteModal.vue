<template>
  <div v-if="workspace" class="modal-backdrop" @mousedown.self="handleClose">
    <div class="modal">
      <span class="modal-title">Transformar "{{ workspace.name }}" em Room</span>
      <p class="modal-message">
        Convide outro usuário Uzuno para entrar nesta room. Ele vai receber um código pelas notificações
        do Uzuno e precisa digitá-lo no DUX para entrar.
      </p>

      <div v-if="creatingRoom" class="modal-status">Criando room...</div>
      <div v-else-if="createError" class="modal-status error">{{ createError }}</div>

      <template v-else-if="room">
        <input
          v-model="query"
          class="search-input"
          type="text"
          placeholder="Buscar por nome ou e-mail..."
          @input="handleQueryInput"
        />

        <div v-if="searching" class="modal-status">Buscando...</div>

        <ul v-if="results.length" class="user-list">
          <li v-for="u in results" :key="u.id" class="user-item">
            <span class="user-name">{{ u.firstname || u.email }}</span>
            <span class="user-email">{{ u.email }}</span>
            <button
              class="btn-invite"
              :disabled="invitedIds.has(u.id)"
              @click="handleInvite(u)"
            >
              {{ invitedIds.has(u.id) ? 'Convidado' : 'Convidar' }}
            </button>
          </li>
        </ul>
        <div v-else-if="query.trim().length >= 2 && !searching" class="modal-status">
          Nenhum usuário encontrado.
        </div>

        <p v-if="inviteError" class="modal-status error">{{ inviteError }}</p>
      </template>

      <div class="modal-actions">
        <button class="btn-secondary" @click="handleClose">Fechar</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { roomInviteWorkspace, closeRoomInviteModal, createRoomFromWorkspace, searchRoomUsers, inviteToRoom } from '../store/roomStore'

const workspace = roomInviteWorkspace

const creatingRoom = ref(false)
const createError = ref('')
const room = ref(null)

const query = ref('')
const results = ref([])
const searching = ref(false)
const invitedIds = ref(new Set())
const inviteError = ref('')

let searchTimer = null

async function ensureRoom(ws) {
  creatingRoom.value = true
  createError.value = ''
  room.value = null
  try {
    room.value = await createRoomFromWorkspace(ws.id, ws.name)
  } catch (err) {
    createError.value = 'Não foi possível criar a room. ' + err.message
  } finally {
    creatingRoom.value = false
  }
}

watch(
  workspace,
  (ws) => {
    query.value = ''
    results.value = []
    invitedIds.value = new Set()
    inviteError.value = ''
    if (ws) ensureRoom(ws)
  },
  { immediate: true }
)

function handleQueryInput() {
  clearTimeout(searchTimer)
  const q = query.value.trim()
  if (q.length < 2) {
    results.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      results.value = await searchRoomUsers(q)
    } catch {
      results.value = []
    } finally {
      searching.value = false
    }
  }, 300)
}

async function handleInvite(targetUser) {
  if (!room.value) return
  inviteError.value = ''
  try {
    await inviteToRoom(room.value.id, targetUser.id)
    invitedIds.value = new Set([...invitedIds.value, targetUser.id])
  } catch (err) {
    inviteError.value = 'Falha ao convidar. ' + err.message
  }
}

function handleClose() {
  clearTimeout(searchTimer)
  closeRoomInviteModal()
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 40;
}

.modal {
  width: 360px;
  padding: 16px;
  box-sizing: border-box;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  box-shadow: 0 16px 48px var(--color-shadow);
}

.modal-title {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-message {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.modal-status {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.modal-status.error {
  color: #ef4444;
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  margin-bottom: 10px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 12px;
}

.search-input:focus {
  outline: none;
}

.user-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 6px;
}

.user-item:hover {
  background: var(--color-hover);
}

.user-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.user-email {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.btn-invite {
  flex-shrink: 0;
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-primary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.btn-invite:hover:not(:disabled) {
  background: var(--color-hover);
}

.btn-invite:disabled {
  color: var(--color-text-quaternary);
  cursor: default;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-secondary {
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary:hover {
  background: var(--color-hover);
}
</style>
