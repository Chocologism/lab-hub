import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

describe('AssistantView Paper Discussion integration', () => {
  const filePath = path.resolve(__dirname, 'AssistantView.vue')
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = parse(content)

  it('contains session-paper-banner in template when paperContext exists', () => {
    const template = parsed.descriptor.template?.content || ''
    expect(template).toContain('class="session-paper-banner"')
    expect(template).toContain('v-if="currentSession?.paperContext"')
    expect(template).toContain('currentSession.paperContext.arxivId')
    expect(template).toContain('currentSession.paperContext.title')
    expect(template).toContain('banner-quick-actions')
    expect(template).toContain('创新点剖析')
    expect(template).toContain('学术翻译')
  })

  it('binds is-paper and session-arxiv-tag in sidebar session list', () => {
    const template = parsed.descriptor.template?.content || ''
    expect(template).toContain(":class=\"{ 'is-paper': Boolean(session.paperContext) }\"")
    expect(template).toContain('session.paperContext ? \'article\' : \'chat\'')
    expect(template).toContain('class="session-arxiv-tag"')
  })

  it('defines paper fetching and route discuss handler functions in script setup', () => {
    const script = parsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('function fetchPaperContentForSession')
    expect(script).toContain('function retryFetchPaperContent')
    expect(script).toContain('function handleRouteDiscussArxiv')
    expect(script).toContain('fetchArxivPaperFulltext')
    expect(script).toContain('paperContext: currentSession.value?.paperContext || null')
  })

  it('styles session-paper-banner and handles responsive layout', () => {
    const style = parsed.descriptor.styles[0]?.content || ''
    expect(style).toContain('.session-paper-banner')
    expect(style).toContain('.paper-arxiv-pill')
    expect(style).toContain('.quick-action-pill')
    expect(style).toContain('.session-lead-icon.is-paper')
    expect(style).toContain('.session-arxiv-tag')
  })
})
