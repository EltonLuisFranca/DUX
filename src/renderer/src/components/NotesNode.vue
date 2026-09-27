<template>
  <div
    class="notes-node"
    :class="{ selected, 'transparent-note': data.transparent }"
    :style="{
      width: nodeWidth + 'px',
      height: nodeHeight + 'px',
      background: backgroundStyle,
      '--rest-border-color': restBorderColor,
      '--selected-color': data.headerColor || '#3b82f6'
    }"
    @keydown="handleNodeKeydown"
  >
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="notes-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="notes-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="notes-handle"
      :class="{ connected: isBottomConnected }"
    />

    <Transition name="toolbar-fade">
      <div v-if="selected" class="notes-toolbar nodrag nowheel">
        <AppTooltip label="Negrito">
          <button class="fmt-btn" @mousedown.prevent="exec('bold')"><b>B</b></button>
        </AppTooltip>
        <AppTooltip label="Itálico">
          <button class="fmt-btn fmt-italic" @mousedown.prevent="exec('italic')"><i>I</i></button>
        </AppTooltip>
        <span class="fmt-divider" />
        <AppTooltip label="Fonte">
          <select class="fmt-select" @mousedown="saveSelection" @change="exec('fontName', $event.target.value)">
            <option value="inherit">Padrão</option>
            <option value="Georgia, serif">Serif</option>
            <option value="'Courier New', monospace">Mono</option>
          </select>
        </AppTooltip>
        <AppTooltip label="Tamanho">
          <select class="fmt-select" @mousedown="saveSelection" @change="exec('fontSize', $event.target.value)">
            <option value="2">Pequeno</option>
            <option value="3" selected>Normal</option>
            <option value="5">Grande</option>
            <option value="7">Enorme</option>
          </select>
        </AppTooltip>
        <span class="fmt-divider" />
        <AppTooltip label="Inserir tabela">
          <button class="fmt-btn" @mousedown.prevent="insertTable">
            <svg viewBox="0 0 16 16" width="13" height="13">
              <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" stroke-width="1.2" fill="none" />
              <path d="M2 7h12M6.3 3v10M10.6 3v10" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
        </AppTooltip>
        <AppTooltip label="Adicionar linha (cursor precisa estar na tabela)">
          <button class="fmt-btn" :disabled="!selectionInTable" @mousedown.prevent="addTableRow">+L</button>
        </AppTooltip>
        <AppTooltip label="Adicionar coluna (cursor precisa estar na tabela)">
          <button class="fmt-btn" :disabled="!selectionInTable" @mousedown.prevent="addTableColumn">+C</button>
        </AppTooltip>
        <span class="fmt-divider" />
        <AppTooltip label="Inserir bloco de código">
          <select class="fmt-select" @mousedown="saveSelection" @change="handleCodeLanguageChange($event)">
            <option value="" selected disabled>Código</option>
            <option v-for="lang in CODE_LANGUAGES" :key="lang.value" :value="lang.value">{{ lang.label }}</option>
          </select>
        </AppTooltip>
        <AppTooltip label="Checklist">
          <button class="fmt-btn" @mousedown.prevent="insertChecklist">☑</button>
        </AppTooltip>
        <span class="fmt-divider" />
        <AppTooltip label="Nova aba">
          <button class="fmt-btn" @mousedown.prevent="addTab">
            <svg viewBox="0 0 16 16" width="13" height="13">
              <path d="M4 4h5l2 2h3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.2" fill="none" />
              <path d="M8 8v3M6.5 9.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            </svg>
          </button>
        </AppTooltip>
        <AppTooltip label="Buscar na nota (Ctrl+F)">
          <button class="fmt-btn" :class="{ active: searchOpen }" @mousedown.prevent="toggleSearch">
            <svg viewBox="0 0 16 16" width="13" height="13">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3" fill="none" />
              <path d="M10.3 10.3L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
          </button>
        </AppTooltip>
        <span class="fmt-divider" />
        <AppTooltip label="Cor da nota">
          <label class="color-swatch" :style="{ background: data.headerColor || 'var(--color-notes-bg)' }">
            <input type="color" class="color-input" :value="data.headerColor || '#fef3c7'" @input="setColor($event.target.value)" />
          </label>
        </AppTooltip>
        <AppTooltip label="Remover cor (padrão)">
          <button class="fmt-btn reset-swatch" @click="setColor(null)">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="1.3" fill="none" />
              <path d="M3.5 12.5l9-9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
          </button>
        </AppTooltip>
        <AppTooltip label="Transparente (sem cor, sem borda)">
          <button class="fmt-btn" :class="{ active: data.transparent }" @click="toggleTransparent">
            <svg viewBox="0 0 16 16" width="14" height="14">
              <rect
                x="2"
                y="2"
                width="12"
                height="12"
                rx="2.5"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-dasharray="2 2"
                fill="none"
              />
            </svg>
          </button>
        </AppTooltip>
        <span class="fmt-divider" />
        <AppTooltip :label="isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'">
          <button class="fmt-btn" @click="toggleFullscreen(id)">
            <svg v-if="!isFullscreen" viewBox="0 0 16 16" width="13" height="13">
              <path
                d="M2 6V3a1 1 0 0 1 1-1h3M14 6V3a1 1 0 0 1-1-1h-3M2 10v3a1 1 0 0 0 1 1h3M14 10v3a1 1 0 0 1-1 1h-3"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
            <svg v-else viewBox="0 0 16 16" width="13" height="13">
              <path
                d="M6 2v3a1 1 0 0 1-1 1H2M10 2v3a1 1 0 0 0 1 1h3M6 14v-3a1 1 0 0 0-1-1H2M10 14v-3a1 1 0 0 1 1-1h3"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
          </button>
        </AppTooltip>
        <span class="fmt-divider" />
        <AppTooltip label="Excluir">
          <button class="fmt-btn fmt-danger" @click="requestDeleteNode(id)">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path
                d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M5 4.5l.5 8a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.5-8"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
          </button>
        </AppTooltip>
      </div>
    </Transition>

    <div class="notes-drag-handle">
      <span class="grip-dots"><span></span><span></span><span></span></span>
    </div>

    <div v-if="searchOpen" class="notes-search nodrag nowheel">
      <input
        ref="searchInputEl"
        v-model="searchQuery"
        class="notes-search-input"
        type="text"
        placeholder="Buscar na nota..."
        @keydown.enter.exact.prevent="goToNextMatch"
        @keydown.enter.shift.prevent="goToPrevMatch"
      />
      <span class="notes-search-count">{{ searchCountLabel }}</span>
      <button class="fmt-btn" title="Anterior" @mousedown.prevent="goToPrevMatch">‹</button>
      <button class="fmt-btn" title="Próximo" @mousedown.prevent="goToNextMatch">›</button>
      <button class="fmt-btn" title="Fechar" @mousedown.prevent="closeSearch">×</button>
    </div>

    <div v-if="tabs.length > 1" class="notes-tabs nodrag nowheel">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.id"
        class="note-tab"
        :class="{ active: index === activeTabIndex }"
        @click="switchTab(index)"
        @dblclick="startRenameTab(index)"
      >
        <input
          v-if="renamingTabIndex === index"
          ref="renameInputEl"
          v-model="renamingTabTitle"
          class="note-tab-rename-input"
          @click.stop
          @blur="commitRenameTab(index)"
          @keydown.enter.prevent="commitRenameTab(index)"
          @keydown.esc.prevent="cancelRenameTab"
        />
        <span v-else class="note-tab-title">{{ tab.title }}</span>
        <button class="note-tab-close" title="Fechar aba" @click.stop="closeTab(index)">×</button>
      </div>
    </div>

    <div
      ref="editorEl"
      class="notes-body nodrag nowheel nopan"
      :class="{ 'has-tabs': tabs.length > 1 }"
      contenteditable="true"
      data-placeholder="Escreva algo..."
      @input="handleInput"
      @mouseup="saveSelection"
      @keyup="saveSelection"
      @keydown="handleEditorKeydown"
      @change.capture="handleEditorChange"
      @paste="handlePaste"
      @drop="handleDrop"
      @focus="isEditorFocused = true"
      @blur="isEditorFocused = false"
    ></div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { updateNodeData, requestDeleteNode, fullscreenNodeId, toggleFullscreen } from '../store/flowStore'
import { readNote, writeNote, watchNote, saveNoteImage } from '../lib/bridgeClient'
import { syncNoteContent } from '../lib/noteSync'
import { htmlToMarkdown, markdownToHtml, splitTabs, joinTabs } from '../lib/noteMarkdown'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'
import AppTooltip from './AppTooltip.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'

const SAVE_DEBOUNCE_MS = 500

const CODE_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'php', label: 'PHP' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'plaintext', label: 'Texto simples' }
]

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const isFullscreen = computed(() => fullscreenNodeId.value === props.id)

const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')
const isBottomConnected = isHandleConnected('bottom')

const editorEl = ref(null)
const { nodeWidth, nodeHeight, startResize } = useNodeResize(props, {
  minWidth: 240,
  minHeight: 160,
  defaultWidth: 320,
  defaultHeight: 240
})
const isEditorFocused = ref(false)

const NOTE_COLOR_OPACITY = 30

function hexToRgba(hex, opacityPercent) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`
}

const backgroundStyle = computed(() => {
  if (props.data.transparent) return 'transparent'
  if (!props.data.headerColor) return undefined
  return hexToRgba(props.data.headerColor, NOTE_COLOR_OPACITY)
})

const restBorderColor = computed(() => {
  if (props.data.transparent) return 'transparent'
  if (!props.data.headerColor) return undefined
  return hexToRgba(props.data.headerColor, 55)
})

let savedRange = null
const selectionInTable = ref(false)

function getCurrentSelectionNode() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  return sel.getRangeAt(0).startContainer
}

function getClosestCell(node) {
  if (!node) return null
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  return el?.closest('td, th') || null
}

function saveSelection() {
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0 && editorEl.value?.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange()
    selectionInTable.value = !!getClosestCell(sel.anchorNode)
  }
}

function restoreSelection() {
  if (!savedRange) return
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(savedRange)
}

function exec(command, value = null) {
  editorEl.value?.focus()
  restoreSelection()
  document.execCommand(command, false, value)
  saveSelection()
  handleInput()
}

// ---- Abas ----
// tabs vive só em memória (parseado do markdown via splitTabs/joinTabs, ver
// noteMarkdown.js) — o .md em disco continua sendo a única fonte de verdade,
// igual ao conteúdo em si (ver comentário mais abaixo, sobre lastWrittenMarkdown).
// activeTabIndex é o único pedaço de estado de abas que persiste em
// node.data (metadado leve, mesmo padrão de headerColor/transparent).
const tabs = ref([{ id: crypto.randomUUID(), title: 'Principal', markdown: '' }])
const activeTabIndex = ref(0)
const renamingTabIndex = ref(null)
const renamingTabTitle = ref('')
const renameInputEl = ref(null)

function renderActiveTabIntoEditor() {
  if (!editorEl.value) return
  const tab = tabs.value[activeTabIndex.value]
  editorEl.value.innerHTML = markdownToHtml(tab?.markdown ?? '')
  clearSearchHighlights()
}

function persistActiveTabIndex() {
  updateNodeData(props.id, { activeTabIndex: activeTabIndex.value })
}

function switchTab(index) {
  if (index === activeTabIndex.value) return
  if (editorEl.value && tabs.value[activeTabIndex.value]) {
    tabs.value[activeTabIndex.value].markdown = htmlToMarkdown(editorEl.value.innerHTML)
  }
  activeTabIndex.value = index
  renderActiveTabIntoEditor()
  persistActiveTabIndex()
}

function addTab() {
  if (editorEl.value && tabs.value[activeTabIndex.value]) {
    tabs.value[activeTabIndex.value].markdown = htmlToMarkdown(editorEl.value.innerHTML)
  }
  tabs.value.push({ id: crypto.randomUUID(), title: `Aba ${tabs.value.length + 1}`, markdown: '' })
  activeTabIndex.value = tabs.value.length - 1
  renderActiveTabIntoEditor()
  persistActiveTabIndex()
  saveNow()
}

function closeTab(index) {
  if (tabs.value.length <= 1) return
  const wasActive = index === activeTabIndex.value
  tabs.value.splice(index, 1)
  if (activeTabIndex.value > index) {
    activeTabIndex.value -= 1
  } else if (activeTabIndex.value >= tabs.value.length) {
    activeTabIndex.value = tabs.value.length - 1
  }
  if (wasActive) renderActiveTabIntoEditor()
  persistActiveTabIndex()
  saveNow()
}

function startRenameTab(index) {
  renamingTabIndex.value = index
  renamingTabTitle.value = tabs.value[index].title
  nextTick(() => renameInputEl.value?.[0]?.focus())
}

function commitRenameTab(index) {
  if (renamingTabIndex.value !== index) return
  const title = renamingTabTitle.value.trim()
  tabs.value[index].title = title || tabs.value[index].title
  renamingTabIndex.value = null
  saveNow()
}

function cancelRenameTab() {
  renamingTabIndex.value = null
}

// o .md em disco é a fonte da verdade (não node.data — evita duplicar
// conteúdo entre workspaces.json e o arquivo, que poderiam divergir).
// lastWrittenMarkdown guarda a última escrita feita por este node, pra
// distinguir o próprio eco (fs.watch detectando a escrita que acabamos de
// fazer) de uma mudança de fato externa (ex: um agente editando o arquivo).
let lastWrittenMarkdown = null
let saveTimer = null
let unwatch = null

function saveNow() {
  if (!editorEl.value || !props.data.path) return
  if (tabs.value[activeTabIndex.value]) {
    tabs.value[activeTabIndex.value].markdown = htmlToMarkdown(editorEl.value.innerHTML)
  }
  const markdown = joinTabs(tabs.value)
  if (markdown === lastWrittenMarkdown) return
  lastWrittenMarkdown = markdown
  writeNote(props.data.path, markdown)
  syncNoteContent({ nodeId: props.id, path: props.data.path, content: markdown })
}

function handleInput() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS)
}

async function loadAndWatch() {
  unwatch?.()
  unwatch = null
  clearTimeout(saveTimer)

  if (!props.data.path) return

  const result = await readNote(props.data.path)
  lastWrittenMarkdown = result.content ?? ''
  tabs.value = splitTabs(lastWrittenMarkdown)
  activeTabIndex.value = Math.min(props.data.activeTabIndex ?? 0, tabs.value.length - 1)
  renderActiveTabIntoEditor()
  // mtime só vem null/ausente quando o bridge não achou o arquivo nem o
  // diretório pai (ex: path sincronizado de outra máquina, que não existe
  // aqui) — nesse caso não empurra pro servidor, senão sobrescreve a cópia
  // remota da nota com conteúdo vazio.
  if (result.mtime != null) {
    syncNoteContent({ nodeId: props.id, path: props.data.path, content: lastWrittenMarkdown })
  }

  unwatch = watchNote(props.data.path, (msg) => {
    if (msg.content === lastWrittenMarkdown) return
    lastWrittenMarkdown = msg.content
    syncNoteContent({ nodeId: props.id, path: props.data.path, content: msg.content })
    // não sobrescreve o editor enquanto o usuário está digitando nele —
    // evita arrancar cursor/seleção no meio de uma edição real; a próxima
    // vez que o autosave local rodar, a versão local prevalece (last-write-
    // wins simples, sem OT/CRDT)
    if (isEditorFocused.value || !editorEl.value) return
    tabs.value = splitTabs(msg.content)
    if (activeTabIndex.value >= tabs.value.length) activeTabIndex.value = tabs.value.length - 1
    renderActiveTabIntoEditor()
  })
}

watch(() => props.data.path, loadAndWatch)

function setColor(color) {
  updateNodeData(props.id, { headerColor: color, transparent: false })
}

function toggleTransparent() {
  updateNodeData(props.id, { transparent: !props.data.transparent })
}

// ---- Tabelas ----
function insertTable() {
  editorEl.value?.focus()
  restoreSelection()
  const html =
    '<table><thead><tr><th>Coluna 1</th><th>Coluna 2</th><th>Coluna 3</th></tr></thead>' +
    '<tbody><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>'
  document.execCommand('insertHTML', false, html)
  saveSelection()
  handleInput()
}

function addTableRow() {
  const cell = getClosestCell(getCurrentSelectionNode())
  if (!cell) return
  const row = cell.parentElement
  const newRow = row.cloneNode(true)
  newRow.querySelectorAll('td, th').forEach((c) => {
    if (c.tagName === 'TH') {
      const td = document.createElement('td')
      td.innerHTML = '<br>'
      c.replaceWith(td)
    } else {
      c.innerHTML = '<br>'
    }
  })
  row.after(newRow)
  handleInput()
}

function addTableColumn() {
  const cell = getClosestCell(getCurrentSelectionNode())
  if (!cell) return
  const table = cell.closest('table')
  table.querySelectorAll('tr').forEach((row) => {
    const isHeaderRow = row.parentElement.tagName === 'THEAD'
    const newCell = document.createElement(isHeaderRow ? 'th' : 'td')
    newCell.innerHTML = isHeaderRow ? 'Nova coluna' : '<br>'
    row.appendChild(newCell)
  })
  handleInput()
}

function placeCaretAtStart(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(true)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

function moveToAdjacentCell(cell, backwards) {
  const row = cell.parentElement
  const table = row.closest('table')
  const cellsInRow = Array.from(row.children)
  const cellIndex = cellsInRow.indexOf(cell)
  let targetCell = backwards ? cellsInRow[cellIndex - 1] : cellsInRow[cellIndex + 1]

  if (!targetCell) {
    const rows = Array.from(table.querySelectorAll('tr'))
    const rowIndex = rows.indexOf(row)
    if (backwards) {
      const prevRow = rows[rowIndex - 1]
      targetCell = prevRow ? prevRow.children[prevRow.children.length - 1] : null
    } else {
      const nextRow = rows[rowIndex + 1]
      if (nextRow) {
        targetCell = nextRow.children[0]
      } else {
        const newRow = row.cloneNode(true)
        newRow.querySelectorAll('td, th').forEach((c) => {
          if (c.tagName === 'TH') {
            const td = document.createElement('td')
            td.innerHTML = '<br>'
            c.replaceWith(td)
          } else {
            c.innerHTML = '<br>'
          }
        })
        ;(table.querySelector('tbody') || table).appendChild(newRow)
        targetCell = newRow.children[0]
      }
    }
  }

  if (targetCell) {
    placeCaretAtStart(targetCell)
    handleInput()
  }
}

function handleEditorKeydown(event) {
  if (event.key === 'Tab') {
    const cell = getClosestCell(getCurrentSelectionNode())
    if (cell) {
      event.preventDefault()
      moveToAdjacentCell(cell, event.shiftKey)
    }
  }
}

function handleEditorChange(event) {
  if (event.target?.matches?.('input[type="checkbox"]')) handleInput()
}

// ---- Código ----
function handleCodeLanguageChange(event) {
  const language = event.target.value
  event.target.value = ''
  if (!language) return
  insertCodeBlock(language)
}

function insertCodeBlock(language) {
  editorEl.value?.focus()
  restoreSelection()
  const html = `<pre><code class="language-${language}">​</code></pre><p><br></p>`
  document.execCommand('insertHTML', false, html)
  saveSelection()
  handleInput()
}

// ---- Checklist ----
function insertChecklist() {
  editorEl.value?.focus()
  restoreSelection()
  const html = '<ul><li><input type="checkbox"> Item</li></ul><p><br></p>'
  document.execCommand('insertHTML', false, html)
  saveSelection()
  handleInput()
}

// ---- Busca local (Ctrl+F) ----
// usa a CSS Custom Highlight API em vez de inserir <mark> no DOM — evitar
// contaminar o HTML que seria serializado de volta pro markdown a cada tecla
// digitada na busca seria bem arriscado de sincronizar com o autosave.
const SEARCH_HIGHLIGHT_NAME = 'dux-note-search'
const SEARCH_ACTIVE_HIGHLIGHT_NAME = 'dux-note-search-active'
const supportsCssHighlights = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'

const searchOpen = ref(false)
const searchQuery = ref('')
const searchMatchCount = ref(0)
const searchActiveIndex = ref(0)
const searchInputEl = ref(null)
let searchRanges = []

const searchCountLabel = computed(() => {
  if (!searchQuery.value.trim()) return ''
  if (searchMatchCount.value === 0) return '0 de 0'
  return `${searchActiveIndex.value + 1} de ${searchMatchCount.value}`
})

function clearSearchHighlights() {
  searchRanges = []
  searchMatchCount.value = 0
  searchActiveIndex.value = 0
  if (supportsCssHighlights) {
    CSS.highlights.delete(SEARCH_HIGHLIGHT_NAME)
    CSS.highlights.delete(SEARCH_ACTIVE_HIGHLIGHT_NAME)
  }
}

function applySearchHighlights() {
  if (!supportsCssHighlights) return
  CSS.highlights.set(SEARCH_HIGHLIGHT_NAME, new Highlight(...searchRanges))
  const activeRange = searchRanges[searchActiveIndex.value]
  CSS.highlights.set(SEARCH_ACTIVE_HIGHLIGHT_NAME, new Highlight(...(activeRange ? [activeRange] : [])))
}

function scrollToActiveMatch() {
  searchRanges[searchActiveIndex.value]?.startContainer?.parentElement?.scrollIntoView?.({ block: 'nearest' })
}

function runSearch() {
  if (!editorEl.value || !supportsCssHighlights) return
  const query = searchQuery.value.trim().toLowerCase()
  searchRanges = []
  if (!query) {
    clearSearchHighlights()
    return
  }

  const walker = document.createTreeWalker(editorEl.value, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    const text = node.textContent.toLowerCase()
    let fromIndex = 0
    let idx
    while ((idx = text.indexOf(query, fromIndex)) !== -1) {
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, idx + query.length)
      searchRanges.push(range)
      fromIndex = idx + query.length
    }
  }

  searchMatchCount.value = searchRanges.length
  searchActiveIndex.value = 0
  applySearchHighlights()
  scrollToActiveMatch()
}

watch(searchQuery, runSearch)

function goToNextMatch() {
  if (searchRanges.length === 0) return
  searchActiveIndex.value = (searchActiveIndex.value + 1) % searchRanges.length
  applySearchHighlights()
  scrollToActiveMatch()
}

function goToPrevMatch() {
  if (searchRanges.length === 0) return
  searchActiveIndex.value = (searchActiveIndex.value - 1 + searchRanges.length) % searchRanges.length
  applySearchHighlights()
  scrollToActiveMatch()
}

function openSearch() {
  searchOpen.value = true
  nextTick(() => searchInputEl.value?.focus())
}

function closeSearch() {
  searchOpen.value = false
  clearSearchHighlights()
  editorEl.value?.focus()
}

function toggleSearch() {
  if (searchOpen.value) closeSearch()
  else openSearch()
}

function handleNodeKeydown(event) {
  const isFindShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f'
  if (isFindShortcut) {
    event.preventDefault()
    openSearch()
  } else if (event.key === 'Escape' && searchOpen.value) {
    closeSearch()
  }
}

// ---- Imagens coladas/arrastadas ----
function toFileUrl(absolutePath) {
  const normalized = absolutePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function insertImageFile(file) {
  if (!props.data.path) return
  const base64 = await fileToBase64(file)
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
  const result = await saveNoteImage(props.data.path, base64, ext)
  if (!result.ok) {
    console.error('[notes] falha ao salvar imagem colada:', result.error)
    return
  }
  editorEl.value?.focus()
  restoreSelection()
  document.execCommand('insertHTML', false, `<img src="${toFileUrl(result.path)}" style="max-width: 100%;" />`)
  saveSelection()
  handleInput()
}

async function handlePaste(event) {
  const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'))
  if (!imageItem) return
  event.preventDefault()
  const file = imageItem.getAsFile()
  if (file) await insertImageFile(file)
}

async function handleDrop(event) {
  const imageFile = Array.from(event.dataTransfer?.files || []).find((file) => file.type.startsWith('image/'))
  if (!imageFile) return
  event.preventDefault()
  await insertImageFile(imageFile)
}

onMounted(loadAndWatch)

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  // última chance de persistir uma edição pendente que o debounce ainda não
  // gravou (ex: node deletado/desmontado logo após digitar)
  saveNow()
  unwatch?.()
})
</script>

<style scoped>
.notes-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-notes-bg);
  border: 1px solid var(--rest-border-color, var(--color-notes-border));
  border-radius: 10px;
  overflow: visible;
  box-shadow: 0 8px 24px var(--color-shadow);
  cursor: default;
}

.notes-node.transparent-note {
  box-shadow: none;
}

.notes-node.selected {
  border-color: var(--selected-color);
}

.notes-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.notes-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.toolbar-fade-enter-active,
.toolbar-fade-leave-active {
  transition: opacity 0.12s ease;
}

.toolbar-fade-enter-from,
.toolbar-fade-leave-to {
  opacity: 0;
}

.notes-toolbar {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  padding: 3px 6px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: 0 4px 16px var(--color-shadow);
  cursor: default;
  z-index: 2;
  flex-wrap: wrap;
}

.fmt-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.fmt-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.fmt-btn.active {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.fmt-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.fmt-btn:disabled:hover {
  background: transparent;
  color: var(--color-text-secondary);
}

.fmt-divider {
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: var(--color-border-strong);
}

.fmt-danger:hover {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.color-swatch {
  position: relative;
  display: flex;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid var(--color-border-strong);
  overflow: hidden;
  cursor: pointer;
}

.color-input {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  border: none;
  padding: 0;
  cursor: pointer;
  opacity: 0;
}

.reset-swatch svg {
  color: var(--color-text-secondary);
}

.reset-swatch:hover svg {
  color: var(--color-text-primary);
}

.fmt-select {
  height: 20px;
  padding: 0 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 10.5px;
  cursor: pointer;
}

.fmt-select:hover {
  background: var(--color-hover);
}

.notes-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 22px;
  border-radius: 10px 10px 0 0;
  cursor: grab;
}

.notes-drag-handle:active {
  cursor: grabbing;
}

.grip-dots {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.grip-dots span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
}

.notes-node:hover .grip-dots {
  opacity: 0.6;
}

.notes-search {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 22px 8px 0;
  padding: 3px 6px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: 0 2px 8px var(--color-shadow);
}

.notes-search-input {
  flex: 1;
  min-width: 0;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 11.5px;
}

.notes-search-input:focus {
  outline: none;
}

.notes-search-count {
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.notes-tabs {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 22px 8px 0;
  padding: 2px 2px 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--rest-border-color, var(--color-notes-border));
}

.notes-tabs::-webkit-scrollbar {
  height: 0;
}

.note-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px 6px 0 0;
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  cursor: pointer;
}

.note-tab:hover {
  background: var(--color-hover);
}

.note-tab.active {
  color: var(--color-text-primary);
  background: var(--color-hover);
}

.note-tab-rename-input {
  width: 70px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 11px;
}

.note-tab-rename-input:focus {
  outline: none;
}

.note-tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.note-tab-close:hover {
  background: rgba(255, 107, 107, 0.2);
  color: #ff6b6b;
}

.notes-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 26px 14px 12px;
  box-sizing: border-box;
  overflow-y: auto;
  border-radius: 10px;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  word-break: break-word;
  cursor: text;
}

.notes-body.has-tabs {
  padding-top: 8px;
}

.notes-body:focus {
  outline: none;
}

.notes-body {
  scrollbar-width: none;
}

.notes-body:hover,
.notes-body:focus {
  scrollbar-width: thin;
  scrollbar-color: var(--color-text-tertiary) transparent;
}

.notes-body::-webkit-scrollbar {
  width: 6px;
}

.notes-body::-webkit-scrollbar-track {
  background: transparent;
}

.notes-body::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 10px;
}

.notes-body:hover::-webkit-scrollbar-thumb,
.notes-body:focus::-webkit-scrollbar-thumb {
  background-color: var(--color-text-tertiary);
}

.notes-body::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-secondary);
}

.notes-body:empty::before {
  content: attr(data-placeholder);
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.notes-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 6px 0;
  font-size: 11.5px;
}

.notes-body :deep(td),
.notes-body :deep(th) {
  border: 1px solid var(--color-border-strong);
  padding: 3px 6px;
  min-width: 24px;
}

.notes-body :deep(th) {
  background: var(--color-bg-surface-alt);
  font-weight: 600;
}

.notes-body :deep(pre) {
  margin: 6px 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  overflow-x: auto;
}

.notes-body :deep(code) {
  font-family: 'Courier New', monospace;
  font-size: 11.5px;
}

.notes-body :deep(ul) {
  padding-left: 20px;
}

.notes-body :deep(img) {
  max-width: 100%;
  height: auto;
}

.notes-body :deep(li input[type='checkbox']) {
  margin-right: 4px;
}

.notes-body :deep(::highlight(dux-note-search)) {
  background-color: rgba(255, 214, 0, 0.45);
}

.notes-body :deep(::highlight(dux-note-search-active)) {
  background-color: rgba(255, 145, 0, 0.6);
}

/* highlight.js — paleta compacta própria (em vez de importar um tema
   inteiro), pra herdar as cores/variáveis já usadas no resto do app */
.notes-body :deep(.hljs-keyword),
.notes-body :deep(.hljs-selector-tag),
.notes-body :deep(.hljs-literal),
.notes-body :deep(.hljs-section) {
  color: #c678dd;
}

.notes-body :deep(.hljs-string),
.notes-body :deep(.hljs-attr),
.notes-body :deep(.hljs-regexp),
.notes-body :deep(.hljs-addition) {
  color: #98c379;
}

.notes-body :deep(.hljs-title),
.notes-body :deep(.hljs-name),
.notes-body :deep(.hljs-built_in),
.notes-body :deep(.hljs-type) {
  color: #61afef;
}

.notes-body :deep(.hljs-comment),
.notes-body :deep(.hljs-quote) {
  color: var(--color-text-tertiary);
  font-style: italic;
}

.notes-body :deep(.hljs-number),
.notes-body :deep(.hljs-symbol) {
  color: #d19a66;
}

.notes-body :deep(.hljs-variable),
.notes-body :deep(.hljs-template-variable),
.notes-body :deep(.hljs-attribute) {
  color: #e06c75;
}

.notes-body :deep(.hljs-deletion) {
  color: #e06c75;
}

.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 3px;
  box-sizing: border-box;
  color: var(--color-text-tertiary);
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.notes-node:hover .resize-handle {
  opacity: 1;
}
</style>
