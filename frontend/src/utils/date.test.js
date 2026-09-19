import { describe, it, expect } from 'vitest'
import { parseUtcDate, formatCommentTime } from './date'

describe('date utility', () => {
  it('parses SQLite datetime UTC strings correctly', () => {
    const d1 = parseUtcDate('2026-09-12 07:51:30')
    const d2 = parseUtcDate('2026-09-12T07:51:30Z')
    expect(d1).not.toBeNull()
    expect(d2).not.toBeNull()
    expect(d1.getTime()).toBe(d2.getTime())
  })

  it('handles strings with fractional seconds and Z', () => {
    const d = parseUtcDate('2026-09-12T07:51:30.123Z')
    expect(d.getUTCHours()).toBe(7)
    expect(d.getUTCMinutes()).toBe(51)
  })

  it('handles null, undefined and invalid strings safely', () => {
    expect(parseUtcDate(null)).toBeNull()
    expect(parseUtcDate(undefined)).toBeNull()
    expect(parseUtcDate('')).toBeNull()
    expect(parseUtcDate('invalid-date')).toBeNull()
    expect(formatCommentTime(null)).toBe('')
    expect(formatCommentTime('')).toBe('')
  })

  it('formats comment time for today correctly', () => {
    // 2026-09-12 07:51:30 UTC
    const utcDateStr = '2026-09-12 07:51:30'
    const parsed = parseUtcDate(utcDateStr)
    const expectedHours = String(parsed.getHours()).padStart(2, '0')
    const expectedMins = String(parsed.getMinutes()).padStart(2, '0')
    
    // Pass the same date as "now"
    const formatted = formatCommentTime(utcDateStr, parsed)
    expect(formatted).toBe(`${expectedHours}:${expectedMins}`)
  })

  it('formats comment time for previous days correctly', () => {
    const pastStr = '2026-09-10 07:51:30'
    const parsed = parseUtcDate(pastStr)
    const futureDate = new Date(parsed.getTime() + 86400000 * 2)
    
    const formatted = formatCommentTime(pastStr, futureDate)
    const m = parsed.getMonth() + 1
    const day = parsed.getDate()
    const hours = String(parsed.getHours()).padStart(2, '0')
    const mins = String(parsed.getMinutes()).padStart(2, '0')
    expect(formatted).toBe(`${m}/${day} ${hours}:${mins}`)
  })
})
