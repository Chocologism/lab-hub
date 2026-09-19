<script setup>
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import UserAvatar from './UserAvatar.vue'
import AppIcon from './AppIcon.vue'
import { renderLatex } from '../utils/latex'
import { formatCommentTime } from '../utils/date'
import { arxivApi } from '../api/client'
import { notify, confirmAction } from '../composables/feedback'
import { usePaperCommentsPolling } from '../composables/usePaperCommentsPolling'

const props = defineProps({
  paper: {
    type: Object,
    required: true
  },
  currentUser: {
    type: Object,
    default: null
  },
  expanded: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['comment-added', 'comment-deleted'])

const draft = ref('')
const sending = ref(false)
const isFocused = ref(false)
const hasDraft = computed(() => Boolean(draft.value.trim()))
const scrollContainer = ref(null)
const chatBoxRef = ref(null)
const maxStreamHeight = ref(null)
let resizeObserver = null

const comments = computed(() => {
  return Array.isArray(props.paper?.comments) ? props.paper.comments : []
})

// 接入自适应增量游标轮询与跨标签页同步
const {
  broadcastCommentAdded,
  broadcastCommentDeleted,
} = usePaperCommentsPolling(
  () => props.paper?.id,
  comments,
  {
    isFocused,
    hasDraft,
    targetEl: chatBoxRef,
    onNewComments: (newItems) => {
      for (const item of newItems) {
        emit('comment-added', item)
      }
      // 如果用户当前在底部附近，则自动滚动到底部
      const el = scrollContainer.value
      if (el) {
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        if (isNearBottom) {
          scrollToBottom()
        }
      }
    },
    onCommentDeleted: (commentId) => {
      emit('comment-deleted', commentId)
    }
  }
)

function updateMaxHeight() {
  if (typeof window === 'undefined') return
  if (window.innerWidth <= 768) {
    maxStreamHeight.value = 240
    return
  }
  const el = chatBoxRef.value
  if (!el) return
  const rail = el.closest('.paper-side-rail')
  if (!rail) return
  const actions = rail.querySelector('.paper-actions')
  const inputBar = el.querySelector('.chat-input-bar')
  const railHeight = rail.offsetHeight
  const actionsHeight = actions ? actions.offsetHeight : 34
  const inputHeight = inputBar ? inputBar.offsetHeight : 32
  // 计算剩余可用高度：卡片侧边栏可用高度 - 顶部操作栏 - 底部输入栏 - 间隙
  const available = railHeight - actionsHeight - inputHeight - 16
  maxStreamHeight.value = available > 70 ? available : 90
}

onMounted(() => {
  updateMaxHeight()
  if (typeof ResizeObserver !== 'undefined' && chatBoxRef.value) {
    const rail = chatBoxRef.value.closest('.paper-side-rail')
    const row = chatBoxRef.value.closest('.paper-row')
    resizeObserver = new ResizeObserver(() => {
      updateMaxHeight()
    })
    if (rail) resizeObserver.observe(rail)
    if (row) resizeObserver.observe(row)
  }
  window.addEventListener('resize', updateMaxHeight)
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateMaxHeight)
  }
})

watch(() => props.expanded, () => {
  nextTick(() => {
    updateMaxHeight()
    scrollToBottom()
  })
})

function scrollToBottom() {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    }
  })
}

watch(() => comments.value.length, () => {
  nextTick(() => {
    updateMaxHeight()
    scrollToBottom()
  })
})

async function handleSend() {
  const content = draft.value.trim()
  if (!content || sending.value) return

  sending.value = true
  try {
    const newComment = await arxivApi.addComment(props.paper.id, content)
    draft.value = ''
    emit('comment-added', newComment)
    broadcastCommentAdded(newComment)
    scrollToBottom()
  } catch (err) {
    notify(err.message || '发送失败', 'error')
  } finally {
    sending.value = false
  }
}

async function handleDeleteComment(comment) {
  const isMine = props.currentUser && comment.user_id === props.currentUser.id
  const isAdmin = props.currentUser && props.currentUser.role === 'admin'
  if (!isMine && !isAdmin) return

  if (!(await confirmAction('确定删除这条讨论留言？', { title: '删除留言', confirmLabel: '删除', danger: true }))) {
    return
  }

  try {
    await arxivApi.deleteComment(comment.id)
    emit('comment-deleted', comment.id)
    broadcastCommentDeleted(comment.id)
    notify('留言已删除')
  } catch (err) {
    notify(err.message || '删除失败', 'error')
  }
}

function formatTime(isoStr) {
  return formatCommentTime(isoStr)
}
</script>

<template>
  <div ref="chatBoxRef" class="paper-chat-box">
    <!-- 消息滚动流（无边界质感，随文献卡片高度自适应） -->
    <div 
      ref="scrollContainer" 
      class="chat-stream"
      :style="maxStreamHeight ? { maxHeight: `${maxStreamHeight}px` } : {}"
    >
      <div v-if="!comments.length" class="chat-empty-hint">
        <AppIcon name="sparkle" :size="13" />
        <span>暂无研读讨论，发一条交流吧…</span>
      </div>

      <TransitionGroup name="elastic-bubble" tag="div" class="chat-bubble-list">
        <div 
          v-for="c in comments" 
          :key="c.id" 
          class="chat-row"
          :class="{ 'is-me': currentUser && c.user_id === currentUser.id }"
        >
          <!-- 他人消息：头像在左侧 -->
          <template v-if="!currentUser || c.user_id !== currentUser.id">
            <div class="chat-avatar-wrap" :title="c.user?.real_name || c.user?.name || '组内成员'">
              <UserAvatar :user="c.user" />
            </div>
            <div class="chat-bubble-content">
              <div class="chat-author-line">
                <span class="chat-author-name">{{ c.user?.real_name || c.user?.name || '组员' }}</span>
                <time class="chat-time">{{ formatTime(c.created_at) }}</time>
                <button 
                  v-if="currentUser?.role === 'admin'" 
                  class="chat-del-btn" 
                  title="删除此留言" 
                  @click.stop="handleDeleteComment(c)"
                >
                  <AppIcon name="trash" :size="10" />
                </button>
              </div>
              <div class="chat-bubble is-other" v-html="renderLatex(c.content)"></div>
            </div>
          </template>

          <!-- 自己的消息：气泡在左/中，头像在最右侧 -->
          <template v-else>
            <div class="chat-bubble-content is-me">
              <div class="chat-author-line is-me">
                <button 
                  class="chat-del-btn" 
                  title="删除我的留言" 
                  @click.stop="handleDeleteComment(c)"
                >
                  <AppIcon name="trash" :size="10" />
                </button>
                <time class="chat-time">{{ formatTime(c.created_at) }}</time>
              </div>
              <div class="chat-bubble is-me" v-html="renderLatex(c.content)"></div>
            </div>
            <div class="chat-avatar-wrap" :title="currentUser?.real_name || currentUser?.name || '我'">
              <UserAvatar :user="currentUser" />
            </div>
          </template>
        </div>
      </TransitionGroup>
    </div>

    <!-- 底部微型悬浮无边界输入栏 -->
    <form class="chat-input-bar" @submit.prevent="handleSend">
      <input
        v-model="draft"
        class="chat-input"
        type="text"
        placeholder="研读体会 / 发起讨论…"
        maxlength="300"
        :disabled="sending"
        @focus="isFocused = true"
        @blur="isFocused = false"
        @keydown.enter.prevent="handleSend"
      />
      <button
        type="submit"
        class="chat-send-btn"
        :disabled="!draft.trim() || sending"
        title="发送 (Enter)"
      >
        <AppIcon name="paper-plane" :size="12" />
      </button>
    </form>
  </div>
</template>

<style scoped>
.paper-chat-box {
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  min-height: 0;
  max-height: 100%;
  width: 100%;
  margin-top: 4px;
  background: transparent;
  position: relative;
}

/* 消息流：柔和透明感，高度随文献卡片自适应 */
.chat-stream {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 4px 6px 2px;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.chat-stream::-webkit-scrollbar {
  width: 3px;
}
.chat-stream::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
}

.chat-empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 18px 8px;
  color: var(--muted);
  font-size: 11px;
  opacity: 0.72;
  user-select: none;
}

.chat-bubble-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

/* 行对齐：左右分栏 */
.chat-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  width: 100%;
  max-width: 100%;
}

.chat-row.is-me {
  justify-content: flex-end;
}

/* 微型圆形头像 (20×20px) */
.chat-avatar-wrap {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--soft);
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  margin-bottom: 2px;
}

.chat-bubble-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: calc(100% - 28px);
  min-width: 0;
}

.chat-bubble-content.is-me {
  align-items: flex-end;
}

/* 作者与时间微标 */
.chat-author-line {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 2px;
  padding: 0 2px;
  font-size: 9.5px;
  color: var(--muted);
  line-height: 1;
}

.chat-author-line.is-me {
  justify-content: flex-end;
}

.chat-author-name {
  font-weight: 500;
  color: var(--soft);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-time {
  opacity: 0.65;
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.chat-del-btn {
  background: transparent;
  border: 0;
  padding: 1px;
  cursor: pointer;
  color: var(--muted);
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
  display: inline-flex;
  align-items: center;
}

.chat-row:hover .chat-del-btn {
  opacity: 0.7;
}

.chat-del-btn:hover {
  opacity: 1 !important;
  color: var(--danger);
}

/* 消息气泡（精致微型排版） */
.chat-bubble {
  font-size: 11.5px;
  line-height: 1.45;
  padding: 5px 9px;
  word-break: break-word;
  white-space: pre-wrap;
  letter-spacing: 0.01em;
  position: relative;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* 他人的气泡 */
.chat-bubble.is-other {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text);
  border-radius: 4px 10px 10px 10px;
}

/* 自己的气泡（带主题强调色与微光） */
.chat-bubble.is-me {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent);
  color: #f1fdf9;
  border-radius: 10px 4px 10px 10px;
}

/* 底部胶囊输入栏（高 28px，无边界感） */
.chat-input-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 2px 4px 2px 8px;
  background: color-mix(in srgb, var(--surface) 45%, transparent);
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: 9999px;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.chat-input-bar:focus-within {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  background: color-mix(in srgb, var(--surface) 75%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent);
}

.chat-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: none;
  font-size: 11.5px;
  color: var(--text);
  padding: 4px 0;
}

.chat-input::placeholder {
  color: var(--muted);
  font-size: 11px;
  opacity: 0.75;
}

.chat-send-btn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  padding: 0;
  flex-shrink: 0;
}

.chat-send-btn:not(:disabled) {
  background: var(--accent);
  color: #0f1923;
  transform: scale(1);
}

.chat-send-btn:not(:disabled):hover {
  transform: scale(1.12) rotate(-6deg);
}

.chat-send-btn:not(:disabled):active {
  transform: scale(0.92);
}

.chat-send-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* 弹簧物理弹性进入动效 (Spring Animation) */
.elastic-bubble-enter-active {
  transition: all 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.elastic-bubble-leave-active {
  transition: all 0.2s ease;
}

.elastic-bubble-enter-from {
  opacity: 0;
  transform: scale(0.85) translateY(10px);
}

.elastic-bubble-enter-to {
  opacity: 1;
  transform: scale(1) translateY(0);
}

.elastic-bubble-leave-from {
  opacity: 1;
  transform: scale(1);
}

.elastic-bubble-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-6px);
}

@media (max-width: 768px) {
  .chat-stream {
    max-height: 240px !important;
  }
}
</style>
