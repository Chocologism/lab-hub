import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

describe('MailboxView talk poster attachment and preview', () => {
  const filePath = path.resolve(__dirname, 'MailboxView.vue')
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = parse(content)
  const script = parsed.descriptor.scriptSetup?.content || ''
  const template = parsed.descriptor.template?.content || ''

  it('declares poster state variables and controls in script setup', () => {
    expect(script).toContain('const emailPosterCandidate = computed')
    expect(script).toContain('const emailPosterUrl = computed')
    expect(script).toContain('const emailImageAttachments = computed')
    expect(script).toContain('const scheduleCandidateImages = computed')
    expect(script).toContain('const attachEmailPoster = ref(false)')
    expect(script).toContain('const uploadPosterBusy = ref(false)')
    expect(script).toContain('function selectCandidatePoster')
    expect(script).toContain('function onToggleAttachEmailPoster')
    expect(script).toContain('function clearSchedulePoster()')
  })

  it('supports preferredPosterUrl and leaves poster unforced by default in openPushScheduleModal', () => {
    expect(script).toContain("async function openPushScheduleModal(email, preferredPosterUrl = ''")
    expect(script).toContain("const emailPoster = preferredPosterUrl || ''")
    expect(script).toContain('attachEmailPoster.value = Boolean(emailPoster)')
    expect(script).toContain('poster_url: emailPoster')
  })

  it('preserves chosen poster when parser or AI does not override it', () => {
    expect(script).toContain('scheduleForm.value.poster_url = parsed.poster_url')
    expect(script).toContain('else if (emailPoster && attachEmailPoster.value)')
  })

  it('submits poster_url in handleSaveTalkToSchedule', () => {
    expect(script).toContain("poster_url: t.poster_url || ''")
    expect(script).toContain("poster_url: scheduleForm.value.poster_url || ''")
  })

  it('renders image badge in email card list and attachments gallery in detail drawer', () => {
    expect(template).toContain('hasEmailImages(item)')
    expect(template).toContain('包含图片')
    expect(template).toContain('v-if="emailImageAttachments.length" class="email-attachments-banner glass-card"')
    expect(template).toContain('邮件图片附件')
    expect(template).toContain('作为海报推送到日程')
    expect(template).toContain('查看原图 ↗')
  })

  it('renders poster candidate chips, clear button, and FileField in schedule push modal', () => {
    expect(template).toContain('class="schedule-poster-section"')
    expect(template).toContain('class="poster-candidates-selector"')
    expect(template).toContain('class="poster-chip no-poster-chip"')
    expect(template).toContain('不使用海报')
    expect(template).toContain(':model-value="attachEmailPoster"')
    expect(template).toContain('@update:model-value="onToggleAttachEmailPoster"')
    expect(template).toContain('v-if="scheduleForm.poster_url" class="poster-active-preview"')
    expect(template).toContain('@click="clearSchedulePoster"')
    expect(template).toContain('v-model="scheduleForm.poster_url"')
    expect(template).toContain('@busy="uploadPosterBusy = $event"')
  })

  it('supports conference push, document attachments, and handbook linking', () => {
    expect(script).toContain('isConferenceEmail')
    expect(script).toContain('extractConferenceFromEmailWithAi')
    expect(script).toContain('confForm')
    expect(template).toContain('推送到学术会议')
    expect(template).toContain('class="schedule-type-segmented"')
    expect(template).toContain('v-if="emailDocAttachments.length"')
    expect(template).toContain('设为手册推送到会议')
  })
})
