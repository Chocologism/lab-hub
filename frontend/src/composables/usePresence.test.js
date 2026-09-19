import { describe, it, expect } from 'vitest'
import { calcPresenceStatus, getMemberPresence } from './usePresence'

describe('usePresence', () => {
  const baseTime = 1773660000000 // Fixed timestamp for reproducible tests

  it('correctly classifies presence based on diffSec', () => {
    // 30 seconds ago -> online
    const active30sAgo = new Date(baseTime - 30 * 1000).toISOString()
    expect(calcPresenceStatus(active30sAgo, baseTime)).toBe('online')

    // 140 seconds ago -> online (<= 150s)
    const active140sAgo = new Date(baseTime - 140 * 1000).toISOString()
    expect(calcPresenceStatus(active140sAgo, baseTime)).toBe('online')

    // 300 seconds (5 min) ago -> away (<= 600s)
    const active5mAgo = new Date(baseTime - 300 * 1000).toISOString()
    expect(calcPresenceStatus(active5mAgo, baseTime)).toBe('away')

    // 700 seconds ago -> offline (> 600s)
    const active700sAgo = new Date(baseTime - 700 * 1000).toISOString()
    expect(calcPresenceStatus(active700sAgo, baseTime)).toBe('offline')

    // null or undefined -> offline
    expect(calcPresenceStatus(null, baseTime)).toBe('offline')
    expect(calcPresenceStatus('', baseTime)).toBe('offline')
  })

  it('correctly parses SQLite UTC datetime string format', () => {
    // Format like '2026-03-16 11:20:30'
    const now = new Date('2026-03-16T11:21:00Z').getTime()
    const sqliteDate = '2026-03-16 11:20:30' // 30s ago
    expect(calcPresenceStatus(sqliteDate, now)).toBe('online')
  })

  it('getMemberPresence handles member objects and fallbacks', () => {
    const onlineMember = {
      id: 1,
      name: 'Alice',
      last_active_at: new Date(baseTime - 20 * 1000).toISOString()
    }
    expect(getMemberPresence(onlineMember, baseTime)).toBe('online')

    const fallbackAwayMember = {
      id: 2,
      name: 'Bob',
      presence_status: 'away'
    }
    expect(getMemberPresence(fallbackAwayMember, baseTime)).toBe('away')

    const offlineMember = {
      id: 3,
      name: 'Charlie'
    }
    expect(getMemberPresence(offlineMember, baseTime)).toBe('offline')
  })
})
