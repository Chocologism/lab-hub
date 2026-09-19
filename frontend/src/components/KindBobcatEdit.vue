<script setup>
defineProps({
  title: { type: String, default: '编辑资料' },
  text: { type: String, default: '编辑' },
  size: { type: String, default: 'small' }, // 'small' | 'medium'
  disabled: { type: Boolean, default: false },
})

defineEmits(['click'])
</script>

<template>
  <button
    type="button"
    class="kind-bobcat-btn"
    :class="[size, { 'is-disabled': disabled }]"
    :data-text="text"
    :disabled="disabled"
    :title="title"
    :aria-label="title"
    @click="$emit('click', $event)"
  >
    <svg viewBox="0 0 512 512" class="edit-svgIcon" aria-hidden="true">
      <path d="M410.3 231l11.3-11.3-33.9-33.9-62.1-62.1L291.7 89.8l-11.3 11.3-22.6 22.6L58.6 322.9c-10.4 10.4-18 23.3-22.2 37.4L1 480.7c-2.5 8.4-.2 17.5 6.1 23.7s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L387.7 253.7 410.3 231zM160 399.4l-9.1 22.7c-4 3.1-8.5 5.4-13.3 6.9L59.4 452l23-78.1c1.4-4.9 3.8-9.4 6.9-13.3l22.7-9.1v32c0 8.8 7.2 16 16 16h32zM362.7 18.7L348.3 33.2 325.7 55.8 314.3 67.1l33.9 33.9 62.1 62.1 33.9 33.9 11.3-11.3 22.6-22.6 14.5-14.5c25-25 25-65.5 0-90.5L453.3 18.7c-25-25-65.5-25-90.5 0zm-47.4 168l-144 144c-6.2 6.2-16.4 6.2-22.6 0s-6.2-16.4 0-22.6l144-144c6.2-6.2 16.4-6.2 22.6 0s6.2 16.4 0 22.6z"></path>
    </svg>
  </button>
</template>

<style scoped>
/* Exact recreation of Uiverse.io kind-bobcat-81 by aaronross1 */
.kind-bobcat-btn {
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

.kind-bobcat-btn .edit-svgIcon {
  transition-duration: 0.3s;
  fill: #ffffff;
  flex-shrink: 0;
}

.kind-bobcat-btn .edit-svgIcon path {
  fill: #ffffff;
}

.kind-bobcat-btn::before {
  display: none;
  content: attr(data-text);
  color: #ffffff;
  transition-duration: 0.3s;
  font-size: 2px;
  font-weight: 600;
  white-space: nowrap;
}

/* Small 规格 (用于卡片内操作，尺寸与 SmartEmuDelete 完全对齐) */
.kind-bobcat-btn.small {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.kind-bobcat-btn.small .edit-svgIcon {
  width: 12px;
  height: 12px;
}

.kind-bobcat-btn.small:hover:not(:disabled) {
  width: 58px;
  border-radius: 32px;
  transition-duration: 0.3s;
  background-color: rgb(255, 69, 69) !important;
  border-color: rgba(255, 69, 69, 0.5) !important;
  box-shadow: 0 4px 14px rgba(255, 69, 69, 0.4) !important;
}

.kind-bobcat-btn.small:hover:not(:disabled) .edit-svgIcon {
  width: 11px;
  height: 11px;
  transition-duration: 0.3s;
  transform: rotate(360deg);
  -webkit-transform: rotate(360deg);
}

.kind-bobcat-btn.small:hover:not(:disabled)::before {
  display: block;
  padding-right: 4px;
  font-size: 10.5px;
  opacity: 1;
  transition-duration: 0.3s;
}

/* Medium 规格 (用于工具栏或独立主操作) */
.kind-bobcat-btn.medium {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.kind-bobcat-btn.medium .edit-svgIcon {
  width: 16px;
  height: 16px;
}

.kind-bobcat-btn.medium:hover:not(:disabled) {
  width: 78px;
  border-radius: 40px;
  transition-duration: 0.3s;
  background-color: rgb(255, 69, 69) !important;
  border-color: rgba(255, 69, 69, 0.5) !important;
  box-shadow: 0 4px 16px rgba(255, 69, 69, 0.45) !important;
}

.kind-bobcat-btn.medium:hover:not(:disabled) .edit-svgIcon {
  width: 14px;
  height: 14px;
  transition-duration: 0.3s;
  transform: rotate(360deg);
  -webkit-transform: rotate(360deg);
}

.kind-bobcat-btn.medium:hover:not(:disabled)::before {
  display: block;
  padding-right: 6px;
  font-size: 11.5px;
  opacity: 1;
  transition-duration: 0.3s;
}

.kind-bobcat-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.kind-bobcat-btn.is-disabled,
.kind-bobcat-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .kind-bobcat-btn:not(:hover) {
  background-color: rgba(20, 26, 30, 0.9);
  border-color: rgba(218, 238, 235, 0.16);
}
</style>
