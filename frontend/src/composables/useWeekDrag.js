import { ref, computed, getCurrentInstance, onBeforeUnmount, nextTick } from 'vue'

/**
 * useWeekDrag
 * 为周日程提供高帧率物理跟手、阻尼弹性、滑动切周与误触拦截支持
 *
 * @param {Object} options
 * @param {Function} options.onPrev - 切换到上一周
 * @param {Function} options.onNext - 切换到下一周
 * @param {Number} [options.threshold=50] - 触发切周的位移阈值 (px)
 * @param {Number} [options.flickVelocity=0.32] - 快速轻扫的瞬时速度阈值 (px/ms)
 */
export function useWeekDrag(options = {}) {
  const {
    onPrev,
    onNext,
    threshold = 50,
    flickVelocity = 0.32,
    damping = 0.78,
    maxFree = 180,
  } = options

  const containerRef = ref(null)
  const trackRef = ref(null)
  const dragOffset = ref(0)
  const isPointerDown = ref(false)
  const isDragging = ref(false)
  const isAnimating = ref(false)
  const trackStyle = ref({})
  const suppressClick = ref(false)
  const velocity = ref(0)

  let startX = 0
  let startY = 0
  let lastX = 0
  let lastTime = 0
  let hasMoved = false

  const dragDirection = computed(() => {
    if (dragOffset.value > 12) return 'prev'
    if (dragOffset.value < -12) return 'next'
    return null
  })

  const isThresholdMet = computed(() => {
    const dist = Math.abs(dragOffset.value)
    const vel = Math.abs(velocity.value)
    return dist >= threshold || (vel >= flickVelocity && dist >= 18)
  })

  function cleanupWindowListeners() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return
    if (isAnimating.value) return

    isPointerDown.value = true
    isDragging.value = false
    hasMoved = false
    dragOffset.value = 0
    velocity.value = 0

    startX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0
    startY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0
    lastX = startX
    lastTime = (typeof performance !== 'undefined' ? performance.now() : Date.now())

    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', onPointerMove, { passive: false })
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerUp)
    }
  }

  function onPointerMove(e) {
    if (!isPointerDown.value) return

    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0
    const dx = clientX - startX
    const dy = clientY - startY

    if (!isDragging.value) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        isDragging.value = true
        hasMoved = true
      } else if (Math.abs(dy) > 12) {
        cleanupWindowListeners()
        isPointerDown.value = false
        return
      }
    }

    if (isDragging.value) {
      if (e.cancelable && typeof e.preventDefault === 'function') {
        e.preventDefault()
      }

      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      const dt = now - lastTime
      if (dt > 0) {
        velocity.value = (clientX - lastX) / dt
      }
      lastX = clientX
      lastTime = now

      const abs = Math.abs(dx)
      let offset = dx
      if (abs > maxFree) {
        const excess = abs - maxFree
        offset = Math.sign(dx) * (maxFree + Math.pow(excess, damping) * 1.5)
      }
      dragOffset.value = offset

      trackStyle.value = {
        transform: `translate3d(${offset}px, 0, 0)`,
        transition: 'none',
        willChange: 'transform'
      }
    }
  }

  function onPointerUp() {
    cleanupWindowListeners()
    isPointerDown.value = false

    if (!isDragging.value || Math.abs(dragOffset.value) < 12) {
      isDragging.value = false
      return
    }

    isDragging.value = false

    suppressClick.value = true
    setTimeout(() => {
      suppressClick.value = false
    }, 120)

    const isFlick = Math.abs(velocity.value) > flickVelocity && Math.abs(dragOffset.value) > 18
    const isPast = Math.abs(dragOffset.value) >= threshold

    if (dragOffset.value < 0 && (isPast || (isFlick && velocity.value < 0))) {
      slideTransition(1)
    } else if (dragOffset.value > 0 && (isPast || (isFlick && velocity.value > 0))) {
      slideTransition(-1)
    } else {
      springBack()
    }
  }

  function springBack() {
    trackStyle.value = {
      transform: 'translate3d(0, 0, 0)',
      opacity: '1',
      transition: 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)',
      willChange: 'transform'
    }
    setTimeout(() => {
      if (!isDragging.value && !isAnimating.value) {
        trackStyle.value = {}
        dragOffset.value = 0
      }
    }, 260)
  }

  function slideTransition(direction, customUpdate) {
    if (isAnimating.value) return
    isAnimating.value = true

    const exitPx = direction > 0 ? -120 : 120
    trackStyle.value = {
      transform: `translate3d(${exitPx}px, 0, 0)`,
      opacity: '0.12',
      transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease',
      willChange: 'transform, opacity'
    }

    setTimeout(() => {
      if (typeof customUpdate === 'function') {
        customUpdate()
      } else if (direction > 0 && typeof onNext === 'function') {
        onNext()
      } else if (direction < 0 && typeof onPrev === 'function') {
        onPrev()
      }

      const enterPx = direction > 0 ? 80 : -80
      trackStyle.value = {
        transform: `translate3d(${enterPx}px, 0, 0)`,
        opacity: '0',
        transition: 'none'
      }

      nextTick(() => {
        if (trackRef.value) {
          void trackRef.value.offsetWidth
        }

        const runSettle = () => {
          trackStyle.value = {
            transform: 'translate3d(0, 0, 0)',
            opacity: '1',
            transition: 'transform 0.26s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.26s ease-out',
            willChange: 'transform, opacity'
          }

          setTimeout(() => {
            trackStyle.value = {}
            dragOffset.value = 0
            isAnimating.value = false
          }, 270)
        }

        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(runSettle)
        } else {
          runSettle()
        }
      })
    }, 190)
  }

  function slidePrev() {
    slideTransition(-1)
  }

  function slideNext() {
    slideTransition(1)
  }

  let wheelAccumX = 0
  let wheelResetTimer = null
  let wheelLockTimer = null
  let isWheelLocked = false
  let lockUntil = 0

  function onWheel(e) {
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.15 || (e.shiftKey && Math.abs(e.deltaY) > 0)
    if (!isHorizontal) {
      return
    }

    if (e.cancelable && typeof e.preventDefault === 'function') {
      e.preventDefault()
    }

    const now = Date.now()

    // 若当前处于锁定冷却期（刚触发过切周，或动画正在进行中）
    if (isWheelLocked || isAnimating.value) {
      // macOS 触控板惯性衰减会持续数百毫秒，持续重置解锁定时器，确保惯性完全停止后才允许下一次切周
      clearTimeout(wheelLockTimer)
      const delay = Math.max(160, lockUntil - now)
      wheelLockTimer = setTimeout(() => {
        if (!isAnimating.value) {
          isWheelLocked = false
          wheelAccumX = 0
        } else {
          setTimeout(() => {
            isWheelLocked = false
            wheelAccumX = 0
          }, 150)
        }
      }, delay)
      return
    }

    const dx = e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY) ? e.deltaY : e.deltaX
    wheelAccumX += dx

    const abs = Math.abs(wheelAccumX)
    let visualOffset = -Math.sign(wheelAccumX) * Math.min(maxFree, Math.pow(abs, damping) * 1.4)
    dragOffset.value = visualOffset
    isDragging.value = true

    trackStyle.value = {
      transform: `translate3d(${visualOffset}px, 0, 0)`,
      transition: 'none',
      willChange: 'transform'
    }

    // 提高切周位移阈值 (85px)，防止轻微触碰误翻；一旦达到阈值，立即锁定 650ms 并在惯性平息前拒绝连续切周
    const wheelThreshold = 85
    if (abs >= wheelThreshold) {
      const dir = wheelAccumX > 0 ? 1 : -1
      wheelAccumX = 0
      isWheelLocked = true
      lockUntil = now + 650
      isDragging.value = false
      slideTransition(dir)

      clearTimeout(wheelLockTimer)
      wheelLockTimer = setTimeout(() => {
        if (!isAnimating.value) {
          isWheelLocked = false
        }
      }, 650)
      return
    }

    clearTimeout(wheelResetTimer)
    wheelResetTimer = setTimeout(() => {
      wheelAccumX = 0
      isDragging.value = false
      springBack()
    }, 120)
  }

  function handleCaptureClick(e) {
    if (suppressClick.value) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation()
      if (typeof e.preventDefault === 'function') e.preventDefault()
    }
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      cleanupWindowListeners()
      clearTimeout(wheelResetTimer)
      clearTimeout(wheelLockTimer)
    })
  }

  return {
    containerRef,
    trackRef,
    dragOffset,
    isDragging,
    isPointerDown,
    isAnimating,
    dragDirection,
    isThresholdMet,
    trackStyle,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    slidePrev,
    slideNext,
    slideTransition,
    handleCaptureClick
  }
}
