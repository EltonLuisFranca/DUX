<template>
  <NodeShell
    :id="id"
    :data="data"
    :selected="selected"
    :resize="{ minWidth: 420, minHeight: 300, defaultWidth: 640, defaultHeight: 440 }"
    :title="data.name"
    :meta="engineLabel"
    :status="statusColor"
    :status-pulse="running"
  >
    <template #icon>
      <svg viewBox="0 0 20 20" width="12" height="12" v-html="DATABASE_ICON"></svg>
    </template>

    <div class="db-body nodrag nowheel nopan">
      <!-- não configurado ainda -->
      <div v-if="!isConfigured" class="db-state">
        <svg class="db-state-icon" viewBox="0 0 20 20" width="24" height="24" v-html="DATABASE_ICON"></svg>
        <span class="db-state-title">Conexão não configurada</span>
        <span class="db-state-hint">Defina host, usuário e senha pra começar.</span>
        <button class="db-btn primary" @click="openNodeSettings(id)">Configurar conexão</button>
      </div>

      <template v-else>
        <div class="db-main">
          <!-- explorador de schema -->
          <aside class="db-schema" :style="{ width: schemaWidth + 'px' }">
            <div class="db-schema-head">
              <span>Tabelas</span>
              <button class="db-icon-btn" :disabled="schemaLoading" title="Recarregar schema" @click="loadSchema">
                <svg viewBox="0 0 16 16" width="12" height="12">
                  <path
                    d="M13 8a5 5 0 1 1-1.5-3.5M13 2v2.5h-2.5"
                    stroke="currentColor"
                    stroke-width="1.4"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
            <div class="db-schema-list">
              <div v-if="schemaLoading" class="db-schema-empty">Carregando…</div>
              <div v-else-if="schemaError" class="db-schema-empty err">{{ schemaError }}</div>
              <div v-else-if="tables.length === 0" class="db-schema-empty">Nenhuma tabela</div>
              <template v-else>
                <div v-for="t in tables" :key="t.schema + '.' + t.name" class="db-table">
                  <button class="db-table-head" @click="toggleTable(t)">
                    <span class="db-caret" :class="{ open: expanded.has(t.schema + '.' + t.name) }">▸</span>
                    <span class="db-table-name" :title="fullTableName(t)">{{ t.name }}</span>
                    <button
                      class="db-mini-btn"
                      title="SELECT * desta tabela"
                      @click.stop="selectFrom(t)"
                    >
                      ⤷
                    </button>
                  </button>
                  <div v-if="expanded.has(t.schema + '.' + t.name)" class="db-cols">
                    <div v-for="c in t.columns" :key="c.name" class="db-col">
                      <span class="db-col-name">{{ c.name }}</span>
                      <span class="db-col-type">{{ c.type }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </aside>

          <div class="db-schema-resize" @mousedown="startSchemaResize"></div>

          <!-- editor + resultado -->
          <div class="db-right">
            <div class="db-editor-wrap">
              <textarea
                ref="editorEl"
                v-model="sql"
                class="db-editor"
                spellcheck="false"
                placeholder="SELECT * FROM ... — Ctrl/Cmd+Enter pra rodar"
                @keydown="onEditorKeydown"
              ></textarea>
            </div>
            <div class="db-toolbar">
              <button class="db-btn primary" :disabled="running || !sql.trim()" @click="run">
                {{ running ? 'Rodando…' : 'Rodar' }}
              </button>
              <span v-if="result && !result.error" class="db-result-meta">
                {{ resultSummary }}
              </span>
              <span v-if="result && result.error" class="db-result-meta err">{{ result.error }}</span>
              <span class="db-spacer"></span>
              <button
                class="db-icon-btn"
                :class="{ active: showHistory }"
                title="Histórico de queries"
                @click="showHistory = !showHistory"
              >
                🕘
              </button>
              <button class="db-icon-btn" title="Exportar CSV" :disabled="!canExport" @click="exportCsv">CSV</button>
              <button class="db-icon-btn" title="Exportar JSON" :disabled="!canExport" @click="exportJson">JSON</button>
              <button class="db-icon-btn" title="Configurar conexão" @click="openNodeSettings(id)">⚙</button>
            </div>

            <!-- painel de histórico (sobrepõe a área de resultado) -->
            <div v-if="showHistory" class="db-history nowheel">
              <div class="db-history-head">
                <span>Histórico ({{ history.length }})</span>
                <button v-if="history.length" class="db-link" @click="clearHistory">limpar</button>
              </div>
              <div v-if="history.length === 0" class="db-result-empty">Nenhuma query ainda.</div>
              <button
                v-for="(h, i) in history"
                :key="h.ts + '-' + i"
                class="db-history-item"
                @click="loadFromHistory(h)"
              >
                <span class="db-history-dot" :class="h.ok ? 'ok' : 'err'"></span>
                <span class="db-history-sql">{{ historyPreview(h.sql) }}</span>
                <span class="db-history-meta">
                  <template v-if="h.rowCount !== null">{{ h.rowCount }} ln · </template>{{ historyTime(h.ts) }}
                </span>
              </button>
            </div>

            <div class="db-result nowheel">
              <div v-if="running" class="db-result-empty">Executando query…</div>
              <div v-else-if="!result" class="db-result-empty">O resultado aparece aqui.</div>
              <div v-else-if="result.error" class="db-result-empty err">{{ result.error }}</div>
              <div v-else-if="result.columns && result.columns.length" class="db-grid-wrap">
                <table class="db-grid">
                  <thead>
                    <tr>
                      <th class="db-rownum">#</th>
                      <th v-for="col in result.columns" :key="col.name" :title="col.name">{{ col.name }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in result.rows" :key="i">
                      <td class="db-rownum">{{ i + 1 }}</td>
                      <td
                        v-for="col in result.columns"
                        :key="col.name"
                        :class="{ null: row[col.name] === null }"
                        :title="cellTitle(row[col.name])"
                      >
                        {{ cellText(row[col.name]) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="db-result-empty ok">
                ✓ Comando executado — {{ result.rowCount }} linha(s) afetada(s)<template v-if="result.insertId"
                  >, insertId {{ result.insertId }}</template
                >.
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </NodeShell>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import NodeShell from './NodeShell.vue'
import { DATABASE_ICON } from '../nodeTypes/nodeIcons'
import { openNodeSettings, updateNodeData } from '../store/flowStore'
import { dbQuery, dbSchema } from '../lib/bridgeClient'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const sql = ref('')
const result = ref(null)
const running = ref(false)

const tables = ref([])
const expanded = ref(new Set())
const schemaLoading = ref(false)
const schemaError = ref('')
const schemaLoaded = ref(false)

const schemaWidth = ref(180)

const isConfigured = computed(() => Boolean(props.data.host && props.data.user))
const engineLabel = computed(() => (props.data.engine === 'mysql' ? 'MySQL' : 'PostgreSQL'))
const statusColor = computed(() => {
  if (running.value) return '#3b82f6'
  if (result.value?.error) return '#ef4444'
  if (result.value) return '#22c55e'
  return null
})

const resultSummary = computed(() => {
  if (!result.value) return ''
  const r = result.value
  const rows = r.columns?.length ? `${r.rows.length} linha(s)` : `${r.rowCount} afetada(s)`
  return `${rows} · ${r.durationMs} ms`
})

function buildConfig() {
  const d = props.data
  return {
    connectionId: d.connectionId,
    engine: d.engine,
    host: d.host,
    port: d.port,
    user: d.user,
    database: d.database,
    ssl: d.ssl
  }
}

async function run() {
  if (running.value || !sql.value.trim()) return
  const ranSql = sql.value.trim()
  running.value = true
  result.value = null
  result.value = await dbQuery(buildConfig(), ranSql)
  running.value = false
  pushHistory(ranSql, result.value)
  // uma escrita que mexe em estrutura pode ter mudado o schema
  if (!result.value.error && /\b(create|drop|alter)\b/i.test(ranSql)) loadSchema()
}

// ---- Histórico de queries ----
// Persistido em node.data (sincroniza com o workspace, então acompanha o
// usuário entre máquinas). Guarda só o texto da query + metadados do
// resultado — nunca os dados retornados. Cap em HISTORY_MAX pra não inchar.
const HISTORY_MAX = 50
const showHistory = ref(false)
const history = computed(() => props.data.queryHistory || [])

function pushHistory(ranSql, res) {
  const prev = props.data.queryHistory || []
  // evita duplicar a mesma query rodada em sequência
  const rest = prev[0]?.sql === ranSql ? prev.slice(1) : prev
  const entry = {
    sql: ranSql,
    ts: Date.now(),
    ok: !res.error,
    rowCount: res.error ? null : res.columns?.length ? res.rows.length : res.rowCount,
    durationMs: res.durationMs ?? null
  }
  updateNodeData(props.id, { queryHistory: [entry, ...rest].slice(0, HISTORY_MAX) })
}

function loadFromHistory(entry) {
  sql.value = entry.sql
  showHistory.value = false
}

function clearHistory() {
  updateNodeData(props.id, { queryHistory: [] })
}

function historyTime(ts) {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

function historyPreview(s) {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > 80 ? flat.slice(0, 80) + '…' : flat
}

// ---- Export do resultado ----
const canExport = computed(() => Boolean(result.value && !result.value.error && result.value.columns?.length))

function csvEscape(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportName(ext) {
  const slug = String(props.data.name || 'resultado').replace(/[^\w-]+/g, '_')
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `${slug}-${stamp}.${ext}`
}

function exportCsv() {
  const { columns, rows } = result.value
  const header = columns.map((c) => csvEscape(c.name)).join(',')
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c.name])).join(',')).join('\n')
  downloadFile(exportName('csv'), header + '\n' + body, 'text/csv')
}

function exportJson() {
  downloadFile(exportName('json'), JSON.stringify(result.value.rows, null, 2), 'application/json')
}

function onEditorKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    run()
  }
}

async function loadSchema() {
  schemaLoading.value = true
  schemaError.value = ''
  const res = await dbSchema(buildConfig())
  schemaLoading.value = false
  schemaLoaded.value = true
  if (res.ok) {
    tables.value = res.tables || []
  } else {
    schemaError.value = res.error || 'falha ao ler schema'
    tables.value = []
  }
}

function fullTableName(t) {
  // Postgres: qualifica com schema quando não é o public; MySQL não usa schema
  // separado da database, então mostra só o nome.
  if (props.data.engine === 'mysql') return t.name
  return t.schema && t.schema !== 'public' ? `${t.schema}.${t.name}` : t.name
}

function toggleTable(t) {
  const key = t.schema + '.' + t.name
  const next = new Set(expanded.value)
  next.has(key) ? next.delete(key) : next.add(key)
  expanded.value = next
}

function selectFrom(t) {
  sql.value = `SELECT * FROM ${fullTableName(t)} LIMIT 100;`
  run()
}

function cellText(v) {
  if (v === null) return 'NULL'
  const s = String(v)
  return s.length > 200 ? s.slice(0, 200) + '…' : s
}

function cellTitle(v) {
  return v === null ? 'NULL' : String(v)
}

// resize do explorador de schema
let resizeStartX = 0
let resizeStartW = 0
function startSchemaResize(e) {
  resizeStartX = e.clientX
  resizeStartW = schemaWidth.value
  window.addEventListener('mousemove', onSchemaResize)
  window.addEventListener('mouseup', stopSchemaResize)
  e.preventDefault()
}
function onSchemaResize(e) {
  schemaWidth.value = Math.max(120, Math.min(360, resizeStartW + (e.clientX - resizeStartX)))
}
function stopSchemaResize() {
  window.removeEventListener('mousemove', onSchemaResize)
  window.removeEventListener('mouseup', stopSchemaResize)
}

// carrega o schema na primeira vez que a conexão fica configurada
watch(
  isConfigured,
  (ok) => {
    if (ok && !schemaLoaded.value) loadSchema()
  },
  { immediate: true }
)
</script>

<style scoped>
.db-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
}

.db-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
}

.db-state-icon {
  color: var(--color-text-tertiary);
}

.db-state-title {
  font-size: 13px;
  color: var(--color-text-primary);
  font-weight: 600;
}

.db-state-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-bottom: 4px;
}

.db-main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.db-schema {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--color-border-strong);
  background: var(--color-bg-surface-alt);
}

.db-schema-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
  border-bottom: 1px solid var(--color-border-strong);
}

.db-schema-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.db-schema-empty {
  padding: 8px 10px;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.db-schema-empty.err {
  color: #ef4444;
}

.db-table-head {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 3px 8px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 11.5px;
  cursor: pointer;
  text-align: left;
}

.db-table-head:hover {
  background: var(--color-bg-surface);
}

.db-caret {
  font-size: 9px;
  transition: transform 0.12s ease;
  flex-shrink: 0;
}

.db-caret.open {
  transform: rotate(90deg);
}

.db-table-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-mini-btn {
  background: none;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  opacity: 0;
}

.db-table-head:hover .db-mini-btn {
  opacity: 1;
}

.db-cols {
  padding: 0 8px 4px 20px;
}

.db-col {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 10.5px;
  padding: 1px 0;
}

.db-col-name {
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-col-type {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.db-schema-resize {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
}

.db-schema-resize:hover {
  background: #3b82f6;
}

.db-right {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.db-editor-wrap {
  flex-shrink: 0;
  height: 34%;
  min-height: 70px;
}

.db-editor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  resize: none;
  border: none;
  outline: none;
  padding: 8px 10px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-family: 'Menlo', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.db-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-top: 1px solid var(--color-border-strong);
  border-bottom: 1px solid var(--color-border-strong);
  background: var(--color-bg-surface-alt);
}

.db-spacer {
  flex: 1;
}

.db-result-meta {
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.db-result-meta.err {
  color: #ef4444;
}

.db-result {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.db-result-empty {
  padding: 12px;
  font-size: 11.5px;
  color: var(--color-text-tertiary);
}

.db-result-empty.err {
  color: #ef4444;
}

.db-result-empty.ok {
  color: #22c55e;
}

.db-grid-wrap {
  min-width: max-content;
}

.db-grid {
  border-collapse: collapse;
  font-size: 11px;
  font-family: 'Menlo', Consolas, monospace;
}

.db-grid th,
.db-grid td {
  border: 1px solid var(--color-border-strong);
  padding: 3px 7px;
  text-align: left;
  max-width: 320px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-grid th {
  position: sticky;
  top: 0;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  font-weight: 600;
  z-index: 1;
}

.db-grid td {
  color: var(--color-text-primary);
}

.db-grid td.null {
  color: var(--color-text-tertiary);
  font-style: italic;
}

.db-rownum {
  color: var(--color-text-tertiary);
  text-align: right !important;
  background: var(--color-bg-surface-alt);
}

.db-btn {
  height: 26px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
  cursor: pointer;
}

.db-btn:hover:not(:disabled) {
  border-color: var(--color-text-secondary);
}

.db-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.db-btn.primary {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.db-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 11px;
}

.db-icon-btn:hover:not(:disabled) {
  border-color: var(--color-text-secondary);
}

.db-icon-btn.active {
  border-color: #3b82f6;
  color: #3b82f6;
}

.db-icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* ---- painel de histórico ---- */
.db-history {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: calc(34% + 37px);
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border-top: 1px solid var(--color-border-strong);
  overflow-y: auto;
  z-index: 2;
}

.db-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
  border-bottom: 1px solid var(--color-border-strong);
  position: sticky;
  top: 0;
  background: var(--color-bg-surface-alt);
}

.db-link {
  background: none;
  border: none;
  color: #3b82f6;
  cursor: pointer;
  font-size: 10.5px;
  text-transform: none;
  letter-spacing: 0;
}

.db-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-border-strong);
  cursor: pointer;
  text-align: left;
}

.db-history-item:hover {
  background: var(--color-bg-surface-alt);
}

.db-history-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.db-history-dot.ok {
  background: #22c55e;
}

.db-history-dot.err {
  background: #ef4444;
}

.db-history-sql {
  flex: 1;
  min-width: 0;
  font-family: 'Menlo', Consolas, monospace;
  font-size: 11px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-history-meta {
  flex-shrink: 0;
  font-size: 9.5px;
  color: var(--color-text-tertiary);
}
</style>
