import { describe, it, expect } from 'vitest'
import {
  isTalkEmail,
  isConferenceEmail,
  detectScheduleType,
  parseTalkMetadataLocally,
  parseConferenceMetadataLocally,
  pickChinesePartIfDual,
  applyInstitutionLocationPrefix
} from './talkEmail'

describe('isTalkEmail', () => {
  it('identifies the youth forum announcement email', () => {
    const email = {
      subject: '青年论坛第181期 时间2026年9月18日 上午10:30 地点5-516会议室',
      snippet: '各位老师、同学： 青年论坛第181期将于2026年9月18日（周五）上午 10：30 在5-516 会议室举办...',
      body_text: '各位老师、同学： 青年论坛第181期将于2026年9月18日（周五）上午 10：30 在5-516 会议室举办，本次邀请到国家天文台的陈云博士，做题为《Probing Dynamical Dark Energy: Evidence & Tensions》的报告。报告摘要与陈云博士的个人简介详见以下海报，欢迎各位老师和同学的参加！！！ 耿'
    }
    expect(isTalkEmail(email)).toBe(true)
  })

  it('identifies standard academic seminar emails', () => {
    const email = {
      subject: '台内学术报告：FAST脉冲星偏振测量',
      body_text: '时间：2026-09-20 14:00 地点：大楼报告厅'
    }
    expect(isTalkEmail(email)).toBe(true)
  })

  it('identifies emails with speaker and topic in body', () => {
    const email = {
      subject: '周五下午交流会',
      body_text: '各位老师，本周五在5-516会议室，邀请到李华教授做题为《黑洞吸积盘》的报告。'
    }
    expect(isTalkEmail(email)).toBe(true)
  })

  it('does not falsely trigger on non-academic administrative emails', () => {
    const email = {
      subject: '关于科研经费报销截止时间的通知',
      body_text: '请各位老师注意，财务处将于本周五下午5点截止报销。'
    }
    expect(isTalkEmail(email)).toBe(false)
  })
})

describe('parseTalkMetadataLocally', () => {
  it('extracts all talk metadata correctly from the forum email', () => {
    const subject = '青年论坛第181期 时间2026年9月18日 上午10:30 地点5-516会议室'
    const body = '各位老师、同学： 青年论坛第181期将于2026年9月18日（周五）上午 10：30 在5-516 会议室举办，本次邀请到国家天文台的陈云博士，做题为《Probing Dynamical Dark Energy: Evidence & Tensions》的报告。报告摘要与陈云博士的个人简介详见以下海报，欢迎各位老师和同学的参加！！！ 耿'
    const text = `${subject}\n${body}`

    const parsed = parseTalkMetadataLocally(text, subject)
    expect(parsed.title).toBe('Probing Dynamical Dark Energy: Evidence & Tensions')
    expect(parsed.date).toBe('2026-09-18')
    expect(parsed.time).toBe('10:30')
    expect(parsed.speaker).toBe('陈云 博士')
    expect(parsed.location).toBe('5-516 会议室')
    expect(parsed.talks).toHaveLength(1)
    expect(parsed.talks[0].title).toBe('Probing Dynamical Dark Energy: Evidence & Tensions')
  })

  it('correctly identifies and extracts multiple talks with 报告一/报告二', () => {
    const subject = '学术报告通知：两场学术前沿报告'
    const body = `各位老师同学：
本周五在实验楼 5-516 会议室举办两场学术报告。
日期：2026年9月25日
地点：实验楼 5-516 会议室

报告一：
题目：FAST脉冲星偏振与磁层物理
报告人：张伟 博士
时间：14:00 - 15:00
摘要：介绍FAST在脉冲星偏振方面的最新突破...

报告二：
题目：高红移尘埃连续谱与星系演化
报告人：王芳 教授
时间：15:15 - 16:15
摘要：基于ALMA观测探讨高红移星系演化...`
    const text = `${subject}\n${body}`

    const parsed = parseTalkMetadataLocally(text, subject)
    expect(parsed.talks).toBeDefined()
    expect(parsed.talks).toHaveLength(2)

    // Talk 1
    expect(parsed.talks[0].title).toBe('FAST脉冲星偏振与磁层物理')
    expect(parsed.talks[0].speaker).toBe('张伟 博士')
    expect(parsed.talks[0].time).toBe('14:00')
    expect(parsed.talks[0].date).toBe('2026-09-25')
    expect(parsed.talks[0].location).toBe('实验楼 5-516 会议室')

    // Talk 2
    expect(parsed.talks[1].title).toBe('高红移尘埃连续谱与星系演化')
    expect(parsed.talks[1].speaker).toBe('王芳 教授')
    expect(parsed.talks[1].time).toBe('15:15')
    expect(parsed.talks[1].date).toBe('2026-09-25')
    expect(parsed.talks[1].location).toBe('实验楼 5-516 会议室')

    // Top-level backwards compatibility matches talk 1
    expect(parsed.title).toBe('FAST脉冲星偏振与磁层物理')
    expect(parsed.speaker).toBe('张伟 博士')
  })

  it('extracts multiple talks with repeated 报告题目 and 报告人 anchors', () => {
    const subject = '天体物理中心学术讲座'
    const text = `学术讲座通知
时间：2026-10-18
地点：仙林 3-302

报告题目：《原初引力波探测最新进展》
报告人：刘强 研究员
时间：09:30

报告题目：《黑洞自旋测量的X射线方法》
报告人：赵丽 博士
时间：10:45`

    const parsed = parseTalkMetadataLocally(text, subject)
    expect(parsed.talks).toHaveLength(2)
    expect(parsed.talks[0].title).toBe('原初引力波探测最新进展')
    expect(parsed.talks[0].speaker).toBe('刘强 研究员')
    expect(parsed.talks[0].time).toBe('09:30')
    expect(parsed.talks[0].location).toBe('仙林 3-302')

    expect(parsed.talks[1].title).toBe('黑洞自旋测量的X射线方法')
    expect(parsed.talks[1].speaker).toBe('赵丽 博士')
    expect(parsed.talks[1].time).toBe('10:45')
    expect(parsed.talks[1].location).toBe('仙林 3-302')
  })

  it('extracts multiple talks with Talk 1 / Talk 2 English format', () => {
    const subject = 'Colloquium Announcement'
    const text = `Colloquium Announcement
Date: 2026-11-20
Location: Room 516

Talk 1:
Title: Pulsar timing arrays
Speaker: Dr. John Doe
Time: 14:00

Talk 2:
Title: Fast radio bursts
Speaker: Prof. Jane Smith
Time: 15:00`

    const parsed = parseTalkMetadataLocally(text, subject)
    expect(parsed.talks).toHaveLength(2)
    expect(parsed.talks[0].title).toBe('Pulsar timing arrays')
    expect(parsed.talks[0].speaker).toBe('Dr. John Doe')
    expect(parsed.talks[0].time).toBe('14:00')

    expect(parsed.talks[1].title).toBe('Fast radio bursts')
    expect(parsed.talks[1].speaker).toBe('Prof. Jane Smith')
    expect(parsed.talks[1].time).toBe('15:00')
  })
})

describe('pickChinesePartIfDual', () => {
  it('prefers Chinese when separated by slash', () => {
    const dual = '宇宙加速膨胀射电测量 / Radio Measurement of Cosmic Acceleration'
    expect(pickChinesePartIfDual(dual)).toBe('宇宙加速膨胀射电测量')
  })

  it('prefers Chinese when English is in parentheses', () => {
    const dual = '利用高精度恒星光谱揭示行星特征（Unveiling Planetary Signatures with High-Precision Stellar Spectroscopy）'
    expect(pickChinesePartIfDual(dual)).toBe('利用高精度恒星光谱揭示行星特征')
  })

  it('prefers Chinese when Chinese is in parentheses after English', () => {
    const dual = 'Fan Liu (刘凡)'
    expect(pickChinesePartIfDual(dual)).toBe('刘凡')
  })

  it('prefers Chinese speaker with academic title', () => {
    const dual = '陈云 博士 (Dr. Yun Chen)'
    expect(pickChinesePartIfDual(dual)).toBe('陈云 博士')
  })

  it('retains pure English unchanged when no Chinese exists', () => {
    const englishOnly = 'Unveiling Planetary Signatures with High-Precision Stellar Spectroscopy'
    expect(pickChinesePartIfDual(englishOnly)).toBe(englishOnly)
    expect(pickChinesePartIfDual('Fan Liu')).toBe('Fan Liu')
  })

  it('retains pure Chinese unchanged', () => {
    const chineseOnly = '暗物质晕吸积盘物理'
    expect(pickChinesePartIfDual(chineseOnly)).toBe(chineseOnly)
  })
})

describe('applyInstitutionLocationPrefix', () => {
  it('prefixes "南大 " for Nanjing University talk without duplication', () => {
    const context = 'Fw: 南京大学【学术报告】9月23日（周三）上午10点'
    expect(applyInstitutionLocationPrefix('天文楼302会议室', context)).toBe('南大 天文楼302会议室')
    expect(applyInstitutionLocationPrefix('南京大学天文楼302会议室', context)).toBe('南大 天文楼302会议室')
    expect(applyInstitutionLocationPrefix('南大 天文楼302会议室', context)).toBe('南大 天文楼302会议室')
    expect(applyInstitutionLocationPrefix('南大天文楼302会议室', context)).toBe('南大 天文楼302会议室')
  })

  it('handles dual Chinese and English location and applies prefix', () => {
    const context = '南京大学天文与空间科学学院报告通知'
    const dualLoc = '天文楼302会议室 (Room 302, Astronomy Building)'
    expect(applyInstitutionLocationPrefix(dualLoc, context)).toBe('南大 天文楼302会议室')
  })

  it('leaves non-NJU location unchanged', () => {
    const context = '清华大学物理系前沿论坛'
    expect(applyInstitutionLocationPrefix('理科楼郑裕彤讲堂', context)).toBe('理科楼郑裕彤讲堂')
  })
})

describe('isConferenceEmail and detectScheduleType', () => {
  it('identifies annual meeting conference announcement', () => {
    const email = {
      subject: '关于召开2026年现代天文学术年会会议的通知（第一轮）',
      body_text: '由中国天文学会学术交流委员会主办的2026年现代天文学术年会定于2026年10月16日-19日在河南省开封市举行。会议入住开封大河希尔顿逸林酒店。摘要提交截止：2026年9月1日，早鸟优惠截止：2026年9月15日，报名截止时间：2026年9月30日。会议官网：https://astro2026.example.org 注册链接：https://astro2026.example.org/reg'
    }
    expect(isConferenceEmail(email)).toBe(true)
    expect(detectScheduleType(email)).toBe('conference')
  })

  it('identifies summer school announcement', () => {
    const email = {
      subject: '2026年高能天体物理暑期学校报名通知',
      body_text: '为培养青年科研学者，研究所将于2026年7月10日至15日举办暑期学校...'
    }
    expect(isConferenceEmail(email)).toBe(true)
    expect(detectScheduleType(email)).toBe('conference')
  })

  it('identifies normal talk as talk schedule type', () => {
    const email = {
      subject: '台内学术报告：FAST脉冲星偏振测量',
      body_text: '时间：2026-09-20 14:00 地点：大楼报告厅，主讲人：张伟 博士'
    }
    expect(isConferenceEmail(email)).toBe(false)
    expect(detectScheduleType(email)).toBe('talk')
  })
})

describe('parseConferenceMetadataLocally', () => {
  it('extracts conference metadata including dates, deadlines, city and urls', () => {
    const subject = '【会议通知】2026年现代天文学术年会会议'
    const body = `各位老师同学：
由中国天文学会学术交流委员会主办的2026年现代天文学术年会定于2026年10月16日-19日在河南省开封市举行。
入住酒店：开封大河希尔顿逸林酒店
摘要提交截止：2026年09月01日
早鸟优惠截止：2026年09月15日
正式注册截止时间：2026年09月30日
会议官网：https://astro2026.example.org
报名入口：https://astro2026.example.org/register`

    const parsed = parseConferenceMetadataLocally(body, subject)
    expect(parsed.title).toBe('2026年现代天文学术年会会议')
    expect(parsed.sub_type).toBe('年会')
    expect(parsed.date).toBe('2026-10-16')
    expect(parsed.end_date).toBe('2026-10-19')
    expect(parsed.city).toBe('开封')
    expect(parsed.location).toBe('开封大河希尔顿逸林酒店')
    expect(parsed.organizer).toBe('中国天文学会学术交流委员会')
    expect(parsed.abstract_deadline).toBe('2026-09-01')
    expect(parsed.early_bird_deadline).toBe('2026-09-15')
    expect(parsed.registration_deadline).toBe('2026-09-30')
    expect(parsed.website_url).toBe('https://astro2026.example.org')
    expect(parsed.registration_url).toBe('https://astro2026.example.org/register')
  })
})
