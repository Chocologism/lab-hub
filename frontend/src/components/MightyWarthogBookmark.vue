<script setup>
const props = defineProps({
  checked: { type: Boolean, default: false },
  count: { type: [Number, String], default: null },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle', 'change'])

function handleClick(e) {
  if (props.disabled) return
  if (e?.currentTarget?.blur) {
    e.currentTarget.blur()
  }
  emit('toggle', !props.checked)
  emit('change', !props.checked)
}
</script>

<template>
  <button
    type="button"
    class="read-bookmark-wrapper"
    :class="{ 'is-read': checked, 'is-disabled': disabled }"
    :disabled="disabled"
    :title="checked ? '已读' : '标记已读'"
    :aria-pressed="checked"
    @click="handleClick($event)"
    @pointerup="$event.currentTarget?.blur()"
  >
    <span class="bookmark-icon-wrap" aria-hidden="true">
      <svg viewBox="0 0 32 32" class="bookmark-svg">
        <path d="M27 4v27a1 1 0 0 1-1.625.781L16 24.281l-9.375 7.5A1 1 0 0 1 5 31V4a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4z"></path>
      </svg>
    </span>
    <span class="read-text">
      {{ label || (checked ? '已读' : '标记已读') }}
    </span>
  </button>
</template>

<style scoped>
.read-bookmark-wrapper {
  -webkit-appearance: none;
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 30px;
  min-height: 30px;
  border-radius: 9999px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--soft, #c0cad3);
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.15s ease;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  user-select: none;
  touch-action: manipulation;
  white-space: nowrap;
  flex-shrink: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}

.read-bookmark-wrapper:focus {
  outline: none;
}

.read-bookmark-wrapper:focus:not(:focus-visible) {
  outline: none;
  box-shadow: none;
}

.read-bookmark-wrapper:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 4px;
}

.bookmark-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.bookmark-svg {
  width: 14px;
  height: 14px;
  display: block;
  fill: var(--muted);
  transition: fill 0.2s ease, transform 0.2s ease;
}

.read-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

@media (hover: hover) and (pointer: fine) {
  .read-bookmark-wrapper:hover:not(:disabled) {
    background: var(--raised);
    border-color: var(--line);
    color: var(--text, #ffffff);
  }
  .read-bookmark-wrapper:hover:not(:disabled) .bookmark-svg {
    fill: var(--text, #ffffff);
  }
}

.read-bookmark-wrapper:active:not(:disabled) {
  transform: scale(0.96);
}

.read-bookmark-wrapper.is-read {
  background: var(--raised);
  border-color: var(--accent);
  color: var(--accent);
}

.read-bookmark-wrapper.is-read .bookmark-svg {
  fill: #ffd166;
  animation: bookmarkPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

@keyframes bookmarkPop {
  0% { transform: scale(0.8); }
  50% { transform: scale(1.25); }
  100% { transform: scale(1); }
}

.read-bookmark-wrapper:disabled,
.read-bookmark-wrapper.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .read-bookmark-wrapper {
  background: rgba(22, 48, 58, 0.6) !important;
  border: 1px solid rgba(218, 238, 235, 0.16) !important;
  color: var(--soft, #c0cad3) !important;
}

@media (hover: hover) and (pointer: fine) {
  [data-theme-style="vanta-fog"] .read-bookmark-wrapper:hover:not(:disabled) {
    background: rgba(197, 230, 223, 0.12) !important;
    border-color: rgba(197, 230, 223, 0.35) !important;
    color: var(--text, #ffffff) !important;
  }
}

[data-theme-style="vanta-fog"] .read-bookmark-wrapper.is-read {
  background: rgba(197, 230, 223, 0.16) !important;
  border-color: var(--accent, #c5e6df) !important;
  color: var(--accent, #c5e6df) !important;
}
</style>

