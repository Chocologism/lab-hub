import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

describe('AssistantView User Scroll Intent & Auto-scroll Control', () => {
  const filePath = path.resolve(__dirname, 'AssistantView.vue')
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = parse(content)

  it('declares isUserScrolledUp ref and scroll management functions in script setup', () => {
    const script = parsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('const isUserScrolledUp = ref(false)')
    expect(script).toContain('function handleContainerScroll')
    expect(script).toContain('function scrollToBottom(smooth = true, force = false)')
    expect(script).toContain('function jumpToBottom')
  })

  it('checks distance to bottom in handleContainerScroll and updates isUserScrolledUp state', () => {
    const script = parsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('el.scrollHeight - el.scrollTop - el.clientHeight')
    expect(script).toContain('distanceToBottom > 80')
    expect(script).toContain('isUserScrolledUp.value = true')
    expect(script).toContain('distanceToBottom < 30')
    expect(script).toContain('isUserScrolledUp.value = false')
  })

  it('respects user reading intent by skipping scroll in scrollToBottom when isUserScrolledUp is true', () => {
    const script = parsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('if (!force && isUserScrolledUp.value) return')
  })

  it('binds scroll listener on chat-messages-container and renders floating scroll-to-bottom button', () => {
    const template = parsed.descriptor.template?.content || ''
    expect(template).toContain('@scroll.passive="handleContainerScroll"')
    expect(template).toContain('class="scroll-to-bottom-btn"')
    expect(template).toContain('v-if="isUserScrolledUp && messages.length > 0"')
    expect(template).toContain('@click="jumpToBottom"')
    expect(template).toContain('回到底部')
    expect(template).toContain('class="streaming-dot-pulse"')
  })

  it('defines stylish and responsive CSS rules for scroll-to-bottom-btn and pulse animation', () => {
    const style = parsed.descriptor.styles[0]?.content || ''
    expect(style).toContain('.scroll-to-bottom-btn')
    expect(style).toContain('.streaming-dot-pulse')
    expect(style).toContain('@keyframes streamDotPulse')
    expect(style).toContain('.scroll-down-fade-enter-active')
  })
})
