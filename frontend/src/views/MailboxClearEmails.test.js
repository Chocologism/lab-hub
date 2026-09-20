import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'
import { mailboxApi } from '../api/client'

describe('Mailbox clear all emails and delete single email functionality', () => {
  const filePath = path.resolve(__dirname, 'MailboxView.vue')
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = parse(content)
  const script = parsed.descriptor.scriptSetup?.content || ''
  const template = parsed.descriptor.template?.content || ''

  it('provides clearEmails and deleteEmail methods in mailboxApi', () => {
    expect(typeof mailboxApi.clearEmails).toBe('function')
    expect(typeof mailboxApi.deleteEmail).toBe('function')
  })

  it('declares clearing and deleting states in MailboxView script', () => {
    expect(script).toContain('const clearingEmails = ref(false)')
    expect(script).toContain('const deletingEmailId = ref(null)')
    expect(script).toContain('async function handleClearAllEmails()')
    expect(script).toContain('async function handleDeleteSingleEmail(item)')
  })

  it('uses confirmAction before clearing and deleting emails', () => {
    expect(script).toContain('import { notify, confirmAction } from')
    expect(script).toContain("title: '清空邮件'")
    expect(script).toContain("confirmLabel: '确认清空'")
    expect(script).toContain("title: '删除邮件'")
    expect(script).toContain("confirmLabel: '删除'")
    expect(script).toContain('danger: true')
  })

  it('calls mailboxApi.clearEmails and mailboxApi.deleteEmail in the script', () => {
    expect(script).toContain('await mailboxApi.clearEmails()')
    expect(script).toContain('await mailboxApi.deleteEmail(item.id)')
    expect(script).toContain('emails.value = []')
    expect(script).toContain('emails.value = emails.value.filter(e => e.id !== item.id)')
  })

  it('renders clear-emails-btn in emails-meta-summary', () => {
    expect(template).toContain('class="clear-emails-btn"')
    expect(template).toContain('@click="handleClearAllEmails"')
    expect(template).toContain(':disabled="clearingEmails"')
    expect(template).toContain('清空邮件')
  })

  it('renders delete button on email cards and inside reader drawer toolbar', () => {
    expect(template).toContain('class="email-delete-btn"')
    expect(template).toContain('@click.stop="handleDeleteSingleEmail(item)"')
    expect(template).toContain('class="button small ghost reader-delete-btn"')
    expect(template).toContain('@click="handleDeleteSingleEmail(selectedEmail)"')
    expect(template).toContain('删除邮件')
  })

  it('renders email-subject on top row and sender info in email-sender-line', () => {
    expect(template).toContain('class="email-card-top-row"')
    expect(template).toContain('class="email-subject"')
    expect(template).toContain('class="email-sender-line"')
    expect(template).toContain('getSenderName(item)')
    expect(template).toContain('getEmailSnippet(item)')
  })

  it('defines getSenderName, getSenderEmail, and getEmailSnippet helper functions in script', () => {
    expect(script).toContain('function getSenderName(item)')
    expect(script).toContain('function getSenderEmail(item)')
    expect(script).toContain('function getEmailSnippet(item)')
    expect(script).not.toContain("item.snippet || '（无正文预览）'")
  })
})
