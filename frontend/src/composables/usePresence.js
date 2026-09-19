import { ref, onMounted, onBeforeUnmount } from 'vue'
import { authApi } from '../api/client'

// 全局时间戳引用（每 15 秒自增更新），驱动所有光点状态动态响应
export const presenceNow = ref(Date.now())

let tickerTimer = null
let tickerRefCount = 0

function startGlobalTicker() {
  tickerRefCount++
  if (!tickerTimer && typeof window !== 'undefined') {
    tickerTimer = setInterval(() => {
      presenceNow.value = Date.now()
    }, 15000)
  }
}

function stopGlobalTicker() {
  tickerRefCount--
  if (tickerRefCount <= 0 && tickerTimer) {
    clearInterval(tickerTimer)
    tickerTimer = null
    tickerRefCount = 0
  }
}

/**
 * 根据活跃时间戳与参考时间计算在线状态
 * @param {string|number|Date|null} lastActiveAt 
 * @param {number} [nowMs] 
 * @returns {'online' | 'away' | 'offline'}
 */
export function calcPresenceStatus(lastActiveAt, nowMs = presenceNow.value) {
  if (!lastActiveAt) return 'offline'

  let targetMs = 0
  if (typeof lastActiveAt === 'number') {
    targetMs = lastActiveAt
  } else if (lastActiveAt instanceof Date) {
    targetMs = lastActiveAt.getTime()
  } else if (typeof lastActiveAt === 'string') {
    const raw = lastActiveAt.trim()
    if (!raw) return 'offline'
    // 兼容 SQLite UTC 时间字符串（如 '2026-09-15 11:20:30'）
    const isoStr = raw.includes('T') ? (raw.endsWith('Z') ? raw : `${raw}Z`) : `${raw.replace(' ', 'T')}Z`
    const parsed = new Date(isoStr).getTime()
    if (isNaN(parsed)) return 'offline'
    targetMs = parsed
  } else {
    return 'offline'
  }

  const diffSec = Math.max(0, Math.floor((nowMs - targetMs) / 1000))
  if (diffSec <= 150) return 'online' // 2.5 分钟以内：在线
  if (diffSec <= 600) return 'away'   // 10 分钟以内：离开
  return 'offline'                   // 超过 10 分钟：离线
}

/**
 * 解析成员对象的实时在线状态
 * 优先基于当前时间戳比对最后活跃时间；无时间戳时回退至服务端预判状态
 * @param {object} member
 * @param {number} [nowMs]
 * @returns {'online' | 'away' | 'offline'}
 */
export function getMemberPresence(member, nowMs = presenceNow.value) {
  if (!member) return 'offline'
  if (member.last_active_at) {
    return calcPresenceStatus(member.last_active_at, nowMs)
  }
  if (member.presence_status === 'online' || member.presence_status === 'away') {
    return member.presence_status
  }
  return 'offline'
}

let heartbeatTimer = null
let lastHeartbeatSentAt = 0

async function sendHeartbeatSafe() {
  if (typeof window === 'undefined') return
  const token = localStorage.getItem('labhub_token')
  if (!token) return

  // 节流：两次心跳间隔不少于 20 秒
  const now = Date.now()
  if (now - lastHeartbeatSentAt < 20000) return

  lastHeartbeatSentAt = now
  try {
    await authApi.heartbeat()
  } catch (err) {
    // 静默忽略偶发心跳失败，避免干扰正常操作
  }
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return
  if (document.visibilityState === 'visible') {
    const now = Date.now()
    if (now - lastHeartbeatSentAt > 30000) {
      sendHeartbeatSafe()
    }
  }
}

/**
 * 在线状态心跳 Composable
 * 供顶层 App.vue 或需保活的视图调用
 */
export function usePresence() {
  onMounted(() => {
    startGlobalTicker()
    sendHeartbeatSafe()

    if (!heartbeatTimer && typeof window !== 'undefined') {
      // 每 50 秒发送一次静默心跳
      heartbeatTimer = setInterval(() => {
        sendHeartbeatSafe()
      }, 50000)

      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
  })

  onBeforeUnmount(() => {
    stopGlobalTicker()
  })

  return {
    presenceNow,
    calcPresenceStatus,
    getMemberPresence,
    sendHeartbeat: sendHeartbeatSafe
  }
}
