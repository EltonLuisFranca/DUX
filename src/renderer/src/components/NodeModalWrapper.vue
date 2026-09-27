<template>
  <Teleport to="body" :disabled="!isModal">
    <div class="node-modal-wrap" :class="{ 'is-modal': isModal }">
      <div v-if="isModal" class="node-modal-topbar">
        <span class="node-modal-title">{{ title }}</span>
        <button class="node-modal-close" @click="close">
          <span>Fechar</span>
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <div class="node-modal-content" :class="{ 'is-modal': isModal }">
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import { modalFullscreenNodeId, closeNodeModal } from '../store/flowStore'

const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, default: '' }
})

const isModal = computed(() => modalFullscreenNodeId.value === props.id)

function close() {
  closeNodeModal()
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

// só escuta Esc enquanto ESTE node é o que está em modal — evita 20+
// listeners globais quando nenhum node está fullscreen
watch(isModal, (active) => {
  if (active) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
/* display:contents quando não é modal: o wrapper não existe pro layout, o
   conteúdo real (o node) fica exatamente como se estivesse direto dentro do
   .vue-flow__node — zero efeito colateral no node normal */
.node-modal-wrap:not(.is-modal),
.node-modal-content:not(.is-modal) {
  display: contents;
}

.node-modal-wrap.is-modal {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-app);
}

.node-modal-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 40px;
  padding: 0 12px;
  background: var(--color-bg-surface-alt);
  border-bottom: 1px solid var(--color-border-strong);
  cursor: default;
}

.node-modal-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.node-modal-close {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.node-modal-close:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
}

.node-modal-content.is-modal {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
}

.node-modal-content.is-modal > :deep(*) {
  flex: 1;
  width: 100%;
  min-height: 0;
}
</style>
