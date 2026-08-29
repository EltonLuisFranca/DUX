import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { ref } from 'vue'
import { apiFetch, authToken, user } from './authStore'

window.Pusher = Pusher

const REVERB_HOST = 'ws.uzuno.tech'
const REVERB_PORT = 443
const REVERB_APP_KEY = 'f4l2tmwqf6eg0f6jz0mw'

const CURSOR_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#818cf8', '#e879f9']

function colorForUserId(id) {
  const sum = String(id)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return CURSOR_COLORS[sum % CURSOR_COLORS.length]
}

function displayName(u) {
  return [u?.firstname, u?.lastname].filter(Boolean).join(' ') || u?.email || 'Usuário'
}

let echo = null
let currentChannel = null
let currentRoomId = null

export const isRoomConnected = ref(false)
export const activeRoomId = ref(null)

// Estado do modal "Transformar em Room" — workspace alvo enquanto o modal
// está aberto, null quando fechado.
export const roomInviteWorkspace = ref(null)

export function openRoomInviteModal(workspace) {
  roomInviteWorkspace.value = workspace
}

export function closeRoomInviteModal() {
  roomInviteWorkspace.value = null
}
export const presenceMembers = ref([]) // [{id, name, avatar, color}]
export const remoteCursors = ref({}) // { [userId]: {x, y, name, color, updatedAt} }
export const remoteNodesByUser = ref({}) // { [userId]: {name, color, nodes: [{id, type, position, label}]} }

function getEcho() {
  if (echo) return echo

  echo = new Echo({
    broadcaster: 'reverb',
    key: REVERB_APP_KEY,
    wsHost: REVERB_HOST,
    wsPort: REVERB_PORT,
    wssPort: REVERB_PORT,
    forceTLS: true,
    enabledTransports: ['ws', 'wss'],
    // Delega o handshake de autorização do canal (POST /broadcasting/auth)
    // pro main process via IPC — o Echo faria esse fetch sozinho a partir
    // do renderer, mas essa rota está atrás de CORS com allowlist que não
    // cobre a origem do Electron. Ver auth:broadcast-auth em main/index.js.
    authorizer: (channel) => ({
      authorize: async (socketId, callback) => {
        try {
          const { ok, data } = await window.authStore.broadcastAuth(socketId, channel.name)
          if (ok) callback(false, data)
          else callback(true, data)
        } catch (err) {
          callback(true, err)
        }
      }
    })
  })

  return echo
}

function resetRoomState() {
  presenceMembers.value = []
  remoteCursors.value = {}
  remoteNodesByUser.value = {}
  isRoomConnected.value = false
}

export function leaveRoom() {
  if (currentChannel && currentRoomId) {
    getEcho().leave(`dux.room.${currentRoomId}`)
  }
  currentChannel = null
  currentRoomId = null
  activeRoomId.value = null
  resetRoomState()
}

export function joinRoomById(roomId) {
  if (!roomId || !authToken.value) return
  if (currentRoomId === roomId) return

  leaveRoom()
  currentRoomId = roomId
  activeRoomId.value = roomId

  currentChannel = getEcho()
    .join(`dux.room.${roomId}`)
    .here((members) => {
      presenceMembers.value = members.map((m) => ({ ...m, color: colorForUserId(m.id) }))
      isRoomConnected.value = true
    })
    .joining((member) => {
      presenceMembers.value = [
        ...presenceMembers.value.filter((m) => m.id !== member.id),
        { ...member, color: colorForUserId(member.id) }
      ]
    })
    .leaving((member) => {
      presenceMembers.value = presenceMembers.value.filter((m) => m.id !== member.id)
      const cursors = { ...remoteCursors.value }
      delete cursors[member.id]
      remoteCursors.value = cursors

      const nodes = { ...remoteNodesByUser.value }
      delete nodes[member.id]
      remoteNodesByUser.value = nodes
    })
    .listenForWhisper('cursor', (payload) => {
      if (!payload?.userId) return
      remoteCursors.value = {
        ...remoteCursors.value,
        [payload.userId]: { ...payload, updatedAt: Date.now() }
      }
    })
    .listenForWhisper('node-snapshot', (payload) => {
      if (!payload?.userId) return
      remoteNodesByUser.value = {
        ...remoteNodesByUser.value,
        [payload.userId]: {
          name: payload.name,
          color: colorForUserId(payload.userId),
          nodes: payload.nodes ?? []
        }
      }
    })
}

let lastCursorWhisperAt = 0
const CURSOR_WHISPER_INTERVAL_MS = 60

export function sendCursorPosition(x, y) {
  if (!currentChannel) return
  const now = Date.now()
  if (now - lastCursorWhisperAt < CURSOR_WHISPER_INTERVAL_MS) return
  lastCursorWhisperAt = now

  currentChannel.whisper('cursor', {
    userId: user.value?.id,
    name: displayName(user.value),
    x,
    y
  })
}

export function broadcastNodeSnapshot(nodes) {
  if (!currentChannel) return

  currentChannel.whisper('node-snapshot', {
    userId: user.value?.id,
    name: displayName(user.value),
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      label: n.data?.name ?? n.type
    }))
  })
}

// --- REST: criação de room, busca de usuários, convite, entrada por código ---

export async function createRoomFromWorkspace(workspaceId, name) {
  return apiFetch('/api/v1/dux/rooms', {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId, name })
  })
}

export async function searchRoomUsers(query) {
  const { users } = await apiFetch(`/api/v1/dux/rooms/search-users?q=${encodeURIComponent(query)}`)
  return users
}

export async function inviteToRoom(roomId, userId) {
  return apiFetch(`/api/v1/dux/rooms/${roomId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId })
  })
}

export async function joinRoomByCode(code) {
  return apiFetch('/api/v1/dux/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ code })
  })
}
