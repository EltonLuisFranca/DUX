<template>
  <div v-if="node" class="modal-backdrop" @mousedown.self="cancelDeleteNode">
    <div class="modal">
      <span class="modal-title">Excluir node?</span>
      <p class="modal-message">
        Isso vai encerrar a sessão e remover <strong>{{ node.data.name }}</strong> do canvas. Essa ação não pode
        ser desfeita.
      </p>
      <div class="modal-actions">
        <button class="btn-secondary" @click="cancelDeleteNode">Cancelar</button>
        <button class="btn-danger" @click="confirmDeleteNode">Excluir</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { nodes, nodePendingDeleteId, cancelDeleteNode, confirmDeleteNode } from '../store/flowStore'

const node = computed(() => nodes.value.find((n) => n.id === nodePendingDeleteId.value) ?? null)
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 10;
}

.modal {
  width: 300px;
  padding: 16px;
  box-sizing: border-box;
  background: var(--color-bg-surface-alt);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  box-shadow: 0 16px 48px var(--color-shadow);
}

.modal-title {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-message {
  margin: 0 0 16px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.modal-message strong {
  color: var(--color-text-primary);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-secondary,
.btn-danger {
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary {
  background: var(--color-bg-surface-raised);
  color: var(--color-text-primary);
}

.btn-secondary:hover {
  background: var(--color-hover);
}

.btn-danger {
  background: #ef4444;
  color: #fff;
}

.btn-danger:hover {
  background: #dc2626;
}
</style>
