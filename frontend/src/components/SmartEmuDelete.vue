<script setup>
defineProps({
  title: { type: String, default: '删除' },
  text: { type: String, default: '删除' },
  size: { type: String, default: 'small' }, // 'small' | 'medium'
  disabled: { type: Boolean, default: false },
})

defineEmits(['click'])
</script>

<template>
  <button
    type="button"
    class="smart-emu-btn"
    :class="[size, { 'is-disabled': disabled }]"
    :data-text="text"
    :disabled="disabled"
    :title="title"
    :aria-label="title"
    @click="$emit('click', $event)"
  >
    <svg viewBox="0 0 448 512" class="svgIcon" aria-hidden="true">
      <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"></path>
    </svg>
  </button>
</template>

<style scoped>
/* Exact recreation of Uiverse.io smart-emu-83 by vinodjangid07 */
.smart-emu-btn {
  background-color: rgba(14, 10, 24, 0.9);
  border: 1px solid rgba(184, 155, 248, 0.18);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition-duration: 0.3s;
  overflow: hidden;
  position: relative;
  color: #ffffff;
  padding: 0;
  flex-shrink: 0;
  vertical-align: middle;
}

.smart-emu-btn .svgIcon {
  transition-duration: 0.3s;
  fill: #ffffff;
  flex-shrink: 0;
}

.smart-emu-btn .svgIcon path {
  fill: #ffffff;
}

/* ::before text dropping in from above */
.smart-emu-btn::before {
  position: absolute;
  content: attr(data-text);
  color: #ffffff;
  transition-duration: 0.3s;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
}

/* Small 规格 (用于卡片内操作) */
.smart-emu-btn.small {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.smart-emu-btn.small .svgIcon {
  width: 11px;
}

.smart-emu-btn.small::before {
  top: -16px;
  font-size: 2px;
}

.smart-emu-btn.small:hover:not(:disabled) {
  width: 58px;
  border-radius: 32px;
  transition-duration: 0.3s;
  background-color: rgb(255, 69, 69) !important;
  border-color: rgba(255, 69, 69, 0.5) !important;
  box-shadow: 0 4px 14px rgba(255, 69, 69, 0.4) !important;
}

.smart-emu-btn.small:hover:not(:disabled) .svgIcon {
  width: 24px;
  transition-duration: 0.3s;
  transform: translateY(70%);
  -webkit-transform: translateY(70%);
}

.smart-emu-btn.small:hover:not(:disabled)::before {
  font-size: 10.5px;
  opacity: 1;
  transform: translateY(21px);
  -webkit-transform: translateY(21px);
  transition-duration: 0.3s;
}

/* Medium 规格 (用于页面工具条与主操作区) */
.smart-emu-btn.medium {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.smart-emu-btn.medium .svgIcon {
  width: 13px;
}

.smart-emu-btn.medium::before {
  top: -18px;
  font-size: 2px;
}

.smart-emu-btn.medium:hover:not(:disabled) {
  width: 78px;
  border-radius: 40px;
  transition-duration: 0.3s;
  background-color: rgb(255, 69, 69) !important;
  border-color: rgba(255, 69, 69, 0.5) !important;
  box-shadow: 0 4px 16px rgba(255, 69, 69, 0.45) !important;
}

.smart-emu-btn.medium:hover:not(:disabled) .svgIcon {
  width: 32px;
  transition-duration: 0.3s;
  transform: translateY(68%);
  -webkit-transform: translateY(68%);
}

.smart-emu-btn.medium:hover:not(:disabled)::before {
  font-size: 11.5px;
  opacity: 1;
  transform: translateY(25px);
  -webkit-transform: translateY(25px);
  transition-duration: 0.3s;
}

.smart-emu-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.smart-emu-btn.is-disabled,
.smart-emu-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .smart-emu-btn:not(:hover) {
  background-color: rgba(20, 26, 30, 0.9);
  border-color: rgba(218, 238, 235, 0.16);
}
</style>
