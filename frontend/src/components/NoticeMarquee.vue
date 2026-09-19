<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { noticeApi } from '../api/client'
import { shanghaiToday } from '../utils/schedule'
import { filterMarqueeNotices } from '../utils/noticeValidity'

const router = useRouter()
const STORAGE_KEY = 'labhub_hide_home_notice_marquee'

const notices = ref([])
const loading = ref(true)
const isHidden = ref(false)
const selectedNotice = ref(null)

function checkHiddenState() {
  try {
    isHidden.value = localStorage.getItem(STORAGE_KEY) === 'true'
  } catch (e) {
    isHidden.value = false
  }
}

async function fetchActiveNotices() {
  loading.value = true
  try {
    const list = await noticeApi.list({ active_only: true, marquee_only: true })
    const today = shanghaiToday()
    // 过滤走马灯展示通知：
    // 1. 具有截止日期的通知：截止日期未过（end_date >= today）
    // 2. 长期有效通知（无 end_date）：超过其邮件通知时间2周（14天）后不再在走马灯显示
    notices.value = filterMarqueeNotices(Array.isArray(list) ? list : [], today)
  } catch (e) {
    console.warn('获取有效重要通知失败:', e)
    notices.value = []
  } finally {
    loading.value = false
  }
}

function hideMarquee() {
  isHidden.value = true
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch (e) {}
}

function openDetail(notice) {
  selectedNotice.value = notice
}

function closeDetail() {
  selectedNotice.value = null
}

function goToNoticesPage() {
  router.push('/notices')
}

// 标签与分类展示
function getCategoryLabel(cat) {
  const map = {
    academic_affairs: '教务培养',
    holiday: '放假调休',
    facility: '物业后勤',
    administrative: '行政办公',
    safety: '园区安全',
    general: '重要通知'
  }
  return map[cat] || '事务通知'
}

function getImportanceBadge(imp) {
  if (imp === 'urgent') return { text: '紧急', class: 'badge-urgent' }
  if (imp === 'important') return { text: '重要', class: 'badge-important' }
  return null
}

// 计算无缝滚动的通知列表（重复一份以实现 -50% 的完美无缝闭环）
const marqueeItems = computed(() => {
  if (notices.value.length === 0) return []
  return [...notices.value, ...notices.value]
})

// 根据通知数量动态调整滚动时间（保证阅读舒适度）
const marqueeDuration = computed(() => {
  const count = notices.value.length
  return Math.max(20, count * 14) + 's'
})

onMounted(() => {
  checkHiddenState()
  fetchActiveNotices()
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      checkHiddenState()
    }
  })
})
</script>

<template>
  <div v-if="!isHidden && notices.length > 0" class="notice-marquee-wrapper">
    <div class="marquee-track">
      <!-- 左侧固定胶囊标签 -->
      <div class="marquee-header" @click="goToNoticesPage" title="点击前往通知中心">
        <span class="pulse-indicator"></span>
        <AppIcon name="bell" :size="13" />
        <span class="header-text">重要通知</span>
        <span class="count-pill">{{ notices.length }}</span>
      </div>

      <!-- 中间无缝循环滚动容器 -->
      <div class="marquee-viewport">
        <div
          class="marquee-scroller"
          :style="{ animationDuration: marqueeDuration }"
        >
          <div
            v-for="(item, idx) in marqueeItems"
            :key="`${item.id}-${idx}`"
            class="marquee-item"
            @click="openDetail(item)"
          >
            <span v-if="getImportanceBadge(item.importance)" :class="['item-badge', getImportanceBadge(item.importance).class]">
              {{ getImportanceBadge(item.importance).text }}
            </span>
            <span class="category-tag">{{ getCategoryLabel(item.category) }}</span>
            <span class="item-title">{{ item.title }}</span>
            <span v-if="item.end_date" class="item-validity">
              (截止: {{ item.end_date }})
            </span>
            <span class="item-divider" aria-hidden="true">/</span>
          </div>
        </div>
      </div>

      <!-- 右侧快速控制区 -->
      <div class="marquee-controls">
        <button class="action-btn" @click="goToNoticesPage" title="查看所有通知">
          <span>全部</span>
          <AppIcon name="arrow-up-right" :size="13" />
        </button>
        <button class="close-btn" @click="hideMarquee" title="隐藏横栏（可在通知中心重新启用）">
          <AppIcon name="close" :size="14" />
        </button>
      </div>
    </div>

    <!-- 弹窗：通知完整详情 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="selectedNotice" class="notice-modal-backdrop" @click.self="closeDetail">
          <div class="notice-modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <div class="modal-meta-row">
                <span class="modal-category-badge">{{ getCategoryLabel(selectedNotice.category) }}</span>
                <span v-if="getImportanceBadge(selectedNotice.importance)" :class="['modal-importance-badge', getImportanceBadge(selectedNotice.importance).class]">
                  {{ getImportanceBadge(selectedNotice.importance).text }}
                </span>
                <span v-if="selectedNotice.end_date" class="modal-validity-tag">
                  时效至：{{ selectedNotice.end_date }}
                </span>
                <span v-else class="modal-validity-tag permanent">
                  长期有效
                </span>
              </div>
              <button class="modal-close-icon" @click="closeDetail" aria-label="关闭">
                <AppIcon name="close" :size="18" />
              </button>
            </div>

            <h2 class="modal-title">{{ selectedNotice.title }}</h2>

            <div class="modal-source-meta">
              <span v-if="selectedNotice.created_by_name" class="meta-item">
                发布人：{{ selectedNotice.created_by_name }}
              </span>
              <span v-if="selectedNotice.source_email_sender" class="meta-item">
                来源发件人：{{ selectedNotice.source_email_sender }}
              </span>
              <span v-if="selectedNotice.start_date" class="meta-item">
                发布日期：{{ selectedNotice.start_date }}
              </span>
            </div>

            <div class="modal-body-content">
              <div class="content-text">{{ selectedNotice.content }}</div>
            </div>

            <div class="modal-footer">
              <button class="btn-subtle" @click="goToNoticesPage">
                <span>前往通知中心</span>
                <AppIcon name="external" :size="14" />
              </button>
              <button class="btn-primary" @click="closeDetail">
                我知道了
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.notice-marquee-wrapper {
  margin-bottom: 0;
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
}

.marquee-track {
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  overflow: hidden;
  position: relative;
  min-height: 26px;
}

.marquee-header {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--raised);
  border: 1px solid var(--line);
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.marquee-header:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: var(--accent);
  transform: translateY(-1px);
}

.pulse-indicator {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--warning, #f59e0b);
  box-shadow: 0 0 6px var(--warning, #f59e0b);
  animation: pulse-glow 2s infinite ease-in-out;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0.6; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.2); }
}

.count-pill {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  padding: 0 5px;
  border-radius: 8px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.marquee-viewport {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  position: relative;
  mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);
}

.marquee-scroller {
  display: flex;
  align-items: center;
  width: max-content;
  will-change: transform;
  animation: marquee-scroll linear infinite;
}

/* 鼠标悬停暂停动画核心交互 */
.marquee-viewport:hover .marquee-scroller {
  animation-play-state: paused;
}

@keyframes marquee-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

.marquee-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 2px 10px;
  color: var(--soft);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: color 0.2s ease;
}

.marquee-item:hover {
  color: var(--text);
}

.marquee-item:hover .item-title {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.item-badge {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 500;
}

.badge-urgent {
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid rgba(255, 194, 196, 0.35);
}

.badge-important {
  background: var(--warning-bg);
  color: var(--warning);
  border: 1px solid rgba(243, 216, 162, 0.35);
}

.category-tag {
  color: var(--accent);
  font-size: 11px;
  background: var(--raised);
  border: 1px solid var(--line);
  padding: 1px 5px;
  border-radius: 4px;
}

.item-title {
  font-weight: 400;
  color: var(--text);
}

.item-validity {
  color: var(--muted);
  font-size: 12px;
}

.item-divider {
  color: var(--line);
  margin-left: 8px;
  user-select: none;
  opacity: 0.6;
}

.marquee-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: var(--raised);
  color: var(--accent);
}

.close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--raised);
  color: var(--text);
}

/* 详情 Modal */
.notice-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.notice-modal-card {
  background: var(--panel-solid, #0c0a1a);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--shadow);
  width: 100%;
  max-width: 620px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  animation: modal-enter 0.2s ease-out;
}

@keyframes modal-enter {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 10px;
}

.modal-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.modal-category-badge {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--raised);
  color: var(--accent);
  border: 1px solid var(--line);
}

.modal-importance-badge {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 500;
}

.modal-validity-tag {
  font-size: 12px;
  color: var(--soft);
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 3px 8px;
  border-radius: 6px;
}

.modal-validity-tag.permanent {
  color: var(--success);
  background: rgba(175, 226, 196, 0.14);
  border-color: rgba(175, 226, 196, 0.28);
}

.modal-close-icon {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}

.modal-close-icon:hover {
  background: var(--raised);
  color: var(--text);
}

.modal-title {
  font-size: 19px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--text);
  padding: 0 24px 12px;
  margin: 0;
}

.modal-source-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 24px 14px;
  color: var(--muted);
  font-size: 12px;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}

.modal-body-content {
  padding: 20px 24px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  transform: translateZ(0);
  flex: 1;
  min-height: 0;
}

.content-text {
  font-size: 14px;
  line-height: 1.85;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}

.btn-subtle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-subtle:hover {
  background: var(--raised);
  border-color: var(--accent);
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-ink) !important;
  border: 1px solid var(--accent);
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: var(--accent-strong);
  color: var(--accent-ink) !important;
  border-color: var(--accent-strong);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .marquee-track {
    padding: 6px 10px;
    gap: 10px;
  }
  .header-text {
    display: none;
  }
  .marquee-header {
    padding: 3px 6px;
  }
  .item-title {
    font-size: 12px;
  }
}
</style>
