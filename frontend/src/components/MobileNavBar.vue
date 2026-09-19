<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'

const route = useRoute()

const navItems = [
  { to: '/', label: '工作台', icon: 'planet', exact: true },
  { to: '/arxiv', label: '文献推荐', icon: 'file-text' },
  { to: '/seminars', label: '学术日程', icon: 'calendar' },
  { to: '/mailbox', label: '学术邮箱', icon: 'envelope' },
  { to: '/resources', label: '教材资料', icon: 'database' },
]

function isActive(item) {
  if (item.exact) {
    return route.path === item.to
  }
  return route.path.startsWith(item.to)
}
</script>

<template>
  <Teleport to="body">
    <nav class="mobile-nav-bar" aria-label="移动端主导航">
      <div class="mobile-nav-track">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="mobile-nav-item"
          :class="{ active: isActive(item) }"
        >
          <div class="nav-icon-wrap">
            <AppIcon :name="item.icon" :size="20" />
            <span v-if="isActive(item)" class="nav-active-glow" aria-hidden="true"></span>
          </div>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </div>
    </nav>
  </Teleport>
</template>

<style scoped>
.mobile-nav-bar {
  display: none;
}

@media (max-width: 768px) {
  .mobile-nav-bar {
    display: block;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    z-index: 990;
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
    background: rgba(10, 6, 20, 0.94);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-top: 1px solid rgba(184, 155, 248, 0.16);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
  }

  .mobile-nav-track {
    display: flex;
    align-items: center;
    justify-content: space-around;
    height: 58px;
    max-width: 500px;
    margin: 0 auto;
    padding: 0 6px;
  }

  .mobile-nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 100%;
    color: var(--muted, #b2c6c8);
    text-decoration: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    position: relative;
  }

  .mobile-nav-item:active {
    transform: scale(0.92);
  }

  .nav-icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 24px;
  }

  .nav-active-glow {
    position: absolute;
    bottom: -3px;
    width: 14px;
    height: 3px;
    border-radius: 999px;
    background: var(--accent, #b89bf8);
    box-shadow: 0 0 10px var(--accent, #b89bf8);
  }

  .nav-label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    line-height: 1.2;
    transition: color 0.2s ease;
  }

  .mobile-nav-item.active {
    color: var(--accent, #b89bf8);
  }

  .mobile-nav-item.active .nav-label {
    font-weight: 600;
    color: #ffffff;
    text-shadow: 0 0 12px rgba(184, 155, 248, 0.6);
  }

  /* ==========================================================================
     水波云雾风格还原 (Vanta Fog / Clouds Static)
     ========================================================================== */
  [data-theme-style="vanta-fog"] .mobile-nav-bar {
    background: rgba(10, 26, 33, 0.92) !important;
    border-top: 1px solid rgba(218, 238, 235, 0.16) !important;
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.4) !important;
  }

  [data-theme-style="vanta-fog"] .nav-active-glow {
    background: var(--accent, #c5e6df) !important;
    box-shadow: 0 0 10px var(--accent, #c5e6df) !important;
  }

  [data-theme-style="vanta-fog"] .mobile-nav-item.active {
    color: var(--accent, #c5e6df) !important;
  }

  [data-theme-style="vanta-fog"] .mobile-nav-item.active .nav-label {
    text-shadow: 0 0 12px rgba(197, 230, 223, 0.6) !important;
  }
}
</style>
