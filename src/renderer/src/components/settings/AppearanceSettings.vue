<template>
  <SettingsGroup title="Tema">
    <SettingsRow label="Modo de cor">
      <SegmentedControl :model-value="theme" :options="THEME_OPTIONS" @update:model-value="setTheme" />
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup title="Nodes">
    <SettingsRow label="Estilo" hint="Compacto tira o cabeçalho alto e aproxima o conteúdo da borda.">
      <SegmentedControl
        :model-value="nodeStyleVariant"
        :options="NODE_STYLE_OPTIONS"
        @update:model-value="setNodeStyleVariant"
      />
    </SettingsRow>
    <SettingsRow label="Sombra" :value="nodeShadowIntensity === 0 ? 'desligada' : `${nodeShadowIntensity}%`" stacked>
      <input
        type="range"
        class="st-range"
        min="0"
        max="100"
        step="5"
        :value="nodeShadowIntensity"
        @input="setNodeShadowIntensity(Number($event.target.value))"
      />
    </SettingsRow>
    <SettingsRow label="Encaixe magnético" hint="Alinha os nodes uns aos outros ao arrastar.">
      <ToggleSwitch :model-value="snapEnabled" label="Encaixe magnético" @update:model-value="setSnapEnabled" />
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup title="Canvas">
    <SettingsRow label="Padrão de fundo" stacked>
      <div class="option-grid">
        <button
          v-for="v in CANVAS_VARIANTS"
          :key="v.value"
          class="option-tile"
          :class="{ active: canvasVariant === v.value }"
          @click="setCanvasVariant(v.value)"
        >
          <svg class="option-preview" viewBox="0 0 48 48" width="40" height="40">
            <rect x="0" y="0" width="48" height="48" rx="6" :fill="v.value === 'none' ? 'none' : 'currentColor'" fill-opacity="0.06" />
            <template v-if="v.value === 'dots'">
              <circle v-for="p in DOT_PREVIEW_POINTS" :key="p.join(',')" :cx="p[0]" :cy="p[1]" r="2" fill="currentColor" />
            </template>
            <path v-else-if="v.value === 'lines'" d="M12 0V48M36 0V48M0 12H48M0 36H48" stroke="currentColor" stroke-width="1.2" fill="none" />
            <template v-else-if="v.value === 'cross'">
              <path
                v-for="p in DOT_PREVIEW_POINTS"
                :key="p.join(',')"
                :d="`M${p[0] - 3} ${p[1]} H${p[0] + 3} M${p[0]} ${p[1] - 3} V${p[1] + 3}`"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
            </template>
            <path
              v-else-if="v.value === 'grid'"
              d="M0 0H48V48H0V0ZM16 0V48M32 0V48M0 16H48M0 32H48"
              stroke="currentColor"
              stroke-width="1.2"
              fill="none"
            />
            <path
              v-else-if="v.value === 'diagonal'"
              d="M-8 8L8 -8M-8 24L24 -8M-8 40L40 -8M8 56L56 8M24 56L56 24M40 56L56 40"
              stroke="currentColor"
              stroke-width="1.4"
            />
            <template v-else-if="v.value === 'checkerboard'">
              <rect x="0" y="0" width="16" height="16" fill="currentColor" fill-opacity="0.35" />
              <rect x="16" y="16" width="16" height="16" fill="currentColor" fill-opacity="0.35" />
              <rect x="32" y="0" width="16" height="16" fill="currentColor" fill-opacity="0.35" />
              <rect x="0" y="32" width="16" height="16" fill="currentColor" fill-opacity="0.35" />
              <rect x="32" y="32" width="16" height="16" fill="currentColor" fill-opacity="0.35" />
            </template>
            <path v-else d="M12 12L36 36M36 12L12 36" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.5" />
          </svg>
          <span class="option-label">{{ v.label }}</span>
        </button>
      </div>
    </SettingsRow>

    <SettingsRow label="Cor de fundo" :hint="canvasBgColor ? '' : 'Seguindo o tema.'">
      <button v-if="canvasBgColor" class="st-btn st-btn--ghost" @click="setCanvasBgColor(null)">Usar do tema</button>
      <AppTooltip label="Cor de fundo">
        <label class="color-swatch" :style="{ background: canvasBgColor || 'var(--color-bg-app)' }">
          <input
            type="color"
            class="color-input"
            :value="canvasBgColor || '#1e1e22'"
            @input="setCanvasBgColor($event.target.value)"
          />
        </label>
      </AppTooltip>
    </SettingsRow>

    <template v-if="canvasVariant !== 'none'">
      <SettingsRow label="Cor do padrão" :hint="canvasPatternColor ? '' : 'Seguindo o tema.'">
        <button v-if="canvasPatternColor" class="st-btn st-btn--ghost" @click="setCanvasPatternColor(null)">
          Usar do tema
        </button>
        <AppTooltip label="Cor do padrão">
          <label class="color-swatch" :style="{ background: resolvedCanvasPatternColor }">
            <input
              type="color"
              class="color-input"
              :value="resolvedCanvasPatternColor"
              @input="setCanvasPatternColor($event.target.value)"
            />
          </label>
        </AppTooltip>
      </SettingsRow>

      <SettingsRow label="Espaçamento" :value="`${canvasGap}px`" stacked>
        <input
          type="range"
          class="st-range"
          min="8"
          max="80"
          step="2"
          :value="canvasGap"
          @input="setCanvasGap(Number($event.target.value))"
        />
      </SettingsRow>

      <SettingsRow
        v-if="canvasVariant !== 'checkerboard'"
        :label="canvasVariant === 'dots' ? 'Tamanho do ponto' : 'Espessura da linha'"
        :value="`${canvasPatternSize}px`"
        stacked
      >
        <input
          type="range"
          class="st-range"
          min="1"
          :max="canvasVariant === 'dots' ? 10 : 4"
          step="1"
          :value="canvasPatternSize"
          @input="setCanvasPatternSize(Number($event.target.value))"
        />
      </SettingsRow>
    </template>
  </SettingsGroup>

  <SettingsGroup title="Conexões entre nodes">
    <SettingsRow label="Formato da linha" stacked>
      <div class="option-grid option-grid--wide">
        <button
          v-for="style in EDGE_STYLES"
          :key="style.value"
          class="option-tile"
          :class="{ active: edgeStyle === style.value }"
          @click="setEdgeStyle(style.value)"
        >
          <svg class="option-preview" viewBox="0 0 64 32" width="64" height="32">
            <path :d="EDGE_PREVIEW_PATHS[style.value]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <circle cx="6" cy="8" r="3" fill="currentColor" />
            <circle cx="58" cy="24" r="3" fill="currentColor" />
          </svg>
          <span class="option-label">{{ style.label }}</span>
        </button>
      </div>
    </SettingsRow>
  </SettingsGroup>
</template>

<script setup>
import {
  theme,
  setTheme,
  nodeStyleVariant,
  setNodeStyleVariant,
  nodeShadowIntensity,
  setNodeShadowIntensity,
  canvasVariant,
  setCanvasVariant,
  CANVAS_VARIANTS,
  canvasBgColor,
  setCanvasBgColor,
  canvasPatternColor,
  setCanvasPatternColor,
  resolvedCanvasPatternColor,
  canvasGap,
  setCanvasGap,
  canvasPatternSize,
  setCanvasPatternSize,
  edgeStyle,
  setEdgeStyle,
  EDGE_STYLES,
  snapEnabled,
  setSnapEnabled
} from '../../store/themeStore'
import AppTooltip from '../AppTooltip.vue'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import SegmentedControl from './SegmentedControl.vue'
import ToggleSwitch from './ToggleSwitch.vue'

const THEME_OPTIONS = [
  { value: 'dark', label: 'Escuro' },
  { value: 'light', label: 'Claro' }
]

const NODE_STYLE_OPTIONS = [
  { value: 'structured', label: 'Estruturado' },
  { value: 'compact', label: 'Compacto' }
]

// pontos de exemplo (grid 3x3) reaproveitados nos previews de "Pontos" e
// "Cruzes" — só muda o que é desenhado em cada ponto (círculo vs. +)
const DOT_PREVIEW_POINTS = [
  [12, 12],
  [24, 12],
  [36, 12],
  [12, 24],
  [24, 24],
  [36, 24],
  [12, 36],
  [24, 36],
  [36, 36]
]

const EDGE_PREVIEW_PATHS = {
  default: 'M6 8 C 30 8, 34 24, 58 24',
  smoothstep: 'M6 8 H32 Q36 8 36 12 V20 Q36 24 40 24 H58',
  step: 'M6 8 H32 V24 H58',
  straight: 'M6 8 L58 24'
}
</script>

<style scoped>
.option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
}

.option-grid--wide {
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
}

.option-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 4px 7px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-surface-alt);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.option-tile:hover {
  color: var(--color-text-primary);
  background: var(--color-hover);
}

.option-tile.active {
  border-color: #3b82f6;
  color: #3b82f6;
  background: rgb(59 130 246 / 0.08);
}

.option-preview {
  color: inherit;
}

.option-label {
  font-size: 10.5px;
  color: var(--color-text-secondary);
}

.option-tile.active .option-label {
  color: #3b82f6;
}

.color-swatch {
  position: relative;
  display: flex;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid var(--color-border-strong);
  overflow: hidden;
  cursor: pointer;
}

.color-input {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  border: none;
  padding: 0;
  cursor: pointer;
  opacity: 0;
}
</style>
