<template>
  <NodeShell
    :id="id"
    :data="data"
    :selected="selected"
    :resize="{ minWidth: 420, minHeight: 320, defaultWidth: 760, defaultHeight: 520 }"
    :title="data.name || 'Navegador'"
  >
    <template #icon>
      <svg viewBox="0 0 20 20" width="12" height="12" v-html="BROWSER_ICON"></svg>
    </template>
    <template #headerActions>
      <button class="nav-btn nodrag" :title="sidebarCollapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'" @click="sidebarCollapsed = !sidebarCollapsed">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.3" fill="none" />
          <line x1="6" y1="3" x2="6" y2="13" stroke="currentColor" stroke-width="1.3" />
        </svg>
      </button>

      <!-- zoom -->
      <div class="zoom-group nodrag" :class="{ dim: activeIsBlank }">
        <button class="nav-btn small" title="Diminuir zoom (Ctrl -)" :disabled="activeIsBlank" @click="zoomBy(-0.1)">−</button>
        <button class="zoom-pct" title="Redefinir zoom (Ctrl 0)" :disabled="activeIsBlank" @click="zoomReset">{{ zoomPct }}%</button>
        <button class="nav-btn small" title="Aumentar zoom (Ctrl +)" :disabled="activeIsBlank" @click="zoomBy(0.1)">+</button>
      </div>

      <button class="nav-btn nodrag" :class="{ on: findOpen }" title="Localizar na página (Ctrl F)" :disabled="activeIsBlank" @click="toggleFind">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <circle cx="7" cy="7" r="4.2" stroke="currentColor" stroke-width="1.4" fill="none" />
          <path d="M10.2 10.2L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>

      <button class="nav-btn nodrag" title="Baixar mídia da página" :disabled="activeIsBlank" @click="openMedia">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          <path d="M3 13h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>

      <button class="nav-btn nodrag" title="Tirar print" :disabled="capturing || activeIsBlank" @click="captureScreenshot">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path
            d="M4 4.5V4a1 1 0 0 1 1-1h1.2l.6-1h2.4l.6 1H11a1 1 0 0 1 1 1v.5M2 4.5h12a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
          <circle cx="8" cy="8.5" r="2.4" stroke="currentColor" stroke-width="1.3" fill="none" />
        </svg>
      </button>
    </template>

    <div class="zen-body nodrag">
      <!-- barra lateral estilo Zen: busca, essenciais, abas verticais -->
      <aside v-show="!sidebarCollapsed" class="zen-sidebar nowheel">
        <div class="zen-navrow">
          <button class="zen-ico" title="Voltar" :disabled="!canGoBack" @click="goBack">
            <svg viewBox="0 0 16 16" width="12" height="12"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
          </button>
          <button class="zen-ico" title="Avançar" :disabled="!canGoForward" @click="goForward">
            <svg viewBox="0 0 16 16" width="12" height="12"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
          </button>
          <button class="zen-ico" title="Recarregar" :disabled="activeIsBlank" @click="reload">
            <svg viewBox="0 0 16 16" width="12" height="12"><path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
          </button>
          <span class="zen-spacer"></span>
          <button class="zen-ico" :class="{ on: activeIsFavorite }" :title="activeIsFavorite ? 'Remover dos essenciais' : 'Fixar nos essenciais'" :disabled="activeIsBlank" @click="toggleFavorite">
            <svg viewBox="0 0 16 16" width="12" height="12"><path d="M8 2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.9 4.4 13.1l.7-4L2.2 6.3l4-.6z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" :fill="activeIsFavorite ? 'currentColor' : 'none'" /></svg>
          </button>
        </div>

        <input
          class="zen-url"
          type="text"
          :value="addressBar"
          placeholder="Pesquisar ou digitar URL"
          @focus="handleAddressFocus"
          @blur="addressEditing = false"
          @keydown.enter="navigateToAddress"
        />

        <!-- Essenciais (favoritos fixados) — também é a zona onde se solta uma
             aba arrastada de baixo pra fixá-la -->
        <span class="zen-label">Essenciais</span>
        <div
          class="zen-essentials-zone"
          :class="{ 'drop-active': dragOverEssentials }"
          @dragover.prevent="dragOverEssentials = true"
          @dragenter.prevent="dragOverEssentials = true"
          @dragleave="dragOverEssentials = false"
          @drop.prevent="onEssentialsDrop"
        >
          <div v-if="favorites.length" class="zen-essentials">
            <button
              v-for="(fav, i) in favorites"
              :key="fav.url + i"
              class="zen-ess"
              :class="{ active: isCurrent(fav.url) }"
              :title="fav.title || fav.url"
              @click="openFavorite(fav)"
            >
              <img v-if="fav.favicon" :src="fav.favicon" class="zen-ess-ico" alt="" @error="onFavImgError($event)" />
              <span v-else class="zen-ess-letter">{{ letterOf(fav.title || favHostname(fav.url)) }}</span>
              <span class="zen-ess-x" title="Remover" @click.stop="removeFavorite(i)">×</span>
            </button>
          </div>
          <p v-else class="zen-ess-placeholder">Arraste uma aba aqui pra fixar</p>
        </div>

        <span class="zen-label">Abas</span>
        <div class="zen-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.id"
            class="zen-tab"
            :class="{ active: tab.id === activeTabId, dragging: draggedTabId === tab.id, 'drop-before': dropBeforeTabId === tab.id }"
            :title="tabLabel(tab)"
            draggable="true"
            @mousedown.left="selectTab(tab.id)"
            @dragstart="onTabDragStart(tab, $event)"
            @dragend="onTabDragEnd"
            @dragover.prevent="onTabDragOver(tab, $event)"
            @drop.prevent="onTabDrop(tab)"
          >
            <img v-if="faviconFor(tab)" :src="faviconFor(tab)" class="zen-tab-ico" alt="" @error="$event.target.style.display = 'none'" />
            <span v-else class="zen-tab-dot"></span>
            <span class="zen-tab-label">{{ tabLabel(tab) }}</span>
            <button class="zen-tab-x" title="Fechar aba" @mousedown.left.stop="closeTab(tab.id)">×</button>
          </div>
        </div>

        <button class="zen-newtab" @click="addTab">
          <span class="zen-plus">+</span> Nova aba
        </button>
      </aside>

      <!-- área de conteúdo: card arredondado flutuante -->
      <main class="zen-content">
        <div class="zen-card">
          <!-- barra de busca na página -->
          <div v-if="findOpen" class="find-bar nodrag">
            <input
              ref="findInput"
              v-model="findQuery"
              class="find-input"
              type="text"
              placeholder="Localizar na página"
              @keydown.enter.prevent="runFind(!$event.shiftKey, true)"
              @keydown.esc.prevent="closeFind"
              @input="runFind(true, false)"
            />
            <span class="find-count">{{ findMatches.total ? `${findMatches.active}/${findMatches.total}` : (findQuery ? '0' : '') }}</span>
            <button class="find-btn" title="Anterior" :disabled="!findMatches.total" @click="runFind(false, true)">‹</button>
            <button class="find-btn" title="Próximo" :disabled="!findMatches.total" @click="runFind(true, true)">›</button>
            <button class="find-btn" title="Fechar" @click="closeFind">×</button>
          </div>

          <!-- painel de mídia da página -->
          <div v-if="mediaOpen" class="media-panel nodrag nowheel">
            <div class="media-head">
              <span>Mídia da página</span>
              <button class="find-btn" title="Fechar" @click="mediaOpen = false">×</button>
            </div>
            <div v-if="mediaLoading" class="media-empty">Procurando mídia…</div>
            <div v-else-if="mediaItems.length === 0" class="media-empty">Nenhuma imagem ou vídeo encontrado.</div>
            <div v-else class="media-grid">
              <div v-for="(item, i) in mediaItems" :key="item.url + i" class="media-item">
                <div class="media-thumb" :class="item.type">
                  <img v-if="item.type === 'image' && !item.url.startsWith('blob:')" :src="item.url" alt="" @error="$event.target.style.visibility = 'hidden'" />
                  <span v-else class="media-thumb-icon">{{ item.type === 'video' ? '▶' : '🖼' }}</span>
                </div>
                <div class="media-meta">
                  <span class="media-name" :title="item.url">{{ mediaName(item.url) }}</span>
                  <button
                    class="media-dl"
                    :disabled="item.url.startsWith('blob:') || downloadingUrl === item.url"
                    :title="item.url.startsWith('blob:') ? 'Streaming não baixável' : 'Baixar'"
                    @click="downloadMedia(item)"
                  >
                    {{ downloadingUrl === item.url ? '…' : 'Baixar' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <template v-for="tab in tabs" :key="tab.id">
            <webview
              v-if="tab.url"
              v-show="tab.id === activeTabId"
              :ref="(el) => registerWebview(tab.id, el)"
              class="browser-body nodrag nowheel nopan"
              :src="tab.url"
              partition="persist:dux-browser"
              webpreferences="nodeIntegration=no,contextIsolation=yes"
              allowpopups="false"
            ></webview>
          </template>

          <div v-if="activeIsBlank" class="start-page nodrag nowheel">
            <svg class="start-logo" viewBox="0 0 20 20" width="40" height="40" v-html="BROWSER_ICON"></svg>
            <input class="start-url" type="text" placeholder="Pesquisar ou digitar URL" @keydown.enter="navigateFromStart" />
            <div v-if="favorites.length" class="start-favs">
              <button v-for="(fav, i) in favorites" :key="fav.url + i" class="start-fav" :title="fav.url" @click="openFavorite(fav)">
                <span class="start-fav-badge">
                  <img v-if="fav.favicon" :src="fav.favicon" alt="" @error="onFavImgError($event)" />
                  <span v-else>{{ letterOf(fav.title || favHostname(fav.url)) }}</span>
                </span>
                <span class="start-fav-label">{{ fav.title || favHostname(fav.url) }}</span>
              </button>
            </div>
            <p v-else class="start-hint">Digite uma URL acima ou fixe páginas nos essenciais.</p>
          </div>

          <div v-if="captureFlash" class="capture-flash" />
        </div>
      </main>
    </div>
  </NodeShell>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import NodeShell from './NodeShell.vue'
import { BROWSER_ICON } from '../nodeTypes/nodeIcons'
import { updateNodeData } from '../store/flowStore'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

// ---- Migração / normalização do estado das abas ----
// Nodes antigos tinham só data.url (uma página). Converte pra uma aba única.
function initialTabs() {
  if (Array.isArray(props.data.tabs) && props.data.tabs.length) return props.data.tabs
  if (props.data.url) return [{ id: crypto.randomUUID(), url: props.data.url, title: '' }]
  return [{ id: crypto.randomUUID(), url: '', title: '' }]
}

const tabs = computed(() => (Array.isArray(props.data.tabs) && props.data.tabs.length ? props.data.tabs : initialTabs()))
const favorites = computed(() => props.data.favorites || [])
const activeTabId = computed(() => {
  const id = props.data.activeTabId
  return tabs.value.some((t) => t.id === id) ? id : tabs.value[0]?.id
})
const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value) || tabs.value[0])
const activeIsBlank = computed(() => !activeTab.value?.url)

// estado de navegação vivo por aba (não persiste — vem dos eventos do webview)
const navState = reactive({})

const addressEditing = ref(false)
const capturing = ref(false)
const captureFlash = ref(false)
const addressBar = ref('')
const sidebarCollapsed = ref(false)
const draggedTabId = ref(null)
const dragOverEssentials = ref(false)
const dropBeforeTabId = ref(null)

// find in page
const findOpen = ref(false)
const findQuery = ref('')
const findInput = ref(null)
const findMatches = reactive({ active: 0, total: 0 })

// zoom (por aba, vivo em navState[id].zoom; default 1)
const zoomPct = computed(() => Math.round((navState[activeTabId.value]?.zoom ?? 1) * 100))

// mídia
const mediaOpen = ref(false)
const mediaLoading = ref(false)
const mediaItems = ref([])
const downloadingUrl = ref(null)

const canGoBack = computed(() => Boolean(navState[activeTabId.value]?.canBack))
const canGoForward = computed(() => Boolean(navState[activeTabId.value]?.canForward))

function currentUrlOf(id) {
  return navState[id]?.currentUrl ?? tabs.value.find((t) => t.id === id)?.url ?? ''
}

function syncAddressBar() {
  if (addressEditing.value) return
  addressBar.value = currentUrlOf(activeTabId.value)
}
watch(activeTabId, syncAddressBar)

const activeIsFavorite = computed(() => {
  const url = currentUrlOf(activeTabId.value)
  return Boolean(url) && favorites.value.some((f) => f.url === url)
})

function isCurrent(url) {
  return currentUrlOf(activeTabId.value) === url
}

// ---- refs dos webviews + listeners ----
const webviews = new Map() // tabId -> { el, handlers }

function registerWebview(id, el) {
  if (!el) {
    const entry = webviews.get(id)
    if (entry) detachWebview(entry)
    webviews.delete(id)
    return
  }
  if (webviews.has(id)) return
  const handlers = {
    nav: () => onNav(id),
    title: (e) => patchTab(id, { title: e.title }),
    favicon: (e) => {
      const icon = Array.isArray(e.favicons) && e.favicons.length ? e.favicons[0] : null
      if (icon) {
        navState[id] = { ...(navState[id] || {}), favicon: icon }
        patchTab(id, { favicon: icon })
      }
    },
    found: (e) => {
      if (id !== activeTabId.value) return
      findMatches.total = e.result.matches
      findMatches.active = e.result.activeMatchOrdinal
    }
  }
  el.addEventListener('did-navigate', handlers.nav)
  el.addEventListener('did-navigate-in-page', handlers.nav)
  el.addEventListener('page-title-updated', handlers.title)
  el.addEventListener('page-favicon-updated', handlers.favicon)
  el.addEventListener('found-in-page', handlers.found)
  // reaplica o zoom salvo da aba quando o conteúdo termina de carregar
  el.addEventListener('dom-ready', () => {
    const z = navState[id]?.zoom
    if (z && z !== 1) el.setZoomFactor(z)
  })
  webviews.set(id, { el, handlers })
}

function detachWebview(entry) {
  entry.el.removeEventListener('did-navigate', entry.handlers.nav)
  entry.el.removeEventListener('did-navigate-in-page', entry.handlers.nav)
  entry.el.removeEventListener('page-title-updated', entry.handlers.title)
  entry.el.removeEventListener('page-favicon-updated', entry.handlers.favicon)
  entry.el.removeEventListener('found-in-page', entry.handlers.found)
}

function activeWebview() {
  return webviews.get(activeTabId.value)?.el || null
}

function onNav(id) {
  const el = webviews.get(id)?.el
  if (!el) return
  navState[id] = {
    ...(navState[id] || {}),
    currentUrl: el.getURL(),
    canBack: el.canGoBack(),
    canForward: el.canGoForward()
  }
  if (id === activeTabId.value) syncAddressBar()
  patchTab(id, { url: el.getURL() })
}

// ---- mutações de abas ----
function writeTabs(nextTabs, nextActiveId) {
  const patch = { tabs: nextTabs }
  if (nextActiveId !== undefined) patch.activeTabId = nextActiveId
  updateNodeData(props.id, patch)
}

function patchTab(id, patch) {
  writeTabs(tabs.value.map((t) => (t.id === id ? { ...t, ...patch } : t)))
}

function selectTab(id) {
  updateNodeData(props.id, { activeTabId: id })
}

function addTab() {
  const tab = { id: crypto.randomUUID(), url: '', title: '' }
  writeTabs([...tabs.value, tab], tab.id)
}

function closeTab(id) {
  const idx = tabs.value.findIndex((t) => t.id === id)
  if (idx === -1) return
  const next = tabs.value.filter((t) => t.id !== id)
  delete navState[id]
  if (next.length === 0) {
    const tab = { id: crypto.randomUUID(), url: '', title: '' }
    writeTabs([tab], tab.id)
    return
  }
  let nextActive = activeTabId.value
  if (id === activeTabId.value) nextActive = (next[idx] || next[idx - 1] || next[0]).id
  writeTabs(next, nextActive)
}

function tabLabel(tab) {
  if (!tab.url) return 'Nova aba'
  return tab.title || favHostname(tab.url) || tab.url
}

function faviconFor(tab) {
  return navState[tab.id]?.favicon || tab.favicon || null
}

// ---- navegação ----
function normalize(value) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const looksLikeHost = !/\s/.test(trimmed) && (trimmed === 'localhost' || /^localhost[:/]/.test(trimmed) || /^[\w-]+(\.[\w-]+)+/.test(trimmed))
  if (looksLikeHost) return `https://${trimmed}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`
}

function goToActive(url) {
  const normalized = normalize(url)
  if (!normalized) return
  const el = activeWebview()
  if (el) el.loadURL(normalized)
  else patchTab(activeTabId.value, { url: normalized })
}

function navigateToAddress(event) {
  addressEditing.value = false
  goToActive(event.target.value)
  event.target.blur()
}

function navigateFromStart(event) {
  goToActive(event.target.value)
}

function handleAddressFocus(event) {
  addressEditing.value = true
  addressBar.value = currentUrlOf(activeTabId.value)
  event.target.value = addressBar.value
  event.target.select()
}

function goBack() {
  activeWebview()?.goBack()
}
function goForward() {
  activeWebview()?.goForward()
}
function reload() {
  activeWebview()?.reload()
}

// ---- find in page ----
function toggleFind() {
  if (activeIsBlank.value) return
  findOpen.value = !findOpen.value
  if (findOpen.value) {
    nextTick(() => findInput.value?.focus())
  } else {
    closeFind()
  }
}

function closeFind() {
  findOpen.value = false
  findMatches.active = 0
  findMatches.total = 0
  activeWebview()?.stopFindInPage('clearSelection')
}

// advance=false inicia uma busca nova (digitação incremental); advance=true
// move pra próxima/anterior ocorrência da mesma busca (Enter / botões ‹ ›)
function runFind(forward = true, advance = false) {
  const el = activeWebview()
  if (!el) return
  const q = findQuery.value
  if (!q) {
    findMatches.active = 0
    findMatches.total = 0
    el.stopFindInPage('clearSelection')
    return
  }
  el.findInPage(q, { forward, findNext: advance })
}

// ---- zoom ----
function setZoom(factor) {
  const el = activeWebview()
  if (!el) return
  const clamped = Math.min(3, Math.max(0.3, Math.round(factor * 10) / 10))
  el.setZoomFactor(clamped)
  navState[activeTabId.value] = { ...(navState[activeTabId.value] || {}), zoom: clamped }
}

function zoomBy(delta) {
  setZoom((navState[activeTabId.value]?.zoom ?? 1) + delta)
}

function zoomReset() {
  setZoom(1)
}

// ---- mídia da página ----
const COLLECT_MEDIA = `(() => {
  const abs = (u) => { try { return new URL(u, location.href).href } catch { return null } };
  const out = []; const seen = new Set();
  const add = (type, raw) => {
    const u = abs(raw); if (!u || seen.has(u)) return;
    if (u.startsWith('data:') && u.length > 3000000) return;
    seen.add(u); out.push({ type, url: u });
  };
  document.querySelectorAll('img').forEach((img) => add('image', img.currentSrc || img.src));
  document.querySelectorAll('picture source[srcset], img[srcset]').forEach((s) => {
    const first = (s.getAttribute('srcset') || '').split(',')[0]; if (first) add('image', first.trim().split(/\\s+/)[0]);
  });
  document.querySelectorAll('video').forEach((v) => {
    add('video', v.currentSrc || v.src);
    if (v.poster) add('image', v.poster);
    v.querySelectorAll('source').forEach((s) => add('video', s.src));
  });
  return JSON.stringify(out);
})()`

async function openMedia() {
  const el = activeWebview()
  if (!el) return
  mediaOpen.value = true
  mediaLoading.value = true
  mediaItems.value = []
  try {
    const json = await el.executeJavaScript(COLLECT_MEDIA, true)
    mediaItems.value = JSON.parse(json || '[]')
  } catch (err) {
    console.error('[browser-node] collect media failed', err)
    mediaItems.value = []
  } finally {
    mediaLoading.value = false
  }
}

async function downloadMedia(item) {
  if (item.url.startsWith('blob:') || downloadingUrl.value) return
  downloadingUrl.value = item.url
  try {
    const pageUrl = currentUrlOf(activeTabId.value)
    const result = await window.browserNodeAPI?.downloadMedia(item.url, pageUrl)
    if (result && !result.saved && result.error) {
      console.warn('[browser-node] download failed:', result.error)
    }
  } catch (err) {
    console.error('[browser-node] download failed', err)
  } finally {
    downloadingUrl.value = null
  }
}

function mediaName(url) {
  try {
    const u = new URL(url)
    return decodeURIComponent(u.pathname.split('/').pop() || u.hostname) || u.hostname
  } catch {
    return url.slice(0, 40)
  }
}

// ---- essenciais / favoritos ----
function toggleFavorite() {
  const el = activeWebview()
  const url = currentUrlOf(activeTabId.value)
  if (!url) return
  const existing = favorites.value.findIndex((f) => f.url === url)
  if (existing !== -1) {
    updateNodeData(props.id, { favorites: favorites.value.filter((_, i) => i !== existing) })
  } else {
    const title = activeTab.value?.title || (el ? el.getTitle?.() : '') || favHostname(url)
    const favicon = navState[activeTabId.value]?.favicon || activeTab.value?.favicon || null
    updateNodeData(props.id, { favorites: [...favorites.value, { url, title, favicon }] })
  }
}

function removeFavorite(i) {
  updateNodeData(props.id, { favorites: favorites.value.filter((_, idx) => idx !== i) })
}

function openFavorite(fav) {
  goToActive(fav.url)
}

// ---- arrastar aba -> fixar nos essenciais (gesto estilo Zen) ----
function onTabDragStart(tab, event) {
  draggedTabId.value = tab.id
  event.dataTransfer.effectAllowed = 'copy'
  // alguns navegadores exigem algum dado setado pra o drag iniciar
  try {
    event.dataTransfer.setData('text/plain', tab.id)
  } catch {
    /* ignore */
  }
}

function onTabDragEnd() {
  draggedTabId.value = null
  dragOverEssentials.value = false
  dropBeforeTabId.value = null
}

// reordenar abas: arrastar uma aba sobre outra a insere antes da alvo
function onTabDragOver(tab) {
  if (draggedTabId.value && draggedTabId.value !== tab.id) dropBeforeTabId.value = tab.id
}

function onTabDrop(targetTab) {
  const id = draggedTabId.value
  dropBeforeTabId.value = null
  if (!id || id === targetTab.id) return
  const list = [...tabs.value]
  const from = list.findIndex((t) => t.id === id)
  if (from === -1) return
  const [moved] = list.splice(from, 1)
  const to = list.findIndex((t) => t.id === targetTab.id)
  list.splice(to, 0, moved)
  writeTabs(list)
}

function onEssentialsDrop() {
  dragOverEssentials.value = false
  const id = draggedTabId.value
  draggedTabId.value = null
  if (!id) return
  const tab = tabs.value.find((t) => t.id === id)
  const url = currentUrlOf(id) || tab?.url
  if (!url) return // aba em branco não dá pra fixar
  if (favorites.value.some((f) => f.url === url)) return // já está nos essenciais
  const title = tab?.title || favHostname(url)
  const favicon = navState[id]?.favicon || tab?.favicon || null
  updateNodeData(props.id, { favorites: [...favorites.value, { url, title, favicon }] })
}

function onFavImgError(event) {
  // favicon quebrado: esconde o <img> e deixa o fallback de letra aparecer
  event.target.style.display = 'none'
}

function favHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function letterOf(text) {
  return (text || '?').charAt(0).toUpperCase()
}

// ---- screenshot ----
async function captureScreenshot() {
  const el = activeWebview()
  if (!el || capturing.value) return
  capturing.value = true
  try {
    const image = await el.capturePage()
    const dataUrl = image.toDataURL()
    const hostname = safeHostname(currentUrlOf(activeTabId.value))
    const result = await window.browserNodeAPI?.saveScreenshot(dataUrl, `${hostname}-${Date.now()}.png`)
    if (result?.saved) {
      captureFlash.value = true
      setTimeout(() => (captureFlash.value = false), 250)
    }
  } catch (err) {
    console.error('[browser-node] screenshot failed', err)
  } finally {
    capturing.value = false
  }
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_')
  } catch {
    return 'screenshot'
  }
}

// Atalhos de teclado — só agem quando este node está selecionado no canvas,
// pra não conflitar com a busca global (DuxSearch) nem com outros nodes.
// Enquanto o foco está DENTRO da página (webview), o evento não chega aqui —
// nesses casos usam-se os botões do topo; os atalhos valem com o foco no
// "chrome" do node (barra de abas, campo de busca, etc.).
function onKeydown(e) {
  if (!props.selected || activeIsBlank.value) return
  const ctrl = e.ctrlKey || e.metaKey
  if (!ctrl) return
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault()
    findOpen.value = true
    nextTick(() => findInput.value?.focus())
  } else if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    zoomBy(0.1)
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    zoomBy(-0.1)
  } else if (e.key === '0') {
    e.preventDefault()
    zoomReset()
  }
}

onMounted(() => {
  if (!Array.isArray(props.data.tabs) || !props.data.tabs.length || !props.data.activeTabId) {
    writeTabs(tabs.value, activeTabId.value)
  }
  syncAddressBar()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  for (const entry of webviews.values()) detachWebview(entry)
  webviews.clear()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
:deep(.shell-header) {
  padding-right: 6px;
  gap: 4px;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.nav-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.nav-btn:disabled {
  color: var(--color-text-tertiary);
  cursor: default;
  opacity: 0.5;
}

.nav-btn.on {
  color: #3b82f6;
}

.nav-btn.small {
  width: 18px;
  height: 22px;
  font-size: 14px;
}

/* grupo de zoom no header */
.zoom-group {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.zoom-group.dim {
  opacity: 0.5;
}

.zoom-pct {
  min-width: 34px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 10.5px;
  cursor: pointer;
}

.zoom-pct:hover:not(:disabled) {
  color: var(--color-text-primary);
}

/* barra de busca na página */
.find-bar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--color-shadow) 50%, transparent);
}

.find-input {
  width: 150px;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 11.5px;
}

.find-input:focus {
  outline: none;
}

.find-count {
  min-width: 34px;
  text-align: center;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.find-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.find-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.find-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* painel de mídia */
.media-panel {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
}

.media-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-strong);
}

.media-empty {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.media-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  padding: 12px;
}

.media-item {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-surface-alt);
}

.media-thumb {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-surface);
  overflow: hidden;
}

.media-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.media-thumb-icon {
  font-size: 22px;
  color: var(--color-text-tertiary);
}

.media-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 7px;
}

.media-name {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.media-dl {
  flex-shrink: 0;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 10px;
  cursor: pointer;
}

.media-dl:hover:not(:disabled) {
  border-color: #3b82f6;
  color: #3b82f6;
}

.media-dl:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ---- corpo: sidebar + conteúdo ---- */
.zen-body {
  flex: 1;
  min-height: 0;
  display: flex;
  background: var(--color-bg-surface-alt);
}

/* ---- sidebar vertical estilo Zen ---- */
.zen-sidebar {
  width: 224px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px;
  overflow-y: auto;
}

.zen-navrow {
  display: flex;
  align-items: center;
  gap: 2px;
}

.zen-spacer {
  flex: 1;
}

.zen-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.zen-ico svg {
  width: 14px;
  height: 14px;
}

.zen-ico:hover:not(:disabled) {
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.zen-ico.on {
  color: #f5a623;
}

.zen-ico:disabled {
  opacity: 0.4;
  cursor: default;
}

.zen-url {
  width: 100%;
  box-sizing: border-box;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 18px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 13px;
}

.zen-url:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.zen-label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-tertiary);
  padding: 2px 4px 0;
}

/* zona de drop dos essenciais (recebe aba arrastada) */
.zen-essentials-zone {
  border: 1px dashed transparent;
  border-radius: 10px;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.zen-essentials-zone.drop-active {
  border-color: #3b82f6;
  background: color-mix(in srgb, #3b82f6 10%, transparent);
}

.zen-ess-placeholder {
  margin: 0;
  padding: 10px 6px;
  text-align: center;
  font-size: 10px;
  color: var(--color-text-tertiary);
}

/* grade de essenciais */
.zen-essentials {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 7px;
}

.zen-ess {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  cursor: pointer;
  overflow: hidden;
}

.zen-ess:hover {
  border-color: var(--color-text-secondary);
}

.zen-ess.active {
  border-color: #3b82f6;
}

.zen-ess-ico {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.zen-ess-letter {
  font-size: 15px;
  font-weight: 600;
}

.zen-ess-x {
  position: absolute;
  top: 1px;
  right: 3px;
  font-size: 11px;
  line-height: 1;
  color: var(--color-text-tertiary);
  opacity: 0;
}

.zen-ess:hover .zen-ess-x {
  opacity: 0.8;
}

/* abas verticais */
.zen-tabs {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.zen-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 7px 0 10px;
  height: 34px;
  border-radius: 10px;
  color: var(--color-text-secondary);
  font-size: 12.5px;
  cursor: pointer;
}

.zen-tab:hover {
  background: var(--color-bg-surface);
}

.zen-tab.active {
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  box-shadow: inset 0 0 0 1px var(--color-border-strong);
}

.zen-tab.dragging {
  opacity: 0.4;
}

.zen-tab.drop-before {
  box-shadow: inset 0 2px 0 0 #3b82f6;
}

.zen-tab-ico {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex-shrink: 0;
}

.zen-tab-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
  flex-shrink: 0;
  margin: 0 4px;
}

.zen-tab-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.zen-tab-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
}

.zen-tab:hover .zen-tab-x,
.zen-tab.active .zen-tab-x {
  opacity: 1;
}

.zen-tab-x:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.zen-newtab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 12.5px;
  cursor: pointer;
}

.zen-newtab:hover {
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.zen-plus {
  font-size: 15px;
  line-height: 1;
}

/* ---- conteúdo: card flutuante arredondado ---- */
.zen-content {
  flex: 1;
  min-width: 0;
  padding: 6px 6px 6px 0;
  display: flex;
}

.zen-card {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  border-radius: 12px;
  overflow: hidden;
  /* fundo transparente de propósito: o <webview> é composto à parte e, quando
     o card o recorta no arredondado, o que estiver aqui atrás vaza nos cantos.
     Com #fff isso virava um fio branco em páginas escuras — transparente deixa
     vazar o fundo (escuro) da sidebar, que se funde com a página. */
  background: transparent;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--color-shadow) 40%, transparent);
}

.browser-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  /* o <webview> é uma camada composta à parte: o border-radius do card (e até
     o dele próprio) às vezes não é respeitado e o canto quadrado escapa. O
     clip-path é honrado nessa camada e recorta o webview de verdade no mesmo
     raio do card. */
  border-radius: 12px;
  clip-path: inset(0 round 12px);
  background: #fff;
}

/* ---- start page ---- */
.start-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px 24px;
  background: var(--color-bg-surface);
  overflow-y: auto;
}

.start-logo {
  color: var(--color-text-tertiary);
}

.start-url {
  width: 100%;
  max-width: 420px;
  height: 38px;
  padding: 0 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 19px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 13px;
}

.start-url:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.start-favs {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
  max-width: 460px;
}

.start-fav {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 76px;
  padding: 8px 4px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.start-fav:hover {
  background: var(--color-bg-surface-alt);
}

.start-fav-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--color-bg-surface-raised, var(--color-bg-surface-alt));
  border: 1px solid var(--color-border-strong);
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
}

.start-fav-badge img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.start-fav-label {
  font-size: 10.5px;
  max-width: 72px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.start-hint {
  font-size: 11.5px;
  color: var(--color-text-tertiary);
  text-align: center;
}

.capture-flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0.6;
  pointer-events: none;
  animation: flash-fade 0.25s ease-out;
}

@keyframes flash-fade {
  from {
    opacity: 0.6;
  }
  to {
    opacity: 0;
  }
}
</style>
