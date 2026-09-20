<script setup>
import { ref, computed, onMounted } from 'vue'
import { isDemoMode, switchDemoRole } from '../mock/isDemo'
import { resetDemoStorage } from '../mock/demoAdapter'
import { useTutorial } from '../composables/useTutorial'

const isDemo = computed(() => isDemoMode())
const isCollapsed = ref(false)
const currentUser = ref(null)

const { openTutorial, showTutorial } = useTutorial()

function refreshCurrentUser() {
  try {
    const raw = localStorage.getItem('labhub_user')
    currentUser.value = raw ? JSON.parse(raw) : null
  } catch {}
}

onMounted(() => {
  refreshCurrentUser()
})

function handleReset() {
  if (confirm('确定要重置所有在线演示数据至初始状态吗？这将清空您在本次体验中添加的测试数据。')) {
    resetDemoStorage()
  }
}

function handleStartTutorial() {
  openTutorial({ role: currentUser.value?.role || 'admin', mandatory: false })
}

function handleToggleRole() {
  const currentRole = currentUser.value?.role || 'admin'
  const nextRole = currentRole === 'admin' ? 'member' : 'admin'
  const updated = switchDemoRole(nextRole)
  currentUser.value = updated
  window.location.reload()
}
</script>

<template>
  <div v-if="isDemo && !showTutorial" class="demo-banner-container">
    <!-- 折叠状态小胶囊 -->
    <div
      v-if="isCollapsed"
      class="demo-pill-collapsed"
      @click="isCollapsed = false"
      title="展开 LabOrbit 在线演示面板"
    >
      <span class="pulse-dot"></span>
      <span class="font-semibold text-xs tracking-wide text-indigo-200">✨ Live Demo</span>
    </div>

    <!-- 展开状态控制条 -->
    <div v-else class="demo-panel">
      <div class="panel-header">
        <div class="flex items-center gap-2">
          <span class="pulse-dot"></span>
          <span class="font-bold text-xs tracking-wider text-indigo-300 uppercase">LabOrbit Live Demo</span>
        </div>
        <button
          class="collapse-btn"
          @click="isCollapsed = true"
          title="最小化演示浮窗"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>

      <div class="panel-body">
        <div class="user-chip">
          <span class="user-role-badge" :class="currentUser?.role === 'admin' ? 'badge-teacher' : 'badge-student'">
            {{ currentUser?.role === 'admin' ? '管理员' : '普通成员' }}
          </span>
          <span class="user-name truncate">{{ currentUser?.name || '李华 (导师 / 管理员)' }}</span>
        </div>

        <div class="actions-group">
          <button
            class="action-btn action-tour"
            @click="handleStartTutorial"
            title="启动全站新手引导体验流程"
          >
            <svg class="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
            </svg>
            <span>功能向导</span>
          </button>

          <button
            class="action-btn action-switch"
            @click="handleToggleRole"
            title="切换管理员/普通成员视角体验不同功能与向导"
          >
            <svg class="w-3.5 h-3.5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span>切身份</span>
          </button>

          <button
            class="action-btn action-reset"
            @click="handleReset"
            title="清空本地修改，恢复干净的出厂科研数据"
          >
            <svg class="w-3.5 h-3.5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>重置</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-banner-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9990;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  user-select: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.demo-pill-collapsed {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 9999px;
  padding: 6px 14px;
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5), 0 0 16px rgba(99, 102, 241, 0.25);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.demo-pill-collapsed:hover {
  transform: translateY(-2px) scale(1.03);
  border-color: rgba(99, 102, 241, 0.6);
  box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.4);
}

.demo-panel {
  width: 290px;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 14px;
  padding: 10px 12px;
  box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.6), 0 0 24px rgba(99, 102, 241, 0.2);
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.collapse-btn {
  color: #94a3b8;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: color 0.15s;
}

.collapse-btn:hover {
  color: #f8fafc;
}

.panel-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: #cbd5e1;
}

.user-role-badge {
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}

.badge-teacher {
  background: rgba(245, 158, 11, 0.2);
  color: #fcd34d;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.badge-student {
  background: rgba(14, 165, 233, 0.2);
  color: #7dd3fc;
  border: 1px solid rgba(14, 165, 233, 0.3);
}

.user-name {
  font-weight: 500;
  max-width: 190px;
}

.actions-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 4px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}

.action-tour:hover {
  border-color: rgba(245, 158, 11, 0.4);
  color: #fef3c7;
}

.action-switch:hover {
  border-color: rgba(56, 189, 248, 0.4);
  color: #e0f2fe;
}

.action-reset:hover {
  border-color: rgba(244, 63, 94, 0.4);
  color: #ffe4e6;
}

.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: pulseGlow 2s infinite;
}

@keyframes pulseGlow {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.85);
  }
}

@media (max-width: 640px) {
  .demo-banner-container {
    bottom: 74px; /* 避开移动端底部 TabBar */
    right: 12px;
  }
  .demo-panel {
    width: 260px;
  }
}
</style>
