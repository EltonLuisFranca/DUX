import { computed, ref, watchEffect } from 'vue'

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

export const CANVAS_VARIANTS = [
  { value: 'dots', label: 'Pontos' },
  { value: 'lines', label: 'Linhas' },
  { value: 'cross', label: 'Cruzes' },
  { value: 'grid', label: 'Grade' },
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'checkerboard', label: 'Xadrez' },
  { value: 'none', label: 'Nenhum' }
]
const CANVAS_VARIANT_VALUES = CANVAS_VARIANTS.map((v) => v.value)
const storedCanvasVariant = localStorage.getItem(CANVAS_VARIANT_STORAGE_KEY)

export const canvasVariant = ref(
  CANVAS_VARIANT_VALUES.includes(storedCanvasVariant) ? storedCanvasVariant : 'dots'
)

watchEffect(() => {
  localStorage.setItem(CANVAS_VARIANT_STORAGE_KEY, canvasVariant.value)
})

export function setCanvasVariant(variant) {
  canvasVariant.value = variant
}

// Cor do padrão (pontos/linhas) e do fundo do canvas — null significa
// "automático" (padrão derivado do tema claro/escuro, ver dotColor em
// FleetCanvas.vue), string hex sobrescreve.
const CANVAS_PATTERN_COLOR_STORAGE_KEY = 'dux-canvas-pattern-color'
const CANVAS_BG_COLOR_STORAGE_KEY = 'dux-canvas-bg-color'
const CANVAS_GAP_STORAGE_KEY = 'dux-canvas-gap'
const CANVAS_PATTERN_SIZE_STORAGE_KEY = 'dux-canvas-pattern-size'

export const canvasPatternColor = ref(localStorage.getItem(CANVAS_PATTERN_COLOR_STORAGE_KEY) || null)

watchEffect(() => {
  if (canvasPatternColor.value) localStorage.setItem(CANVAS_PATTERN_COLOR_STORAGE_KEY, canvasPatternColor.value)
  else localStorage.removeItem(CANVAS_PATTERN_COLOR_STORAGE_KEY)
})

export function setCanvasPatternColor(value) {
  canvasPatternColor.value = value
}

// Cor do padrão quando canvasPatternColor é null ("automático") — deriva do
// tema, igual sempre foi antes de existir a opção de customizar. Exportado
// pra FleetCanvas.vue e SettingsSidebar.vue usarem o mesmo valor (preview do
// swatch e botão "resetar" precisam bater com o que realmente é desenhado).
export const defaultCanvasPatternColor = computed(() => (theme.value === 'light' ? '#c4c4cc' : '#55555e'))

export const resolvedCanvasPatternColor = computed(() => canvasPatternColor.value || defaultCanvasPatternColor.value)

export const canvasBgColor = ref(localStorage.getItem(CANVAS_BG_COLOR_STORAGE_KEY) || null)

watchEffect(() => {
  if (canvasBgColor.value) localStorage.setItem(CANVAS_BG_COLOR_STORAGE_KEY, canvasBgColor.value)
  else localStorage.removeItem(CANVAS_BG_COLOR_STORAGE_KEY)
})

export function setCanvasBgColor(value) {
  canvasBgColor.value = value
}

const storedCanvasGap = Number(localStorage.getItem(CANVAS_GAP_STORAGE_KEY))
export const canvasGap = ref(Number.isFinite(storedCanvasGap) && storedCanvasGap > 0 ? storedCanvasGap : 16)

watchEffect(() => {
  localStorage.setItem(CANVAS_GAP_STORAGE_KEY, String(canvasGap.value))
})

export function setCanvasGap(value) {
  canvasGap.value = value
}

// Diâmetro do ponto (variant 'dots') ou espessura da linha (variant 'lines')
// — mesmo valor serve pros dois props do vue-flow/background (size/lineWidth),
// só um se aplica por vez dependendo do canvasVariant ativo.
const storedCanvasPatternSize = Number(localStorage.getItem(CANVAS_PATTERN_SIZE_STORAGE_KEY))
export const canvasPatternSize = ref(
  Number.isFinite(storedCanvasPatternSize) && storedCanvasPatternSize > 0 ? storedCanvasPatternSize : 1
)

watchEffect(() => {
  localStorage.setItem(CANVAS_PATTERN_SIZE_STORAGE_KEY, String(canvasPatternSize.value))
})

export function setCanvasPatternSize(value) {
  canvasPatternSize.value = value
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

const NODE_STYLE_VARIANT_STORAGE_KEY = 'dux-node-style-variant'
const NODE_STYLE_VARIANT_VALUES = ['structured', 'compact']

// estilo visual compartilhado de todo node (exceto Notas, que tem o dele
// próprio) — ver NodeShell.vue. 'structured' = cards com header/corpo/rodapé
// separados por divisor; 'compact' = header baixo, texto truncado, rodapé só
// no hover (pra caber mais nodes na tela).
const storedNodeStyleVariant = localStorage.getItem(NODE_STYLE_VARIANT_STORAGE_KEY)

export const nodeStyleVariant = ref(
  NODE_STYLE_VARIANT_VALUES.includes(storedNodeStyleVariant) ? storedNodeStyleVariant : 'structured'
)

watchEffect(() => {
  localStorage.setItem(NODE_STYLE_VARIANT_STORAGE_KEY, nodeStyleVariant.value)
})

export function setNodeStyleVariant(value) {
  nodeStyleVariant.value = value
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
