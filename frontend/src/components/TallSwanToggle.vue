<script setup>
defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '展开 / 收起'
  }
})

defineEmits(['update:modelValue'])
</script>

<template>
  <label class="tall-swan-toggle" :title="title" :aria-label="title">
    <input
      type="checkbox"
      :checked="modelValue"
      @change="$emit('update:modelValue', $event.target.checked)"
    />
    <svg viewBox="0 0 32 32">
      <path
        class="line line-top-bottom"
        d="M27 10 13 10C10.8 10 9 8.2 9 6 9 3.5 10.8 2 13 2 15.2 2 17 3.8 17 6L17 26C17 28.2 18.8 30 21 30 23.2 30 25 28.2 25 26 25 23.8 23.2 22 21 22L7 22"
      ></path>
      <path class="line" d="M7 16 27 16"></path>
    </svg>
  </label>
</template>

<style scoped>
.tall-swan-toggle {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 4px;
  user-select: none;
  transition: opacity 0.2s ease;
}

.tall-swan-toggle:hover {
  opacity: 0.85;
}

.tall-swan-toggle input {
  display: none;
}

.tall-swan-toggle svg {
  height: 28px;
  width: 28px;
  transition: transform 600ms cubic-bezier(0.4, 0, 0.2, 1);
}

.line {
  fill: none;
  stroke: var(--text, #ffffff);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.8;
  transition: stroke-dasharray 600ms cubic-bezier(0.4, 0, 0.2, 1),
              stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1);
}

.line-top-bottom {
  stroke-dasharray: 12 63;
}

.tall-swan-toggle input:checked + svg {
  transform: rotate(-45deg);
}

.tall-swan-toggle input:checked + svg .line {
  stroke: var(--accent, #b89bf8);
}

.tall-swan-toggle input:checked + svg .line-top-bottom {
  stroke-dasharray: 20 300;
  stroke-dashoffset: -32.42;
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .tall-swan-toggle input:checked + svg .line {
  stroke: var(--accent, #c5e6df) !important;
}
</style>
