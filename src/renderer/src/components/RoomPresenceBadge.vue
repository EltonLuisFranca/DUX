<template>
  <div v-if="presenceMembers.length" class="presence-badge">
    <div
      v-for="member in presenceMembers"
      :key="member.id"
      class="presence-avatar"
      :style="{ borderColor: member.color }"
      :title="member.name"
    >
      <img v-if="member.avatar" :src="member.avatar" alt="" />
      <span v-else>{{ (member.name || '?').charAt(0).toUpperCase() }}</span>
    </div>
  </div>
</template>

<script setup>
import { presenceMembers } from '../store/roomStore'
</script>

<style scoped>
.presence-badge {
  display: flex;
  align-items: center;
}

.presence-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: -8px;
  border-radius: 50%;
  border: 2px solid;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-primary);
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 2px 6px var(--color-shadow);
  overflow: hidden;
}

.presence-avatar:first-child {
  margin-left: 0;
}

.presence-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
