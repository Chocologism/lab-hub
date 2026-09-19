import { describe, it, expect } from 'vitest'
import { parseExternalEmails, formatSeminarDateTime, buildSeminarNoticeBody } from './smtpNotice'

describe('smtpNotice utilities', () => {
  it('parses external emails correctly with various separators and trims duplicates', () => {
    const raw = 'test1@lab.edu, test2@163.com; test3@qq.com\ntest1@lab.edu  invalid-email  guest@nju.edu.cn'
    const result = parseExternalEmails(raw)
    expect(result).toEqual([
      'test1@lab.edu',
      'test2@163.com',
      'test3@qq.com',
      'guest@nju.edu.cn'
    ])
  })

  it('formats seminar date and time into natural Chinese', () => {
    // 2026-09-16 is Wednesday
    const formatted = formatSeminarDateTime('2026-09-16', '10:00')
    expect(formatted).toBe('9月16日（周三） 上午10点')

    const formattedAfternoon = formatSeminarDateTime('2026-09-16', '14:30')
    expect(formattedAfternoon).toBe('9月16日（周三） 下午2点30分')
  })

  it('generates the seminar notice email body following user specified format', () => {
    const body = buildSeminarNoticeBody({
      dateStr: '2026-09-16',
      timeStr: '10:00',
      location: '5-511 / 腾讯会议 911-575-921',
      presenterName: '李雷',
      presentationsText: '李四、王五',
      topic: 'AI 在科研中的应用',
      adminName: '韩梅梅'
    })

    expect(body).toContain('大家好，')
    expect(body).toContain('时间：9月16日（周三） 上午10点')
    expect(body).toContain('地点：5-511')
    expect(body).toContain('线上：腾讯会议 911-575-921')
    expect(body).toContain('主讲人：李雷')
    expect(body).toContain('arXiv分享人：李四、王五')
    expect(body).toContain('本次组会将围绕 AI 在科研中的应用 进行分享和讨论。')
    expect(body).not.toContain('另外，后续组会安排有个别调整')
    expect(body).toContain('请大家准时参加，谢谢！')
    expect(body).toContain('祝好，')
    expect(body).toContain('韩梅梅')
  })

  it('formats email subject simply as 【组会通知】date and time', () => {
    // 2026-09-23 is Wednesday
    const formatted = formatSeminarDateTime('2026-09-23', '10:00')
    expect(formatted).toBe('9月23日（周三） 上午10点')
    const subject = `【组会通知】${formatted}`
    expect(subject).toBe('【组会通知】9月23日（周三） 上午10点')
  })
})
