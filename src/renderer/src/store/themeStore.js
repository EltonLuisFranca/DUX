import { ref, watchEffect } from 'vue'

const STORAGE_KEY = 'dux-theme'
const CANVAS_VARIANT_STORAGE_KEY = 'dux-canvas-variant'
const EDGE_STYLE_STORAGE_KEY = 'dux-edge-style'
const SNAP_ENABLED_STORAGE_KEY = 'dux-snap-enabled'

export const SNAP_GRID_SIZE = 16

export const EDGE_STYLES = [
  { value: 'default', label: 'Curva' },
  { value: 'smoothstep', label: 'Ortogonal' },
  { value: 'step', label: 'Reta em ângulo' },
  { value: 'straight', label: 'Reta' }
]

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

const validEdgeStyleValues = EDGE_STYLES.map((s) => s.value)
const storedEdgeStyle = localStorage.getItem(EDGE_STYLE_STORAGE_KEY)

export const edgeStyle = ref(validEdgeStyleValues.includes(storedEdgeStyle) ? storedEdgeStyle : 'default')

watchEffect(() => {
  localStorage.setItem(EDGE_STYLE_STORAGE_KEY, edgeStyle.value)
})

export function setEdgeStyle(value) {
  edgeStyle.value = value
}

export const snapEnabled = ref(localStorage.getItem(SNAP_ENABLED_STORAGE_KEY) === 'true')

watchEffect(() => {
  localStorage.setItem(SNAP_ENABLED_STORAGE_KEY, String(snapEnabled.value))
})

export function setSnapEnabled(value) {
  snapEnabled.value = value
}

// Sidebar de configurações do app: mesmo padrão do NodeSettingsSidebar
// (flowStore.activeSettingsNodeId) — estado global simples em vez de local,
// pra empurrar o layout do canvas em vez de sobrepor como overlay.
export const settingsSidebarOpen = ref(false)

export function openSettings() {
  settingsSidebarOpen.value = true
}

export function closeSettings() {
  settingsSidebarOpen.value = false
}

export function toggleSettings() {
  settingsSidebarOpen.value = !settingsSidebarOpen.value
}

export const XTERM_THEMES = {
  dark: { background: '#18181b', foreground: '#e4e4e7' },
  light: { background: '#ffffff', foreground: '#18181b' }
}
