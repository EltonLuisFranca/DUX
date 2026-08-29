import { ref, watch } from 'vue'

const UZUNO_API_BASE = 'https://api.uzuno.tech'

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

export async function apiFetch(path, options = {}) {
  if (!authToken.value) throw new Error('not authenticated')

  const response = await fetch(`${UZUNO_API_BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${authToken.value}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    }
  })

  if (response.status === 401) {
    logout()
    throw new Error('session expired')
  }

  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`)
  }

  return response.json()
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
