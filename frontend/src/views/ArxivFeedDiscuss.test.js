import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

describe('ArxivFeedView Discuss with AI integration', () => {
  const filePath = path.resolve(__dirname, 'ArxivFeedView.vue')
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = parse(content)

  it('contains the discuss-ai-btn button in the template for arxiv papers conditional on isAiReady', () => {
    const template = parsed.descriptor.template?.content || ''
    expect(template).toContain('class="discuss-ai-btn button small secondary"')
    expect(template).toContain('v-if="isAiReady && paper.arxiv_id"')
    expect(template).toContain('@click="handleDiscussWithAi(paper)"')
    expect(template).toContain('与AI讨论')
  })

  it('defines handleDiscussWithAi in script setup with session storage and router navigation', () => {
    const script = parsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('function handleDiscussWithAi(paper)')
    expect(script).toContain("sessionStorage.setItem('labhub_pending_discuss_paper'")
    expect(script).toContain("path: '/assistant'")
    expect(script).toContain('discussArxiv: rawId')
  })

  it('contains proper CSS rules for discuss-ai-btn and responsive media query', () => {
    const style = parsed.descriptor.styles[0]?.content || ''
    expect(style).toContain('.discuss-ai-btn')
    expect(style).toContain('.paper-meta .discuss-ai-btn')
  })

  it('binds checkAiReady with isAiAssistantReady and listens for window storage and focus', () => {
    const script = parsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('function checkAiReady()')
    expect(script).toContain('isAiReady.value = isAiAssistantReady()')
    expect(script).toContain("window.addEventListener('storage', checkAiReady)")
    expect(script).toContain("window.addEventListener('focus', checkAiReady)")
    expect(script).toContain("window.removeEventListener('storage', checkAiReady)")
    expect(script).toContain("window.removeEventListener('focus', checkAiReady)")
  })
})
