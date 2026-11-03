import { onBeforeUnmount, ref } from 'vue'

// Lógica de resize por arraste compartilhada pelas sidebars. NodeSettingsSidebar
// abre pela esquerda com o handle na borda direita (arrastar pra direita aumenta
// a largura); uma sidebar aberta pela direita (handle na borda esquerda,
// arrastar pra esquerda aumenta) passa `invert` pra inverter o sinal do dx.
// `storageKey` (opcional) lembra a largura entre sessões.
export function useSidebarResize({ defaultWidth, minWidth, maxWidth, invert = false, storageKey = null }) {
  const stored = storageKey ? Number(localStorage.getItem(storageKey)) : NaN
  const width = ref(Number.isFinite(stored) && stored > 0 ? Math.min(maxWidth, Math.max(minWidth, stored)) : defaultWidth)
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
    if (resizing.value && storageKey) localStorage.setItem(storageKey, String(width.value))
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
