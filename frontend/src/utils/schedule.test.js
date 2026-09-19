import { describe, it, expect } from 'vitest'
import { addDays, monday, railDates, shanghaiToday, parseDate, seminarIcs, weekScheduleIcs, filterScheduleEvents, moveDraft, previewSeminars, reconcileChanges, findConflicts, nextSeminar, filterSeminars, statusLabel } from './schedule'

const a = { id: 1, date: '2026-12-31', time: '23:30', status: 'upcoming', presenter_name: '甲', topic: '题目', location: '302' }
const b = { ...a, id: 2, time: '14:30', presenter_name: '乙' }
describe('research group calendar', () => {
  it('handles leap days, year boundaries and Shanghai midnight', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(parseDate('2026-02-29')).toBeNull()
    expect(monday('2027-01-03')).toBe('2026-12-28')
    expect(railDates('2027-01-03')).toHaveLength(14)
    expect(shanghaiToday(new Date('2026-12-31T16:01:00Z'))).toBe('2027-01-01')
  })
  it('sorts same-day sessions and keeps actual status', () => {
    const archived = { ...a, id: 3, status: 'completed' }
    expect(filterSeminars([a, b, archived], 'upcoming', '').map(s => s.id)).toEqual([2, 1])
    expect(filterSeminars([a, b], 'all', '甲')).toEqual([a])
    expect(nextSeminar([a, b], Date.parse('2026-12-30'))).toEqual(b)
    expect(statusLabel(a, Date.parse('2027-01-02'))).toBe('待补纪要')
    expect(a.status).toBe('upcoming')
  })
  it('keeps original date through repeated drags and removes no-op changes', () => {
    let draft = moveDraft({}, a, '2027-01-01')
    draft = moveDraft(draft, a, '2027-01-03')
    expect(draft[1]).toEqual({ id: 1, expected_date: a.date, date: '2027-01-03' })
    expect(previewSeminars([a], draft)[0].date).toBe('2027-01-03')
    expect(a.date).toBe('2026-12-31')
    expect(moveDraft(draft, a, a.date)).toEqual({})
    expect(moveDraft({}, { ...a, status: 'completed' }, '2027-01-01')).toEqual({})
  })
  it('distinguishes lost success responses, uncommitted batches and conflicts', () => {
    const changes = [{ id: 1, expected_date: a.date, date: '2027-01-01' }]
    expect(reconcileChanges(changes, [a])).toBe('unchanged')
    expect(reconcileChanges(changes, [{ ...a, date: '2027-01-01' }])).toBe('saved')
    expect(reconcileChanges(changes, [])).toBe('conflict')
    expect(findConflicts(changes, [{ ...a, date: '2027-02-01' }])[0].current_date).toBe('2027-02-01')
  })
  it('exports UTC times across midnight and safely folds/escapes Unicode', () => {
    const ics = seminarIcs({ ...a, topic: '红移, 宇宙学; ' + '中文标题'.repeat(30), notes: '甲\n乙\\丙' }, new Date('2026-01-01T00:00:00Z'))
    expect(ics).toContain('DTSTART:20261231T153000Z')
    expect(ics).toContain('DTEND:20261231T173000Z')
    expect(ics).toContain('红移\\, 宇宙学\\;')
    expect(ics).toContain('甲\\n乙\\\\丙')
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(() => seminarIcs({ ...a, time: '25:60' })).toThrow()
  })
  it('exports weekly schedule with seminars and talks to multi-event iCalendar', () => {
    const seminarItem = { ...a, type: 'seminar', presentations: [{ presenter_name: '丙', arxiv_id: '2609.12345' }] }
    const talkItem = { id: 10, type: 'talk', date: '2026-12-31', time: '10:00', title: '星系巡天进展', speaker: '李教授', location: '天文楼502' }
    const ics = weekScheduleIcs([seminarItem, talkItem], '课题组周日程', new Date('2026-01-01T00:00:00Z'))
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('X-WR-CALNAME:课题组周日程')
    expect(ics).toContain('UID:seminar-1-2026-12-31@lab-hub.local')
    expect(ics).toContain('UID:talk-10-2026-12-31@lab-hub.local')
    expect(ics).toContain('SUMMARY:[组会] 题目 (甲)')
    expect(ics).toContain('SUMMARY:[学术报告] 星系巡天进展 (李教授)')
    expect(ics).toContain('arXiv 分享: 丙 (2609.12345)')
    expect(ics).toContain('LOCATION:天文楼502')
    expect(ics).toContain('END:VCALENDAR')
  })
  it('filters schedule events by interest and event type', () => {
    const sem1 = { id: 1, type: 'seminar', is_interested: true }
    const sem2 = { id: 2, type: 'seminar', is_interested: false }
    const talk1 = { id: 10, type: 'talk', is_interested: true }
    const talk2 = { id: 20, type: 'talk', is_interested: false }
    const list = [sem1, sem2, talk1, talk2]

    // 全部导出，包含组会与报告
    expect(filterScheduleEvents(list, { scope: 'all', includeSeminars: true, includeTalks: true })).toHaveLength(4)

    // 仅想听，包含组会与报告（包含当周组会 + 想听的学术报告）
    const interested = filterScheduleEvents(list, { scope: 'interested', includeSeminars: true, includeTalks: true })
    expect(interested.map(i => i.id)).toEqual([1, 2, 10])

    // 仅想听，不包含组会（只导出想听的报告）
    const interestedNoSem = filterScheduleEvents(list, { scope: 'interested', includeSeminars: false, includeTalks: true })
    expect(interestedNoSem.map(i => i.id)).toEqual([10])

    // 全部日程，不包含组会（只导出报告）
    const noSem = filterScheduleEvents(list, { scope: 'all', includeSeminars: false, includeTalks: true })
    expect(noSem.map(i => i.id)).toEqual([10, 20])
  })
  it('supports academic conferences in weekScheduleIcs and filterScheduleEvents', () => {
    const confItem = {
      id: 99,
      type: 'conference',
      date: '2026-10-15',
      end_date: '2026-10-18',
      time: '全天',
      title: '全国星系宇宙学年会',
      speaker: '国家天文台',
      location: '北京国际会议中心',
      is_interested: true
    }
    const ics = weekScheduleIcs([confItem], '学术日程', new Date('2026-01-01T00:00:00Z'))
    expect(ics).toContain('SUMMARY:[学术会议] 全国星系宇宙学年会 (国家天文台)')
    expect(ics).toContain('UID:conference-99-2026-10-15@lab-hub.local')
    expect(ics.replace(/\r\n /g, '')).toContain('会议会期: 2026-10-15 至 2026-10-18')
    expect(ics.replace(/\r\n /g, '')).toContain('地点/网址: 北京国际会议中心')

    // 筛选测试：学术会议作为学术报告/会议类日程受到 includeTalks 与 scope 控制
    const list = [confItem, { id: 100, type: 'conference', is_interested: false }]
    const interestedConfs = filterScheduleEvents(list, { scope: 'interested', includeSeminars: false, includeTalks: true })
    expect(interestedConfs.map(c => c.id)).toEqual([99])

    const noTalksConfs = filterScheduleEvents(list, { scope: 'all', includeSeminars: true, includeTalks: false })
    expect(noTalksConfs).toHaveLength(0)
  })
})
