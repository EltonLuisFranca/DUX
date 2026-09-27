import TurndownService from 'turndown'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'

// codeBlockStyle: 'fenced' — o padrão do Turndown é bloco indentado (4
// espaços), que descarta a classe "language-xxx" do <code> (não tem onde
// guardar a linguagem nesse estilo). Fenced (```php) é o único dos dois que
// preserva a linguagem no round-trip.
const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

// document.execCommand('bold'|'italic'|'fontName'|'fontSize', ...) produz
// <b>, <i> e <font face="..." size="...">. Turndown não tem regra própria
// pra <font> (markdown não tem conceito de família/tamanho de fonte) — sem
// isso, a tag seria descartada e só o texto sobreviveria. keep() preserva a
// tag como HTML bruto literal dentro do markdown de saída, incluindo
// qualquer <b>/<i> aninhado dentro dela (turndown não recursa formatação
// dentro de um nó "mantido").
turndownService.keep(['font'])

function escapeTableCell(text) {
  return text.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
}

// Turndown (o pacote base, sem turndown-plugin-gfm) não tem regra própria
// pra <table> — sem isso a tabela vira só o texto das células concatenado,
// sem nenhuma estrutura. marked já lê tabela GFM de volta em markdownToHtml
// (gfm:true, abaixo), então só faltava esta direção (editor -> markdown).
turndownService.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = Array.from(node.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.children).map((cell) => escapeTableCell(cell.textContent || ''))
    )
    if (rows.length === 0) return ''
    const colCount = Math.max(...rows.map((row) => row.length))
    const pad = (row) => [...row, ...Array(colCount - row.length).fill('')]
    const toLine = (row) => `| ${pad(row).join(' | ')} |`
    const header = toLine(rows[0])
    const separator = `| ${Array(colCount).fill('---').join(' | ')} |`
    const body = rows.slice(1).map(toLine)
    return `\n\n${[header, separator, ...body].join('\n')}\n\n`
  }
})

// checklist: <li> cujo primeiro filho é um <input type="checkbox"> vira
// "- [ ] "/"- [x] " em vez de um item de lista comum. Precisa ser addRule
// (checada antes das regras embutidas do Turndown) pra não cair na regra
// padrão de listItem primeiro.
turndownService.addRule('checklistItem', {
  filter: (node) =>
    node.nodeName === 'LI' &&
    node.firstElementChild?.tagName === 'INPUT' &&
    node.firstElementChild.type === 'checkbox',
  replacement: (content, node) => {
    const checked = node.firstElementChild.checked
    const text = content.replace(/^\s+/, '').replace(/\n+$/, '')
    return `- [${checked ? 'x' : ' '}] ${text}\n`
  }
})

marked.setOptions({ gfm: true })

export function htmlToMarkdown(html) {
  return turndownService.turndown(html || '')
}

const HLJS_LANGUAGE_RE = /language-(\S+)/

function highlightCodeBlocks(container) {
  container.querySelectorAll('pre code').forEach((block) => {
    const match = block.className.match(HLJS_LANGUAGE_RE)
    if (!match) return
    const language = match[1]
    if (!hljs.getLanguage(language)) return
    try {
      block.innerHTML = hljs.highlight(block.textContent || '', { language }).value
      block.classList.add('hljs')
    } catch {
      // linguagem não suportada ou erro de parse — deixa o bloco como texto puro
    }
  })
}

// marked (gfm:true) renderiza "- [ ]"/"- [x]" como <input type="checkbox"
// disabled> — sem isso os checkboxes ficam visíveis mas não clicáveis.
function enableChecklistCheckboxes(container) {
  container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.removeAttribute('disabled')
  })
}

// o markdown pode ter sido editado externamente por um agente (texto puro,
// sem HTML) — tratado como conteúdo não confiável, por isso sempre passa
// por DOMPurify antes de virar innerHTML. html:true no parse deixa o
// <font>/<b>/<i> gravados pelo turndown voltarem como HTML de verdade.
export function markdownToHtml(markdown) {
  const raw = marked.parse(markdown || '', { async: false })
  const sanitized = DOMPurify.sanitize(raw, {
    ADD_TAGS: ['font'],
    ADD_ATTR: ['face', 'size', 'color']
  })

  const doc = new DOMParser().parseFromString(sanitized, 'text/html')
  highlightCodeBlocks(doc.body)
  enableChecklistCheckboxes(doc.body)
  return doc.body.innerHTML
}

// ---- Abas ----
// Uma nota com uma aba só (o caso comum) não tem nenhum delimitador no
// arquivo — fica idêntica ao formato de antes das abas, sem migração
// necessária. Com 2+ abas, cada uma (incluindo a primeira) ganha seu próprio
// delimitador, pra quem abrir o .md fora do DUX (um agente, outro editor)
// entender a estrutura sem ambiguidade.
const TAB_DELIM_RE = /^<!--\s*dux:tab\s+title="([^"]*)"\s*-->\s*$/

function unescapeTitle(title) {
  return title.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

function escapeTitle(title) {
  return title.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export function splitTabs(markdown) {
  const lines = (markdown ?? '').split('\n')
  const segments = []
  let current = { title: null, lines: [] }
  for (const line of lines) {
    const match = line.match(TAB_DELIM_RE)
    if (match) {
      segments.push(current)
      current = { title: unescapeTitle(match[1]), lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  segments.push(current)

  // se o arquivo começa direto com um delimitador, o segmento implícito antes
  // dele fica vazio — descarta em vez de virar uma aba "Principal" fantasma
  // na frente da primeira aba de verdade
  if (segments.length > 1 && segments[0].title === null && segments[0].lines.every((line) => line.trim() === '')) {
    segments.shift()
  }

  return segments.map((segment, index) => ({
    title: segment.title ?? (index === 0 ? 'Principal' : `Aba ${index + 1}`),
    markdown: segment.lines.join('\n').replace(/^\n+/, '')
  }))
}

export function joinTabs(tabs) {
  if (tabs.length <= 1) return tabs[0]?.markdown ?? ''
  return tabs.map((tab) => `<!-- dux:tab title="${escapeTitle(tab.title)}" -->\n${tab.markdown}`).join('\n\n')
}
