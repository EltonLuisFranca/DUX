<template>
  <div
    class="ct-node"
    :class="{ selected }"
    :style="{ width: nodeWidth + 'px', height: nodeHeight + 'px', '--selected-color': data.headerColor || '#3b82f6' }"
  >
    <NodeToolbar :id="id" :data="data" :selected="selected" />
    <Handle
      id="left"
      type="target"
      :position="Position.Left"
      class="ct-handle"
      :class="{ connected: isLeftConnected }"
    />
    <Handle
      id="right"
      type="source"
      :position="Position.Right"
      class="ct-handle"
      :class="{ connected: isRightConnected }"
    />
    <Handle
      id="bottom"
      type="source"
      :position="Position.Bottom"
      class="ct-handle"
      :class="{ connected: isBottomConnected }"
    />

    <div class="ct-header" :style="{ background: data.headerColor || undefined }">
      <span class="status-dot" :class="statusDotClass" />
      <span class="ct-title">{{ data.name }}</span>
      <button class="header-btn nodrag" title="Log completo de tentativas" @click="showLogModal = true">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>
      <button class="header-btn nodrag" title="Configurações" @click="toggleNodeSettings(id)">
        <GearIcon />
      </button>
    </div>

    <div class="tabs-row nodrag">
      <button class="tab-btn" :class="{ active: activeTab === 'target' }" @click="activeTab = 'target'">Alvo</button>
      <button class="tab-btn" :class="{ active: activeTab === 'credentials' }" @click="activeTab = 'credentials'">
        Credenciais
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'detection' }" @click="activeTab = 'detection'">
        Detecção
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'run' }" @click="activeTab = 'run'">Execução</button>
    </div>

    <div class="tab-body nodrag nowheel nopan">
      <div v-if="activeTab === 'target'" class="pane">
        <div class="request-row">
          <select v-model="method" class="method-select" @change="syncData">
            <option v-for="m in METHODS" :key="m" :value="m">{{ m }}</option>
          </select>
          <input
            v-model="url"
            class="url-input"
            type="text"
            placeholder="https://minha-app.com/login"
            @input="syncData"
          />
        </div>

        <div class="field-row">
          <span class="section-label">Body (Content-Type)</span>
          <select v-model="contentType" class="inline-select" @change="syncData">
            <option value="json">JSON</option>
            <option value="form">form-urlencoded</option>
          </select>
        </div>

        <p class="hint">
          Use <code v-pre>{{user}}</code> e <code v-pre>{{pass}}</code> no body — substituídos a cada tentativa.
        </p>
        <textarea
          v-model="bodyTemplate"
          class="body-editor"
          spellcheck="false"
          placeholder='{"user":"{{user}}","pass":"{{pass}}"}'
          @input="syncData"
        />
        <button class="link-btn" @click="resetBodyTemplateToDefault">Usar template padrão</button>

        <div class="headers-editor">
          <span class="section-label">Headers</span>
          <div v-for="(h, i) in headers" :key="i" class="header-row">
            <input v-model="h.key" class="header-input" type="text" placeholder="Chave" @input="syncData" />
            <input v-model="h.value" class="header-input" type="text" placeholder="Valor" @input="syncData" />
            <button class="remove-btn" @click="removeHeader(i)">
              <svg viewBox="0 0 16 16" width="12" height="12">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <button class="add-header-btn" @click="addHeader">+ Header</button>
        </div>
      </div>

      <div v-else-if="activeTab === 'credentials'" class="pane">
        <div class="mode-row">
          <label class="radio-label">
            <input type="radio" value="quick" v-model="credentialsMode" @change="syncData" />
            Lista rápida (clássicas)
          </label>
          <label class="radio-label">
            <input type="radio" value="custom" v-model="credentialsMode" @change="syncData" />
            Wordlist customizada
          </label>
        </div>

        <div v-if="credentialsMode === 'quick'">
          <p class="hint">{{ QUICK_CREDENTIALS_CLIENT.length }} credenciais clássicas (admin/admin, root/root, qa/qa...).</p>
          <div class="quick-grid">
            <span v-for="c in QUICK_CREDENTIALS_CLIENT" :key="c.user + ':' + c.pass" class="quick-pill">
              {{ c.user }}:{{ c.pass }}
            </span>
          </div>
        </div>

        <div v-else class="custom-list">
          <input
            v-model="fixedUser"
            class="header-input"
            type="text"
            placeholder="Usuário fixo (opcional — use se a lista abaixo tiver só senhas)"
            @input="syncData"
          />
          <textarea
            v-model="customWordlist"
            class="body-editor wordlist-editor"
            spellcheck="false"
            placeholder="usuario:senha (um par por linha)&#10;ou, com usuário fixo acima, só a senha por linha"
            @input="syncData"
          />
          <p class="hint">{{ credentialsCount }} credenciais válidas nessa lista.</p>
        </div>
      </div>

      <div v-else-if="activeTab === 'detection'" class="pane">
        <span class="section-label">Sucesso é reconhecido por</span>
        <select v-model="successType" class="inline-select full-width" @change="syncData">
          <option value="status">Status HTTP</option>
          <option value="text">Texto na resposta</option>
          <option value="redirect">Redirect (header Location)</option>
          <option value="cookie">Cookie de sessão</option>
        </select>

        <div v-if="successType === 'status'" class="rule-fields">
          <input v-model="successStatusList" class="header-input" type="text" placeholder="200,201" @input="syncData" />
          <p class="hint">Status HTTP considerados sucesso, separados por vírgula.</p>
        </div>
        <div v-else-if="successType === 'text'" class="rule-fields">
          <select v-model="successTextMode" class="inline-select full-width" @change="syncData">
            <option value="contains">Resposta contém</option>
            <option value="not_contains">Resposta não contém</option>
          </select>
          <input v-model="successText" class="header-input" type="text" placeholder="Bem-vindo" @input="syncData" />
        </div>
        <div v-else-if="successType === 'redirect'" class="rule-fields">
          <input v-model="successText" class="header-input" type="text" placeholder="/dashboard" @input="syncData" />
          <p class="hint">Sucesso se o header Location da resposta contiver este trecho.</p>
        </div>
        <div v-else class="rule-fields">
          <input v-model="successText" class="header-input" type="text" placeholder="session_id" @input="syncData" />
          <p class="hint">Sucesso se a resposta setar um cookie com este nome.</p>
        </div>

        <p class="hint detection-note">
          Rate limit/lockout é detectado automaticamente durante o teste (status 429, CAPTCHA/mensagem de bloqueio na
          resposta, ou aumento anormal de latência) — não precisa configurar nada aqui.
        </p>
      </div>

      <div v-else class="pane">
        <div class="exec-controls">
          <label class="exec-field">
            Delay entre tentativas (ms)
            <input v-model.number="delayMs" type="number" min="0" :disabled="running" @input="syncData" />
          </label>
          <label class="exec-field">
            Concorrência
            <input v-model.number="concurrency" type="number" min="1" max="10" :disabled="running" @input="syncData" />
          </label>
        </div>

        <div v-if="!running && !showConfirm" class="start-row">
          <button class="btn-primary" :disabled="!canStart" @click="clickStart">Iniciar teste</button>
          <span v-if="!url" class="hint">Informe a URL alvo na aba Alvo.</span>
          <span v-else-if="credentialsCount === 0" class="hint">Nenhuma credencial configurada na aba Credenciais.</span>
        </div>

        <div v-if="showConfirm" class="confirm-panel">
          <p>
            Confirma o teste contra <strong>{{ method }} {{ url }}</strong> — {{ credentialsCount }} credenciais?
          </p>
          <div class="confirm-actions">
            <button class="btn-secondary" @click="showConfirm = false">Cancelar</button>
            <button class="btn-danger" @click="confirmStart">Confirmar e iniciar</button>
          </div>
        </div>

        <div v-if="running" class="progress-panel">
          <div class="progress-bar"><div class="progress-fill" :style="{ width: progressPct + '%' }" /></div>
          <div class="progress-row">
            <span class="hint">{{ progressCount }}/{{ progressTotal }} tentativas</span>
            <button class="btn-secondary" @click="stopTest">Parar</button>
          </div>
        </div>

        <div v-if="liveFindings.length" class="banner danger">
          <strong>Credencial fraca encontrada:</strong>
          <div v-for="f in liveFindings" :key="f.user + ':' + f.pass" class="finding-row">
            {{ f.user }} : {{ f.pass }} <span class="finding-status">({{ f.status }})</span>
          </div>
        </div>

        <div v-if="liveRateLimit" class="banner ok">
          Rate limit/lockout detectado após {{ liveRateLimit.afterAttempts }} tentativas
          ({{ rateLimitSignalLabel(liveRateLimit.signal) }}).
        </div>
        <div v-else-if="lastResult && !running && !lastResult.error" class="banner warn">
          Nenhum rate limit/lockout detectado em {{ lastResult.totalAttempts }} tentativas — possível falta de
          proteção contra força bruta.
        </div>

        <div v-if="lastResult && !lastResult.error" class="summary-row">
          <span class="hint">
            {{ lastResult.cancelled ? 'Parado manualmente' : 'Concluído' }} — {{ lastResult.totalAttempts }}/{{
              lastResult.totalCredentials
            }}
            tentativas em {{ formatDuration(lastResult.durationMs) }}.
          </span>
          <button class="link-btn" @click="showLogModal = true">Ver log completo</button>
        </div>
        <div v-if="lastResult && lastResult.error" class="banner danger">{{ lastResult.error }}</div>
      </div>
    </div>

    <div class="resize-handle nodrag nowheel nopan" @mousedown="startResize">
      <ResizeGripIcon />
    </div>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showLogModal" class="logs-modal-backdrop" @mousedown.self="showLogModal = false">
          <div class="logs-modal nodrag nowheel nopan">
            <div class="logs-modal-header">
              <span class="logs-modal-title">Log de tentativas — {{ data.name }}</span>
              <div class="logs-modal-header-actions">
                <button class="header-btn" title="Copiar" @click="copyLog">
                  <svg v-if="logCopied" viewBox="0 0 16 16" width="14" height="14">
                    <path d="M3 8.5l3.2 3.2L13 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <svg v-else viewBox="0 0 16 16" width="14" height="14">
                    <rect x="5.5" y="5.5" width="8" height="8" rx="1.3" stroke="currentColor" stroke-width="1.3" fill="none" />
                    <path d="M3.5 10.5V3.5a1 1 0 0 1 1-1h7" stroke="currentColor" stroke-width="1.3" fill="none" />
                  </svg>
                </button>
                <button class="header-btn" title="Fechar (Esc)" @click="showLogModal = false">
                  <svg viewBox="0 0 16 16" width="16" height="16">
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="logs-modal-toolbar">
              <input v-model="logSearch" type="text" class="logs-search" placeholder="Filtrar usuário/senha..." />
            </div>

            <div class="logs-modal-body">
              <div v-if="!filteredAttempts.length" class="logs-empty">Nenhuma tentativa registrada ainda.</div>
              <div
                v-for="a in filteredAttempts"
                :key="a.seq"
                class="log-row"
                :class="{ success: a.success, failed: !a.ok, warn: a.rateLimitSignal }"
              >
                <span class="log-seq">#{{ a.seq }}</span>
                <span class="log-cred">{{ a.user }}:{{ a.pass }}</span>
                <span class="log-status">{{ a.ok ? a.status : 'erro' }}</span>
                <span class="log-latency">{{ a.latencyMs }}ms</span>
                <span v-if="a.success" class="log-tag success">SUCESSO</span>
                <span v-if="a.rateLimitSignal" class="log-tag warn">{{ rateLimitSignalLabel(a.rateLimitSignal) }}</span>
                <span v-if="!a.ok" class="log-tag failed">{{ a.error }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import GearIcon from './icons/GearIcon.vue'
import ResizeGripIcon from './icons/ResizeGripIcon.vue'
import NodeToolbar from './NodeToolbar.vue'
import { toggleNodeSettings, updateNodeData } from '../store/flowStore'
import { useHandleConnection } from '../lib/useHandleConnection'
import { useNodeResize } from '../lib/useNodeResize'
import { runCredentialTest } from '../lib/bridgeClient'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH']

// mesma lista curta do bridge (bridge/credentialTest.js) — duplicada aqui só
// pra mostrar a prévia na aba Credenciais sem precisar de uma ida e volta ao bridge
const QUICK_CREDENTIALS_CLIENT = [
  ['admin', 'admin'],
  ['admin', '123456'],
  ['admin', 'password'],
  ['admin', 'admin123'],
  ['admin', 'senha123'],
  ['administrator', 'admin'],
  ['root', 'root'],
  ['root', 'toor'],
  ['test', 'test'],
  ['qa', 'qa'],
  ['demo', 'demo'],
  ['guest', 'guest'],
  ['user', 'user'],
  ['sa', 'sa'],
  ['postgres', 'postgres']
].map(([user, pass]) => ({ user, pass }))

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const { isHandleConnected } = useHandleConnection(props.id)
const isLeftConnected = isHandleConnected('left')
const isRightConnected = isHandleConnected('right')
const isBottomConnected = isHandleConnected('bottom')

const { nodeWidth, nodeHeight, startResize } = useNodeResize(props, {
  minWidth: 380,
  minHeight: 420,
  defaultWidth: 460,
  defaultHeight: 480
})

function defaultBodyTemplate(ct) {
  return ct === 'form' ? 'user={{user}}&pass={{pass}}' : '{"user":"{{user}}","pass":"{{pass}}"}'
}

const activeTab = ref('target')

const url = ref(props.data.url || '')
const method = ref(props.data.method || 'POST')
const contentType = ref(props.data.contentType || 'json')
const bodyTemplate = ref(props.data.bodyTemplate ?? defaultBodyTemplate(contentType.value))
const headers = ref(
  Array.isArray(props.data.headers) && props.data.headers.length ? props.data.headers : [{ key: '', value: '' }]
)

const credentialsMode = ref(props.data.credentialsMode || 'quick')
const customWordlist = ref(props.data.customWordlist || '')
const fixedUser = ref(props.data.fixedUser || '')

const successType = ref(props.data.successRule?.type || 'status')
const successStatusList = ref(props.data.successRule?.statusList || '200')
const successTextMode = ref(props.data.successRule?.textMode || 'contains')
const successText = ref(props.data.successRule?.text || '')

const delayMs = ref(props.data.delayMs ?? 300)
const concurrency = ref(props.data.concurrency ?? 1)

const running = ref(false)
const showConfirm = ref(false)
const attempts = ref([])
const lastResult = ref(props.data.lastResult || null)
const progressCount = ref(0)
const progressTotal = ref(0)
const showLogModal = ref(false)
const logSearch = ref('')
const logCopied = ref(false)
let logCopiedTimeout = null
let controller = null

function addHeader() {
  headers.value.push({ key: '', value: '' })
  syncData()
}

function removeHeader(index) {
  headers.value.splice(index, 1)
  if (headers.value.length === 0) headers.value.push({ key: '', value: '' })
  syncData()
}

function resetBodyTemplateToDefault() {
  bodyTemplate.value = defaultBodyTemplate(contentType.value)
  syncData()
}

function syncData() {
  updateNodeData(props.id, {
    url: url.value,
    method: method.value,
    contentType: contentType.value,
    bodyTemplate: bodyTemplate.value,
    headers: headers.value,
    credentialsMode: credentialsMode.value,
    customWordlist: customWordlist.value,
    fixedUser: fixedUser.value,
    successRule: {
      type: successType.value,
      statusList: successStatusList.value,
      textMode: successTextMode.value,
      text: successText.value
    },
    delayMs: delayMs.value,
    concurrency: concurrency.value,
    lastResult: lastResult.value
  })
}

function parseCustomCredentialsCount() {
  const lines = customWordlist.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  let count = 0
  for (const line of lines) {
    if (line.includes(':')) count += 1
    else if (fixedUser.value) count += 1
  }
  return count
}

const credentialsCount = computed(() =>
  credentialsMode.value === 'custom' ? parseCustomCredentialsCount() : QUICK_CREDENTIALS_CLIENT.length
)

const canStart = computed(() => Boolean(url.value) && credentialsCount.value > 0 && !running.value)

const statusDotClass = computed(() => {
  if (running.value) return 'pending'
  if (!lastResult.value || lastResult.value.error) return ''
  if (lastResult.value.findings?.length) return 'danger'
  if (!lastResult.value.rateLimit?.detected) return 'warn'
  return 'online'
})

const progressPct = computed(() => (progressTotal.value ? Math.round((progressCount.value / progressTotal.value) * 100) : 0))

const liveFindings = computed(() => {
  if (running.value) return attempts.value.filter((a) => a.ok && a.success)
  return lastResult.value?.findings || []
})

const liveRateLimit = computed(() => {
  if (running.value) {
    const hit = attempts.value.find((a) => a.rateLimitSignal)
    return hit ? { afterAttempts: hit.seq, signal: hit.rateLimitSignal } : null
  }
  return lastResult.value?.rateLimit || null
})

const filteredAttempts = computed(() => {
  const term = logSearch.value.trim().toLowerCase()
  const list = term
    ? attempts.value.filter((a) => `${a.user}:${a.pass}`.toLowerCase().includes(term))
    : attempts.value
  return [...list].sort((a, b) => a.seq - b.seq)
})

function rateLimitSignalLabel(signal) {
  if (!signal) return ''
  if (signal === 'status_429') return 'HTTP 429'
  if (signal === 'latency_spike') return 'aumento de latência'
  if (signal.startsWith('keyword:')) return `texto "${signal.slice(8)}" na resposta`
  return signal
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return ''
  if (ms < 1000) return `${ms}ms`
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes ? `${minutes}m${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

function clickStart() {
  if (!canStart.value) return
  showConfirm.value = true
}

function confirmStart() {
  showConfirm.value = false
  startTest()
}

function startTest() {
  syncData()
  attempts.value = []
  lastResult.value = null
  progressCount.value = 0
  progressTotal.value = credentialsCount.value
  running.value = true
  activeTab.value = 'run'

  controller = runCredentialTest(
    {
      target: {
        url: url.value,
        method: method.value,
        contentType: contentType.value,
        bodyTemplate: bodyTemplate.value,
        headers: headers.value
      },
      credentials: {
        mode: credentialsMode.value,
        customWordlist: customWordlist.value,
        fixedUser: fixedUser.value
      },
      successRule: {
        type: successType.value,
        statusList: successStatusList.value,
        textMode: successTextMode.value,
        text: successText.value
      },
      execution: { delayMs: delayMs.value, concurrency: concurrency.value }
    },
    {
      onProgress: (msg) => {
        attempts.value.push(msg)
        progressCount.value = msg.seq
      },
      onResult: (result) => {
        running.value = false
        controller = null
        lastResult.value = result.error
          ? { error: result.error }
          : {
              cancelled: result.cancelled,
              totalAttempts: result.totalAttempts,
              totalCredentials: result.totalCredentials,
              findings: result.findings,
              rateLimit: result.rateLimit,
              durationMs: result.durationMs
            }
        syncData()
      }
    }
  )
}

function stopTest() {
  controller?.stop()
}

async function copyLog() {
  const text = filteredAttempts.value
    .map((a) => `#${a.seq} ${a.user}:${a.pass} ${a.ok ? a.status : 'erro:' + a.error} ${a.latencyMs}ms${a.success ? ' SUCESSO' : ''}${a.rateLimitSignal ? ' [' + rateLimitSignalLabel(a.rateLimitSignal) + ']' : ''}`)
    .join('\n')
  try {
    await navigator.clipboard.writeText(text)
    logCopied.value = true
    clearTimeout(logCopiedTimeout)
    logCopiedTimeout = setTimeout(() => {
      logCopied.value = false
    }, 1500)
  } catch (err) {
    console.error('[credential-test-node] copy failed', err)
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && showLogModal.value) showLogModal.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  controller?.stop()
  clearTimeout(logCopiedTimeout)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.ct-node {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
}

.ct-node.selected {
  border-color: var(--selected-color);
}

.ct-handle {
  width: 8px;
  height: 8px;
  background: var(--color-border-strong);
  border: 2px solid var(--color-bg-surface);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.ct-handle.connected {
  background: #3b82f6;
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.6);
}

.ct-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: 34px;
  padding: 0 10px;
  background: var(--color-bg-surface-alt);
  border-bottom: 1px solid var(--color-border);
  border-radius: 9px 9px 0 0;
  cursor: grab;
}

.ct-header:active {
  cursor: grabbing;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
  flex-shrink: 0;
}

.status-dot.online {
  background: #22c55e;
}

.status-dot.warn {
  background: #eab308;
}

.status-dot.danger {
  background: #ef4444;
}

.status-dot.pending {
  background: #eab308;
  animation: pulse 1.1s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.ct-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.header-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.tabs-row {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  padding: 6px 8px 0;
}

.tab-btn {
  padding: 5px 10px;
  border: none;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--color-text-secondary);
}

.tab-btn.active {
  background: var(--color-bg-app);
  color: var(--color-text-primary);
  font-weight: 600;
}

.tab-body {
  flex: 1;
  min-height: 0;
  background: var(--color-bg-app);
  overflow-y: auto;
  border-radius: 0 0 9px 9px;
}

.pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.request-row {
  display: flex;
  gap: 6px;
}

.method-select {
  flex-shrink: 0;
  width: 78px;
  height: 28px;
  padding: 0 4px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.url-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 12px;
  font-family: 'Menlo', Consolas, monospace;
}

.url-input:focus,
.method-select:focus,
.inline-select:focus,
.header-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.inline-select {
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
  cursor: pointer;
}

.inline-select.full-width {
  width: 100%;
}

.hint {
  margin: 0;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.hint code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--color-bg-surface-raised);
  font-family: 'Menlo', Consolas, monospace;
}

.detection-note {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.body-editor {
  width: 100%;
  height: 90px;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
  font-family: 'Menlo', Consolas, monospace;
  line-height: 1.5;
  resize: none;
}

.wordlist-editor {
  height: 120px;
}

.body-editor:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.link-btn {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  text-decoration: underline;
  cursor: pointer;
}

.link-btn:hover {
  color: var(--color-text-primary);
}

.headers-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--color-border);
}

.header-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.header-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11px;
  font-family: 'Menlo', Consolas, monospace;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.remove-btn:hover {
  background: var(--color-hover);
  color: #ef4444;
}

.add-header-btn {
  align-self: flex-start;
  margin-top: 2px;
  padding: 4px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11px;
  cursor: pointer;
}

.add-header-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.mode-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--color-text-primary);
  cursor: pointer;
}

.quick-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.quick-pill {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 10.5px;
  font-family: 'Menlo', Consolas, monospace;
}

.custom-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rule-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.exec-controls {
  display: flex;
  gap: 10px;
}

.exec-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10.5px;
  color: var(--color-text-secondary);
}

.exec-field input {
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 11.5px;
}

.start-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: #3b82f6;
  color: #fff;
}

.btn-primary:disabled {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
  cursor: default;
}

.btn-secondary {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
}

.btn-secondary:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.btn-danger {
  background: #ef4444;
  color: #fff;
}

.confirm-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface);
}

.confirm-panel p {
  margin: 0;
  font-size: 11.5px;
  color: var(--color-text-primary);
  word-break: break-all;
}

.confirm-actions {
  display: flex;
  gap: 6px;
}

.progress-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.15s ease;
}

.progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.banner {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.5;
}

.banner.danger {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.banner.warn {
  background: rgba(234, 179, 8, 0.12);
  color: #b45309;
}

.banner.ok {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.finding-row {
  font-family: 'Menlo', Consolas, monospace;
  font-weight: 700;
}

.finding-status {
  font-weight: 400;
  opacity: 0.8;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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

.ct-node:hover .resize-handle {
  opacity: 1;
}

.logs-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.logs-modal {
  display: flex;
  flex-direction: column;
  width: 720px;
  max-width: calc(100vw - 32px);
  height: 560px;
  max-height: calc(100vh - 64px);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 16px 48px var(--color-shadow);
  cursor: default;
}

.logs-modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: 44px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--color-border);
}

.logs-modal-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logs-modal-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.logs-modal-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
}

.logs-search {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 11.5px;
}

.logs-search:focus {
  outline: none;
  border-color: var(--selected-color, #3b82f6);
}

.logs-modal-body {
  flex: 1;
  min-height: 0;
  padding: 6px 10px;
  overflow-y: auto;
  background: var(--color-bg-app);
  border-radius: 0 0 9px 9px;
}

.logs-empty {
  padding: 16px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  text-align: center;
}

.log-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 5px;
  font-size: 11px;
  font-family: 'Menlo', Consolas, monospace;
  color: var(--color-text-secondary);
}

.log-row:hover {
  background: var(--color-hover);
}

.log-row.success {
  color: #16a34a;
}

.log-row.failed {
  color: var(--color-text-tertiary);
}

.log-seq {
  flex-shrink: 0;
  width: 34px;
  color: var(--color-text-tertiary);
}

.log-cred {
  flex-shrink: 0;
  width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-status {
  flex-shrink: 0;
  width: 40px;
}

.log-latency {
  flex-shrink: 0;
  width: 56px;
  color: var(--color-text-tertiary);
}

.log-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
}

.log-tag.success {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.log-tag.warn {
  background: rgba(234, 179, 8, 0.15);
  color: #b45309;
}

.log-tag.failed {
  background: rgba(148, 163, 184, 0.15);
  color: var(--color-text-tertiary);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.15s ease;
}

.modal-fade-enter-active .logs-modal,
.modal-fade-leave-active .logs-modal {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .logs-modal,
.modal-fade-leave-to .logs-modal {
  opacity: 0;
  transform: scale(0.96) translateY(6px);
}
</style>
