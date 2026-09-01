import { onBeforeUnmount, ref } from 'vue'

// Lógica de resize por arraste compartilhada pelas sidebars. NodeSettingsSidebar
// abre pela esquerda com o handle na borda direita (arrastar pra direita aumenta
// a largura); SettingsSidebar abre pela direita com o handle na borda esquerda
// (arrastar pra esquerda aumenta a largura) — por isso `invert` inverte o sinal do dx.
export function useSidebarResize({ defaultWidth, minWidth, maxWidth, invert = false }) {
  const width = ref(defaultWidth)
  const resizing = ref(false)
  const showTip = ref(false)
  let startX = 0
  let startWidth = 0
  let tipTimer = null

  function handleTipEnter() {
    tipTimer = setTimeout(() => {
      showTip.value = true
    }, 250)
  }

  function handleTipLeave() {
    clearTimeout(tipTimer)
    showTip.value = false
  }

  function onResizeMove(event) {
    const raw = event.clientX - startX
    const dx = invert ? -raw : raw
    width.value = Math.min(maxWidth, Math.max(minWidth, startWidth + dx))
  }

  function stopResize() {
    resizing.value = false
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', stopResize)
  }

  function startResize(event) {
    clearTimeout(tipTimer)
    resizing.value = true
    showTip.value = false
    startX = event.clientX
    startWidth = width.value
    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', stopResize)
    event.preventDefault()
  }

  onBeforeUnmount(() => {
    clearTimeout(tipTimer)
    stopResize()
  })

  return { width, resizing, showTip, startResize, handleTipEnter, handleTipLeave }
}
