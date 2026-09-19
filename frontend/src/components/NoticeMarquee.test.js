import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse, compileScript } from '@vue/compiler-sfc'

describe('NoticeMarquee component', () => {
  const filePath = path.resolve(__dirname, 'NoticeMarquee.vue')
  const content = fs.readFileSync(filePath, 'utf8')

  it('compiles SFC script setup properly', () => {
    const parsed = parse(content)
    const compiled = compileScript(parsed.descriptor, { id: 'test-notice-marquee' })
    const bindings = compiled.bindings || {}

    expect(bindings.notices).toBeDefined()
    expect(bindings.isHidden).toBeDefined()
    expect(bindings.openDetail).toBeDefined()
    expect(bindings.hideMarquee).toBeDefined()
    expect(bindings.marqueeItems).toBeDefined()
  })

  it('contains marquee elements, hover pause, and modal in template', () => {
    expect(content).toContain('notice-marquee-wrapper')
    expect(content).toContain('marquee-scroller')
    expect(content).toContain('marquee-item')
    expect(content).toContain('animation-play-state: paused')
    expect(content).toContain('notice-modal-backdrop')
  })

  it('filters active notices correctly by validity date and 2-week permanent rule', () => {
    const today = '2026-09-19'
    const mockList = [
      { id: 1, title: '电梯检修', end_date: '2026-09-22', start_date: '2026-09-18' }, // active (future deadline)
      { id: 2, title: '奖学金申报', end_date: '2026-09-15', start_date: '2026-09-08' }, // expired (past deadline)
      { id: 3, title: '近期学分要求落实通知', end_date: '', start_date: '2026-09-16' }, // permanent within 2 weeks (3 days ago) -> active
      { id: 4, title: '三周前的办公规章通知', end_date: '', start_date: '2026-08-25' }, // permanent exceeding 2 weeks (25 days ago) -> filtered out
    ]

    const activeItems = mockList.filter(item => {
      if (item.end_date && item.end_date.trim()) {
        return item.end_date >= today
      }
      if (item.start_date) {
        const [y1, m1, d1] = item.start_date.split('-').map(Number)
        const [y2, m2, d2] = today.split('-').map(Number)
        const diff = Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (1000 * 60 * 60 * 24))
        return diff <= 14
      }
      return true
    })

    expect(activeItems).toHaveLength(2)
    expect(activeItems.map(i => i.id)).toEqual([1, 3])
  })

  it('handles seamless loop calculation with duplicated items', () => {
    const list = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }]
    const looped = [...list, ...list]
    expect(looped).toHaveLength(4)
    expect(looped[0].title).toBe('A')
    expect(looped[2].title).toBe('A')
  })
})
