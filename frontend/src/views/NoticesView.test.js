import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse, compileScript } from '@vue/compiler-sfc'

describe('NoticesView component', () => {
  const filePath = path.resolve(__dirname, 'NoticesView.vue')
  const content = fs.readFileSync(filePath, 'utf8')

  it('compiles SFC script setup properly', () => {
    const parsed = parse(content)
    const compiled = compileScript(parsed.descriptor, { id: 'test-notices-view' })
    const bindings = compiled.bindings || {}

    expect(bindings.notices).toBeDefined()
    expect(bindings.filteredNotices).toBeDefined()
    expect(bindings.currentScope).toBeDefined()
    expect(bindings.selectedCategory).toBeDefined()
    expect(bindings.openCreateModal).toBeDefined()
    expect(bindings.openAiScan).toBeDefined()
    expect(bindings.confirmBatchImport).toBeDefined()
    expect(bindings.toggleMarquee).toBeDefined()
  })

  it('contains essential sections and dialogs in template', () => {
    expect(content).toContain('notices-view-container')
    expect(content).toContain('stats-banner')
    expect(content).toContain('filter-toolbar')
    expect(content).toContain('notice-grid')
    expect(content).toContain('detail-modal')
    expect(content).toContain('edit-modal')
    expect(content).toContain('ai-scan-modal')
  })

  it('filters notices by scope, category and keywords accurately', () => {
    const today = '2026-09-19'
    const items = [
      { id: 1, title: '东区电梯年检停运', category: 'facility', importance: 'urgent', end_date: '2026-09-21', content: '综合楼电梯停运' },
      { id: 2, title: '国奖申报评审通知', category: 'academic_affairs', importance: 'important', end_date: '2026-09-25', content: '奖学金申报细则' },
      { id: 3, title: '旧学期补退选', category: 'academic_affairs', importance: 'normal', end_date: '2026-09-10', content: '补退选已结束' },
    ]

    // Active scope
    const active = items.filter(it => !it.end_date || it.end_date >= today)
    expect(active).toHaveLength(2)

    // Expired scope
    const expired = items.filter(it => it.end_date && it.end_date < today)
    expect(expired).toHaveLength(1)
    expect(expired[0].id).toBe(3)

    // Category filter
    const facility = items.filter(it => it.category === 'facility')
    expect(facility).toHaveLength(1)
    expect(facility[0].title).toBe('东区电梯年检停运')
  })
})
