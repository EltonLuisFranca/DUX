<template>
  <Transition name="banner-fade">
    <div v-if="visible" class="update-banner">
      <span v-if="state === 'downloading'">Baixando atualização{{ progressText }}...</span>
      <span v-else-if="state === 'downloaded'">Atualização pronta para instalar.</span>
      <button v-if="state === 'downloaded'" class="update-btn" @click="installNow">Reiniciar e atualizar</button>
      <button class="dismiss-btn" @click="visible = false">×</button>
    </div>
  </Transition>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'

const state = ref(null)
const progress = ref(0)
const visible = ref(false)
let unsubscribe = null

const progressText = computed(() => (progress.value ? ` (${Math.round(progress.value)}%)` : ''))

function installNow() {
  window.updaterAPI?.installNow()
}

onMounted(() => {
  unsubscribe = window.updaterAPI?.onStatus((payload) => {
    if (payload.state === 'downloading') {
      state.value = 'downloading'
      progress.value = payload.progress?.percent ?? 0
      visible.value = true
    } else if (payload.state === 'downloaded') {
      state.value = 'downloaded'
      visible.value = true
    }
  })
})

onBeforeUnmount(() => unsubscribe?.())
</script>

<style scoped>
.update-banner {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--color-shadow);
  color: var(--color-text-primary);
  font-size: 12px;
  z-index: 50;
}

.update-btn {
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: #3b82f6;
  color: #fff;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.dismiss-btn {
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.dismiss-btn:hover {
  color: var(--color-text-primary);
}

.banner-fade-enter-active,
.banner-fade-leave-active {
  transition: opacity 0.15s ease;
}

.banner-fade-enter-from,
.banner-fade-leave-to {
  opacity: 0;
}
</style>
