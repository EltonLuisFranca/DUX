const { Client: PgClient } = require('pg')
const mysql = require('mysql2/promise')

// Conexões vivas por connectionId. Um node de banco é interativo (explora
// schema, roda várias queries seguidas) — reabrir a cada query seria lento e
// derrubaria transações. Guardamos a conexão e a reusamos enquanto a config
// não mudar; uma sweep de ociosidade fecha o que ficou parado, pra não deixar
// conexão pendurada no banco do usuário quando ele larga o node.
const connections = new Map() // connectionId -> { signature, engine, client, lastUsed, idleTimer }

const IDLE_MS = 5 * 60 * 1000
const CONNECT_TIMEOUT_MS = 8000

// pg devolve bigint/Date/Buffer crus; JSON.stringify sobre o WS quebra em
// bigint e serializa Buffer/Date de um jeito inútil pro grid. Normaliza pra
// algo que o renderer consegue exibir como texto.
function sanitizeValue(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return v.toISOString()
  if (Buffer.isBuffer(v)) return `\\x${v.toString('hex')}`
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return v
}

function signatureOf(config, password) {
  return JSON.stringify({
    engine: config.engine,
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    ssl: Boolean(config.ssl),
    password: password || ''
  })
}

function scheduleIdleClose(connectionId) {
  const entry = connections.get(connectionId)
  if (!entry) return
  clearTimeout(entry.idleTimer)
  entry.idleTimer = setTimeout(() => {
    closeConnection(connectionId)
  }, IDLE_MS)
}

async function openClient(config, password) {
  const engine = config.engine === 'mysql' ? 'mysql' : 'postgres'
  if (engine === 'postgres') {
    const client = new PgClient({
      host: config.host || 'localhost',
      port: Number(config.port) || 5432,
      user: config.user || undefined,
      password: password || undefined,
      database: config.database || undefined,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS
    })
    await client.connect()
    return { engine, client }
  }
  const client = await mysql.createConnection({
    host: config.host || 'localhost',
    port: Number(config.port) || 3306,
    user: config.user || undefined,
    password: password || undefined,
    database: config.database || undefined,
    ssl: config.ssl ? {} : undefined,
    connectTimeout: CONNECT_TIMEOUT_MS,
    multipleStatements: false,
    // devolve números grandes como string em vez de perder precisão — casa
    // com o sanitizeValue do lado pg
    supportBigNumbers: true,
    bigNumberStrings: true
  })
  return { engine, client }
}

// Pega (ou abre) a conexão pro connectionId. Se a config/senha mudou desde a
// última vez, fecha a antiga e reabre — senão editar o host na sidebar não
// teria efeito até fechar o node.
async function getConnection(config, password) {
  const id = config.connectionId
  const signature = signatureOf(config, password)
  const existing = connections.get(id)
  if (existing && existing.signature === signature) {
    existing.lastUsed = Date.now()
    scheduleIdleClose(id)
    return existing
  }
  if (existing) await closeConnection(id)

  const { engine, client } = await openClient(config, password)
  const entry = { signature, engine, client, lastUsed: Date.now(), idleTimer: null }
  connections.set(id, entry)
  scheduleIdleClose(id)
  return entry
}

async function closeConnection(connectionId) {
  const entry = connections.get(connectionId)
  if (!entry) return
  clearTimeout(entry.idleTimer)
  connections.delete(connectionId)
  try {
    await entry.client.end()
  } catch {
    // conexão já pode ter caído do outro lado — fechar é best-effort
  }
}

async function testConnection(config, password) {
  try {
    const { engine, client } = await openClient(config, password)
    let version = ''
    try {
      if (engine === 'postgres') {
        const r = await client.query('SELECT version()')
        version = r.rows?.[0]?.version || ''
      } else {
        const [rows] = await client.query('SELECT VERSION() AS version')
        version = rows?.[0]?.version || ''
      }
    } catch {
      // conectou mas não deixou ler a versão — ainda conta como sucesso
    }
    try {
      await client.end()
    } catch {
      /* best-effort */
    }
    return { ok: true, version }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

function normalizePg(result) {
  // result.command: SELECT, INSERT, UPDATE, DELETE, CREATE...
  const fields = result.fields || []
  const columns = fields.map((f) => ({ name: f.name, type: String(f.dataTypeID) }))
  const rows = (result.rows || []).map((row) => {
    const out = {}
    for (const col of columns) out[col.name] = sanitizeValue(row[col.name])
    return out
  })
  return {
    columns,
    rows,
    command: result.command || '',
    rowCount: typeof result.rowCount === 'number' ? result.rowCount : rows.length
  }
}

function normalizeMysql(result, fields) {
  // SELECT/SHOW => result é um array de linhas (+ fields definido); escrita =>
  // result é um ResultSetHeader com affectedRows e sem fields.
  if (Array.isArray(result)) {
    const cols = (fields || []).map((f) => ({ name: f.name, type: String(f.columnType ?? '') }))
    const columns = cols.length ? cols : Object.keys(result[0] || {}).map((name) => ({ name, type: '' }))
    const rows = result.map((row) => {
      const out = {}
      for (const col of columns) out[col.name] = sanitizeValue(row[col.name])
      return out
    })
    return { columns, rows, command: 'SELECT', rowCount: rows.length }
  }
  return {
    columns: [],
    rows: [],
    command: 'OK',
    rowCount: typeof result?.affectedRows === 'number' ? result.affectedRows : 0,
    insertId: result?.insertId ?? null
  }
}

async function runQuery(config, password, sql) {
  if (!sql || !sql.trim()) return { ok: false, error: 'query vazia' }
  const startedAt = Date.now()
  let entry
  try {
    entry = await getConnection(config, password)
  } catch (err) {
    return { ok: false, error: err.message, durationMs: Date.now() - startedAt }
  }
  try {
    if (entry.engine === 'postgres') {
      const result = await entry.client.query(sql)
      // pg devolve um array de results quando o texto tem múltiplos comandos;
      // pegamos o último (o que o usuário normalmente quer ver)
      const picked = Array.isArray(result) ? result[result.length - 1] : result
      return { ok: true, ...normalizePg(picked), durationMs: Date.now() - startedAt }
    }
    const [result, fields] = await entry.client.query(sql)
    return { ok: true, ...normalizeMysql(result, fields), durationMs: Date.now() - startedAt }
  } catch (err) {
    return { ok: false, error: err.message, durationMs: Date.now() - startedAt }
  }
}

async function fetchSchema(config, password) {
  let entry
  try {
    entry = await getConnection(config, password)
  } catch (err) {
    return { ok: false, error: err.message }
  }
  try {
    let tableRows
    if (entry.engine === 'postgres') {
      const r = await entry.client.query(
        `SELECT c.table_schema, c.table_name, c.column_name, c.data_type
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
         WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
           AND t.table_type = 'BASE TABLE'
         ORDER BY c.table_schema, c.table_name, c.ordinal_position`
      )
      tableRows = r.rows
    } else {
      const [rows] = await entry.client.query(
        `SELECT table_schema, table_name, column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
         ORDER BY table_name, ordinal_position`
      )
      tableRows = rows
    }
    // agrupa linhas (uma por coluna) em tabelas com suas colunas
    const map = new Map()
    for (const row of tableRows) {
      const schema = row.table_schema || row.TABLE_SCHEMA || ''
      const name = row.table_name || row.TABLE_NAME || ''
      const key = `${schema}.${name}`
      if (!map.has(key)) map.set(key, { schema, name, columns: [] })
      map.get(key).columns.push({
        name: row.column_name || row.COLUMN_NAME || '',
        type: row.data_type || row.DATA_TYPE || ''
      })
    }
    return { ok: true, tables: Array.from(map.values()) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { testConnection, runQuery, fetchSchema, closeConnection }
