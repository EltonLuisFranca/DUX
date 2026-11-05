<template>
  <article class="account-card" :style="{ '--profile-color': color }">
    <header class="card-head">
      <span class="profile-avatar">{{ initial }}</span>
      <div class="card-identity">
        <div class="card-title-row">
          <input
            v-if="renaming"
            ref="renameInput"
            v-model="renameDraft"
            class="st-input rename-input"
            maxlength="40"
            @keydown.enter="saveRename"
            @keydown.esc.stop="renaming = false"
            @blur="saveRename"
          />
          <span v-else class="card-name" :title="profile.configDir">{{ profile.name }}</span>
          <span v-if="plan" class="badge">{{ plan }}</span>
          <span v-if="profile.isDefault" class="badge badge--muted">Padrão</span>
        </div>
        <span class="card-sub">
          <template v-if="profile.loggedIn">
            {{ profile.email || 'Conectado' }}<template v-if="profile.organization"> · {{ profile.organization }}</template>
          </template>
          <template v-else>Sem login</template>
        </span>
      </div>
      <div class="card-tools">
        <button
          v-if="profile.loggedIn"
          class="icon-btn"
          title="Atualizar uso agora"
          :class="{ spinning: refreshing }"
          @click="refresh"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
          </svg>
        </button>
        <button class="icon-btn" title="Renomear" @click="startRename">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
            <path d="M10.8 2.7l2.5 2.5-7.6 7.6-3.2.7.7-3.2z" />
          </svg>
        </button>
        <button v-if="!profile.isDefault" class="icon-btn icon-btn--danger" title="Remover conta" @click="confirmingDelete = true">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
          </svg>
        </button>
      </div>
    </header>

    <div v-if="!profile.loggedIn" class="card-empty">
      <p>Abra um terminal nesta conta e siga o login do Claude Code (ou rode <code>/login</code>). Assim que concluir, o uso aparece aqui.</p>
      <button class="st-btn st-btn--primary" @click="$emit('open-terminal')">Fazer login</button>
    </div>

    <template v-else>
      <div v-if="sharedWith" class="card-banner warn">
        <span>
          Este login é da mesma conta de {{ sharedWith }}, então o uso e a licença são os mesmos. Para separar, abra um
          terminal aqui, rode <code>/login</code> e entre com a outra conta no navegador.
        </span>
        <button class="st-btn st-btn--small" @click="$emit('open-terminal')">Abrir terminal</button>
      </div>

      <div v-if="banner" class="card-banner" :class="banner.kind">
        <span>{{ banner.text }}</span>
        <button v-if="banner.action" class="st-btn st-btn--small" @click="$emit('open-terminal')">{{ banner.action }}</button>
      </div>

      <div v-if="usage?.session || usage?.week" class="meters">
        <UsageMeter v-if="usage.session" label="Sessão · 5h" :data="usage.session" :stale="stale" />
        <UsageMeter v-if="usage.week" label="Semana · 7 dias" :data="usage.week" :stale="stale" />
        <UsageMeter v-if="usage.weekOpus" label="Semana · Opus" :data="usage.weekOpus" :stale="stale" />
        <UsageMeter v-if="usage.weekSonnet" label="Semana · Sonnet" :data="usage.weekSonnet" :stale="stale" />
      </div>
      <p v-else-if="!banner" class="card-loading">Carregando uso…</p>

      <div v-if="breakdown.length" class="breakdown" :class="{ stale }">
        <span class="detail-label">Onde a semana foi gasta</span>
        <div class="breakdown-bar">
          <span
            v-for="(row, i) in breakdown"
            :key="row.key"
            class="breakdown-seg"
            :style="{ width: `${row.percent}%`, background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }"
            :title="`${row.label}: ${row.percent}%`"
          />
        </div>
        <div class="breakdown-legend">
          <span v-for="(row, i) in breakdown" :key="row.key" class="legend-item">
            <span class="legend-dot" :style="{ background: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }" />
            {{ row.label }} <b>{{ row.percent }}%</b>
          </span>
        </div>
      </div>

      <div v-if="usage?.extra" class="extra-row">
        <span class="detail-label">Créditos extras</span>
        <span class="extra-value">
          <template v-if="usage.extra.enabled">
            {{ formatMoney(usage.extra.used, usage.extra.currency, usage.extra.decimals) }} de
            {{ formatMoney(usage.extra.limit, usage.extra.currency, usage.extra.decimals) }} no mês
          </template>
          <template v-else>Desativados</template>
        </span>
      </div>
    </template>

    <footer v-if="confirmingDelete" class="card-foot card-foot--confirm">
      <span>
        Remover "{{ profile.name }}"? Apaga o login e o histórico de conversas desta conta.<template v-if="terminalCount">
          {{ terminalCount === 1 ? 'O terminal que usa ela volta' : `Os ${terminalCount} terminais que usam ela voltam` }} pra
          conta padrão.</template
        >
      </span>
      <div class="foot-actions">
        <button class="st-btn st-btn--small" @click="confirmingDelete = false">Cancelar</button>
        <button class="st-btn st-btn--small st-btn--danger" :disabled="deleting" @click="remove">Remover</button>
      </div>
    </footer>
    <footer v-else class="card-foot">
      <span class="foot-meta">
        <template v-if="updatedAgo">Atualizado {{ updatedAgo }}</template>
        <template v-if="updatedAgo && terminalCount"> · </template>
        <template v-if="terminalCount">{{ terminalCount }} terminal{{ terminalCount === 1 ? '' : 'is' }} usando</template>
      </span>
      <button v-if="profile.loggedIn" class="st-btn st-btn--small" @click="$emit('open-terminal')">Abrir terminal</button>
    </footer>
    <p v-if="error" class="card-error">{{ error }}</p>
  </article>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import {
  claudeProfiles,
  deleteClaudeProfile,
  planLabel,
  refreshClaudeUsage,
  renameClaudeProfile,
  usageByProfile
} from '../../store/claudeProfilesStore'
import { formatAgo, formatMoney } from '../../lib/claudeUsageFormat'
import UsageMeter from './UsageMeter.vue'

const props = defineProps({
  profile: { type: Object, required: true },
  color: { type: String, required: true },
  terminalCount: { type: Number, default: 0 },
  now: { type: Number, required: true }
})
defineEmits(['open-terminal'])

const BREAKDOWN_COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#71717a']

const usage = computed(() => usageByProfile.value[props.profile.id] || null)
const plan = computed(() => planLabel(props.profile))
const initial = computed(() => (props.profile.name || '?').charAt(0).toUpperCase())
const updatedAgo = computed(() => formatAgo(usage.value?.fetchedAt, props.now))
const breakdown = computed(() => (usage.value?.breakdown || []).filter((r) => r.percent > 0))

// Pastas de perfil separadas não garantem contas separadas: o que vale é o dono
// do token, confirmado pelo bridge no servidor.
const sharedWith = computed(() => {
  const uuid = props.profile.accountUuid
  if (!uuid) return null
  const names = claudeProfiles.value
    .filter((p) => p.id !== props.profile.id && p.accountUuid === uuid)
    .map((p) => `"${p.name}"`)
  return names.length ? names.join(', ') : null
})

// Dado guardado de um poll anterior — mostrado esmaecido quando o atual falhou
const stale = computed(() => !!usage.value?.error && usage.value.error !== 'no-auth')

const banner = computed(() => {
  const err = usage.value?.error
  if (!err || err === 'no-auth') return null
  if (err === 'expired') {
    return {
      kind: 'warn',
      text: updatedAgo.value
        ? `Login parado (última leitura ${updatedAgo.value}). Abrir um terminal nesta conta renova o acesso.`
        : 'Login parado. Abrir um terminal nesta conta renova o acesso.',
      action: 'Abrir terminal'
    }
  }
  if (err === 'unauthorized') {
    return { kind: 'danger', text: 'Login inválido ou revogado. Faça login de novo com /login.', action: 'Abrir terminal' }
  }
  if (err === 'rate-limited') {
    return { kind: 'muted', text: 'A consulta de uso foi limitada por alguns minutos. Mostrando o último valor.' }
  }
  return { kind: 'muted', text: 'Não foi possível atualizar agora. Mostrando o último valor.' }
})

const refreshing = ref(false)
function refresh() {
  refreshing.value = true
  refreshClaudeUsage(props.profile.id)
  setTimeout(() => (refreshing.value = false), 900)
}

const renaming = ref(false)
const renameDraft = ref('')
const renameInput = ref(null)
const error = ref(null)

async function startRename() {
  renameDraft.value = props.profile.name
  renaming.value = true
  await nextTick()
  renameInput.value?.select()
}

async function saveRename() {
  if (!renaming.value) return
  renaming.value = false
  const name = renameDraft.value.trim()
  if (!name || name === props.profile.name) return
  const res = await renameClaudeProfile(props.profile.id, name)
  error.value = res.ok ? null : res.error
}

const confirmingDelete = ref(false)
const deleting = ref(false)
async function remove() {
  deleting.value = true
  const res = await deleteClaudeProfile(props.profile.id)
  deleting.value = false
  if (!res.ok) {
    error.value = res.error
    confirmingDelete.value = false
  }
}
</script>

<style scoped>
.account-card {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 12px 12px 14px;
}

.profile-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 9px;
  background: color-mix(in srgb, var(--profile-color) 18%, transparent);
  color: var(--profile-color);
  font-size: 14px;
  font-weight: 700;
}

.card-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.card-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.rename-input {
  height: 24px;
  max-width: 180px;
}

.badge {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--profile-color) 16%, transparent);
  color: var(--profile-color);
  font-size: 10px;
  font-weight: 650;
  line-height: 17px;
}

.badge--muted {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-tertiary);
}

.card-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--color-text-tertiary);
}

.card-tools {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.icon-btn--danger:hover {
  color: #ef4444;
}

.icon-btn.spinning svg {
  animation: spin 0.9s linear;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.card-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 0 14px 14px 57px;
}

.card-empty p {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.card-empty code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--color-bg-surface-raised);
  font-size: 11px;
}

.card-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 14px 12px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.45;
}

.card-banner span {
  flex: 1;
}

.card-banner code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--color-bg-surface-raised);
  font-size: 11px;
}

.card-banner.warn {
  background: rgb(217 119 6 / 0.12);
  color: #d97706;
}

.card-banner.danger {
  background: rgb(239 68 68 / 0.12);
  color: #ef4444;
}

.card-banner.muted {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
}

.meters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px 18px;
  padding: 2px 14px 14px;
}

.card-loading {
  margin: 0;
  padding: 0 14px 14px;
  font-size: 11.5px;
  color: var(--color-text-tertiary);
}

.detail-label {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.breakdown {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 14px 14px;
}

.breakdown.stale {
  opacity: 0.55;
}

.breakdown-bar {
  display: flex;
  gap: 2px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
}

.breakdown-seg {
  min-width: 3px;
  height: 100%;
}

.breakdown-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.legend-item b {
  font-weight: 600;
  color: var(--color-text-primary);
}

.legend-dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}

.extra-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 0 14px 12px;
}

.extra-value {
  font-size: 11.5px;
  color: var(--color-text-secondary);
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 40px;
  padding: 6px 10px 6px 14px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-surface-alt);
}

.card-foot--confirm {
  background: rgb(239 68 68 / 0.08);
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--color-text-primary);
}

.foot-meta {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.foot-actions {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}

.card-error {
  margin: 0;
  padding: 6px 14px 10px;
  font-size: 11.5px;
  color: #ef4444;
}
</style>
