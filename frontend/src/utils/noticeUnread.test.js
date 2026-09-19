import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getViewedNoticeIds,
  markNoticeAsRead,
  markAllNoticesAsRead,
  getUnreadNoticesCount,
  VIEWED_NOTICES_STORAGE_KEY
} from './noticeUnread'

describe('noticeUnread utility', () => {
  let store = {}

  beforeEach(() => {
    store = {}
    global.localStorage = {
      getItem: vi.fn(key => (store[key] !== undefined ? store[key] : null)),
      setItem: vi.fn((key, val) => {
        store[key] = String(val)
      }),
      removeItem: vi.fn(key => {
        delete store[key]
      }),
      clear: vi.fn(() => {
        store = {}
      })
    }
  })

  it('correctly retrieves empty viewed set by default', () => {
    const set = getViewedNoticeIds()
    expect(set.size).toBe(0)
  })

  it('marks single notice as read and persists to localStorage', () => {
    markNoticeAsRead(101)
    const set = getViewedNoticeIds()
    expect(set.has(101)).toBe(true)
    expect(JSON.parse(store[VIEWED_NOTICES_STORAGE_KEY])).toEqual([101])
  })

  it('marks multiple notices as read without duplicating', () => {
    markNoticeAsRead(1)
    markAllNoticesAsRead([1, 2, 3, '4'])
    const set = getViewedNoticeIds()
    expect(set.size).toBe(4)
    expect(set.has(1)).toBe(true)
    expect(set.has(2)).toBe(true)
    expect(set.has(3)).toBe(true)
    expect(set.has(4)).toBe(true)
  })

  it('calculates unread count excluding expired and viewed notices', () => {
    const mockNotices = [
      { id: 1, title: 'Notice 1', end_date: '2099-12-31' }, // active, unread
      { id: 2, title: 'Notice 2', end_date: '2099-12-31' }, // active, will mark read
      { id: 3, title: 'Notice 3', end_date: '2020-01-01' }, // expired, unread
      { id: 4, title: 'Notice 4', end_date: '' },           // permanent active, unread
    ]

    expect(getUnreadNoticesCount(mockNotices)).toBe(3) // 1, 2, 4

    markNoticeAsRead(2)
    expect(getUnreadNoticesCount(mockNotices)).toBe(2) // 1, 4

    markNoticeAsRead(1)
    expect(getUnreadNoticesCount(mockNotices)).toBe(1) // 4

    markAllNoticesAsRead([4])
    expect(getUnreadNoticesCount(mockNotices)).toBe(0)
  })
})
