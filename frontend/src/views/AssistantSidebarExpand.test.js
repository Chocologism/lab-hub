import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse } from '@vue/compiler-sfc'

describe('AssistantView Sidebar Collapse and Expand Control', () => {
  const filePath = path.resolve(__dirname, 'AssistantView.vue')
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = parse(content)

  it('declares isSidebarCollapsed ref and toggleSidebar function in script setup', () => {
    const script = parsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('const isSidebarCollapsed = ref')
    expect(script).toContain('function toggleSidebar')
    expect(script).toContain('isSidebarCollapsed.value = !isSidebarCollapsed.value')
    expect(script).toContain("localStorage.setItem('labhub_ai_sidebar_collapsed'")
  })

  it('contains sidebar-toggle-btn inside sidebar-top with expand/collapse logic', () => {
    const template = parsed.descriptor.template?.content || ''
    expect(template).toContain('class="sidebar-toggle-btn"')
    expect(template).toContain(":title=\"isSidebarCollapsed ? '展开历史对话' : '收起历史对话'\"")
    expect(template).toContain('@click="toggleSidebar"')
    expect(template).toContain("<AppIcon :name=\"isSidebarCollapsed ? 'right' : 'left'\" :size=\"14\" />")
  })

  it('ensures collapsed sidebar displays sidebar-toggle-btn without hiding it', () => {
    const style = parsed.descriptor.styles[0]?.content || ''
    // CSS should NOT hide sidebar-toggle-btn when collapsed
    expect(style).not.toMatch(/\.assistant-sidebar\.is-collapsed\s+\.sidebar-toggle-btn\s*\{\s*display:\s*none;\s*\}/)
    expect(style).toContain('.assistant-sidebar.is-collapsed .sidebar-toggle-btn')
    expect(style).toContain('display: flex !important')
  })

  it('renders expand button in assistant-header when sidebar is collapsed', () => {
    const template = parsed.descriptor.template?.content || ''
    expect(template).toContain('v-if="isSidebarCollapsed"')
    expect(template).toContain('class="sidebar-expand-header-btn"')
    expect(template).toContain('@click="toggleSidebar"')
    expect(template).toContain('展开侧栏')
  })
})
