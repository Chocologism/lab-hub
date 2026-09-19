<template>
  <div ref="wrapperRef" class="paper-authors-wrapper">
    <p
      ref="textRef"
      class="authors"
      :class="{ 'clamped-single-line': isClamped }"
      :title="isClamped ? '点击展开作者列表' : undefined"
      @click="handleTextClick"
    >
      {{ displayAuthorsText }}
    </p>
    <button
      v-if="canCollapse"
      type="button"
      class="author-toggle-btn text-action"
      :aria-expanded="isExpanded"
      @click.stop="toggleExpand"
    >
      <span class="toggle-text">{{ isExpanded ? '收起作者' : (authorCount > 0 ? `展开全部 ${authorCount} 位作者` : '展开作者') }}</span>
      <span class="toggle-arrow" :class="{ 'is-expanded': isExpanded }">▾</span>
    </button>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { parseAuthors, formatAuthors, isPotentialMultiLine } from '../utils/authors'

const props = defineProps({
  authors: {
    type: [Array, String],
    default: () => []
  },
  expanded: {
    type: Boolean,
    default: undefined
  }
})

const emit = defineEmits(['update:expanded', 'toggle'])

const wrapperRef = ref(null)
const textRef = ref(null)
const canCollapse = ref(false)
const internalExpanded = ref(false)

const parsedAuthorsList = computed(() => parseAuthors(props.authors))
const authorCount = computed(() => parsedAuthorsList.value.length)
const displayAuthorsText = computed(() => formatAuthors(props.authors))

const isExpanded = computed({
  get() {
    return props.expanded !== undefined ? props.expanded : internalExpanded.value
  },
  set(val) {
    if (props.expanded !== undefined) {
      emit('update:expanded', val)
    } else {
      internalExpanded.value = val
    }
    emit('toggle', val)
  }
})

const isClamped = computed(() => !isExpanded.value && canCollapse.value)

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

function handleTextClick() {
  if (typeof window !== 'undefined') {
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) return
  }
  if (!isExpanded.value && canCollapse.value) {
    toggleExpand()
  }
}

function measureOverflow() {
  if (!textRef.value) return
  const el = textRef.value
  const ch = el.clientHeight
  const sh = el.scrollHeight

  // In test environments or before initial layout
  if (ch === 0 && sh === 0) {
    canCollapse.value = isPotentialMultiLine(props.authors)
    return
  }

  // When line-height is 18px:
  // Single-line text will have sh <= 22px.
  // Multi-line text (>=2 lines) will have sh >= 34px.
  // When clamped, ch ~ 18px and sh >= 34px (sh > ch + 3).
  // When unclamped, ch >= 34px and sh >= 34px (sh > 25).
  const isMulti = (sh > ch + 3) || (sh > 25)
  canCollapse.value = isMulti
}

let resizeObserver = null

onMounted(() => {
  nextTick(() => {
    measureOverflow()
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(measureOverflow)
    }
  })

  if (typeof ResizeObserver !== 'undefined' && wrapperRef.value) {
    resizeObserver = new ResizeObserver(() => {
      measureOverflow()
    })
    resizeObserver.observe(wrapperRef.value)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', measureOverflow)
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', measureOverflow)
  }
})

watch(() => props.authors, () => {
  nextTick(() => {
    measureOverflow()
  })
}, { deep: true })
</script>

<style scoped>
.paper-authors-wrapper {
  margin: 3px 0 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  width: 100%;
}

.authors {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 18px;
  word-break: break-word;
  transition: color 0.15s ease;
}

.authors.clamped-single-line {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.authors.clamped-single-line:hover {
  color: color-mix(in srgb, var(--text) 75%, var(--muted));
}

.author-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 11.5px;
  line-height: 1.4;
  cursor: pointer;
  border-radius: 4px;
  transition: opacity 0.15s ease;
  user-select: none;
}

.author-toggle-btn:hover {
  opacity: 0.8;
  text-decoration: underline;
}

.toggle-arrow {
  display: inline-block;
  font-size: 9px;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toggle-arrow.is-expanded {
  transform: rotate(180deg);
}
</style>
