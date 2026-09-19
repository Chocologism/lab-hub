import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

describe('AssistantView Modal Backdrop Drag Protection', () => {
  const filePath = path.resolve(__dirname, 'AssistantView.vue')
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = parse(content)

  it('defines backdrop mouse tracking handlers in script setup', () => {
    const script = parsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('let isConfigBackdropMouseDown = false')
    expect(script).toContain('function handleConfigOverlayMouseDown')
    expect(script).toContain('function handleConfigOverlayMouseUp')
    expect(script).toContain('function handleConfigOverlayClick')
    expect(script).toContain('let isImageLightboxMouseDown = false')
    expect(script).toContain('function handleImageLightboxMouseDown')
    expect(script).toContain('function handleImageLightboxClick')
  })

  it('binds mousedown, mouseup, and click handlers on config-modal-overlay', () => {
    const template = parsed.descriptor.template?.content || ''
    expect(template).toContain('class="config-modal-overlay"')
    expect(template).toContain('@mousedown="handleConfigOverlayMouseDown"')
    expect(template).toContain('@mouseup="handleConfigOverlayMouseUp"')
    expect(template).toContain('@click="handleConfigOverlayClick"')
    expect(template).toContain('class="config-modal-card glass-card" @mousedown.stop')
  })

  it('binds drag protection on image lightbox modal as well', () => {
    const template = parsed.descriptor.template?.content || ''
    expect(template).toContain('class="image-lightbox-overlay"')
    expect(template).toContain('@mousedown="handleImageLightboxMouseDown"')
    expect(template).toContain('@mouseup="handleImageLightboxMouseUp"')
    expect(template).toContain('@click="handleImageLightboxClick"')
    expect(template).toContain('class="image-lightbox-card" @click.stop @mousedown.stop')
  })

  it('renders hint for active provider', () => {
    const template = parsed.descriptor.template?.content || ''
    expect(template).toContain('currentProviderInfo?.hint')
  })
})
