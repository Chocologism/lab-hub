import { ref, computed } from 'vue'

export const ADMIN_MODE_KEY = 'labhub_admin_view_mode'

// 内存兜底状态，便于在无原生 localStorage 的测试或无头环境中平稳运行
let inMemoryMode = 'admin'

/**
 * 获取当前管理员视角模式
 * @returns {'admin' | 'user'}
 */
export function getAdminMode() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(ADMIN_MODE_KEY)
      if (val === 'user' || val === 'admin') {
        return val
      }
    }
  } catch (e) {
    // 忽略异常
  }
  return inMemoryMode || 'admin'
}

// 响应式单例引用
const adminModeRef = ref(getAdminMode())

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('admin-mode-changed', (e) => {
    if (e.detail?.mode && adminModeRef.value !== e.detail.mode) {
      adminModeRef.value = e.detail.mode
    }
  })
}

/**
 * 设置管理员视角模式，并持久化到本地存储与事件通知
 * @param {'admin' | 'user'} mode 
 * @returns {'admin' | 'user'}
 */
export function setAdminMode(mode) {
  const targetMode = mode === 'user' ? 'user' : 'admin'
  inMemoryMode = targetMode
  adminModeRef.value = targetMode

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ADMIN_MODE_KEY, targetMode)

      // 同步更新本地缓存的 labhub_user 映射
      for (const key of ['labhub_user']) {
        const raw = window.localStorage.getItem(key)
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            const updated = applyViewMode(parsed)
            window.localStorage.setItem(key, JSON.stringify(updated))
          } catch (e) {
            // 忽略格式解析异常
          }
        }
      }
    }
  } catch (e) {
    // 忽略异常
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('admin-mode-changed', { detail: { mode: targetMode } }))
    window.dispatchEvent(new Event('account-updated'))
  }

  return targetMode
}

/**
 * 将视角模式应用至用户对象
 * 只有在用户后端真实角色为 'admin' 时，才允许映射为普通用户视角；
 * 普通组员账号受安全保护，不会发生任何意外提权或降权。
 * @param {object|null} user 
 * @returns {object|null}
 */
export function applyViewMode(user) {
  if (!user || typeof user !== 'object') return user

  // 记录真实角色
  const actualRole = user.actual_role || user.role
  const isRealAdmin = actualRole === 'admin'

  if (!isRealAdmin) {
    return {
      ...user,
      actual_role: actualRole,
      is_admin_account: false,
      effective_role: user.role,
      admin_view_mode: 'admin'
    }
  }

  const mode = getAdminMode()
  const effectiveRole = mode === 'user' ? 'user' : 'admin'

  return {
    ...user,
    actual_role: 'admin',
    is_admin_account: true,
    effective_role: effectiveRole,
    role: effectiveRole,
    can_manage_seminars: mode === 'user' ? false : (user.can_manage_seminars ?? true),
    can_manage_talks: mode === 'user' ? false : (user.can_manage_talks ?? true),
    admin_view_mode: mode
  }
}

/**
 * 管理员视角模式 Composable 接口
 */
export function useAdminMode() {
  const currentMode = computed(() => adminModeRef.value)
  const isUserMode = computed(() => adminModeRef.value === 'user')
  const isAdminMode = computed(() => adminModeRef.value === 'admin')

  const changeMode = (target) => {
    const updated = setAdminMode(target)
    adminModeRef.value = updated
    return updated
  }

  return {
    currentMode,
    isUserMode,
    isAdminMode,
    setAdminMode: changeMode,
    getAdminMode,
    applyViewMode
  }
}
