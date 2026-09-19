import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('Scroll Anti-Flicker Architecture & Theme Colors', () => {
  const indexCss = readFileSync(resolve(__dirname, '../index.css'), 'utf-8')
  const baseDialogVue = readFileSync(resolve(__dirname, '../components/BaseDialog.vue'), 'utf-8')
  const noticesVue = readFileSync(resolve(__dirname, 'NoticesView.vue'), 'utf-8')
  const noticeMarqueeVue = readFileSync(resolve(__dirname, '../components/NoticeMarquee.vue'), 'utf-8')
  const assistantVue = readFileSync(resolve(__dirname, 'AssistantView.vue'), 'utf-8')

  it('defines --panel-solid in :root and classic-cyan', () => {
    expect(indexCss).toContain('--panel-solid: #0c0a1a;')
    expect(indexCss).toContain('--panel-solid: #152f38;')
  })

  it('decouples .dialog-frame scrolling and removes backdrop-filter', () => {
    // .dialog-frame must NOT have backdrop-filter (flicker cause)
    const dialogFrameRegex = /\.dialog-frame\s*\{([^}]+)\}/
    const match = indexCss.match(dialogFrameRegex)
    expect(match).toBeTruthy()
    const content = match[1]
    expect(content).not.toContain('backdrop-filter:blur')
    expect(content).toContain('overflow:hidden')
    expect(content).toContain('isolation:isolate')
    expect(content).toContain('--panel-solid')
  })

  it('ensures .dialog-content is the dedicated scrolling container with overscroll-behavior: contain', () => {
    const dialogContentRegex = /\.dialog-content\s*\{([^}]+)\}/
    const match = indexCss.match(dialogContentRegex)
    expect(match).toBeTruthy()
    const content = match[1]
    expect(content).toContain('overflow-y:auto')
    expect(content).toContain('overscroll-behavior:contain')
  })

  it('ensures BaseDialog clears GSAP transform on animation completion', () => {
    expect(baseDialogVue).toContain("clearProps: 'transform'")
  })

  it('ensures Notices search input does not use hardcoded sky blue #06b6d4 for focus', () => {
    expect(noticesVue).not.toContain('border-bottom-color: var(--primary, #06b6d4)')
    expect(noticesVue).toContain('border-bottom-color: var(--accent) !important;')
    expect(noticesVue).toContain('color: var(--accent) !important;')
  })

  it('ensures modal cards in NoticesView, NoticeMarquee, and AssistantView have panel-solid and isolation', () => {
    expect(noticesVue).toContain('background: var(--panel-solid, #0c0a1a);')
    expect(noticesVue).toContain('isolation: isolate;')
    expect(noticeMarqueeVue).toContain('background: var(--panel-solid, #0c0a1a);')
    expect(noticeMarqueeVue).toContain('isolation: isolate;')
    expect(assistantVue).toContain('background: var(--panel-solid, #0c0a1a);')
    expect(assistantVue).toContain('isolation: isolate;')
  })

  it('ensures dialog window is unified with custom colors and not hardcoded to cyan', () => {
    // index.css should NOT have hardcoded #152f38 on dialog-frame under vanta-fog
    expect(indexCss).not.toContain('[data-theme-style="vanta-fog"] .dialog-frame { background: #152f38; }')
    expect(indexCss).not.toContain('[data-theme-style="vanta-fog"] .dialog-heading { background: #18323b; }')
    // custom scheme must explicitly bind dialog-frame to --panel-solid
    expect(indexCss).toContain('[data-color-scheme="custom"] .dialog-frame')
    // BaseDialog must support and bind frameStyle
    expect(baseDialogVue).toContain('frameStyle: [Object, String]')
    expect(baseDialogVue).toContain(':style="frameStyle"')
  })
})
