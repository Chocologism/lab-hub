<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Navbar from './components/Navbar.vue'
import MobileHeader from './components/MobileHeader.vue'
import MobileNavBar from './components/MobileNavBar.vue'
import FeedbackHost from './components/FeedbackHost.vue'
import ForecastAtmosphere from './components/ForecastAtmosphere.vue'
import { enterPage, leavePage } from './composables/motion'
import { usePresence } from './composables/usePresence'

usePresence()

const route = useRoute()
const showNavbar = computed(() => !['/login', '/quick-share', '/setup'].includes(route.path))
const isHome = computed(() => route.path === '/')

const isPinned = ref(localStorage.getItem('sidebar_pinned') === 'true')

import SystemTutorialModal from './components/SystemTutorialModal.vue'
import DemoModeBanner from './components/DemoModeBanner.vue'
import { useTutorial } from './composables/useTutorial'
import { authApi } from './api/client'
import { isDemoMode } from './mock/isDemo'

const isDemo = computed(() => isDemoMode())
const { openTutorial } = useTutorial()
let hasCheckedTutorial = false

async function checkTutorialEligibility() {
  const token = localStorage.getItem('labhub_token')
  if (!token || route.path === '/setup' || route.path === '/login') return

  if (hasCheckedTutorial) return
  try {
    const u = await authApi.getMe()
    if (u && !u.tutorial_completed) {
      hasCheckedTutorial = true
      openTutorial({ role: u.role, mandatory: true })
    }
  } catch {}
}

watch(() => route.path, (to, from) => {
  isPinned.value = localStorage.getItem('sidebar_pinned') === 'true'
  if (to !== '/setup' && to !== '/login') {
    checkTutorialEligibility()
  }
}, { immediate: true })

function onUpdatePinned(val) {
  isPinned.value = val
  localStorage.setItem('sidebar_pinned', String(val))
}
</script>

<template>
  <div class="app-shell" :class="{ 'is-home': isHome, 'has-sidebar': showNavbar, 'sidebar-collapsed': !isPinned && showNavbar }">
    <ForecastAtmosphere />
    <a href="#main-content" class="skip-link">跳到主要内容</a>
    <MobileHeader v-if="showNavbar" />
    <Navbar v-if="showNavbar" :pinned="isPinned" @update:pinned="onUpdatePinned" />
    <main id="main-content" :class="!showNavbar ? 'public-workspace' : (isHome ? 'home-workspace' : 'workspace')">
      <router-view v-slot="{ Component }">
        <Transition :css="false" mode="out-in" @enter="enterPage" @leave="leavePage">
          <KeepAlive include="AssistantView">
            <component :is="Component" :key="route.path" />
          </KeepAlive>
        </Transition>
      </router-view>
    </main>
    <MobileNavBar v-if="showNavbar" />
    <FeedbackHost />
    <SystemTutorialModal />
    <DemoModeBanner />
    <div v-if="isDemo" class="demo-watermark-overlay" aria-hidden="true"></div>
  </div>
</template>

<style>
.skip-link { 
  position: fixed; 
  top: -60px; 
  left: 20px; 
  background: var(--accent); 
  color: #ffffff; 
  padding: 10px 20px; 
  z-index: 200; 
  border-radius: 9999px; 
  font-weight: 500; 
  font-size: 13px; 
}
.skip-link:focus { top: 12px; }
.home-workspace { width: 100%; min-width: 0; }

.demo-watermark-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9980;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='340' viewBox='0 0 480 340'%3E%3Cg transform='rotate(-22 240 170)'%3E%3Ctext x='240' y='135' text-anchor='middle' dominant-baseline='central' fill='%23ffffff' fill-opacity='0.085' font-size='56' font-family='system-ui, -apple-system, sans-serif' font-weight='600' letter-spacing='4'%3E%E8%99%9A%E6%9E%84%E4%BF%A1%E6%81%AF%3C/text%3E%3Ctext x='240' y='205' text-anchor='middle' dominant-baseline='central' fill='%23ffffff' fill-opacity='0.085' font-size='56' font-family='system-ui, -apple-system, sans-serif' font-weight='600' letter-spacing='4'%3E%E4%BB%85%E4%BE%9B%E5%B1%95%E7%A4%BA%3C/text%3E%3C/g%3E%3C/svg%3E");
  background-size: 480px 340px;
}

@media (max-width: 640px) {
  .demo-watermark-overlay {
    background-size: 280px 198px;
  }
}
</style>
