<template>
  <button
    v-if="hasMultipleProfiles && profile"
    ref="chipRef"
    class="profile-chip nodrag"
    :class="{ open, warn: !profile.loggedIn }"
    :title="`Conta Claude: ${profile.name}${profile.email ? ` (${profile.email})` : ''}`"
    @click.stop="toggle"
  >
    <span class="profile-dot" :style="{ background: colorFor(profile.id) }" />
    <span class="profile-name">{{ profile.name }}</span>
    <svg viewBox="0 0 10 10" width="8" height="8"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </button>

  <Teleport to="body">
    <div v-if="open" ref="menuRef" class="profile-menu" :style="menuStyle" @mousedown.stop>
      <div class="menu-title">Trocar conta deste terminal</div>
      <button
        v-for="p in claudeProfiles"
        :key="p.id"
        class="menu-item"
        :class="{ active: p.id === profile.id }"
        @click="choose(p.id)"
      >
        <span class="profile-dot" :style="{ background: colorFor(p.id) }" />
        <span class="menu-item-text">
          <span class="menu-item-name">
            {{ p.name }}
            <span v-if="planLabel(p)" class="menu-plan">{{ planLabel(p) }}</span>
          </span>
          <span class="menu-item-sub">{{ p.loggedIn ? p.email || 'Conectado' : 'Sem login — faz login ao abrir' }}</span>
        </span>
        <span v-if="usageByProfile[p.id]?.session" class="menu-usage" :class="severity(usageByProfile[p.id].session.percent)">
          {{ usageByProfile[p.id].session.percent }}%
        </span>
      </button>
      <p class="menu-hint">Trocar reinicia a sessão — a conversa atual fica no histórico da conta anterior.</p>
      <button class="menu-manage" @click="manage">Gerenciar contas…</button>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  claudeProfiles,
  hasMultipleProfiles,
  planLabel,
  resolveClaudeProfile,
  usageByProfile
} from '../store/claudeProfilesStore'
import { profileColor } from '../lib/claudeProfileColors'
import { openSettings } from '../store/themeStore'

const props = defineProps({
  profileId: { type: String, default: null }
})
const emit = defineEmits(['change'])

const profile = computed(() => resolveClaudeProfile(props.profileId))
const open = ref(false)
const chipRef = ref(null)
const menuRef = ref(null)
const menuStyle = ref({})

function colorFor(id) {
  return profileColor(id, claudeProfiles.value)
}

function severity(percent) {
  if (percent >= 90) return 'danger'
  if (percent >= 70) return 'warn'
  return ''
}

function onOutside(event) {
  if (menuRef.value?.contains(event.target) || chipRef.value?.contains(event.target)) return
  close()
}

function onKey(event) {
  if (event.key === 'Escape') close()
}

async function toggle() {
  if (open.value) return close()
  const rect = chipRef.value.getBoundingClientRect()
  menuStyle.value = { top: `${rect.bottom + 6}px`, left: `${Math.max(8, rect.right - 260)}px` }
  open.value = true
  await nextTick()
  window.addEventListener('mousedown', onOutside, true)
  window.addEventListener('keydown', onKey, true)
}

function close() {
  open.value = false
  window.removeEventListener('mousedown', onOutside, true)
  window.removeEventListener('keydown', onKey, true)
}

function choose(id) {
  close()
  if (id !== profile.value?.id) emit('change', id)
}

function manage() {
  close()
  openSettings('claude')
}

onBeforeUnmount(close)
</script>

<style scoped>
.profile-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 140px;
  flex-shrink: 1;
  min-width: 0;
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}

.profile-chip:hover,
.profile-chip.open {
  color: var(--color-text-primary);
  border-color: var(--color-text-tertiary);
}

.profile-chip.warn {
  border-color: #d97706;
}

.profile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
}

.profile-menu {
  position: fixed;
  z-index: 2000;
  width: 260px;
  padding: 6px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 12px 32px var(--color-shadow);
  color: var(--color-text-primary);
}

.menu-title {
  padding: 4px 8px 6px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--color-hover);
}

.menu-item.active {
  background: rgb(59 130 246 / 0.12);
}

.menu-item-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.menu-item-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}

.menu-plan {
  padding: 0 5px;
  border-radius: 4px;
  background: var(--color-bg-surface-raised);
  color: var(--color-text-secondary);
  font-size: 9.5px;
  font-weight: 600;
  line-height: 15px;
}

.menu-item-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.menu-usage {
  font-size: 10.5px;
  font-weight: 600;
  color: #10b981;
  font-variant-numeric: tabular-nums;
}

.menu-usage.warn {
  color: #d97706;
}

.menu-usage.danger {
  color: #ef4444;
}

.menu-hint {
  margin: 6px 8px;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--color-text-tertiary);
}

.menu-manage {
  width: 100%;
  height: 28px;
  border: none;
  border-top: 1px solid var(--color-border);
  border-radius: 0 0 6px 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11.5px;
  cursor: pointer;
}

.menu-manage:hover {
  color: var(--color-text-primary);
  background: var(--color-hover);
}
</style>
