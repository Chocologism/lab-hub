import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

describe('MailboxView push schedule AI recognition conditional display', () => {
  const filePath = path.resolve(__dirname, 'MailboxView.vue')
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = parse(content)

  it('renders ai-schedule-recognize-bar conditionally based on isAiAssistantReadyState', () => {
    const template = parsed.descriptor.template?.content || ''
    expect(template).toContain('v-if="isAiAssistantReadyState" class="ai-schedule-recognize-bar"')
    expect(template).toContain('class="ai-recognize-action-btn"')
    expect(template).toContain('AI 智能识别填报')
  })

  it('declares isAiAssistantReadyState and updates it via isAiAssistantReady in openPushScheduleModal and refreshAiState', () => {
    const script = parsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('const isAiAssistantReadyState = ref(false)')
    expect(script).toContain('function refreshAiState()')
    expect(script).toContain('isAiAssistantReadyState.value = isAiAssistantReady()')
    expect(script).toContain("window.addEventListener('storage', refreshAiState)")
    expect(script).toContain("window.addEventListener('focus', refreshAiState)")
    expect(script).toContain("window.removeEventListener('storage', refreshAiState)")
    expect(script).toContain("window.removeEventListener('focus', refreshAiState)")
  })
})
