const DEFAULT_TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 300_000

const CATEGORY_LABELS = {
  cms: 'CMS',
  framework: 'Framework / Linguagem',
  'js-library': 'Biblioteca JS',
  'web-server': 'Servidor Web',
  'cdn-waf': 'CDN / Proxy / WAF',
  analytics: 'Analytics / Terceiros'
}

function find(haystack, regex) {
  const m = regex.exec(haystack)
  return m ? m[0].slice(0, 80) : null
}

// Assinaturas curadas (regex contra headers + cookies + HTML combinados) —
// mesmo espírito das wordlists de subdomain-scan/dir-fuzz: cobre o que é mais
// comum encontrar num recon de aplicação web, não um banco tipo Wappalyzer
// (milhares de fingerprints versionados).
const SIGNATURES = [
  { id: 'wordpress', name: 'WordPress', category: 'cms', re: /wp-content\/|wp-includes\/|generator"\s+content="wordpress/i },
  { id: 'joomla', name: 'Joomla', category: 'cms', re: /\/media\/jui\/|content="joomla/i },
  { id: 'drupal', name: 'Drupal', category: 'cms', re: /drupal\.settings|sites\/default\/files|x-generator:\s*drupal/i },
  { id: 'magento', name: 'Magento', category: 'cms', re: /mage\.cookies|\/skin\/frontend\/|magento/i },
  { id: 'shopify', name: 'Shopify', category: 'cms', re: /cdn\.shopify\.com|shopify\.theme|x-shopid/i },
  { id: 'prestashop', name: 'PrestaShop', category: 'cms', re: /prestashop/i },
  { id: 'wix', name: 'Wix', category: 'cms', re: /static\.wixstatic\.com/i },
  { id: 'squarespace', name: 'Squarespace', category: 'cms', re: /squarespace\.com/i },

  { id: 'nextjs', name: 'Next.js', category: 'framework', re: /__next_data__|_next\/static/i },
  { id: 'nuxtjs', name: 'Nuxt.js', category: 'framework', re: /__nuxt__|\/_nuxt\// },
  { id: 'laravel', name: 'Laravel', category: 'framework', re: /laravel_session/i },
  { id: 'django', name: 'Django', category: 'framework', re: /csrftoken=|django/i },
  { id: 'rails', name: 'Ruby on Rails', category: 'framework', re: /_session_id=|x-runtime:/i },
  { id: 'express', name: 'Express', category: 'framework', re: /x-powered-by:\s*express/i },
  { id: 'aspnet', name: 'ASP.NET', category: 'framework', re: /x-aspnet-version|x-powered-by:\s*asp\.net|asp\.net_sessionid=/i },
  { id: 'php', name: 'PHP', category: 'framework', re: /x-powered-by:\s*php|phpsessid=/i },
  { id: 'java-jsp', name: 'Java / JSP', category: 'framework', re: /jsessionid=/i },
  { id: 'spring-boot', name: 'Spring Boot', category: 'framework', re: /whitelabel error page|\/actuator\//i },

  { id: 'react', name: 'React', category: 'js-library', re: /data-reactroot|react-dom(\.min)?\.js/i },
  { id: 'vuejs', name: 'Vue.js', category: 'js-library', re: /data-v-app|__vue__|vue(\.runtime)?(\.min)?\.js/i },
  { id: 'angular', name: 'Angular', category: 'js-library', re: /ng-version=/i },
  { id: 'jquery', name: 'jQuery', category: 'js-library', re: /jquery(-[\d.]+)?(\.min)?\.js/i },
  { id: 'bootstrap', name: 'Bootstrap', category: 'js-library', re: /bootstrap(\.min)?\.css|bootstrap(\.bundle)?(\.min)?\.js/i },

  { id: 'nginx', name: 'nginx', category: 'web-server', re: /server:\s*nginx/i },
  { id: 'apache', name: 'Apache', category: 'web-server', re: /server:\s*apache/i },
  { id: 'iis', name: 'Microsoft IIS', category: 'web-server', re: /server:\s*microsoft-iis/i },
  { id: 'litespeed', name: 'LiteSpeed', category: 'web-server', re: /server:\s*litespeed/i },

  { id: 'cloudflare', name: 'Cloudflare', category: 'cdn-waf', re: /server:\s*cloudflare|cf-ray:/i },
  { id: 'cloudfront', name: 'Amazon CloudFront', category: 'cdn-waf', re: /x-amz-cf-id:|via:.*cloudfront/i },
  { id: 'akamai', name: 'Akamai', category: 'cdn-waf', re: /server:\s*akamaighost|x-akamai-/i },
  { id: 'sucuri', name: 'Sucuri (WAF)', category: 'cdn-waf', re: /x-sucuri-id:|server:\s*sucuri/i },
  { id: 'incapsula', name: 'Imperva / Incapsula (WAF)', category: 'cdn-waf', re: /incap_ses_|visid_incap_|x-iinfo:/i },
  { id: 'varnish', name: 'Varnish', category: 'cdn-waf', re: /x-varnish:|via:.*varnish/i },
  { id: 'fastly', name: 'Fastly', category: 'cdn-waf', re: /x-served-by:.*cache-|via:.*fastly/i },

  { id: 'google-analytics', name: 'Google Analytics', category: 'analytics', re: /googletagmanager\.com\/gtag|google-analytics\.com\/analytics\.js|gtag\(/i },
  { id: 'gtm', name: 'Google Tag Manager', category: 'analytics', re: /googletagmanager\.com\/gtm\.js/i },
  { id: 'hotjar', name: 'Hotjar', category: 'analytics', re: /static\.hotjar\.com/i },
  { id: 'recaptcha', name: 'Google reCAPTCHA', category: 'analytics', re: /google\.com\/recaptcha/i },
  { id: 'sentry', name: 'Sentry', category: 'analytics', re: /sentry\.io|sentry\.init\(/i },
  { id: 'swagger', name: 'Swagger / OpenAPI', category: 'analytics', re: /swagger-ui|openapi\.json/i }
]

async function readBodyCapped(response, maxBytes) {
  if (!response.body) {
    try {
      return await response.text()
    } catch {
      return ''
    }
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
    if (total >= maxBytes) {
      await reader.cancel().catch(() => {})
      break
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}

// Diferente de portScan.js/dirFuzz.js: não é um worker pool contra uma
// wordlist, é uma única requisição — mesma forma createRunner(payload,
// {onProgress, onDone}) -> {stop()} do securityHeaders.js/tlsCheck.js pra
// encaixar sem mudanças no wiring do wsHandlers.js/bridgeClient.js.
function createRunner({ url, timeoutMs }, { onProgress, onDone }) {
  const target = String(url || '').trim()
  const timeout = Math.max(1000, Math.min(30_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  const startedAt = Date.now()

  if (!/^https?:\/\//i.test(target)) {
    setTimeout(() => onDone({ cancelled: false, error: 'URL inválida (precisa começar com http:// ou https://)' }), 0)
    return { stop() {} }
  }

  let cancelled = false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeout)

  onProgress?.({ status: 'checking' })

  fetch(target, { method: 'GET', redirect: 'follow', signal: controller.signal })
    .then(async (response) => {
      const html = await readBodyCapped(response, MAX_HTML_BYTES)
      clearTimeout(timer)
      if (cancelled) {
        onDone({ cancelled: true, durationMs: Date.now() - startedAt })
        return
      }

      const headersText = [...response.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')
      const setCookieList =
        typeof response.headers.getSetCookie === 'function'
          ? response.headers.getSetCookie()
          : [response.headers.get('set-cookie')].filter(Boolean)
      const haystack = `${headersText}\n${setCookieList.join('\n')}\n${html}`

      const detected = []
      for (const sig of SIGNATURES) {
        const evidence = find(haystack, sig.re)
        if (evidence) detected.push({ id: sig.id, name: sig.name, category: sig.category, evidence })
      }

      onDone({
        cancelled: false,
        url: target,
        finalUrl: response.url,
        status: response.status,
        detected,
        durationMs: Date.now() - startedAt
      })
    })
    .catch((err) => {
      clearTimeout(timer)
      if (cancelled) {
        onDone({ cancelled: true, durationMs: Date.now() - startedAt })
        return
      }
      const reason = controller.signal.aborted ? controller.signal.reason : null
      const message =
        reason === 'stop' ? 'cancelado pelo usuário' : reason === 'timeout' ? 'tempo esgotado esperando resposta' : err.message || 'erro de rede'
      onDone({ cancelled: false, error: message, durationMs: Date.now() - startedAt })
    })

  return {
    stop() {
      cancelled = true
      controller.abort('stop')
    }
  }
}

module.exports = { createRunner, SIGNATURES, CATEGORY_LABELS }
