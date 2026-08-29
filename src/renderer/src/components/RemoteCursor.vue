<template>
  <div class="remote-cursor" :style="{ transform: `translate(${x}px, ${y}px)`, color }">
    <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
      <path d="M4 2l12 6-5 1.5L9 15z" stroke="var(--color-bg-app)" stroke-width="1" stroke-linejoin="round" />
    </svg>
    <span class="remote-cursor-label" :style="{ background: color }">{{ name }}</span>
  </div>
</template>

<script setup>
defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  name: { type: String, required: true },
  color: { type: String, required: true }
})
</script>

<style scoped>
.remote-cursor {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 25;
  pointer-events: none;
  will-change: transform;
}

.remote-cursor-label {
  position: absolute;
  top: 16px;
  left: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
