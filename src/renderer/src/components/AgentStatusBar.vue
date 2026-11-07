<template>
  <div class="agent-status-bar">
    <AppTooltip :label="workingTooltip" placement="top">
      <button class="status-item tone-working" :class="{ empty: !workingAgentIds.length, pulsing: workingAgentIds.length }" @click="goTo('working')">
        <span class="dot" />
        {{ workingAgentIds.length }} trabalhando
      </button>
    </AppTooltip>
    <AppTooltip :label="waitingTooltip" placement="top">
      <button class="status-item tone-waiting" :class="{ empty: !waitingAgentIds.length, pulsing: waitingAgentIds.length }" @click="goTo('waiting')">
        <span class="dot" />
        {{ waitingAgentIds.length }} aguardando
      </button>
    </AppTooltip>
    <AppTooltip :label="bridgeTooltip" placement="top">
      <span class="status-item" :class="bridgeTone">
        <span class="dot" />
        {{ bridgeLabel }}
      </span>
    </AppTooltip>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AppTooltip from './AppTooltip.vue'
import { agentStatuses, workingAgentIds, waitingAgentIds, requestNodeFocus } from '../store/agentStatusStore'
import { bridgeState } from '../store/bridgeStatusStore'
import { workspaces, activeWorkspaceId, switchWorkspace } from '../store/flowStore'

// Rodapé com o resumo do app inteiro (todos os workspaces): quantos agentes
// estão trabalhando, quantos esperando o usuário e se o bridge está de pé.
// Clicar em trabalhando/aguardando leva até o agente — em sequência, um por
// clique, se houver vários — trocando de workspace se precisar.

function names(ids) {
  return ids.map((id) => agentStatuses.get(id)?.name || 'Agente').join(', ')
}

const workingTooltip = computed(() =>
  workingAgentIds.value.length ? `Trabalhando: ${names(workingAgentIds.value)}` : 'Nenhum agente trabalhando agora'
)
const waitingTooltip = computed(() =>
  waitingAgentIds.value.length ? `Esperando você: ${names(waitingAgentIds.value)}` : 'Nenhum agente esperando você'
)

const bridgeLabel = computed(
  () => ({ online: 'bridge ok', connecting: 'bridge conectando…', offline: 'bridge fora do ar' })[bridgeState.value]
)
const bridgeTone = computed(() => ({ online: 'tone-ok', connecting: 'tone-waiting', offline: 'tone-error' })[bridgeState.value])
const bridgeTooltip = computed(() =>
  bridgeState.value === 'online'
    ? 'O bridge (terminais, git, notas) está respondendo em 127.0.0.1:4577'
    : 'Sem resposta do bridge em 127.0.0.1:4577 — terminais, git e notas não funcionam até ele voltar'
)

const cursor = { working: 0, waiting: 0 }

function goTo(state) {
  const ids = state === 'working' ? workingAgentIds.value : waitingAgentIds.value
  if (!ids.length) return
  const nodeId = ids[cursor[state]++ % ids.length]
  const ws = workspaces.value.find((w) => w.nodes.some((n) => n.id === nodeId))
  if (ws && ws.id !== activeWorkspaceId.value) switchWorkspace(ws.id)
  requestNodeFocus(nodeId)
}
</script>

<style scoped>
.agent-status-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  padding: 0 4px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-bg-surface);
  box-shadow: 0 4px 16px var(--color-shadow);
}

.status-item {
  --tone: var(--color-text-tertiary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 9px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
}

button.status-item {
  cursor: pointer;
}

button.status-item:hover:not(.empty) {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

button.status-item.empty {
  cursor: default;
  color: var(--color-text-tertiary);
}

.tone-working {
  --tone: var(--color-status-working);
}
.tone-waiting {
  --tone: var(--color-status-waiting);
}
.tone-ok {
  --tone: var(--color-status-ok);
}
.tone-error {
  --tone: var(--color-status-error);
}

.dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--tone);
}

.empty .dot {
  background: var(--color-text-tertiary);
  opacity: 0.5;
}

.pulsing .dot {
  animation: status-pulse 1.4s ease-in-out infinite;
}

@keyframes status-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--tone) 55%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--tone) 0%, transparent);
  }
}
</style>
