<template>
  <svg v-if="icon === 'done'" viewBox="0 0 16 16" width="16" height="16">
    <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4" />
    <path d="M5.3 8.2l1.8 1.8 3.4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  </svg>
  <svg v-else-if="icon === 'review'" viewBox="0 0 16 16" width="16" height="16">
    <path d="M4 2.5v11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    <path d="M4 3h7l-1.6 2L11 7H4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none" />
  </svg>
  <svg v-else-if="icon === 'process'" viewBox="0 0 16 16" width="16" height="16">
    <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4" />
    <path d="M8 4.6v3.7l2.4 1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none" />
  </svg>
  <svg v-else viewBox="0 0 16 16" width="16" height="16">
    <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4" />
  </svg>
</template>

<script setup>
defineProps({
  icon: { type: String, default: 'todo' }
})
</script>
