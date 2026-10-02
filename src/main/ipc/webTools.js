import { ipcMain, net } from 'electron'

// Ferramentas de internet da Duxi (ver duxiTools.js) — rodam no main process
// pelo mesmo motivo do httpNode/auth: net.fetch usa a stack do Chromium (trust
// store do sistema, sem a parede de CORS que travaria um fetch() no renderer).
// Tudo de graça e sem chave: a busca usa o endpoint HTML do DuckDuckGo e o
// fetch é só um GET + limpeza de HTML pra texto.

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// Teto de caracteres entregue ao modelo: modelos locais do Ollama costumam ter
// contexto curto, então uma página inteira estouraria o budget. 8k é o mesmo
// corte citado no planejamento com a Duxi.
const MAX_CHARS = 8000

// Decodifica as entidades HTML que de fato aparecem em títulos/snippets de
// resultado — não é um parser completo, só o suficiente pra não entregar
// "&amp;" e afins pro modelo ler em voz alta.
function decodeEntities(str) {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).trim()
}

// O DuckDuckGo HTML embrulha o link real num redirect (/l/?uddg=<url>). Extrai
// a URL de destino de dentro do parâmetro uddg quando existir.
function unwrapDuckLink(href) {
  try {
    const u = new URL(href, 'https://duckduckgo.com')
    const target = u.searchParams.get('uddg')
    if (target) return decodeURIComponent(target)
    return u.href
  } catch {
    return href
  }
}

// Extrai os resultados do HTML do html.duckduckgo.com. Cada resultado é um
// bloco com a.result__a (título + link) e a.result__snippet (trecho). Regex em
// vez de DOM porque estamos no main (sem document), e o layout desse endpoint
// é estável e simples o bastante pra isso.
function parseDuckResults(html, limit) {
  const results = []
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
  const snippets = []
  let sm
  while ((sm = snippetRe.exec(html)) !== null) snippets.push(stripTags(sm[1]))
  let lm
  let i = 0
  while ((lm = linkRe.exec(html)) !== null && results.length < limit) {
    results.push({
      title: stripTags(lm[2]),
      url: unwrapDuckLink(lm[1]),
      snippet: snippets[i] || ''
    })
    i++
  }
  return results
}

export function registerWebToolsIpc() {
  ipcMain.handle('web-tools:search', async (_event, { query, limit = 5 }) => {
    try {
      const q = String(query || '').trim()
      if (!q) return { ok: false, error: 'Busca vazia.' }
      const response = await net.fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, Accept: 'text/html' } }
      )
      if (!response.ok) {
        return { ok: false, error: `Busca falhou (HTTP ${response.status}).` }
      }
      const html = await response.text()
      const results = parseDuckResults(html, Math.min(Math.max(1, limit), 10))
      return { ok: true, results }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('web-tools:fetch', async (_event, { url }) => {
    try {
      const target = String(url || '').trim()
      if (!/^https?:\/\//i.test(target)) {
        return { ok: false, error: 'URL inválida — precisa começar com http:// ou https://.' }
      }
      const response = await net.fetch(target, {
        headers: { 'User-Agent': UA, Accept: 'text/html,text/plain' }
      })
      if (!response.ok) {
        return { ok: false, error: `Página respondeu HTTP ${response.status}.` }
      }
      const contentType = response.headers.get('content-type') || ''
      const raw = await response.text()
      // Só tratamos texto/HTML — um PDF ou imagem viraria lixo binário no
      // contexto do modelo.
      if (contentType && !/text\/|json|xml/i.test(contentType)) {
        return { ok: false, error: `Tipo de conteúdo não suportado (${contentType}).` }
      }

      // Tira script/style/comentários inteiros (conteúdo e tudo) antes de
      // remover as outras tags — se não, o JS/CSS viraria "texto" no corpo.
      const text = raw
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
      const clean = decodeEntities(text)
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim()

      const truncated = clean.length > MAX_CHARS
      return {
        ok: true,
        url: target,
        content: truncated ? clean.slice(0, MAX_CHARS) + '\n\n[...conteúdo cortado...]' : clean,
        truncated
      }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}
