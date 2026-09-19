<script setup>
import { computed, onMounted } from 'vue'
import { useFavorites } from '../composables/favorites'
import { notify } from '../composables/feedback'

const props = defineProps({
  kind: { type: String, required: true },
  target: { type: [String, Number], required: true },
  count: { type: Number, default: undefined },
  variant: { type: String, default: 'button' } // 'button' | 'tag'
})

const emit = defineEmits(['toggle'])

const { ready, error, load, saved, toggle, busy } = useFavorites()

const isSaved = computed(() => saved(props.kind, props.target))
const isBusy = computed(() => busy(props.kind, props.target))

const displayCount = computed(() => {
  if (props.count === undefined || props.count === null) return 0
  return props.count
})

onMounted(() => {
  load().catch(() => {})
})

async function click(e) {
  if (e?.currentTarget?.blur) {
    e.currentTarget.blur()
  }
  if (isBusy.value) return
  const nextSaved = !isSaved.value
  emit('toggle', nextSaved)
  try {
    await toggle(props.kind, props.target)
  } catch (err) {
    emit('toggle', !nextSaved)
    notify(err.message, 'error')
  }
}
</script>

<template>
  <!-- 标签模式 (variant="tag"): 收藏按钮与收藏人数合一，点击前灰色，点击后点亮 -->
  <button
    v-if="variant === 'tag'"
    type="button"
    class="favorite-tag-btn"
    :class="{ 'is-saved': isSaved }"
    :aria-pressed="isSaved"
    :title="error ? '收藏状态读取失败，点击重试' : (isSaved ? `已收藏 (全站共 ${displayCount} 人收藏，点击取消)` : `收藏 (全站共 ${displayCount} 人收藏，点击收藏)`)"
    :aria-label="isSaved ? `已收藏，全站共 ${displayCount} 人收藏` : `收藏，全站共 ${displayCount} 人收藏`"
    @click.stop="click($event)"
    @pointerup="$event.currentTarget.blur()"
  >
    <svg
      viewBox="0 0 24 24"
      class="lionfish-star"
      aria-hidden="true"
    >
      <path d="M9.362,9.158c0,0-3.16,0.35-5.268,0.584c-0.19,0.023-0.358,0.15-0.421,0.343s0,0.394,0.14,0.521 c1.566,1.429,3.919,3.569,3.919,3.569c-0.002,0-0.646,3.113-1.074,5.19c-0.036,0.188,0.032,0.387,0.196,0.506 c0.163,0.119,0.373,0.121,0.538,0.028c1.844-1.048,4.606-2.624,4.606-2.624s2.763,1.576,4.604,2.625 c0.168,0.092,0.378,0.09,0.541-0.029c0.164-0.119,0.232-0.318,0.195-0.505c-0.428-2.078-1.071-5.191-1.071-5.191 s2.353-2.14,3.919-3.566c0.14-0.131,0.202-0.332,0.14-0.524s-0.23-0.319-0.42-0.341c-2.108-0.236-5.269-0.586-5.269-0.586 s-1.31-2.898-2.183-4.83c-0.082-0.173-0.254-0.294-0.456-0.294s-0.375,0.122-0.453,0.294C10.671,6.26,9.362,9.158,9.362,9.158z" />
    </svg>
    <span class="fav-count-num">{{ displayCount }}</span>
  </button>

  <!-- 经典独立圆钮模式 (默认) -->
  <button
    v-else
    type="button"
    class="favorite-button lionfish-fav-btn"
    :class="{ 'is-saved': isSaved }"
    :aria-pressed="isSaved"
    :title="error ? '收藏状态读取失败，点击重试' : (isSaved ? '取消收藏' : '收藏')"
    :aria-label="isSaved ? '取消收藏' : '收藏'"
    @click.stop="click($event)"
    @pointerup="$event.currentTarget.blur()"
  >
    <svg
      viewBox="0 0 24 24"
      class="lionfish-star"
      aria-hidden="true"
    >
      <path d="M9.362,9.158c0,0-3.16,0.35-5.268,0.584c-0.19,0.023-0.358,0.15-0.421,0.343s0,0.394,0.14,0.521 c1.566,1.429,3.919,3.569,3.919,3.569c-0.002,0-0.646,3.113-1.074,5.19c-0.036,0.188,0.032,0.387,0.196,0.506 c0.163,0.119,0.373,0.121,0.538,0.028c1.844-1.048,4.606-2.624,4.606-2.624s2.763,1.576,4.604,2.625 c0.168,0.092,0.378,0.09,0.541-0.029c0.164-0.119,0.232-0.318,0.195-0.505c-0.428-2.078-1.071-5.191-1.071-5.191 s2.353-2.14,3.919-3.566c0.14-0.131,0.202-0.332,0.14-0.524s-0.23-0.319-0.42-0.341c-2.108-0.236-5.269-0.586-5.269-0.586 s-1.31-2.898-2.183-4.83c-0.082-0.173-0.254-0.294-0.456-0.294s-0.375,0.122-0.453,0.294C10.671,6.26,9.362,9.158,9.362,9.158z" />
    </svg>
  </button>
</template>

<style scoped>
/* 经典圆钮样式 */
.lionfish-fav-btn {
  -webkit-appearance: none;
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  outline: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  transition: background-color 0.2s ease, transform 0.15s ease;
  user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.lionfish-fav-btn:focus {
  outline: none;
}

.lionfish-fav-btn:focus:not(:focus-visible) {
  outline: none;
  background: transparent;
  box-shadow: none;
}

.lionfish-fav-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 4px;
}

@media (hover: hover) and (pointer: fine) {
  .lionfish-fav-btn:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }

  .lionfish-fav-btn:hover .lionfish-star {
    transform: scale(1.18);
    fill: rgba(255, 255, 255, 0.75);
  }

  .lionfish-fav-btn.is-saved:hover .lionfish-star {
    transform: scale(1.22);
    filter: drop-shadow(0 0 12px rgba(255, 235, 73, 0.9));
  }
}

.lionfish-fav-btn:active .lionfish-star {
  transform: scale(0.88);
}

.lionfish-fav-btn .lionfish-star {
  width: 22px;
  height: 22px;
  fill: rgba(255, 255, 255, 0.38);
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  display: block;
}

.lionfish-fav-btn.is-saved .lionfish-star {
  fill: #ffeb49;
  filter: drop-shadow(0 0 8px rgba(255, 235, 73, 0.75));
}

/* ==========================================================================
   Tag Variant: 收藏按钮与收藏人数合一 Pill 标签
   ========================================================================== */
.favorite-tag-btn {
  -webkit-appearance: none;
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 9px 0 7px;
  border-radius: 9999px;
  cursor: pointer;
  outline: none;
  user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  white-space: nowrap;

  /* 点击收藏前为灰色 */
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--muted);
}

.favorite-tag-btn:focus {
  outline: none;
}

.favorite-tag-btn:focus:not(:focus-visible) {
  outline: none;
  box-shadow: none;
}

.favorite-tag-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.favorite-tag-btn .lionfish-star {
  width: 13.5px;
  height: 13.5px;
  fill: var(--muted);
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  display: block;
}

.favorite-tag-btn .fav-count-num {
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1;
  color: inherit;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  transition: color 0.25s ease;
}

/* 悬停状态 (未点亮) */
@media (hover: hover) and (pointer: fine) {
  .favorite-tag-btn:hover {
    background: var(--raised);
    border-color: var(--line);
    color: var(--text);
  }

  .favorite-tag-btn:hover .lionfish-star {
    transform: scale(1.18);
    fill: var(--text);
  }
}

/* 点击后点亮 (Favorited / is-saved) */
.favorite-tag-btn.is-saved {
  background: rgba(255, 235, 73, 0.14);
  border: 1px solid rgba(255, 235, 73, 0.42);
  color: #ffeb49;
  box-shadow: 0 0 10px rgba(255, 235, 73, 0.12);
}

.favorite-tag-btn.is-saved .lionfish-star {
  fill: #ffeb49;
  filter: drop-shadow(0 0 6px rgba(255, 235, 73, 0.75));
}

.favorite-tag-btn.is-saved .fav-count-num {
  color: #ffeb49;
  font-weight: 700;
}

/* 悬停状态 (已点亮) */
@media (hover: hover) and (pointer: fine) {
  .favorite-tag-btn.is-saved:hover {
    background: rgba(255, 235, 73, 0.22);
    border-color: rgba(255, 235, 73, 0.6);
    box-shadow: 0 0 14px rgba(255, 235, 73, 0.24);
  }

  .favorite-tag-btn.is-saved:hover .lionfish-star {
    transform: scale(1.22);
    filter: drop-shadow(0 0 10px rgba(255, 235, 73, 0.95));
  }
}

/* 按下动效 */
.favorite-tag-btn:active {
  transform: scale(0.93);
}

.favorite-tag-btn:active .lionfish-star {
  transform: scale(0.88);
}

/* 主题适配 (Vanta Fog / 水波云雾 与 classic-cyan 配色) */
:global([data-theme-style="vanta-fog"] .favorite-tag-btn),
:global([data-color-scheme="classic-cyan"] .favorite-tag-btn) {
  background: rgba(14, 38, 46, 0.7);
  border: 1px solid rgba(197, 230, 223, 0.25);
  color: #8da3a6;
}

:global([data-theme-style="vanta-fog"] .favorite-tag-btn .lionfish-star),
:global([data-color-scheme="classic-cyan"] .favorite-tag-btn .lionfish-star) {
  fill: #8da3a6;
}

:global([data-theme-style="vanta-fog"] .favorite-tag-btn.is-saved),
:global([data-color-scheme="classic-cyan"] .favorite-tag-btn.is-saved) {
  background: rgba(255, 235, 73, 0.15);
  border: 1px solid rgba(255, 235, 73, 0.45);
  color: #ffeb49;
}

:global([data-theme-style="vanta-fog"] .favorite-tag-btn.is-saved .lionfish-star),
:global([data-color-scheme="classic-cyan"] .favorite-tag-btn.is-saved .lionfish-star) {
  fill: #ffeb49;
}
</style>
