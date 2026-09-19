// Cor de ícone/texto legível sobre um headerColor customizado (escolhido
// livremente pelo usuário no color picker de NodeVisualSettings.vue) — sem
// isso, botões como o gear de configurações usam uma cor fixa do tema
// (--color-text-secondary) que pode ficar com baixo contraste contra uma cor
// de fundo clara ou muito saturada.
export function headerIconColor(headerColor) {
  const rgb = parseHexColor(headerColor)
  if (!rgb) return null
  // luminância percebida (fórmula YIQ) — não precisa da relativa completa
  // (com linearização de gamma) só pra decidir entre um ícone claro ou escuro
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
  return brightness > 140 ? '#18181b' : '#f4f4f5'
}

function parseHexColor(hex) {
  if (!hex) return null
  const clean = String(hex).trim().replace('#', '')
  if (clean.length === 3) {
    const [r, g, b] = clean.split('').map((c) => parseInt(c + c, 16))
    return { r, g, b }
  }
  if (clean.length === 6) {
    const num = parseInt(clean, 16)
    if (Number.isNaN(num)) return null
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
  }
  return null
}
