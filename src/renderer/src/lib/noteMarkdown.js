import TurndownService from 'turndown'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const turndownService = new TurndownService({ headingStyle: 'atx' })

// document.execCommand('bold'|'italic'|'fontName'|'fontSize', ...) produz
// <b>, <i> e <font face="..." size="...">. Turndown não tem regra própria
// pra <font> (markdown não tem conceito de família/tamanho de fonte) — sem
// isso, a tag seria descartada e só o texto sobreviveria. keep() preserva a
// tag como HTML bruto literal dentro do markdown de saída, incluindo
// qualquer <b>/<i> aninhado dentro dela (turndown não recursa formatação
// dentro de um nó "mantido").
turndownService.keep(['font'])

marked.setOptions({ gfm: true })

export function htmlToMarkdown(html) {
  return turndownService.turndown(html || '')
}

// o markdown pode ter sido editado externamente por um agente (texto puro,
// sem HTML) — tratado como conteúdo não confiável, por isso sempre passa
// por DOMPurify antes de virar innerHTML. html:true no parse deixa o
// <font>/<b>/<i> gravados pelo turndown voltarem como HTML de verdade.
export function markdownToHtml(markdown) {
  const raw = marked.parse(markdown || '', { async: false })
  return DOMPurify.sanitize(raw, {
    ADD_TAGS: ['font'],
    ADD_ATTR: ['face', 'size', 'color']
  })
}
