import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

describe('MailboxView and TalkManager duplicate schedule prompt handling', () => {
  const mailboxPath = path.resolve(__dirname, 'MailboxView.vue')
  const mailboxContent = fs.readFileSync(mailboxPath, 'utf8')
  const mailboxParsed = parse(mailboxContent)
  const mailboxScript = mailboxParsed.descriptor.scriptSetup?.content || ''

  const talkManagerPath = path.resolve(__dirname, '../components/TalkManager.vue')
  const talkManagerContent = fs.readFileSync(talkManagerPath, 'utf8')
  const talkManagerParsed = parse(talkManagerContent)
  const talkManagerScript = talkManagerParsed.descriptor.scriptSetup?.content || ''

  it('MailboxView handles replaced vs unchanged duplicates for multi-talk push', () => {
    expect(mailboxScript).toContain('let replacedCount = 0')
    expect(mailboxScript).toContain('let unchangedCount = 0')
    expect(mailboxScript).toContain('if (res?.replaced) {')
    expect(mailboxScript).toContain('replacedCount++')
    expect(mailboxScript).toContain('} else if (res?.merged) {')
    expect(mailboxScript).toContain('unchangedCount++')
    expect(mailboxScript).toContain('已用最新推送更新替换')
    expect(mailboxScript).toContain('已有完全相同记录无变更')
  })

  it('MailboxView handles replaced vs unchanged duplicates for single talk push', () => {
    expect(mailboxScript).toContain('if (res?.replaced) {')
    expect(mailboxScript).toContain("notify('检测到重复日程，已用最新推送内容更新替换！可在工作台与组会日程查看。')")
    expect(mailboxScript).toContain("notify('检测到相同日程，已有完全相同记录无变更。')")
  })

  it('TalkManager handles replaced vs unchanged duplicates', () => {
    expect(talkManagerScript).toContain('let replacedCount = 0')
    expect(talkManagerScript).toContain('let unchangedCount = 0')
    expect(talkManagerScript).toContain("notify('检测到重复日程，已用最新内容更新替换！')")
    expect(talkManagerScript).toContain("notify('检测到相同日程，已有完全相同记录无变更')")
    expect(talkManagerScript).toContain('已用最新内容更新替换')
  })
})
