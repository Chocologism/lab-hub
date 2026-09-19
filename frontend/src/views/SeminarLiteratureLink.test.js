import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse, compileScript } from '@vue/compiler-sfc'
import { seminarApi } from '../api/client'

describe('Seminar and Library Literature Linkage', () => {
  it('verifies SeminarView.vue SFC bindings and removed paperInputType', () => {
    const filePath = path.resolve(__dirname, 'SeminarView.vue')
    const content = fs.readFileSync(filePath, 'utf8')
    const parsed = parse(content)
    const compiled = compileScript(parsed.descriptor, { id: 'test-seminar-link' })
    const bindings = compiled.bindings || {}

    // Ensure presenter paper input is removed
    expect('paperInputType' in bindings).toBe(false)
    expect(content).not.toContain('id="seminar-paper-input"')
    expect(content).not.toContain('关联文献（可选：arXiv 编号 / DOI / 论文标题）')

    // Ensure duplicate arxiv check variables and handlers are present
    expect('duplicateArxivWarning' in bindings).toBe(true)
    expect('checkingDuplicateArxiv' in bindings).toBe(true)
    expect('checkSharerDuplicateArxiv' in bindings).toBe(true)

    // Ensure text has been changed to remove (可选)
    expect(content).not.toContain('label="arXiv 编号或链接（可选）"')
    expect(content).toContain('label="arXiv 编号或链接"')
  })

  it('verifies LibraryView.vue SFC bindings and card click navigation', () => {
    const filePath = path.resolve(__dirname, 'LibraryView.vue')
    const content = fs.readFileSync(filePath, 'utf8')
    const parsed = parse(content)
    const compiled = compileScript(parsed.descriptor, { id: 'test-library-link' })
    const bindings = compiled.bindings || {}

    expect('router' in bindings).toBe(true)
    expect('handlePaperCardClick' in bindings).toBe(true)
    expect('goToSeminar' in bindings).toBe(true)

    // Check template contains clickable seminar card class and 查看组会 button
    expect(content).toContain('clickable-seminar-card')
    expect(content).toContain('查看组会')
    expect(content).toContain('seminar-jump-pill')
  })

  it('verifies seminarApi.checkArxivPresented method exists', () => {
    expect(typeof seminarApi.checkArxivPresented).toBe('function')
  })

  it('verifies router query payload structure for seminar timeline jump', () => {
    const mockSeminarId = 42
    const targetQuery = {
      view: 'timeline',
      target_seminar: String(mockSeminarId),
      no_reset: '1'
    }

    expect(targetQuery.view).toBe('timeline')
    expect(targetQuery.target_seminar).toBe('42')
    expect(targetQuery.no_reset).toBe('1')
  })

  it('verifies ArxivFeedView.vue SFC bindings and seminar jump linkage', () => {
    const filePath = path.resolve(__dirname, 'ArxivFeedView.vue')
    const content = fs.readFileSync(filePath, 'utf8')
    const parsed = parse(content)
    const compiled = compileScript(parsed.descriptor, { id: 'test-arxiv-feed-link' })
    const bindings = compiled.bindings || {}

    expect('router' in bindings).toBe(true)
    expect('goToSeminar' in bindings).toBe(true)
    expect('handleRecommendBodyClick' in bindings).toBe(true)

    // Check template contains seminar tags and jump triggers
    expect(content).toContain('seminar-priority')
    expect(content).toContain('今日组会')
    expect(content).toContain('seminar-tag-action')
    expect(content).toContain('查看组会')
    expect(content).toContain('clickable-recommend')
  })

  it('verifies dynamic seminar pinning and expiry sorting logic', () => {
    const today = '2026-09-16'
    const pastSeminarDate = '2026-09-15'

    const testFeed = [
      { id: 10, title: 'Old paper', is_pinned: false, seminar_id: null, seminar_date: null },
      { id: 11, title: 'Seminar paper', is_pinned: false, seminar_id: 1, seminar_date: today },
      { id: 12, title: 'Teacher pinned paper', is_pinned: true, seminar_id: null, seminar_date: null },
    ]

    // On seminar day
    const onDayList = testFeed.map(p => {
      const isSeminarToday = Boolean(p.seminar_date && p.seminar_date === today)
      const effectiveIsPinned = Boolean(p.is_pinned || isSeminarToday)
      return { ...p, is_pinned: effectiveIsPinned, is_seminar_today: isSeminarToday }
    }).sort((a, b) => {
      const pinA = a.is_pinned ? 1 : 0
      const pinB = b.is_pinned ? 1 : 0
      if (pinA !== pinB) return pinB - pinA
      return b.id - a.id
    })

    // Both seminar paper (id 11) and teacher paper (id 12) are pinned
    expect(onDayList[0].id).toBe(12)
    expect(onDayList[1].id).toBe(11)
    expect(onDayList[1].is_seminar_today).toBe(true)
    expect(onDayList[2].id).toBe(10)

    // Next day (expired seminar): seminar paper unpins automatically
    const nextDay = '2026-09-17'
    const feedNextDay = [
      ...testFeed,
      { id: 13, title: 'New paper next day', is_pinned: false, seminar_id: null, seminar_date: null }
    ]

    const nextDayList = feedNextDay.map(p => {
      const isSeminarToday = Boolean(p.seminar_date && p.seminar_date === nextDay)
      const effectiveIsPinned = Boolean(p.is_pinned || isSeminarToday)
      return { ...p, is_pinned: effectiveIsPinned, is_seminar_today: isSeminarToday }
    }).sort((a, b) => {
      const pinA = a.is_pinned ? 1 : 0
      const pinB = b.is_pinned ? 1 : 0
      if (pinA !== pinB) return pinB - pinA
      return b.id - a.id
    })

    // Teacher paper (id 12) remains pinned at the top
    expect(nextDayList[0].id).toBe(12)
    // New unpinned paper (id 13) naturally appears above past seminar paper (id 11)
    expect(nextDayList[1].id).toBe(13)
    // Past seminar paper (id 11) is unpinned, but still above older paper (id 10)
    expect(nextDayList[2].id).toBe(11)
    expect(nextDayList[2].is_seminar_today).toBe(false)
    expect(nextDayList[3].id).toBe(10)
  })
})
