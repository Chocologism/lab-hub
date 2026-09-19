<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  label: { type: String, default: '发送推荐' },
  type: { type: String, default: 'button' }
})
</script>

<template>
  <button
    :type="type"
    class="smart-moth-btn"
    :disabled="disabled || loading"
    v-bind="$attrs"
  >
    <div class="svg-wrapper-1">
      <div class="svg-wrapper">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          class="plane-svg"
          aria-hidden="true"
        >
          <path fill="none" d="M0 0h24v24H0z"></path>
          <path
            fill="currentColor"
            d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z"
          ></path>
        </svg>
      </div>
    </div>
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.smart-moth-btn {
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  background: linear-gradient(135deg, var(--accent, #b89bf8) 0%, #c084fc 100%);
  color: var(--accent-ink, #070314);
  padding: 9px 18px 9px 15px;
  display: inline-flex;
  align-items: center;
  border: none;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.25s ease;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(184, 155, 248, 0.35);
  box-sizing: border-box;
}

.smart-moth-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
  pointer-events: none;
}

.smart-moth-btn span {
  display: block;
  margin-left: 8px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.smart-moth-btn .svg-wrapper-1 {
  display: flex;
  align-items: center;
  justify-content: center;
}

.smart-moth-btn .svg-wrapper {
  transition: transform 0.3s ease-in-out;
}

.smart-moth-btn .plane-svg {
  display: block;
  transform-origin: center center;
  transition: transform 0.3s ease-in-out;
}

.smart-moth-btn:hover:not(:disabled) .svg-wrapper {
  animation: fly-1 0.6s ease-in-out infinite alternate;
}

.smart-moth-btn:hover:not(:disabled) .plane-svg {
  transform: translateX(4px) rotate(45deg) scale(1.15);
}

.smart-moth-btn:hover:not(:disabled) span {
  transform: translateX(4px);
}

.smart-moth-btn:active:not(:disabled) {
  transform: scale(0.95);
}

@keyframes fly-1 {
  from {
    transform: translateY(1.5px);
  }
  to {
    transform: translateY(-1.5px);
  }
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .smart-moth-btn {
  background: linear-gradient(135deg, var(--accent, #c5e6df) 0%, #a2d7cc 100%) !important;
  color: var(--accent-ink, #102f33) !important;
  box-shadow: 0 4px 14px rgba(197, 230, 223, 0.25) !important;
}
</style>
