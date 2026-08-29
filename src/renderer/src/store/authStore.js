import { ref, watch } from 'vue'

export const authToken = ref(window.authStore?.getTokenSync?.() ?? null)
export const isAuthenticated = ref(Boolean(authToken.value))
export const user = ref(null)

export function login() {
  window.authStore?.login?.()
}

export function logout() {
  window.authStore?.logout?.()
  authToken.value = null
  isAuthenticated.value = false
  user.value = null
}

window.authStore?.onTokenReceived?.(() => {
  authToken.value = window.authStore?.getTokenSync?.() ?? null
  isAuthenticated.value = Boolean(authToken.value)
})

// A requisição de fato roda no processo main (Node puro), não aqui — fetch()
// no renderer é sujeito a CORS como qualquer página web, e a allowlist de
// origens do backend não cobre nem deveria precisar cobrir um app desktop.
export async function apiFetch(path, options = {}) {
  if (!authToken.value) throw new Error('not authenticated')

  const { ok, status, data } = await window.authStore.apiFetch(path, {
    method: options.method,
    body: options.body ? JSON.parse(options.body) : undefined
  })

  if (status === 401) {
    logout()
    throw new Error('session expired')
  }

  if (!ok) {
    throw new Error(`request failed: ${status}`)
  }

  return data
}

async function fetchProfile() {
  try {
    const { data } = await apiFetch('/api/v1/profile')
    user.value = data
  } catch (err) {
    console.error('[auth] failed to fetch profile', err)
  }
}

watch(
  authToken,
  (token) => {
    if (token) fetchProfile()
    else user.value = null
  },
  { immediate: true }
)
