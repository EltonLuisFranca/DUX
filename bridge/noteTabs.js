// Mesmo formato de delimitador de abas que src/renderer/src/lib/noteMarkdown.js
// (splitTabs/joinTabs) — duplicado aqui porque bridge/ é CommonJS puro, sem
// bundler, e não importa nada do renderer. Qualquer mudança no formato do
// delimitador (regex/escape) precisa ser replicada nos dois lugares.
const TAB_DELIM_RE = /^<!--\s*dux:tab\s+title="([^"]*)"\s*-->\s*$/

function unescapeTitle(title) {
  return title.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

function escapeTitle(title) {
  return title.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function splitTabs(markdown) {
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

  if (segments.length > 1 && segments[0].title === null && segments[0].lines.every((line) => line.trim() === '')) {
    segments.shift()
  }

  return segments.map((segment, index) => ({
    title: segment.title ?? (index === 0 ? 'Principal' : `Aba ${index + 1}`),
    markdown: segment.lines.join('\n').replace(/^\n+/, '')
  }))
}

function joinTabs(tabs) {
  if (tabs.length <= 1) return tabs[0]?.markdown ?? ''
  return tabs.map((tab) => `<!-- dux:tab title="${escapeTitle(tab.title)}" -->\n${tab.markdown}`).join('\n\n')
}

module.exports = { splitTabs, joinTabs }
