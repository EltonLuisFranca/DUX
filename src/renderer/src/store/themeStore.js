import { ref, watchEffect } from 'vue'

const STORAGE_KEY = 'dux-theme'

export const theme = ref(localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark')

watchEffect(() => {
  document.documentElement.setAttribute('data-theme', theme.value)
  localStorage.setItem(STORAGE_KEY, theme.value)
})

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

export const XTERM_THEMES = {
  dark: { background: '#18181b', foreground: '#e4e4e7' },
  light: { background: '#ffffff', foreground: '#18181b' }
}
