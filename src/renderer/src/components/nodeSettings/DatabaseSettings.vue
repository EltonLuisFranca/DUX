<template>
  <div class="field">
    <label class="field-label" for="db-name">Nome do node</label>
    <input
      id="db-name"
      class="field-input"
      type="text"
      :value="node.data.name"
      @input="updateNodeData(node.id, { name: $event.target.value })"
    />
  </div>

  <div class="field">
    <label class="field-label" for="db-engine">Banco</label>
    <select id="db-engine" class="field-input" :value="node.data.engine" @change="onEngineChange($event.target.value)">
      <option value="postgres">PostgreSQL</option>
      <option value="mysql">MySQL / MariaDB</option>
    </select>
  </div>

  <div class="field-row">
    <div class="field grow">
      <label class="field-label" for="db-host">Host</label>
      <input
        id="db-host"
        class="field-input"
        type="text"
        placeholder="localhost"
        :value="node.data.host"
        @input="updateNodeData(node.id, { host: $event.target.value })"
      />
    </div>
    <div class="field port">
      <label class="field-label" for="db-port">Porta</label>
      <input
        id="db-port"
        class="field-input"
        type="number"
        :value="node.data.port"
        @input="updateNodeData(node.id, { port: Number($event.target.value) || null })"
      />
    </div>
  </div>

  <div class="field">
    <label class="field-label" for="db-user">Usuário</label>
    <input
      id="db-user"
      class="field-input"
      type="text"
      :value="node.data.user"
      @input="updateNodeData(node.id, { user: $event.target.value })"
    />
  </div>

  <div class="field">
    <label class="field-label" for="db-password">
      Senha
      <span class="vault-tag" :class="{ saved: credentialSaved }">
        {{ credentialSaved ? 'salva localmente' : 'não salva' }}
      </span>
    </label>
    <input
      id="db-password"
      class="field-input"
      type="password"
      :placeholder="credentialSaved ? '•••••••• (guardada no cofre)' : 'senha do banco'"
      v-model="password"
    />
    <span class="field-hint">
      Fica só nesta máquina (<code>~/.dux</code>, chmod 600). Nunca sincroniza pro servidor junto com o workspace.
    </span>
  </div>

  <div class="field">
    <label class="field-label" for="db-database">Database</label>
    <input
      id="db-database"
      class="field-input"
      type="text"
      :value="node.data.database"
      @input="updateNodeData(node.id, { database: $event.target.value })"
    />
  </div>

  <label class="field-check">
    <input type="checkbox" :checked="node.data.ssl" @change="updateNodeData(node.id, { ssl: $event.target.checked })" />
    Usar SSL/TLS
  </label>

  <div class="field-actions">
    <button class="btn" :disabled="busy" @click="saveCredential">Salvar senha</button>
    <button class="btn primary" :disabled="busy" @click="testConnection">
      {{ busy ? 'Testando…' : 'Testar conexão' }}
    </button>
  </div>

  <div v-if="testResult" class="test-result" :class="testResult.ok ? 'ok' : 'err'">
    <span v-if="testResult.ok">✓ Conectado{{ testResult.version ? ' — ' + shortVersion(testResult.version) : '' }}</span>
    <span v-else>✗ {{ testResult.error || 'falha ao conectar' }}</span>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { updateNodeData } from '../../store/flowStore'
import { dbTestConnection, dbSaveCredential, dbCredentialStatus } from '../../lib/bridgeClient'

const props = defineProps({
  node: { type: Object, required: true }
})

const password = ref('')
const credentialSaved = ref(false)
const busy = ref(false)
const testResult = ref(null)

const DEFAULT_PORTS = { postgres: 5432, mysql: 3306 }

onMounted(async () => {
  const status = await dbCredentialStatus(props.node.data.connectionId)
  credentialSaved.value = Boolean(status.exists)
})

// Troca a porta junto com o engine só quando ela ainda está no default do
// outro banco — assim quem já pôs uma porta custom não a perde.
function onEngineChange(engine) {
  const patch = { engine }
  const current = Number(props.node.data.port)
  if (current === DEFAULT_PORTS.postgres || current === DEFAULT_PORTS.mysql || !current) {
    patch.port = DEFAULT_PORTS[engine]
  }
  updateNodeData(props.node.id, patch)
}

// config sem segredo: só o que pode trafegar/sincronizar. A senha vai à parte
// (inline no teste, ou resolvida pelo cofre no bridge).
function buildConfig() {
  const d = props.node.data
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

async function saveCredential() {
  busy.value = true
  testResult.value = null
  const result = await dbSaveCredential(props.node.data.connectionId, password.value)
  busy.value = false
  if (result.ok) {
    credentialSaved.value = Boolean(password.value)
    password.value = ''
  } else {
    testResult.value = { ok: false, error: result.error || 'falha ao salvar senha' }
  }
}

async function testConnection() {
  busy.value = true
  testResult.value = null
  // senha digitada agora vence o cofre; vazia => usa a salva
  const inline = password.value ? password.value : undefined
  testResult.value = await dbTestConnection(buildConfig(), inline)
  busy.value = false
}

function shortVersion(v) {
  return String(v).split(/\s+/).slice(0, 2).join(' ')
}
</script>

<style scoped>
.field {
  margin-bottom: 16px;
}

.field-row {
  display: flex;
  gap: 8px;
}

.field-row .grow {
  flex: 1;
}

.field-row .port {
  width: 84px;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.field-input {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  box-sizing: border-box;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  color: var(--color-text-primary);
  font-size: 12px;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-text-secondary);
}

.field-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.field-hint {
  display: block;
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

.field-hint code {
  font-family: 'Menlo', Consolas, monospace;
}

.vault-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9.5px;
  background: color-mix(in srgb, var(--color-text-tertiary) 20%, transparent);
  color: var(--color-text-tertiary);
}

.vault-tag.saved {
  background: color-mix(in srgb, #22c55e 22%, transparent);
  color: #22c55e;
}

.field-actions {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: 12px;
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  border-color: var(--color-text-secondary);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn.primary {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.test-result {
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  word-break: break-word;
}

.test-result.ok {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  color: #22c55e;
}

.test-result.err {
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: #ef4444;
}
</style>
