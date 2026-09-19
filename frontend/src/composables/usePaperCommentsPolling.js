import { ref, computed, watch, onMounted, onBeforeUnmount, unref, getCurrentInstance } from 'vue'
import { arxivApi } from '../api/client'

/**
 * 自适应增量游标轮询 Composable
 * 
 * 核心策略：
 * 1. 增量游标：以本地已有留言最大 ID（since_id）增量拉取，杜绝冗余全量数据传输；
 * 2. 状态驱动的阶梯退避：
 *    - 活跃态 (Active): 输入框聚焦、正在输入草稿、或 60s 内有消息互动 -> 3s 高频轮询；
 *    - 静默态 (Idle): 卡片可见但失焦且无互动 -> 梯度退避 3s -> 6s -> 10s -> 15s；
 *    - 休眠态 (Dormant): 卡片滚出视口 (IntersectionObserver) 或标签页切到后台 (visibilityState === 'hidden') -> 0 CPU / 0 网络开销；
 * 3. 跨标签页即时同步: BroadcastChannel 广播新留言与删除事件，秒级多端同步。
 */
export function usePaperCommentsPolling(propsOrPaperId, commentsRef, options = {}) {
  const {
    isFocused = ref(false),
    hasDraft = ref(false),
    targetEl = ref(null),
    onNewComments = () => {},
    onCommentDeleted = () => {},
    enabled = ref(true),
    activeInterval = 3000,
    idleIntervals = [3000, 6000, 10000, 15000],
    activityWindowMs = 60000,
  } = options

  const getPaperId = () => {
    const raw = unref(propsOrPaperId)
    if (!raw) return null
    if (typeof raw === 'object') return raw.id || raw.paper_id || null
    return Number(raw) || null
  }

  const isIntersecting = ref(true)
  const isDocVisible = ref(
    typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true
  )
  const isPolling = ref(false)
  const lastActivityAt = ref(Date.now())
  const idleStep = ref(0)
  let pollTimer = null
  let observer = null
  let broadcastChannel = null

  // 状态判定
  const isDormant = computed(() => {
    if (!unref(enabled)) return true
    if (!isDocVisible.value) return true
    if (!isIntersecting.value) return true
    return false
  })

  const isActive = computed(() => {
    if (isDormant.value) return false
    if (unref(isFocused)) return true
    if (unref(hasDraft)) return true
    return (Date.now() - lastActivityAt.value) < activityWindowMs
  })

  const currentInterval = computed(() => {
    if (isDormant.value) return 0
    if (isActive.value) return activeInterval
    const step = Math.min(idleStep.value, idleIntervals.length - 1)
    return idleIntervals[step]
  })

  const getSinceId = () => {
    const list = unref(commentsRef)
    if (!Array.isArray(list) || !list.length) return 0
    return list.reduce((max, c) => Math.max(max, Number(c?.id) || 0), 0)
  }

  const clearTimer = () => {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  const scheduleNext = () => {
    clearTimer()
    if (isDormant.value) return
    const ms = currentInterval.value
    if (ms > 0) {
      pollTimer = setTimeout(async () => {
        await pollOnce()
        scheduleNext()
      }, ms)
    }
  }

  const pollOnce = async () => {
    if (isDormant.value || isPolling.value) return []
    const paperId = getPaperId()
    if (!paperId) return []

    isPolling.value = true
    const sinceId = getSinceId()

    try {
      const res = await arxivApi.getComments(paperId, sinceId)
      const newItems = Array.isArray(res) ? res : (res?.data || [])
      
      // 本地已有列表去重校验
      const currentList = unref(commentsRef) || []
      const existingIds = new Set(currentList.map(c => c.id))
      const trulyNew = newItems.filter(c => c && c.id && !existingIds.has(c.id))

      if (trulyNew.length > 0) {
        lastActivityAt.value = Date.now()
        idleStep.value = 0
        onNewComments(trulyNew)
      } else {
        // 无新消息时递增退避步进
        if (!isActive.value) {
          idleStep.value = Math.min(idleStep.value + 1, idleIntervals.length - 1)
        }
      }
      return trulyNew
    } catch (err) {
      // 网络或权限异常静默处理，适当退避
      idleStep.value = Math.min(idleStep.value + 1, idleIntervals.length - 1)
      return []
    } finally {
      isPolling.value = false
    }
  }

  const wakeUpAndPoll = async () => {
    lastActivityAt.value = Date.now()
    idleStep.value = 0
    await pollOnce()
    scheduleNext()
  }

  // 跨标签页广播
  const initBroadcastChannel = () => {
    if (typeof window === 'undefined' && typeof globalThis === 'undefined') return
    const BC = typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : (globalThis && globalThis.BroadcastChannel)
    if (!BC) return
    try {
      broadcastChannel = new BC('labhub_paper_comments')
      broadcastChannel.onmessage = (event) => {
        const data = event?.data
        if (!data) return
        const currentPaperId = getPaperId()
        if (data.paperId !== currentPaperId) return

        if (data.type === 'comment_added' && data.comment) {
          const currentList = unref(commentsRef) || []
          if (!currentList.some(c => c.id === data.comment.id)) {
            lastActivityAt.value = Date.now()
            idleStep.value = 0
            onNewComments([data.comment])
          }
        } else if (data.type === 'comment_deleted' && data.commentId) {
          onCommentDeleted(data.commentId)
        }
      }
    } catch (e) {
      // 兼容不支持 BroadcastChannel 的环境
      broadcastChannel = null
    }
  }

  const broadcastCommentAdded = (comment) => {
    const paperId = getPaperId()
    if (!paperId || !comment) return
    lastActivityAt.value = Date.now()
    idleStep.value = 0
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type: 'comment_added',
          paperId,
          comment,
        })
      } catch (e) {}
    }
  }

  const broadcastCommentDeleted = (commentId) => {
    const paperId = getPaperId()
    if (!paperId || !commentId) return
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type: 'comment_deleted',
          paperId,
          commentId,
        })
      } catch (e) {}
    }
  }

  // DOM 视口可见性观察
  const setupIntersectionObserver = () => {
    const IO = typeof IntersectionObserver !== 'undefined' ? IntersectionObserver : (globalThis && globalThis.IntersectionObserver)
    if (!IO) {
      isIntersecting.value = true
      return
    }
    const el = unref(targetEl)
    if (!el) {
      isIntersecting.value = true
      return
    }

    if (observer) {
      observer.disconnect()
      observer = null
    }

    observer = new IO((entries) => {
      const entry = entries[0]
      if (!entry) return
      const nowIntersecting = entry.isIntersecting
      const prevIntersecting = isIntersecting.value
      isIntersecting.value = nowIntersecting

      if (nowIntersecting && !prevIntersecting) {
        // 卡片滚动入屏唤醒
        wakeUpAndPoll()
      } else if (!nowIntersecting && prevIntersecting) {
        // 卡片滚出视口，暂停定时器
        clearTimer()
      }
    }, { threshold: 0.05 })

    observer.observe(el)
  }

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined') return
    const visible = document.visibilityState !== 'hidden'
    const prevVisible = isDocVisible.value
    isDocVisible.value = visible

    if (visible && !prevVisible) {
      // 从后台切换回前台唤醒
      wakeUpAndPoll()
    } else if (!visible && prevVisible) {
      // 切换到后台休眠
      clearTimer()
    }
  }

  const handleOnline = () => {
    wakeUpAndPoll()
  }

  // 监听输入状态变化
  watch([() => unref(isFocused), () => unref(hasDraft)], ([focused, drafting]) => {
    if (focused || drafting) {
      lastActivityAt.value = Date.now()
      idleStep.value = 0
      scheduleNext()
    }
  })

  // 监听文献 ID 切换
  watch(() => getPaperId(), (newId, oldId) => {
    if (newId !== oldId) {
      lastActivityAt.value = Date.now()
      idleStep.value = 0
      wakeUpAndPoll()
    }
  })

  // 监听 targetEl 挂载
  watch(() => unref(targetEl), (newEl) => {
    if (newEl) {
      setupIntersectionObserver()
    }
  })

  const start = () => {
    initBroadcastChannel()
    setupIntersectionObserver()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
    }
    scheduleNext()
  }

  const stop = () => {
    clearTimer()
    if (observer) {
      observer.disconnect()
      observer = null
    }
    if (broadcastChannel) {
      try {
        broadcastChannel.close()
      } catch (e) {}
      broadcastChannel = null
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
    }
  }

  if (getCurrentInstance()) {
    onMounted(start)
    onBeforeUnmount(stop)
  } else {
    start()
  }

  return {
    isDormant,
    isActive,
    currentInterval,
    idleStep,
    isPolling,
    pollOnce,
    wakeUpAndPoll,
    broadcastCommentAdded,
    broadcastCommentDeleted,
    start,
    stop,
  }
}
