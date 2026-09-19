<script setup>
const props = defineProps({
  liked: {
    type: Boolean,
    default: false
  },
  count: {
    type: Number,
    default: 0
  },
  disabled: {
    type: Boolean,
    default: false
  },
  label: {
    type: String,
    default: '赞'
  },
  size: {
    type: String,
    default: 'medium' // 'small' | 'medium'
  },
  compact: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['toggle'])

function handleToggle(e) {
  if (props.disabled) return
  if (e?.currentTarget?.blur) {
    e.currentTarget.blur()
  }
  emit('toggle', !props.liked)
}
</script>

<template>
  <button 
    type="button"
    class="popular-puma-like" 
    :class="{ 
      'is-liked': liked, 
      'is-disabled': disabled,
      'is-small': size === 'small',
      'is-compact': compact
    }"
    :disabled="disabled"
    :title="title || (liked ? (label === '赞' ? '取消点赞' : (count > 0 ? `取消想听 (已有 ${count} 人想听)` : '取消想听')) : (label === '赞' ? '点赞文献' : (count > 0 ? `想听此报告 (已有 ${count} 人想听)` : '想听此报告')))"
    :aria-pressed="liked"
    @click.stop="handleToggle($event)"
    @pointerup="$event.currentTarget.blur()"
  >
    <div class="like">
      <svg
        class="like-icon"
        fill-rule="nonzero"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z"
        />
      </svg>
      <span class="like-text">{{ label }}</span>
    </div>
    <span class="like-count one">{{ liked ? Math.max(0, count - 1) : count }}</span>
    <span class="like-count two">{{ liked ? count : count + 1 }}</span>
  </button>
</template>

<style scoped>
.popular-puma-like {
  -webkit-appearance: none;
  appearance: none;
  position: relative;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  height: 30px;
  min-height: 30px;
  width: 78px;
  border-radius: 9999px;
  border: 1px solid var(--line);
  background-color: var(--surface);
  overflow: hidden;
  box-shadow:
    inset -1px -1px 3px rgba(255, 255, 255, 0.08),
    inset 1px 1px 3px rgba(0, 0, 0, 0.2);
  transition: background-color 0.22s ease, border-color 0.22s ease, transform 0.15s ease;
  user-select: none;
  touch-action: manipulation;
  flex-shrink: 0;
  white-space: nowrap;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}

.popular-puma-like:focus {
  outline: none;
}

.popular-puma-like:focus:not(:focus-visible) {
  outline: none;
}

.popular-puma-like:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 4px;
}

@media (hover: hover) and (pointer: fine) {
  .popular-puma-like:hover:not(:disabled) {
    border-color: var(--line);
    background-color: var(--raised);
  }
}

.popular-puma-like:active:not(:disabled) {
  transform: scale(0.96);
}

.popular-puma-like.is-liked {
  border-color: rgba(255, 107, 129, 0.45);
  background-color: rgba(255, 71, 87, 0.12);
}

.like {
  width: 62%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding-left: 2px;
  pointer-events: none;
}

.like-icon {
  fill: #8590a6;
  height: 14px;
  width: 14px;
  transition: all 0.2s ease-out;
}

.like-text {
  color: var(--soft, #c0cad3);
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.like-count {
  position: absolute;
  right: 0;
  width: 38%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #8590a6;
  font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
  border-left: 1px solid rgba(255, 255, 255, 0.12);
  transition: all 0.38s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}

.like-count.two {
  transform: translateY(28px);
}

.popular-puma-like.is-liked .like-icon {
  fill: #ff4757;
  animation: enlarge 0.28s ease-out 1;
}

.popular-puma-like.is-liked .like-text {
  color: #ff6b81;
  font-weight: 600;
}

.popular-puma-like.is-liked .like-count.two {
  transform: translateY(0);
  color: #ff6b81;
}

.popular-puma-like.is-liked .like-count.one {
  transform: translateY(-28px);
}

@keyframes enlarge {
  0% {
    transform: scale(0.6);
  }
  50% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
  }
}

.popular-puma-like:disabled,
.popular-puma-like.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 紧凑尺寸（适用于日程卡片顶部条，避免挤压日程时间） */
.popular-puma-like.is-small {
  height: 24px;
  min-height: 24px;
  width: 68px;
  border-radius: 9999px;
}

.popular-puma-like.is-small .like {
  width: 63%;
  gap: 3px;
  padding-left: 4px;
  padding-right: 4px;
  box-sizing: border-box;
}

.popular-puma-like.is-small .like-icon {
  width: 11px;
  height: 11px;
}

.popular-puma-like.is-small .like-text {
  font-size: 11px;
  letter-spacing: 0.02em;
}

.popular-puma-like.is-small .like-count {
  width: 37%;
  font-size: 11px;
  padding-right: 2px;
  box-sizing: border-box;
}

.popular-puma-like.is-small .like-count.two {
  transform: translateY(24px);
}

.popular-puma-like.is-small.is-liked .like-count.one {
  transform: translateY(-24px);
}

.popular-puma-like.is-small.is-liked .like-count.two {
  transform: translateY(0);
}

/* 极限压缩模式：卡片宽度受限时自动折叠文字，仅保留心形与数字 (42px) */
.popular-puma-like.is-small.is-compact {
  width: 42px;
}

.popular-puma-like.is-small.is-compact .like {
  width: 50%;
  gap: 0;
  padding-left: 0;
  padding-right: 0;
  justify-content: center;
}

.popular-puma-like.is-small.is-compact .like-text {
  display: none;
}

.popular-puma-like.is-small.is-compact .like-count {
  width: 50%;
  padding-right: 0;
  justify-content: center;
}

@container (max-width: 152px) {
  .popular-puma-like.is-small {
    width: 42px;
  }

  .popular-puma-like.is-small .like {
    width: 50%;
    gap: 0;
    padding-left: 0;
    padding-right: 0;
    justify-content: center;
  }

  .popular-puma-like.is-small .like-text {
    display: none;
  }

  .popular-puma-like.is-small .like-count {
    width: 50%;
    padding-right: 0;
    justify-content: center;
  }
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .popular-puma-like {
  border: 1px solid rgba(218, 238, 235, 0.16) !important;
  background-color: rgba(22, 48, 58, 0.6) !important;
}

[data-theme-style="vanta-fog"] .popular-puma-like.is-liked {
  border-color: rgba(255, 107, 129, 0.5) !important;
  background-color: rgba(255, 71, 87, 0.16) !important;
}

@media (hover: hover) and (pointer: fine) {
  [data-theme-style="vanta-fog"] .popular-puma-like:hover:not(:disabled) {
    border-color: rgba(197, 230, 223, 0.35) !important;
    background-color: rgba(197, 230, 223, 0.12) !important;
  }
}
</style>

