<template>
  <section class="settings-group">
    <header v-if="title || $slots.actions" class="group-header">
      <div class="group-heading">
        <h3 v-if="title" class="group-title">{{ title }}</h3>
        <p v-if="description" class="group-description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="group-actions"><slot name="actions" /></div>
    </header>
    <div class="group-card" :class="{ bare }">
      <slot />
    </div>
  </section>
</template>

<script setup>
// Bloco de configurações relacionadas: título fora do card + card com as
// linhas (SettingsRow) separadas por divisória. `bare` tira o card pra
// conteúdo que já traz a própria moldura (ex: os cards de conta Claude).
defineProps({
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  bare: { type: Boolean, default: false }
})
</script>

<style scoped>
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px;
}

.group-heading {
  min-width: 0;
}

.group-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
}

.group-description {
  margin: 3px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--color-text-tertiary);
}

.group-actions {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}

.group-card {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.group-card > :deep(* + *) {
  border-top: 1px solid var(--color-border);
}

.group-card.bare {
  gap: 10px;
  background: none;
  border: none;
  border-radius: 0;
}

.group-card.bare > :deep(* + *) {
  border-top: none;
}
</style>
