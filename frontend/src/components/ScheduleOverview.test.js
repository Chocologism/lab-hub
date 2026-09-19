import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse, compileScript } from '@vue/compiler-sfc'
import { getHoliday } from '../utils/holidays'

describe('ScheduleOverview week schedule holiday marking', () => {
  it('compiles script setup with getHoliday imported', () => {
    const filePath = path.resolve(__dirname, 'ScheduleOverview.vue')
    const content = fs.readFileSync(filePath, 'utf8')
    const parsed = parse(content)
    const compiled = compileScript(parsed.descriptor, { id: 'test-schedule-overview' })
    const bindings = compiled.bindings || {}

    expect(bindings.getHoliday).toBeDefined()
  })

  it('contains day-empty holiday markup in template', () => {
    const filePath = path.resolve(__dirname, 'ScheduleOverview.vue')
    const content = fs.readFileSync(filePath, 'utf8')
    
    // Check template structure for holiday pill and fallback
    expect(content).toContain('class="day-empty"')
    expect(content).toContain('is-holiday')
    expect(content).toContain('holiday-pill')
    expect(content).toContain('getHoliday(day)')
    expect(content).toContain('暂无日程')
  })

  it('evaluates holiday replacement for empty days across festival weeks', () => {
    // 2026 National Day week
    const natDay = '2026-10-01'
    expect(getHoliday(natDay) || '暂无日程').toBe('国庆节')

    // 2026 Mid-Autumn Festival
    const midAutumn = '2026-09-25'
    expect(getHoliday(midAutumn) || '暂无日程').toBe('中秋节')

    // 2026 Spring Festival
    const springFest = '2026-02-17'
    expect(getHoliday(springFest) || '暂无日程').toBe('春节')

    // Regular day without holiday
    const regularDay = '2026-09-17'
    expect(getHoliday(regularDay) || '暂无日程').toBe('暂无日程')
  })
})
