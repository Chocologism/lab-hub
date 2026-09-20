<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import UserAvatar from './UserAvatar.vue'
import { authApi, noticeApi } from '../api/client'
import { getUnreadNoticesCount, NOTICES_READ_EVENT } from '../utils/noticeUnread'
import { isAiGeneratingGlobally } from '../composables/useAiAssistantState'
import { useSiteConfig } from '../composables/useSiteConfig'
import { useTutorial } from '../composables/useTutorial'

const { siteConfig } = useSiteConfig()
const { showTutorial, currentSubStep } = useTutorial()

const props = defineProps({
  pinned: { type: Boolean, default: false }
})

const emit = defineEmits(['update:pinned'])

// 在新手引导第一步中，强制侧边栏处于唤起但不固定的状态；
// 无论第一步用户有没有点击锁定边栏，后续所有步骤都将边栏锁定
const isTourPinStep = computed(() => {
  return showTutorial.value && currentSubStep.value?.id === 'home_pin_sidebar'
})

watch([() => showTutorial.value, () => currentSubStep.value?.id, () => props.pinned], ([active, subStepId, pinned]) => {
  if (!active) return
  if (subStepId === 'home_pin_sidebar') {
    if (pinned) {
      emit('update:pinned', false)
      try {
        localStorage.setItem('sidebar_pinned', 'false')
      } catch {}
    }
  } else {
    // 无论用户在第一步有没有点击锁定边栏，后续步骤都将边栏锁定
    if (!pinned) {
      emit('update:pinned', true)
      try {
        localStorage.setItem('sidebar_pinned', 'true')
      } catch {}
    }
  }
}, { immediate: true })

// 退出或跳过新手引导时，确保边栏处于锁定状态
watch(() => showTutorial.value, (active, prevActive) => {
  if (prevActive && !active && !props.pinned) {
    emit('update:pinned', true)
    try {
      localStorage.setItem('sidebar_pinned', 'true')
    } catch {}
  }
})

function getInitialUser() {
  try {
    const raw = localStorage.getItem('labhub_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const router = useRouter()
const user = ref(getInitialUser())
const route = useRoute()

// 鼠标悬停激活展开状态与新用户微导引状态
const isHovered = ref(false)
const isPeeking = ref(false)
const showPinGuide = ref(false)
const PEEK_STORAGE_KEY = 'labhub_sidebar_peeked'
const PIN_GUIDE_STORAGE_KEY = 'labhub_pin_guided'

let leaveTimer = null
let peekTimer = null
let peekRetractTimer = null

function checkPinGuideState() {
  if (typeof window === 'undefined') return
  const hasPinGuided = localStorage.getItem(PIN_GUIDE_STORAGE_KEY) === 'true'
  showPinGuide.value = !hasPinGuided && !props.pinned
}

function initNewUserGuides() {
  if (typeof window === 'undefined') return
  checkPinGuideState()
  if (window.innerWidth <= 768) return
  if (props.pinned) return

  const hasPeeked = localStorage.getItem(PEEK_STORAGE_KEY) === 'true'
  if (!hasPeeked) {
    peekTimer = setTimeout(() => {
      if (!isHovered.value && !props.pinned) {
        isPeeking.value = true
        peekRetractTimer = setTimeout(() => {
          isPeeking.value = false
          try { localStorage.setItem(PEEK_STORAGE_KEY, 'true') } catch {}
        }, 1800)
      } else {
        try { localStorage.setItem(PEEK_STORAGE_KEY, 'true') } catch {}
      }
    }, 600)
  }
}

function handleMouseEnter() {
  if (peekRetractTimer) {
    clearTimeout(peekRetractTimer)
    peekRetractTimer = null
  }
  isPeeking.value = false
  try { localStorage.setItem(PEEK_STORAGE_KEY, 'true') } catch {}
  if (leaveTimer) {
    clearTimeout(leaveTimer)
    leaveTimer = null
  }
  isHovered.value = true
  checkPinGuideState()
}

function handleMouseLeave() {
  if (leaveTimer) clearTimeout(leaveTimer)
  leaveTimer = setTimeout(() => {
    isHovered.value = false
  }, 220)
}

function togglePin() {
  const nextPinned = !props.pinned
  emit('update:pinned', nextPinned)
  if (nextPinned) {
    try { localStorage.setItem(PIN_GUIDE_STORAGE_KEY, 'true') } catch {}
    showPinGuide.value = false
  }
}

watch(() => props.pinned, (val) => {
  if (val) {
    isPeeking.value = false
    showPinGuide.value = false
    try { localStorage.setItem(PIN_GUIDE_STORAGE_KEY, 'true') } catch {}
  } else {
    checkPinGuideState()
  }
})

watch(() => route.fullPath, () => {
  if (!props.pinned) {
    isHovered.value = false
  }
})

const items = [
  { to: '/', label: '工作台', icon: 'planet' },
  { to: '/notices', label: '重要通知', icon: 'bell' },
  { to: '/arxiv', label: '文献推荐', icon: 'file-text' },
  { to: '/seminars', label: '学术日程', icon: 'calendar' },
  { to: '/mailbox', label: '邮箱', icon: 'envelope' },
  { to: '/library', label: '文献库', icon: 'book-open' },
  { to: '/resources', label: '教材资料', icon: 'database' },
]


const roleLabel = computed(() => ({ teacher: '导师', admin: '管理员' }[user.value?.role] || '组员'))

const unreadNoticesCount = ref(0)

async function refreshUnreadNotices() {
  try {
    const list = await noticeApi.list({ active_only: true })
    if (Array.isArray(list)) {
      unreadNoticesCount.value = getUnreadNoticesCount(list)
    }
  } catch {}
}

function handleNoticesReadState() {
  refreshUnreadNotices()
}

watch(() => route.path, (newPath) => {
  if (newPath === '/notices') {
    setTimeout(refreshUnreadNotices, 300)
  }
})

async function refreshUser() {
  try {
    const me = await authApi.getMe()
    user.value = me
    try {
      localStorage.setItem('labhub_user', JSON.stringify(me))
    } catch {}
  } catch {
    const token = localStorage.getItem('labhub_token')
    if (!token) {
      user.value = null
    }
  }
}

onMounted(() => {
  refreshUser()
  refreshUnreadNotices()
  initNewUserGuides()
  window.addEventListener('account-updated', refreshUser)
  window.addEventListener(NOTICES_READ_EVENT, handleNoticesReadState)
  window.addEventListener('notices-updated', refreshUnreadNotices)
})

onBeforeUnmount(() => {
  window.removeEventListener('account-updated', refreshUser)
  window.removeEventListener(NOTICES_READ_EVENT, handleNoticesReadState)
  window.removeEventListener('notices-updated', refreshUnreadNotices)
  if (leaveTimer) clearTimeout(leaveTimer)
  if (peekTimer) clearTimeout(peekTimer)
  if (peekRetractTimer) clearTimeout(peekRetractTimer)
})

function openFeedback() {
  router.push(user.value?.role === 'admin' ? '/admin/feedback' : '/feedback')
}

function logout() {
  if (!window.confirm('确定要退出登录吗？')) return
  for (const key of ['labhub_token', 'labhub_user']) {
    localStorage.removeItem(key)
  }
  router.push('/login')
}
</script>

<template>
  <div class="sidebar-wrapper">
    <!-- 边缘感应带与方案二极简呼吸把手 -->
    <div
      v-if="!pinned"
      class="sidebar-edge-trigger"
      @mouseenter="handleMouseEnter"
      aria-hidden="true"
    >
      <div
        class="sidebar-grip-handle"
        :class="{ 'is-hidden': isHovered || isPeeking }"
        title="展开侧边栏"
      >
        <span class="grip-pill"></span>
        <AppIcon name="right" :size="9" class="grip-arrow" />
      </div>
    </div>

    <!-- 侧边栏主体 (方案一窥探动效 + 边缘滑出) -->
    <aside
      class="forecast-sidebar"
      :class="{
        'is-collapsed': !pinned && !isHovered && !isPeeking && !isTourPinStep,
        'is-floating': (!pinned && isHovered) || isTourPinStep,
        'is-peeking': !pinned && isPeeking && !isTourPinStep
      }"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <div class="sidebar-top">
        <div class="pin-anchor-wrapper">
          <!-- sour-rabbit-84 拟物图钉固定按钮 -->
          <label
            id="tour-pin-sidebar"
            class="sour-pin-container"
            :class="{ 'has-cue': showPinGuide && !pinned }"
            :title="pinned ? '取消固定（移开自动收起）' : '固定侧边栏'"
            :aria-label="pinned ? '取消固定（移开自动收起）' : '固定侧边栏'"
          >
            <input
              type="checkbox"
              :checked="pinned"
              @change="togglePin"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 75 100"
              class="pin"
              aria-hidden="true"
            >
              <line
                stroke-width="12"
                stroke="currentColor"
                y2="100"
                x2="37"
                y1="64"
                x1="37"
              ></line>
              <path
                stroke-width="10"
                stroke="currentColor"
                d="M16.5 36V4.5H58.5V36V53.75V54.9752L59.1862 55.9903L66.9674 67.5H8.03256L15.8138 55.9903L16.5 54.9752V53.75V36Z"
              ></path>
            </svg>
            <!-- 方案三：柔和呼吸扩散光环 -->
            <span v-if="showPinGuide && !pinned && (isHovered || isPeeking)" class="pin-pulse-ring" aria-hidden="true"></span>
          </label>

          <!-- 方案三：极轻量毛玻璃微胶囊引导提示 -->
          <div
            v-if="showPinGuide && !pinned && (isHovered || isPeeking)"
            class="pin-guide-tooltip"
            @click.stop="togglePin"
          >
            <span>点击固定侧边栏</span>
          </div>
        </div>

        <router-link to="/" class="sidebar-brand" :aria-label="siteConfig.labName + '首页'">
          <img src="/assets/LO_logo.svg" alt="LabOrbit Logo" class="sidebar-brand-logo" />
          <span class="sidebar-brand-text">{{ siteConfig.labShortName }}</span>
        </router-link>
      </div>

      <nav class="sidebar-links" aria-label="主导航">
        <router-link
          v-for="item in items"
          :key="item.to"
          :id="'tour-nav-' + (item.to === '/' ? 'home' : item.to.replace('/', ''))"
          :to="item.to"
          class="sidebar-link iso-pro"
          :aria-label="item.label"
        >
          <span class="iso-layer"></span>
          <span class="iso-layer"></span>
          <span class="iso-layer"></span>
          <div class="iso-icon">
            <AppIcon :name="item.icon" :size="21" />
            <span
              v-if="item.to === '/notices' && unreadNoticesCount > 0"
              class="nav-notice-badge"
              :title="`有 ${unreadNoticesCount} 条未读重要通知`"
            >
              {{ unreadNoticesCount > 99 ? '99+' : unreadNoticesCount }}
            </span>
          </div>
          <div class="iso-text">{{ item.label }}</div>
        </router-link>
      </nav>

      <div class="sidebar-bottom">
        <router-link to="/favorites" class="sidebar-tool iso-pro" aria-label="我的收藏">
          <span class="iso-layer"></span>
          <span class="iso-layer"></span>
          <span class="iso-layer"></span>
          <div class="iso-icon">
            <AppIcon name="star" :size="21" />
          </div>
          <div class="iso-text">我的收藏</div>
        </router-link>

        <button
          class="sidebar-tool iso-pro"
          :aria-label="user?.role === 'admin' ? '反馈管理' : '我的反馈'"
          @click="openFeedback"
        >
          <span class="iso-layer"></span>
          <span class="iso-layer"></span>
          <span class="iso-layer"></span>
          <div class="iso-icon">
            <AppIcon name="warning" :size="21" />
          </div>
          <div class="iso-text">{{ user?.role === 'admin' ? '反馈管理' : '我的反馈' }}</div>
        </button>

        <!-- AI 助手大模型对话按钮 -->
        <router-link
          id="tour-nav-assistant"
          to="/assistant"
          class="sidebar-tool iso-pro"
          aria-label="AI 助手"
        >
          <span class="iso-layer"></span>
          <span class="iso-layer"></span>
          <span class="iso-layer"></span>
          <div class="iso-icon">
            <AppIcon name="robot" :size="21" />
            <span v-if="isAiGeneratingGlobally" class="nav-ai-pulsing-badge" title="AI 助手正在后台持续生成回复中..."></span>
          </div>
          <div class="iso-text">AI 助手</div>
        </router-link>

        <!-- 头像账户设置按钮：鼠标悬停展开显示“账户设置”，点击直接进入账户设置 -->
        <router-link
          id="tour-nav-account"
          to="/account"
          class="account-btn-duck"
          :title="user ? `${user.nickname || user.real_name || user.name} · ${roleLabel} (账户设置)` : '账户设置'"
          :aria-label="user ? `账户设置 · ${user.nickname || user.real_name || user.name}` : '账户设置'"
        >
          <div class="sign">
            <div class="avatar-circle">
              <UserAvatar :user="user || { nickname: '我' }" />
            </div>
          </div>
          <div class="text">账户设置</div>
        </router-link>

        <!-- thin-duck-22 退出登录按钮 -->
        <button
          class="logout-btn-duck"
          aria-label="退出登录"
          title="退出登录"
          @click="logout"
        >
          <div class="sign">
            <svg viewBox="0 0 512 512" class="logout-svg" aria-hidden="true">
              <path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z"></path>
            </svg>
          </div>
          <div class="text">退出登录</div>
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .sidebar-wrapper {
    display: none !important;
  }
}

/* 屏幕最左侧感应触发带 */
.sidebar-edge-trigger {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 18px;
  z-index: 45;
  background: transparent;
}

/* 方案二：屏幕左侧垂直居中灵动呼吸微把手 */
.sidebar-grip-handle {
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 5px;
  height: 48px;
  border-radius: 0 8px 8px 0;
  background: color-mix(in srgb, var(--accent, #b89bf8) 22%, rgba(255, 255, 255, 0.08));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--accent, #b89bf8) 35%, transparent);
  border-left: none;
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent, #b89bf8) 20%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 46;
  opacity: 0.45;
  transition: all 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: grip-glow-breath 3.6s ease-in-out infinite alternate;
}

@keyframes grip-glow-breath {
  0% {
    opacity: 0.35;
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent, #b89bf8) 15%, transparent);
  }
  100% {
    opacity: 0.65;
    box-shadow: 0 0 16px color-mix(in srgb, var(--accent, #b89bf8) 35%, transparent);
  }
}

.sidebar-grip-handle .grip-arrow {
  opacity: 0;
  transform: translateX(-4px);
  color: var(--accent, #b89bf8);
  transition: all 0.25s ease;
  font-size: 9px;
  flex-shrink: 0;
}

.sidebar-edge-trigger:hover .sidebar-grip-handle,
.sidebar-grip-handle:hover {
  width: 14px;
  height: 52px;
  opacity: 1 !important;
  box-shadow: 2px 0 18px color-mix(in srgb, var(--accent, #b89bf8) 50%, transparent);
}

.sidebar-edge-trigger:hover .sidebar-grip-handle .grip-arrow,
.sidebar-grip-handle:hover .grip-arrow {
  opacity: 1;
  transform: translateX(0);
}

.sidebar-grip-handle.is-hidden {
  opacity: 0 !important;
  transform: translateY(-50%) translateX(-100%) !important;
  pointer-events: none !important;
}

/* 方案一：侧边栏新用户入场半滑出窥探动效 */
.forecast-sidebar.is-peeking {
  transform: translateX(-50%) !important;
  box-shadow: 6px 0 28px rgba(0, 0, 0, 0.55), 0 0 20px color-mix(in srgb, var(--accent, #b89bf8) 20%, transparent) !important;
  transition: transform 0.68s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

/* 方案三：图钉锚点、呼吸光环与微胶囊引导条 */
.pin-anchor-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sour-pin-container.has-cue {
  border-color: color-mix(in srgb, var(--accent, #b89bf8) 40%, transparent);
}

.pin-pulse-ring {
  position: absolute;
  inset: -3px;
  border-radius: 12px;
  border: 1.5px solid var(--accent, #b89bf8);
  pointer-events: none;
  animation: pin-ring-pulse 2.2s cubic-bezier(0.24, 0, 0.38, 1) infinite;
}

@keyframes pin-ring-pulse {
  0% {
    transform: scale(0.92);
    opacity: 0.85;
  }
  70% {
    transform: scale(1.36);
    opacity: 0;
  }
  100% {
    transform: scale(1.36);
    opacity: 0;
  }
}

.pin-guide-tooltip {
  position: absolute;
  left: 48px;
  top: 50%;
  transform: translateY(-50%);
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
  color: var(--accent, #b89bf8);
  background: color-mix(in srgb, var(--panel, #0c0a1a) 88%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid color-mix(in srgb, var(--accent, #b89bf8) 40%, transparent);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4), 0 0 12px color-mix(in srgb, var(--accent, #b89bf8) 25%, transparent);
  cursor: pointer;
  z-index: 120;
  animation: guide-slide-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transition: all 0.2s ease;
}

.pin-guide-tooltip:hover {
  background: color-mix(in srgb, var(--accent, #b89bf8) 18%, var(--panel, #0c0a1a));
  border-color: var(--accent, #b89bf8);
  transform: translateY(-50%) translateX(2px);
}

@keyframes guide-slide-in {
  0% {
    opacity: 0;
    transform: translateY(-50%) translateX(-8px);
  }
  100% {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
}

/* 侧边栏顶部固定/品牌区域 */
.sidebar-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.sidebar-top .sidebar-brand {
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-decoration: none;
  cursor: pointer;
}

.sidebar-brand-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(187, 144, 252, 0.45));
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.sidebar-brand:hover .sidebar-brand-logo {
  transform: scale(1.14) rotate(8deg);
}

.sidebar-brand-text {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text);
  line-height: 1;
}

/* sour-rabbit-84 拟物图钉样式 */
.sour-pin-container {
  width: 38px;
  height: 38px;
  background-color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  color: var(--muted, #8faab2);
}

.sour-pin-container input {
  display: none;
}

.sour-pin-container .pin {
  width: 15px;
  height: auto;
  transform: rotate(35deg);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.25s ease;
}

.sour-pin-container .pin line,
.sour-pin-container .pin path {
  stroke: currentColor;
  transition: stroke 0.25s ease, fill 0.25s ease;
}

.sour-pin-container:hover {
  background-color: rgba(184, 155, 248, 0.12);
  border-color: rgba(184, 155, 248, 0.3);
  color: #f3e8ff;
  box-shadow: 0 0 10px rgba(184, 155, 248, 0.15);
}

.sour-pin-container:active {
  transform: scale(0.9);
}

.sour-pin-container input:checked ~ .pin {
  transform: rotate(0deg);
  color: var(--accent, #b89bf8);
}

.sour-pin-container input:checked ~ .pin line {
  stroke: var(--accent, #b89bf8);
}

.sour-pin-container input:checked ~ .pin path {
  fill: var(--accent, #b89bf8);
  stroke: var(--accent, #b89bf8);
}

/* 浮动展开时的阴影与背景强化 */
.forecast-sidebar.is-floating {
  z-index: 100;
  box-shadow: 8px 0 32px rgba(0, 0, 0, 0.65), 0 0 20px color-mix(in srgb, var(--accent, #b89bf8) 15%, transparent);
  background: var(--panel-solid, rgba(12, 10, 26, 0.96));
  border-right: 1px solid var(--line);
}

/* 头像账户设置按钮样式（类似退出登录按钮风格，hover 展开显示“账户设置”） */
.account-btn-duck {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 40px;
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  background-color: var(--surface, rgba(16, 12, 32, 0.55));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 0;
  margin: 6px auto;
  text-decoration: none;
  box-sizing: border-box;
}

.account-btn-duck .sign {
  width: 100%;
  height: 100%;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: transparent;
}

.account-btn-duck .avatar-circle {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent, #b89bf8);
  color: var(--accent-ink, #070314);
  font-size: 15px;
  font-weight: 700;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.account-btn-duck .avatar-circle :deep(.user-avatar-image) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}

.account-btn-duck .avatar-circle span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  line-height: 1;
}

.account-btn-duck .text {
  position: absolute;
  right: 0%;
  width: 0%;
  opacity: 0;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  letter-spacing: -0.2px;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.account-btn-duck:hover {
  width: 78px;
  border-radius: 20px;
  background-color: var(--raised, rgba(184, 155, 248, 0.18));
  border-color: var(--accent, #b89bf8);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--accent, #b89bf8) 35%, transparent);
}

.account-btn-duck:hover .sign {
  width: 0;
  padding: 0;
  margin: 0;
  opacity: 0;
  transform: scale(0);
  overflow: hidden;
}

.account-btn-duck:hover .avatar-circle {
  width: 0;
  height: 0;
  opacity: 0;
  transform: scale(0);
}

.account-btn-duck:hover .text {
  opacity: 1;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text, #f5f3ff);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.account-btn-duck:active {
  transform: translate(1px, 1px) scale(0.98);
}

.account-btn-duck.router-link-exact-active {
  border-color: var(--accent, #b89bf8);
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent, #b89bf8) 30%, transparent);
}

/* thin-duck-22 退出登录按钮样式 */
.logout-btn-duck {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 99, 99, 0.35);
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  background-color: rgba(220, 53, 69, 0.22);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 0;
  margin: 6px auto;
}

.logout-btn-duck .sign {
  width: 100%;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logout-btn-duck .logout-svg {
  width: 15px;
  height: 15px;
  fill: #ff8585;
  transition: fill 0.3s ease;
}

.logout-btn-duck .text {
  position: absolute;
  right: 0%;
  width: 0%;
  opacity: 0;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  letter-spacing: -0.2px;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.logout-btn-duck:hover {
  width: 76px;
  border-radius: 20px;
  background-color: rgb(220, 53, 69);
  border-color: rgb(220, 53, 69);
  box-shadow: 0 4px 16px rgba(220, 53, 69, 0.45);
}

.logout-btn-duck:hover .sign {
  width: 25px;
  padding-left: 6px;
}

.logout-btn-duck:hover .logout-svg {
  fill: #ffffff;
}

.logout-btn-duck:hover .text {
  opacity: 1;
  width: calc(100% - 25px);
  padding-right: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logout-btn-duck:active {
  transform: translate(1px, 1px) scale(0.98);
}

/* kind-gecko-74 等轴测 3D 浮雕按键动效 */
.sidebar-link.iso-pro,
.sidebar-tool.iso-pro {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 44px;
  height: 44px;
  margin: auto;
  border-radius: 14px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
  border: none;
  padding: 0;
}

.iso-pro .iso-icon {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 14px;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.3s ease;
  color: #a3c2c8;
}

.iso-pro .iso-icon :deep(svg) {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), fill 0.3s ease;
}

.nav-ai-pulsing-badge {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #68d391;
  box-shadow: 0 0 8px rgba(104, 211, 145, 0.8);
  animation: navAiPulseGlow 1.4s ease-in-out infinite;
  pointer-events: none;
  z-index: 10;
}

@keyframes navAiPulseGlow {
  0%, 100% {
    transform: scale(0.85);
    opacity: 0.6;
    box-shadow: 0 0 4px rgba(104, 211, 145, 0.6);
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
    box-shadow: 0 0 12px rgba(104, 211, 145, 0.95);
  }
}

.nav-notice-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9999px;
  background: #ef4444;
  background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  line-height: 17px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(225, 29, 72, 0.45), 0 0 0 1.5px rgba(15, 12, 34, 0.85);
  pointer-events: none;
  z-index: 10;
  animation: noticeBadgePop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes noticeBadgePop {
  0% {
    transform: scale(0.4);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.iso-pro .iso-layer {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  border: 1px solid var(--line);
  box-shadow: inset 0 0 14px color-mix(in srgb, var(--accent, #b89bf8) 18%, transparent),
              inset 0 0 4px rgba(255, 255, 255, 0.25),
              0 4px 8px rgba(0, 0, 0, 0.3);
  background: color-mix(in srgb, var(--panel, rgba(16, 12, 32, 0.40)) 50%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  opacity: 0;
  pointer-events: none;
}

.iso-pro:hover .iso-layer {
  opacity: 1;
}

.iso-pro:hover .iso-layer:nth-of-type(1) {
  opacity: 0.25;
  transform: translate(0, 0);
}

.iso-pro:hover .iso-layer:nth-of-type(2) {
  opacity: 0.5;
  transform: translate(4px, -4px);
  border-color: color-mix(in srgb, var(--accent, #b89bf8) 40%, transparent);
}

.iso-pro:hover .iso-layer:nth-of-type(3) {
  opacity: 0.8;
  transform: translate(8px, -8px);
  border-color: var(--accent, #b89bf8);
  box-shadow: inset 0 0 16px color-mix(in srgb, var(--accent, #b89bf8) 30%, transparent), 0 0 12px color-mix(in srgb, var(--accent, #b89bf8) 25%, transparent);
}

.iso-pro:hover .iso-icon {
  transform: translate(12px, -12px);
  color: var(--text, #f3e8ff);
}

.iso-pro:hover .iso-icon :deep(svg) {
  transform: scale(1.15);
  fill: var(--text, #f3e8ff);
}

.iso-pro .iso-text {
  position: absolute;
  left: 56px;
  opacity: 0;
  pointer-events: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--text, #ffffff);
  background: var(--panel-solid, rgba(12, 10, 26, 0.96));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--line);
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.4),
              inset 0 0 10px color-mix(in srgb, var(--accent, #b89bf8) 10%, transparent);
  z-index: 100;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: translate(0, 0);
}

.iso-pro:hover .iso-text {
  opacity: 1;
  transform: translate(16px, -2px) skew(-5deg);
}

/* Active router state */
.sidebar-link.router-link-exact-active .iso-icon,
.sidebar-tool.router-link-exact-active .iso-icon {
  color: var(--accent, #b89bf8);
}

.sidebar-link.router-link-exact-active .iso-layer:nth-of-type(1) {
  opacity: 0.3;
  transform: translate(0, 0);
  background: var(--raised, rgba(184, 155, 248, 0.12));
}

.sidebar-link.router-link-exact-active .iso-layer:nth-of-type(2) {
  opacity: 0.55;
  transform: translate(3px, -3px);
  border-color: color-mix(in srgb, var(--accent, #b89bf8) 40%, transparent);
}

.sidebar-link.router-link-exact-active .iso-layer:nth-of-type(3) {
  opacity: 0.85;
  transform: translate(6px, -6px);
  border-color: var(--accent, #b89bf8);
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent, #b89bf8) 35%, transparent);
}

@media (max-width: 650px) {
  .sidebar-edge-trigger,
  .sour-pin-container,
  .logout-btn-duck,
  .account-btn-duck {
    display: none !important;
  }
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .sour-pin-container:hover {
  background-color: rgba(197, 230, 223, 0.12) !important;
  border-color: rgba(197, 230, 223, 0.3) !important;
  color: #e4f7f2 !important;
  box-shadow: 0 0 10px rgba(197, 230, 223, 0.15) !important;
}

[data-theme-style="vanta-fog"] .sour-pin-container input:checked ~ .pin {
  color: var(--accent, #8eedd1) !important;
}

[data-theme-style="vanta-fog"] .sour-pin-container input:checked ~ .pin line {
  stroke: var(--accent, #8eedd1) !important;
}

[data-theme-style="vanta-fog"] .sour-pin-container input:checked ~ .pin path {
  fill: var(--accent, #8eedd1) !important;
  stroke: var(--accent, #8eedd1) !important;
}

[data-theme-style="vanta-fog"] .forecast-sidebar.is-floating {
  box-shadow: 8px 0 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(197, 230, 223, 0.1) !important;
  background: rgba(16, 42, 51, 0.95) !important;
  border-right: 1px solid rgba(197, 230, 223, 0.3) !important;
}

[data-theme-style="vanta-fog"] .account-btn-duck {
  border: 1px solid rgba(197, 230, 223, 0.35) !important;
  background-color: rgba(22, 50, 60, 0.45) !important;
}

[data-theme-style="vanta-fog"] .account-btn-duck .sign {
  background: transparent !important;
}

[data-theme-style="vanta-fog"] .account-btn-duck .avatar-circle {
  background: #b9d4cb !important;
  color: var(--accent-ink, #102f33) !important;
}

[data-theme-style="vanta-fog"] .account-btn-duck:hover {
  background-color: rgb(26, 88, 96) !important;
  border-color: var(--accent, #c5e6df) !important;
  box-shadow: 0 4px 16px rgba(197, 230, 223, 0.4) !important;
}

[data-theme-style="vanta-fog"] .account-btn-duck.router-link-exact-active {
  border-color: var(--accent, #c5e6df) !important;
  box-shadow: 0 0 14px rgba(197, 230, 223, 0.3) !important;
}

[data-theme-style="vanta-fog"] .account-btn-duck .text {
  color: #e4f4ee !important;
}

[data-theme-style="vanta-fog"] .iso-layer {
  border: 1px solid rgba(197, 230, 223, 0.28) !important;
  box-shadow: inset 0 0 14px rgba(197, 230, 223, 0.18),
              inset 0 0 4px rgba(255, 255, 255, 0.25),
              0 4px 8px rgba(0, 0, 0, 0.2) !important;
  background: rgba(22, 50, 60, 0.25) !important;
}

[data-theme-style="vanta-fog"] .iso-pro:hover .iso-layer:nth-of-type(2) {
  border-color: rgba(197, 230, 223, 0.4) !important;
}

[data-theme-style="vanta-fog"] .iso-pro:hover .iso-layer:nth-of-type(3) {
  box-shadow: inset 0 0 16px rgba(197, 230, 223, 0.3), 0 0 12px rgba(197, 230, 223, 0.25) !important;
}

[data-theme-style="vanta-fog"] .iso-pro:hover .iso-icon {
  color: #e4f7f2 !important;
}

[data-theme-style="vanta-fog"] .iso-pro:hover .iso-icon :deep(svg) {
  fill: #e4f7f2 !important;
}

[data-theme-style="vanta-fog"] .iso-pro .iso-text {
  background: rgba(14, 38, 46, 0.95) !important;
  border: 1px solid rgba(197, 230, 223, 0.35) !important;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3),
              inset 0 0 10px rgba(197, 230, 223, 0.1) !important;
}

[data-theme-style="vanta-fog"] .sidebar-link.router-link-exact-active .iso-layer:nth-of-type(1) {
  background: rgba(197, 230, 223, 0.12) !important;
}

[data-theme-style="vanta-fog"] .sidebar-link.router-link-exact-active .iso-layer:nth-of-type(2) {
  border-color: rgba(197, 230, 223, 0.4) !important;
}

[data-theme-style="vanta-fog"] .sidebar-link.router-link-exact-active .iso-layer:nth-of-type(3) {
  box-shadow: 0 0 14px rgba(197, 230, 223, 0.35) !important;
}

[data-theme-style="vanta-fog"] .sidebar-grip-handle {
  background: rgba(197, 230, 223, 0.16) !important;
  border-color: rgba(197, 230, 223, 0.38) !important;
  box-shadow: 0 0 14px rgba(197, 230, 223, 0.25) !important;
}

[data-theme-style="vanta-fog"] .pin-pulse-ring {
  border-color: var(--accent, #8eedd1) !important;
}

[data-theme-style="vanta-fog"] .pin-guide-tooltip {
  background: rgba(14, 38, 46, 0.94) !important;
  border-color: rgba(197, 230, 223, 0.45) !important;
  color: var(--accent, #8eedd1) !important;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35), 0 0 12px rgba(197, 230, 223, 0.2) !important;
}
</style>

