<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import UserAvatar from './UserAvatar.vue'
import { authApi } from '../api/client'
import { useSiteConfig } from '../composables/useSiteConfig'

const { siteConfig } = useSiteConfig()

function getInitialUser() {
  try {
    const raw = localStorage.getItem('labhub_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const router = useRouter()
const route = useRoute()

const showMenu = ref(false)
const user = ref(getInitialUser())

const pageTitles = {
  '/': '工作台',
  '/arxiv': '文献推荐',
  '/quick-share': '推荐文献',
  '/seminars': '学术日程',
  '/mailbox': '学术邮箱',
  '/resources': '教材资料',
  '/library': '文献库',
  '/favorites': '我的收藏',
  '/account': '账户设置',
  '/feedback': '意见反馈',
  '/admin/feedback': '反馈管理'
}

const currentTitle = computed(() => {
  for (const [path, title] of Object.entries(pageTitles)) {
    if (path === '/' && route.path === '/') return title
    if (path !== '/' && route.path.startsWith(path)) return title
  }
  return '科研协作'
})

const roleLabel = computed(() => ({ teacher: '导师', admin: '管理员' }[user.value?.role] || '组员'))

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
  window.addEventListener('account-updated', refreshUser)
})

onBeforeUnmount(() => {
  window.removeEventListener('account-updated', refreshUser)
})

function navigateTo(path) {
  showMenu.value = false
  router.push(path)
}

function logout() {
  showMenu.value = false
  if (!window.confirm('确定要退出登录吗？')) return
  for (const key of ['labhub_token', 'labhub_user']) {
    localStorage.removeItem(key)
  }
  router.push('/login')
}
</script>

<template>
  <Teleport to="body">
    <header class="mobile-header">
      <div class="mobile-header-inner">
        <router-link to="/" class="mobile-brand" aria-label="返回工作台">
          <span class="brand-badge">{{ siteConfig.labShortName }}</span>
          <span class="brand-title">{{ currentTitle }}</span>
        </router-link>

        <button
          type="button"
          class="mobile-avatar-btn"
          :aria-label="user ? `${user.name} · ${roleLabel}` : '个人中心'"
          @click="showMenu = !showMenu"
        >
          <UserAvatar :user="user" />
        </button>
      </div>
    </header>

    <!-- 个人中心全屏遮罩与抽屉：独立挂载于 body 下，不受 header 变换和高度限制 -->
    <Transition name="mobile-drawer">
      <div v-if="showMenu" class="mobile-profile-overlay" @click="showMenu = false">
        <div class="mobile-profile-sheet" @click.stop>
          <div class="sheet-drag-handle" aria-hidden="true"></div>
          
          <header class="sheet-header">
            <div class="sheet-user-avatar">
              <UserAvatar :user="user" />
            </div>
            <div class="sheet-user-meta">
              <div class="sheet-user-name-row">
                <h3 class="sheet-user-name">{{ user?.nickname || user?.real_name || user?.name || '未知用户' }}</h3>
                <span class="sheet-role-badge" :class="user?.role">{{ roleLabel }}</span>
              </div>
              <span class="sheet-user-email mono">{{ user?.email || '—' }}</span>
            </div>
            <button type="button" class="sheet-close-btn" aria-label="关闭" @click="showMenu = false">
              <AppIcon name="close" :size="18" />
            </button>
          </header>

          <div class="sheet-nav-list">
            <button type="button" class="sheet-nav-item" @click="navigateTo('/library')">
              <AppIcon name="book-open" :size="18" />
              <span>文献库</span>
              <AppIcon name="right" :size="16" class="nav-arrow" />
            </button>
            <button type="button" class="sheet-nav-item" @click="navigateTo('/favorites')">
              <AppIcon name="star" :size="18" />
              <span>我的收藏</span>
              <AppIcon name="right" :size="16" class="nav-arrow" />
            </button>
            <button type="button" class="sheet-nav-item" @click="navigateTo('/account')">
              <AppIcon name="user" :size="18" />
              <span>账户与身份设置</span>
              <AppIcon name="right" :size="16" class="nav-arrow" />
            </button>
            <button type="button" class="sheet-nav-item" @click="navigateTo(user?.role === 'admin' ? '/admin/feedback' : '/feedback')">
              <AppIcon name="warning" :size="18" />
              <span>{{ user?.role === 'admin' ? '反馈管理' : '问题与意见反馈' }}</span>
              <AppIcon name="right" :size="16" class="nav-arrow" />
            </button>
          </div>

          <div class="sheet-footer">
            <button type="button" class="sheet-logout-btn" @click="logout">
              <AppIcon name="external" :size="16" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mobile-header,
.mobile-profile-overlay {
  display: none;
}

@media (max-width: 768px) {
  .mobile-header {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    z-index: 980;
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
    background: rgba(10, 6, 20, 0.94);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-bottom: 1px solid rgba(184, 155, 248, 0.16);
    padding-top: env(safe-area-inset-top, 0px);
    user-select: none;
    -webkit-user-select: none;
  }

  .mobile-header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 16px;
    max-width: 768px;
    margin: 0 auto;
  }

  .mobile-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--text, #ffffff);
  }

  .brand-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(184, 155, 248, 0.18);
    color: var(--accent, #b89bf8);
    border: 1px solid rgba(184, 155, 248, 0.35);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 2px 7px;
    border-radius: 6px;
  }

  .brand-title {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text, #ffffff);
  }

  .mobile-avatar-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1.5px solid rgba(184, 155, 248, 0.3);
    background: var(--surface);
    color: var(--text);
    display: grid;
    place-items: center;
    cursor: pointer;
    padding: 0;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-avatar-btn:active {
    transform: scale(0.94);
  }

  /* 个人中心抽屉蒙层 */
  .mobile-profile-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    z-index: 1050;
    background: rgba(1, 4, 10, 0.72);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .mobile-profile-sheet {
    width: 100%;
    background: #0c081e;
    border-top: 1px solid rgba(184, 155, 248, 0.2);
    border-radius: 24px 24px 0 0;
    padding: 12px 20px calc(24px + env(safe-area-inset-bottom, 0px));
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.7);
    max-height: 85dvh;
    overflow-y: auto;
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
  }

  .sheet-drag-handle {
    width: 36px;
    height: 4px;
    background: rgba(184, 155, 248, 0.3);
    border-radius: 999px;
    margin: 0 auto 16px;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 18px;
    border-bottom: 1px solid rgba(184, 155, 248, 0.14);
  }

  .sheet-user-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    display: grid;
    place-items: center;
    font-size: 20px;
    font-weight: 700;
    overflow: hidden;
    flex-shrink: 0;
  }

  .sheet-user-meta {
    flex: 1;
    min-width: 0;
  }

  .sheet-user-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sheet-user-name {
    font-size: 17px;
    font-weight: 600;
    color: #ffffff;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sheet-role-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(208, 231, 232, 0.15);
    color: var(--soft);
  }

  .sheet-role-badge.teacher {
    background: rgba(243, 216, 162, 0.2);
    color: #f3d8a2;
    border: 1px solid rgba(243, 216, 162, 0.35);
  }

  .sheet-user-email {
    font-size: 12px;
    color: var(--muted);
    display: block;
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sheet-close-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: rgba(184, 155, 248, 0.08);
    border: 0;
    color: var(--soft);
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .sheet-nav-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 0;
  }

  .sheet-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 10px 14px;
    border-radius: 12px;
    background: transparent;
    border: 0;
    color: var(--text);
    font-size: 14.5px;
    cursor: pointer;
    text-align: left;
    transition: background 0.18s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .sheet-nav-item:active {
    background: rgba(184, 155, 248, 0.12);
  }

  .sheet-nav-item .nav-arrow {
    margin-left: auto;
    color: var(--muted);
    opacity: 0.6;
  }

  .sheet-footer {
    padding-top: 10px;
    border-top: 1px solid rgba(184, 155, 248, 0.12);
  }

  .sheet-logout-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    border-radius: 12px;
    background: rgba(255, 194, 196, 0.12);
    border: 1px solid rgba(255, 194, 196, 0.25);
    color: var(--danger, #ffc2c4);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .sheet-logout-btn:active {
    background: rgba(255, 194, 196, 0.22);
  }

  /* 抽屉弹出动效 */
  .mobile-drawer-enter-active,
  .mobile-drawer-leave-active {
    transition: opacity 0.25s ease;
  }

  .mobile-drawer-enter-active .mobile-profile-sheet,
  .mobile-drawer-leave-active .mobile-profile-sheet {
    transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  }

  .mobile-drawer-enter-from,
  .mobile-drawer-leave-to {
    opacity: 0;
  }

  .mobile-drawer-enter-from .mobile-profile-sheet,
  .mobile-drawer-leave-to .mobile-profile-sheet {
    transform: translateY(100%);
  }

  /* ==========================================================================
     水波云雾风格还原 (Vanta Fog / Clouds Static)
     ========================================================================== */
  [data-theme-style="vanta-fog"] .mobile-header {
    background: rgba(8, 31, 40, 0.92) !important;
    border-bottom: 1px solid rgba(218, 238, 235, 0.16) !important;
  }

  [data-theme-style="vanta-fog"] .brand-badge {
    background: rgba(197, 230, 223, 0.18) !important;
    color: var(--accent, #c5e6df) !important;
    border: 1px solid rgba(197, 230, 223, 0.35) !important;
  }

  [data-theme-style="vanta-fog"] .mobile-avatar-btn {
    border: 1.5px solid rgba(197, 230, 223, 0.3) !important;
  }

  [data-theme-style="vanta-fog"] .mobile-profile-overlay {
    background: rgba(4, 16, 21, 0.68) !important;
  }

  [data-theme-style="vanta-fog"] .mobile-profile-sheet {
    background: #142f38 !important;
    border-top: 1px solid rgba(218, 238, 235, 0.22) !important;
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.6) !important;
  }

  [data-theme-style="vanta-fog"] .sheet-drag-handle {
    background: rgba(218, 238, 235, 0.3) !important;
  }

  [data-theme-style="vanta-fog"] .sheet-header {
    border-bottom: 1px solid rgba(218, 238, 235, 0.14) !important;
  }

  [data-theme-style="vanta-fog"] .sheet-close-btn {
    background: rgba(218, 238, 235, 0.08) !important;
  }

  [data-theme-style="vanta-fog"] .sheet-nav-item:active {
    background: rgba(218, 238, 235, 0.12) !important;
  }

  [data-theme-style="vanta-fog"] .sheet-footer {
    border-top: 1px solid rgba(218, 238, 235, 0.12) !important;
  }
}
</style>
