import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { usePaperCommentsPolling } from './usePaperCommentsPolling'
import { arxivApi } from '../api/client'

vi.mock('../api/client', () => ({
  arxivApi: {
    getComments: vi.fn(),
  }
}))

describe('usePaperCommentsPolling composable', () => {
  let mockBroadcastChannelInstance = null

  class MockBroadcastChannel {
    constructor(name) {
      this.name = name
      this.onmessage = null
      mockBroadcastChannelInstance = this
    }
    postMessage = vi.fn()
    close = vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    global.BroadcastChannel = MockBroadcastChannel
  })

  afterEach(() => {
    vi.useRealTimers()
    delete global.BroadcastChannel
  })

  it('computes since_id from existing comments and queries arxivApi.getComments', async () => {
    const comments = ref([
      { id: 101, content: 'Comment 1' },
      { id: 105, content: 'Comment 2' },
      { id: 103, content: 'Comment 3' },
    ])
    const newItems = [{ id: 106, content: 'Comment 4' }]
    arxivApi.getComments.mockResolvedValueOnce(newItems)

    const onNewComments = vi.fn()
    const polling = usePaperCommentsPolling(
      ref(42),
      comments,
      { onNewComments }
    )

    const result = await polling.pollOnce()
    expect(arxivApi.getComments).toHaveBeenCalledWith(42, 105)
    expect(result).toEqual(newItems)
    expect(onNewComments).toHaveBeenCalledWith(newItems)
    expect(polling.idleStep.value).toBe(0)
  })

  it('filters out comments that already exist locally', async () => {
    const comments = ref([
      { id: 101, content: 'Comment 1' },
      { id: 105, content: 'Comment 2' },
    ])
    // Server returns 105 (already exists) and 106 (truly new)
    arxivApi.getComments.mockResolvedValueOnce([
      { id: 105, content: 'Comment 2' },
      { id: 106, content: 'Comment 3' },
    ])

    const onNewComments = vi.fn()
    const polling = usePaperCommentsPolling(
      ref(42),
      comments,
      { onNewComments }
    )

    const result = await polling.pollOnce()
    expect(result).toEqual([{ id: 106, content: 'Comment 3' }])
    expect(onNewComments).toHaveBeenCalledWith([{ id: 106, content: 'Comment 3' }])
  })

  it('backs off stepped intervals when idle with no new comments', async () => {
    const comments = ref([{ id: 10, content: 'Existing' }])
    arxivApi.getComments.mockResolvedValue([])

    const isFocused = ref(false)
    const hasDraft = ref(false)
    const polling = usePaperCommentsPolling(
      ref(42),
      comments,
      {
        isFocused,
        hasDraft,
        activityWindowMs: 0, // 强制立即进入失焦静默态
        idleIntervals: [3000, 6000, 10000, 15000]
      }
    )

    expect(polling.currentInterval.value).toBe(3000)

    // Poll 1: 0 new comments -> step 1 (6000ms)
    await polling.pollOnce()
    expect(polling.idleStep.value).toBe(1)
    expect(polling.currentInterval.value).toBe(6000)

    // Poll 2: 0 new comments -> step 2 (10000ms)
    await polling.pollOnce()
    expect(polling.idleStep.value).toBe(2)
    expect(polling.currentInterval.value).toBe(10000)

    // Poll 3: 0 new comments -> step 3 (15000ms max)
    await polling.pollOnce()
    expect(polling.idleStep.value).toBe(3)
    expect(polling.currentInterval.value).toBe(15000)

    // Poll 4: still at max 15000ms
    await polling.pollOnce()
    expect(polling.idleStep.value).toBe(3)
    expect(polling.currentInterval.value).toBe(15000)

    // When focused, resets to active 3000ms immediately
    isFocused.value = true
    expect(polling.isActive.value).toBe(true)
    expect(polling.currentInterval.value).toBe(3000)
  })

  it('broadcasts comment additions and deletions across tabs via BroadcastChannel', () => {
    const comments = ref([])
    const onNewComments = vi.fn()
    const onCommentDeleted = vi.fn()

    const polling = usePaperCommentsPolling(
      ref(42),
      comments,
      { onNewComments, onCommentDeleted }
    )

    expect(mockBroadcastChannelInstance).not.toBeNull()

    // 1. 发送新留言广播
    const mockComment = { id: 200, content: 'Broadcasted comment' }
    polling.broadcastCommentAdded(mockComment)
    expect(mockBroadcastChannelInstance.postMessage).toHaveBeenCalledWith({
      type: 'comment_added',
      paperId: 42,
      comment: mockComment,
    })

    // 2. 发送删除留言广播
    polling.broadcastCommentDeleted(200)
    expect(mockBroadcastChannelInstance.postMessage).toHaveBeenCalledWith({
      type: 'comment_deleted',
      paperId: 42,
      commentId: 200,
    })

    // 3. 接收同 paperId 广播消息
    mockBroadcastChannelInstance.onmessage({
      data: {
        type: 'comment_added',
        paperId: 42,
        comment: { id: 201, content: 'Incoming from tab 2' }
      }
    })
    expect(onNewComments).toHaveBeenCalledWith([{ id: 201, content: 'Incoming from tab 2' }])

    // 4. 接收同 paperId 删除广播
    mockBroadcastChannelInstance.onmessage({
      data: {
        type: 'comment_deleted',
        paperId: 42,
        commentId: 201
      }
    })
    expect(onCommentDeleted).toHaveBeenCalledWith(201)

    // 5. 忽略不同 paperId 消息
    mockBroadcastChannelInstance.onmessage({
      data: {
        type: 'comment_added',
        paperId: 999,
        comment: { id: 300, content: 'Other paper' }
      }
    })
    expect(onNewComments).not.toHaveBeenCalledWith([{ id: 300, content: 'Other paper' }])
  })

  it('stops timer when hidden and wakes up when visible', async () => {
    const comments = ref([])
    arxivApi.getComments.mockResolvedValue([])

    const listeners = {}
    const mockDoc = {
      visibilityState: 'visible',
      addEventListener: (event, handler) => {
        listeners[event] = handler
      },
      removeEventListener: (event, handler) => {
        delete listeners[event]
      },
    }
    const origDoc = global.document
    global.document = mockDoc

    try {
      const polling = usePaperCommentsPolling(ref(42), comments)
      expect(polling.isDormant.value).toBe(false)

      // 切到后台
      mockDoc.visibilityState = 'hidden'
      listeners.visibilitychange()
      expect(polling.isDormant.value).toBe(true)
      expect(polling.currentInterval.value).toBe(0)

      // 切回前台
      mockDoc.visibilityState = 'visible'
      listeners.visibilitychange()
      expect(polling.isDormant.value).toBe(false)
      expect(polling.currentInterval.value).toBe(3000)

      polling.stop()
    } finally {
      if (origDoc !== undefined) {
        global.document = origDoc
      } else {
        delete global.document
      }
    }
  })

  it('cleans up timers and channels when stop() is called', () => {
    const comments = ref([])
    const polling = usePaperCommentsPolling(ref(42), comments)
    expect(mockBroadcastChannelInstance).not.toBeNull()

    polling.stop()
    expect(mockBroadcastChannelInstance.close).toHaveBeenCalled()
  })
})
