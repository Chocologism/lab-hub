import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const routes = [
  { path: '/feedback', component: () => import('../views/FeedbackView.vue'), meta: { requiresAuth: true } },
  { path: '/account', component: () => import('../views/AccountView.vue'), meta: { requiresAuth: true } },
  {
    path: '/',
    name: 'Home',
    component: HomeView,
    meta: { requiresAuth: true },
  },
  { path: '/library', name: 'Library', component: () => import('../views/LibraryView.vue'), meta: { requiresAuth: true } },
  { path: '/favorites', name: 'Favorites', component: () => import('../views/FavoritesView.vue'), meta: { requiresAuth: true } },
  { path: '/admin/feedback', name: 'AdminFeedback', component: () => import('../views/AdminFeedbackView.vue'), meta: { requiresAuth: true } },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
  },
  {
    path: '/arxiv',
    name: 'ArxivFeed',
    component: () => import('../views/ArxivFeedView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/seminars',
    name: 'Seminars',
    component: () => import('../views/SeminarView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/resources',
    name: 'Resources',
    component: () => import('../views/ResourceHubView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/mailbox',
    name: 'Mailbox',
    component: () => import('../views/MailboxView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/notices',
    name: 'Notices',
    component: () => import('../views/NoticesView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/quick-share',
    name: 'QuickShare',
    component: () => import('../views/QuickShareView.vue'),
  },
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('../views/SetupView.vue'),
  },
  {
    path: '/assistant',
    name: 'Assistant',
    component: () => import('../views/AssistantView.vue'),
    meta: { requiresAuth: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

import { useSiteConfig } from '../composables/useSiteConfig'

router.beforeEach(async (to, from, next) => {
  const { siteConfig, fetchSiteStatus } = useSiteConfig()

  if (siteConfig.initialized === null) {
    await fetchSiteStatus()
  }

  // 1. 系统未初始化：强制重定向至 /setup
  if (siteConfig.initialized === false) {
    if (to.path !== '/setup') {
      return next({ path: '/setup' })
    }
    return next()
  }

  // 2. 系统已初始化：禁止重入 /setup
  if (to.path === '/setup') {
    return next({ path: '/' })
  }

  // 3. 身份认证权限校验
  const token = localStorage.getItem('labhub_token')
  if (to.meta.requiresAuth && !token) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

export default router
