import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

describe('SystemTutorialModal Interactive In-Page Tour & Accessibility', () => {
  const modalPath = path.resolve(__dirname, 'SystemTutorialModal.vue')
  const modalContent = fs.readFileSync(modalPath, 'utf8')
  const modalParsed = parse(modalContent)
  const template = modalParsed.descriptor.template?.content || ''
  const script = modalParsed.descriptor.scriptSetup?.content || ''

  it('contains essential in-page tour dock layout elements', () => {
    expect(template).toContain('tutorial-overlay')
    expect(template).toContain('tutorial-card')
    expect(template).toContain('tutorial-top-bar')
    expect(template).toContain('tutorial-step-badge')
    expect(template).toContain('progress-track')
    expect(template).toContain('progress-fill')
    expect(template).toContain('tutorial-body')
    expect(template).toContain('icon-stage')
    expect(template).toContain('content-stage')
    expect(template).toContain('dots-nav')
    expect(template).toContain('tutorial-footer')
  })

  it('supports mandatory mode by hiding close button when isMandatory is true', () => {
    expect(template).toContain('v-if="!isMandatory"')
    expect(template).toContain('aria-label="关闭教程"')
  })

  it('supports minimizable floating capsule dock to avoid obscuring the page', () => {
    expect(template).toContain('tour-minimized-pill')
    expect(template).toContain('isMinimized = false')
    expect(template).toContain('isMinimized = true')
  })

  it('renders dynamic in-page navigation status and interactive action buttons', () => {
    expect(template).toContain('tour-status-banner')
    expect(template).toContain('isOnTargetRoute')
    expect(template).toContain('btn-navigate-target')
    expect(template).toContain('btn-ready-next')
    expect(template).toContain('finishTutorial')
    expect(template).toContain('完成引导')
  })

  it('renders visible feature highlights checklist for each step', () => {
    expect(template).toContain('tour-highlights-box')
    expect(template).toContain('highlights-list')
    expect(template).toContain('highlight-item')
  })

  it('supports keyboard navigation via ArrowRight, ArrowLeft, Enter, and Escape', () => {
    expect(script).toContain("e.key === 'ArrowRight'")
    expect(script).toContain("e.key === 'ArrowLeft'")
    expect(script).toContain("e.key === 'Enter'")
    expect(script).toContain("e.key === 'Escape'")
    expect(script).toContain('window.addEventListener')
    expect(script).toContain('window.removeEventListener')
  })

  it('guarantees ultra-high contrast dark slate solid background to eliminate pale text issues', () => {
    expect(modalContent).toContain('background: #0f172a !important')
    expect(modalContent).toContain('color: #ffffff !important')
    expect(modalContent).toContain('border: 2px solid #38bdf8 !important')
  })

  it('includes admin distinction styling classes', () => {
    expect(template).toContain('admin-badge')
    expect(template).toContain('admin-fill')
    expect(template).toContain('admin-stage')
    expect(template).toContain('admin-dot')
  })

  it('renders SVG spotlight cutout mask with grayscale backdrop and glowing ring', () => {
    expect(template).toContain('tour-backdrop-svg')
    expect(template).toContain('tour-spotlight-mask')
    expect(template).toContain('tour-backdrop-tint')
    expect(template).toContain('tour-spotlight-ring')
    expect(modalContent).toContain('backdrop-filter: grayscale(85%)')
  })

  it('provides clean non-arrow spotlight presentation without arrow clutter', () => {
    expect(template).not.toContain('tour-pointer-arrow')
    expect(template).not.toContain('pointer-arrow-svg')
    expect(script).not.toContain('arrowDirection')
    expect(script).not.toContain('arrowStyle')
    expect(template).toContain('tour-spotlight-ring')
  })

  it('provides dedicated action guide and purpose explanation for in-page sub-guides', () => {
    expect(template).toContain('tour-action-guide-box')
    expect(template).toContain('guide-purpose-row')
    expect(template).toContain('guide-action-row')
    expect(template).toContain('highlight-action')
  })

  it('provides skip tutorial buttons allowing users to skip anytime', () => {
    expect(template).toContain('skip-tour-text-btn')
    expect(template).toContain('btn-skip-tour')
    expect(template).toContain('skipTutorial')
    expect(template).toContain('跳过')
  })

  it('streamlines next button to always show 下一步 and finish button to 完成引导', () => {
    expect(template).toContain('下一步')
    expect(template).toContain('完成引导')
    expect(template).not.toContain('立即前往实景页面')
    expect(template).not.toContain('完成引导，开启科研协作')
  })

  it('supports mouse drag interactions to move cards and resolve occlusion', () => {
    expect(script).toContain('dragOffset')
    expect(script).toContain('isDragging')
    expect(script).toContain('startDrag')
    expect(script).toContain('resetDragOffset')
    expect(template).toContain('is-dragging')
    expect(template).toContain('@pointerdown="startDrag"')
    expect(template).toContain('@dblclick="resetDragOffset"')
    expect(modalContent).toContain('cursor: grab')
    expect(modalContent).toContain('cursor: grabbing')
    expect(modalContent).toContain('transition: none !important')
  })

  it('omits next button for click-required steps and shows click guidance indicator', () => {
    expect(template).toContain('v-if="currentSubStep?.requiresClick"')
    expect(template).toContain('tour-click-require-indicator')
    expect(template).toContain('请在页面中点击高亮区域')
    expect(template).toContain('v-else')
    expect(template).toContain('btn-step-next')
    expect(script).toContain('if (currentSubStep.value?.requiresClick)')
  })

  it('disables clicking on highlighted area when requiresClick is false and only allows proceeding via next button', () => {
    expect(script).toContain('if (!sub.requiresClick)')
    expect(template).toContain('tour-target-click-proxy')
    expect(template).toContain("'is-clickable': currentSubStep?.requiresClick")
    expect(template).toContain("'is-inert': !currentSubStep?.requiresClick")
    expect(template).toContain('@click.stop.prevent="handleTargetHoleClick"')
    expect(modalContent).toContain('.tour-target-click-proxy.is-inert')
    expect(modalContent).toContain('cursor: default')
    expect(modalContent).toContain('.tour-target-click-proxy.is-clickable')
    expect(modalContent).toContain('cursor: pointer')
  })
})
