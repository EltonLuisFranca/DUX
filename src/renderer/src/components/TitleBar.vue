<template>
  <div class="titlebar">
    <!-- esquerda: marca + workspace -->
    <div class="tb-left">
      <svg class="brand-mark" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
        <rect x="2" y="2" width="6" height="8" rx="1.6" fill="currentColor" />
        <rect x="2" y="12" width="6" height="10" rx="1.6" fill="currentColor" />
        <path d="M11 3l9 9-9 9" fill="none" stroke="var(--color-accent)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="brand-word">DUX</span>
      <span class="brand-sep">/</span>

      <div ref="wsRef" class="ws-dd">
        <button class="ws-btn" @click="wsOpen = !wsOpen">
          {{ activeWorkspace?.name || 'Workspace' }}
          <svg class="ws-chev" :class="{ open: wsOpen }" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
        </button>
        <ul v-if="wsOpen" class="ws-menu">
          <li
            v-for="ws in workspaces"
            :key="ws.id"
            class="ws-opt"
            :class="{ active: ws.id === activeWorkspaceId }"
            @click="pickWorkspace(ws.id)"
          >
            <span class="ws-opt-dot" :class="{ on: ws.id === activeWorkspaceId }" />
            <span class="ws-opt-name">{{ ws.name }}</span>
          </li>
          <li class="ws-div" />
          <li class="ws-opt ws-new" @click="createNew">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
            Novo workspace
          </li>
        </ul>
      </div>
    </div>

    <!-- centro: busca / command bar -->
    <button class="tb-search" aria-label="Buscar e executar comandos" @click="openCommandBar">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      <span class="tb-search-text">Buscar nodes, arquivos ou executar um comando…</span>
      <kbd class="tb-kbd">Ctrl K</kbd>
    </button>

    <!-- direita: uso + presença + controles -->
    <div class="tb-right">
      <TitleUsage />
      <RoomPresenceBadge />
      <div class="traffic-lights">
        <button class="light minimize" aria-label="Minimizar" @click="minimize" />
        <button class="light maximize" aria-label="Maximizar" @click="maximize" />
        <button class="light close" aria-label="Fechar" @click="close" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { workspaces, activeWorkspaceId, switchWorkspace, createWorkspace } from '../store/flowStore'
import { openCommandBar } from '../store/uiStore'
import TitleUsage from './TitleUsage.vue'
import RoomPresenceBadge from './RoomPresenceBadge.vue'

defineProps({
  title: { type: String, default: '' }
})

const wsOpen = ref(false)
const wsRef = ref(null)

const activeWorkspace = computed(() => workspaces.value.find((w) => w.id === activeWorkspaceId.value))

function pickWorkspace(id) {
  switchWorkspace(id)
  wsOpen.value = false
}

function createNew() {
  switchWorkspace(createWorkspace())
  wsOpen.value = false
}

function onClickOutside(event) {
  if (wsRef.value && !wsRef.value.contains(event.target)) wsOpen.value = false
}
onMounted(() => document.addEventListener('mousedown', onClickOutside, { capture: true }))
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside, { capture: true }))

const close = () => window.windowControls?.close()
const minimize = () => window.windowControls?.minimize()
const maximize = () => window.windowControls?.maximize()
</script>

<style scoped>
.titlebar {
  position: relative;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px 0 12px;
  flex-shrink: 0;
  background: var(--color-bg-surface-alt);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

/* ——— esquerda ——— */
.tb-left {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.brand-mark {
  display: block;
}

.brand-word {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--color-text-primary);
}

.brand-sep {
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.ws-dd {
  position: relative;
}

.ws-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.ws-btn:hover {
  background: var(--color-hover);
}

.ws-chev {
  color: var(--color-text-tertiary);
  transition: transform 0.15s ease;
}

.ws-chev.open {
  transform: rotate(180deg);
}

.ws-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  list-style: none;
  margin: 0;
  padding: 4px;
  width: 220px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 12px 32px var(--color-shadow);
  z-index: 40;
}

.ws-opt {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.ws-opt:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.ws-opt.active {
  color: var(--color-text-primary);
  font-weight: 600;
}

.ws-opt-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-border-strong);
  flex-shrink: 0;
}

.ws-opt-dot.on {
  background: var(--color-accent);
}

.ws-opt-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-div {
  height: 1px;
  margin: 4px 2px;
  background: var(--color-border);
}

.ws-new {
  color: var(--color-text-secondary);
}

/* ——— centro: busca ——— */
.tb-search {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 9px;
  width: 440px;
  max-width: 38vw;
  height: 30px;
  padding: 0 8px 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-surface);
  color: var(--color-text-tertiary);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.tb-search:hover {
  border-color: var(--color-border-strong);
  background: var(--color-bg-surface-raised);
}

.tb-search-text {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-kbd {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--color-text-secondary);
  background: var(--color-bg-surface-raised);
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  padding: 1px 6px;
}

/* ——— direita ——— */
.tb-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin-left: auto;
  -webkit-app-region: no-drag;
}

.traffic-lights {
  display: flex;
  gap: 8px;
  padding-left: 2px;
}

.light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: filter 0.1s ease;
}

.light.close {
  background: #ff5f57;
}

.light.minimize {
  background: #febc2e;
}

.light.maximize {
  background: #28c840;
}

.light:hover {
  filter: brightness(1.15);
}
</style>
