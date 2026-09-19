import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useWeekDrag } from './useWeekDrag'

describe('useWeekDrag composable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('initializes with default idle state', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const drag = useWeekDrag({ onPrev, onNext })

    expect(drag.isDragging.value).toBe(false)
    expect(drag.isPointerDown.value).toBe(false)
    expect(drag.isAnimating.value).toBe(false)
    expect(drag.dragOffset.value).toBe(0)
    expect(drag.dragDirection.value).toBe(null)
    expect(drag.isThresholdMet.value).toBe(false)
  })

  it('triggers slideNext on onNext call and transitions correctly', async () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const drag = useWeekDrag({ onPrev, onNext })

    drag.slideNext()
    expect(drag.isAnimating.value).toBe(true)
    expect(drag.trackStyle.value.transform).toContain('-120px')

    // Fast-forward phase 1 (190ms)
    vi.advanceTimersByTime(200)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrev).not.toHaveBeenCalled()

    // Flush nextTick microtask
    await nextTick()

    // Fast-forward phase 2 & 3
    vi.advanceTimersByTime(300)
    expect(drag.isAnimating.value).toBe(false)
  })

  it('triggers slidePrev on onPrev call and transitions correctly', async () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const drag = useWeekDrag({ onPrev, onNext })

    drag.slidePrev()
    expect(drag.isAnimating.value).toBe(true)
    expect(drag.trackStyle.value.transform).toContain('120px')

    vi.advanceTimersByTime(200)
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).not.toHaveBeenCalled()

    await nextTick()

    vi.advanceTimersByTime(300)
    expect(drag.isAnimating.value).toBe(false)
  })

  it('handles pointer moves and calculates dragOffset and direction', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const drag = useWeekDrag({ onPrev, onNext })

    // Mouse down
    drag.onPointerDown({ clientX: 100, clientY: 100, button: 0 })
    expect(drag.isPointerDown.value).toBe(true)

    // Move horizontally right by 60px (towards previous week)
    drag.onPointerMove({ clientX: 160, clientY: 100 })
    expect(drag.isDragging.value).toBe(true)
    expect(drag.dragDirection.value).toBe('prev')
    expect(drag.dragOffset.value).toBe(60)
    expect(drag.isThresholdMet.value).toBe(true)
    expect(drag.trackStyle.value.transform).toContain('60px')

    // Mouse up -> should trigger slidePrev
    drag.onPointerUp()
    expect(drag.isDragging.value).toBe(false)
    expect(drag.isAnimating.value).toBe(true)

    vi.advanceTimersByTime(200)
    expect(onPrev).toHaveBeenCalledTimes(1)
  })

  it('suppresses click after dragging', () => {
    const drag = useWeekDrag()
    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn()
    }

    // Before drag: clicks pass through
    drag.handleCaptureClick(mockEvent)
    expect(mockEvent.stopPropagation).not.toHaveBeenCalled()

    // Start drag
    drag.onPointerDown({ clientX: 100, clientY: 100, button: 0 })
    drag.onPointerMove({ clientX: 30, clientY: 100 })
    expect(drag.isDragging.value).toBe(true)

    // End drag
    drag.onPointerUp()

    // Click is intercepted immediately after dragging
    drag.handleCaptureClick(mockEvent)
    expect(mockEvent.stopPropagation).toHaveBeenCalled()
    expect(mockEvent.preventDefault).toHaveBeenCalled()

    // After suppression timeout expires, click works again
    vi.advanceTimersByTime(150)
    const nextMock = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn()
    }
    drag.handleCaptureClick(nextMock)
    expect(nextMock.stopPropagation).not.toHaveBeenCalled()
  })

  it('allows click to pass through when pointer movement is micro-movement (<12px)', () => {
    const drag = useWeekDrag()
    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn()
    }

    drag.onPointerDown({ clientX: 100, clientY: 100, button: 0 })
    // Slight trackpad micro-jitter of 5px
    drag.onPointerMove({ clientX: 105, clientY: 101 })
    expect(drag.isDragging.value).toBe(false)

    drag.onPointerUp()
    // Click must NOT be suppressed!
    drag.handleCaptureClick(mockEvent)
    expect(mockEvent.stopPropagation).not.toHaveBeenCalled()
    expect(mockEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('handles trackpad and wheel horizontal gestures', async () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const drag = useWeekDrag({ onPrev, onNext })

    // Vertical wheel scroll (deltaY >> deltaX) should be ignored
    const vertEvent = { deltaX: 2, deltaY: 50, preventDefault: vi.fn(), cancelable: true }
    drag.onWheel(vertEvent)
    expect(vertEvent.preventDefault).not.toHaveBeenCalled()
    expect(drag.isDragging.value).toBe(false)

    // Horizontal wheel scroll to right (positive deltaX >= 85 -> next week)
    const horizEvent = { deltaX: 90, deltaY: 0, preventDefault: vi.fn(), cancelable: true }
    drag.onWheel(horizEvent)
    expect(horizEvent.preventDefault).toHaveBeenCalled()
    expect(drag.isAnimating.value).toBe(true)

    vi.advanceTimersByTime(200)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('strictly prevents multiple week skips from a single continuous momentum swipe', async () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const drag = useWeekDrag({ onPrev, onNext })

    // First intentional swipe triggers 1 week flip
    drag.onWheel({ deltaX: 95, deltaY: 0, preventDefault: vi.fn(), cancelable: true })
    expect(drag.isAnimating.value).toBe(true)

    vi.advanceTimersByTime(200)
    expect(onNext).toHaveBeenCalledTimes(1)

    // Residual macOS trackpad momentum events stream in rapidly
    drag.onWheel({ deltaX: 110, deltaY: 0, preventDefault: vi.fn(), cancelable: true })
    drag.onWheel({ deltaX: 90, deltaY: 0, preventDefault: vi.fn(), cancelable: true })
    drag.onWheel({ deltaX: 60, deltaY: 0, preventDefault: vi.fn(), cancelable: true })
    drag.onWheel({ deltaX: 30, deltaY: 0, preventDefault: vi.fn(), cancelable: true })

    vi.advanceTimersByTime(600)

    // Must strictly remain at 1! Never skip 2 weeks from single swipe
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrev).not.toHaveBeenCalled()
  })
})
