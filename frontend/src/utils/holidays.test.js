import { describe, it, expect } from 'vitest'
import { getHoliday, isHoliday } from './holidays'

describe('holidays utility - China Statutory Holidays', () => {
  it('identifies official holidays in 2024', () => {
    expect(getHoliday('2024-01-01')).toBe('元旦')
    expect(getHoliday('2024-02-09')).toBe('春节')
    expect(getHoliday('2024-02-10')).toBe('春节')
    expect(getHoliday('2024-04-05')).toBe('清明节')
    expect(getHoliday('2024-05-01')).toBe('劳动节')
    expect(getHoliday('2024-06-10')).toBe('端午节')
    expect(getHoliday('2024-09-17')).toBe('中秋节')
    expect(getHoliday('2024-10-01')).toBe('国庆节')
    expect(getHoliday('2024-10-07')).toBe('国庆节')
    expect(getHoliday('2024-10-08')).toBeNull()
  })

  it('identifies official holidays in 2025', () => {
    expect(getHoliday('2025-01-01')).toBe('元旦')
    expect(getHoliday('2025-01-28')).toBe('春节')
    expect(getHoliday('2025-01-29')).toBe('春节')
    expect(getHoliday('2025-04-04')).toBe('清明节')
    expect(getHoliday('2025-05-01')).toBe('劳动节')
    expect(getHoliday('2025-05-31')).toBe('端午节')
    expect(getHoliday('2025-10-01')).toBe('国庆节')
    expect(getHoliday('2025-10-06')).toBe('中秋节')
    expect(getHoliday('2025-10-07')).toBe('国庆节')
    expect(getHoliday('2025-10-09')).toBeNull()
  })

  it('identifies official holidays in 2026', () => {
    // 元旦
    expect(getHoliday('2026-01-01')).toBe('元旦')
    expect(getHoliday('2026-01-02')).toBe('元旦')
    expect(getHoliday('2026-01-03')).toBe('元旦')

    // 春节
    expect(getHoliday('2026-02-16')).toBe('春节')
    expect(getHoliday('2026-02-17')).toBe('春节')
    expect(getHoliday('2026-02-23')).toBe('春节')
    expect(getHoliday('2026-02-24')).toBeNull()

    // 清明节
    expect(getHoliday('2026-04-04')).toBe('清明节')
    expect(getHoliday('2026-04-05')).toBe('清明节')
    expect(getHoliday('2026-04-06')).toBe('清明节')

    // 劳动节
    expect(getHoliday('2026-05-01')).toBe('劳动节')
    expect(getHoliday('2026-05-05')).toBe('劳动节')
    expect(getHoliday('2026-05-06')).toBeNull()

    // 端午节
    expect(getHoliday('2026-06-19')).toBe('端午节')
    expect(getHoliday('2026-06-21')).toBe('端午节')

    // 中秋节
    expect(getHoliday('2026-09-25')).toBe('中秋节')
    expect(getHoliday('2026-09-26')).toBe('中秋节')
    expect(getHoliday('2026-09-27')).toBe('中秋节')

    // 国庆节
    expect(getHoliday('2026-10-01')).toBe('国庆节')
    expect(getHoliday('2026-10-03')).toBe('国庆节')
    expect(getHoliday('2026-10-07')).toBe('国庆节')
    expect(getHoliday('2026-10-08')).toBeNull()
  })

  it('correctly handles normal workdays and non-holidays', () => {
    expect(getHoliday('2026-09-17')).toBeNull()
    expect(isHoliday('2026-09-17')).toBe(false)
    expect(getHoliday('2026-03-18')).toBeNull()
    expect(isHoliday('2026-03-18')).toBe(false)
  })

  it('safely handles invalid date inputs', () => {
    expect(getHoliday('')).toBeNull()
    expect(getHoliday(null)).toBeNull()
    expect(getHoliday(undefined)).toBeNull()
    expect(getHoliday('invalid-date')).toBeNull()
    expect(isHoliday(null)).toBe(false)
  })

  it('falls back correctly for future years not in static map', () => {
    expect(getHoliday('2029-01-01')).toBe('元旦')
    expect(getHoliday('2029-02-12')).toBe('春节')
    expect(getHoliday('2029-02-13')).toBe('春节')
    expect(getHoliday('2029-04-04')).toBe('清明节')
    expect(getHoliday('2029-05-01')).toBe('劳动节')
    expect(getHoliday('2029-06-16')).toBe('端午节')
    expect(getHoliday('2029-09-22')).toBe('中秋节')
    expect(getHoliday('2029-10-01')).toBe('国庆节')
  })
})
