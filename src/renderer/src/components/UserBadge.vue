<template>
  <div v-if="isAuthenticated" class="user-badge">
    <div class="badge-anchor" @mouseenter="showTooltip = true" @mouseleave="showTooltip = false">
      <img v-if="user?.avatar" class="badge-avatar" :src="user.avatar" alt="" />
      <div v-else class="badge-avatar badge-avatar-fallback">
        {{ (user?.firstname || '?').charAt(0).toUpperCase() }}
      </div>
      <span class="badge-online-dot" />

      <Transition name="tooltip-fade">
        <div v-if="showTooltip" class="badge-tooltip">
          <span class="tooltip-name">{{ fullName }}</span>
          <span class="tooltip-email">{{ user?.email }}</span>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { isAuthenticated, user } from '../store/authStore'

const showTooltip = ref(false)

const fullName = computed(() => [user.value?.firstname, user.value?.lastname].filter(Boolean).join(' ') || 'Conectado')
</script>

<style scoped>
.user-badge {
  pointer-events: none;
}

.badge-anchor {
  position: relative;
  pointer-events: auto;
  width: 36px;
  height: 36px;
}

.badge-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #22c55e;
  box-shadow: 0 2px 8px var(--color-shadow);
  display: block;
}

.badge-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3b82f6;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.badge-online-dot {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #22c55e;
  border: 2px solid var(--color-bg-surface-alt);
}

.badge-tooltip {
  position: absolute;
  top: 44px;
  left: 0;
  z-index: 31;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 12px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: 0 8px 24px var(--color-shadow);
  white-space: nowrap;
}

.tooltip-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.tooltip-email {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.12s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
}
</style>
