import { ref } from 'vue'

// Estado do command bar (Ctrl+K) — global pra dar pra abrir de fora do próprio
// componente (ex: botão de busca central na barra de título).
export const commandBarOpen = ref(false)

export function openCommandBar() {
  commandBarOpen.value = true
}

export function closeCommandBar() {
  commandBarOpen.value = false
}

export function toggleCommandBar() {
  commandBarOpen.value = !commandBarOpen.value
}
