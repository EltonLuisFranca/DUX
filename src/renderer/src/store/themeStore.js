import { ref, watchEffect } from 'vue'

const STORAGE_KEY = 'dux-theme'
const CANVAS_VARIANT_STORAGE_KEY = 'dux-canvas-variant'

export const theme = ref(localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark')

watchEffect(() => {
  document.documentElement.setAttribute('data-theme', theme.value)
  localStorage.setItem(STORAGE_KEY, theme.value)
})

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

export function setTheme(value) {
  theme.value = value
}

export const canvasVariant = ref(
  localStorage.getItem(CANVAS_VARIANT_STORAGE_KEY) === 'lines' ? 'lines' : 'dots'
)

watchEffect(() => {
  localStorage.setItem(CANVAS_VARIANT_STORAGE_KEY, canvasVariant.value)
})

export function setCanvasVariant(variant) {
  canvasVariant.value = variant
}

export const XTERM_THEMES = {
  dark: { background: '#18181b', foreground: '#e4e4e7' },
  light: { background: '#ffffff', foreground: '#18181b' }
}
