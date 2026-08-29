<template>
  <div ref="rootRef" class="join-room">
    <AppTooltip label="Entrar em uma Room">
      <button class="join-btn" :class="{ active: isRoomConnected }" @click="open = !open">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3l2 1.5" />
        </svg>
      </button>
    </AppTooltip>

    <div v-if="open" class="join-panel">
      <template v-if="!isRoomConnected">
        <input
          v-model="code"
          class="code-input"
          type="text"
          maxlength="6"
          placeholder="Código de 6 dígitos"
          @keyup.enter="handleJoin"
        />
        <button class="btn-join" :disabled="joining || code.trim().length !== 6" @click="handleJoin">
          {{ joining ? 'Entrando...' : 'Entrar' }}
        </button>
        <p v-if="error" class="join-error">{{ error }}</p>
      </template>
      <template v-else>
        <p class="join-status">Conectado a uma room.</p>
        <button class="btn-leave" @click="handleLeave">Sair da room</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppTooltip from './AppTooltip.vue'
import { isRoomConnected, joinRoomByCode, joinRoomById, leaveRoom } from '../store/roomStore'

const open = ref(false)
const code = ref('')
const joining = ref(false)
const error = ref('')
const rootRef = ref(null)

async function handleJoin() {
  const trimmed = code.value.trim()
  if (trimmed.length !== 6) return
  joining.value = true
  error.value = ''
  try {
    const { room_id: roomId } = await joinRoomByCode(trimmed)
    joinRoomById(roomId)
    code.value = ''
    open.value = false
  } catch (err) {
    error.value = 'Código inválido ou expirado.'
  } finally {
    joining.value = false
  }
}

function handleLeave() {
  leaveRoom()
  open.value = false
}

function handleClickOutside(event) {
  if (rootRef.value && !rootRef.value.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside, { capture: true }))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside, { capture: true }))
</script>

<style scoped>
.join-room {
  position: relative;
}

.join-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-quaternary);
  box-shadow: 0 2px 8px var(--color-shadow);
  cursor: pointer;
}

.join-btn:hover {
  background: var(--color-hover);
}

.join-btn.active {
  color: #22c55e;
}

.join-panel {
  position: absolute;
  top: 44px;
  left: 0;
  z-index: 31;
  width: 200px;
  padding: 10px;
  box-sizing: border-box;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.code-input {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  margin-bottom: 8px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 13px;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.code-input:focus {
  outline: none;
}

.btn-join,
.btn-leave {
  width: 100%;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-join:hover:not(:disabled),
.btn-leave:hover {
  background: var(--color-hover);
}

.btn-join:disabled {
  color: var(--color-text-quaternary);
  cursor: default;
}

.join-error {
  margin: 6px 0 0;
  font-size: 11px;
  color: #ef4444;
}

.join-status {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
