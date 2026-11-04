<template>
  <SettingsGroup title="Sincronização">
    <div v-if="isAuthenticated" class="account-profile">
      <img v-if="user?.avatar" class="account-avatar" :src="user.avatar" alt="" />
      <div v-else class="account-avatar account-avatar-fallback">
        {{ (user?.firstname || '?').charAt(0).toUpperCase() }}
      </div>
      <div class="account-info">
        <span class="account-name">{{ [user?.firstname, user?.lastname].filter(Boolean).join(' ') || 'Conectado' }}</span>
        <span class="account-email">{{ user?.email }}</span>
      </div>
      <button class="st-btn" @click="logout">Sair</button>
    </div>
    <div v-else class="account-empty">
      <p class="st-hint">Conecte sua conta Google pra sincronizar workspaces entre máquinas.</p>
      <button class="st-btn st-btn--primary" @click="login">Entrar com Google</button>
    </div>
  </SettingsGroup>
</template>

<script setup>
import { isAuthenticated, user, login, logout } from '../../store/authStore'
import SettingsGroup from './SettingsGroup.vue'
</script>

<style scoped>
.account-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
}

.account-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
}

.account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.account-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.account-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.account-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-email {
  font-size: 11.5px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
