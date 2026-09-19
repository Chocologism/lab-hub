import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parse, compileScript } from '@vue/compiler-sfc'
import {
  saveAiConfig,
  setAiConnectivityPassed,
  isAiConnectivityPassed,
  AI_STORAGE_KEY,
  AI_CONNECTIVITY_KEY
} from '../services/aiService'

describe('AssistantView & Global AI Configuration Instant Reactivity', () => {
  const assistantPath = path.resolve(__dirname, 'AssistantView.vue')
  const assistantContent = fs.readFileSync(assistantPath, 'utf8')
  const assistantParsed = parse(assistantContent)

  const mailboxPath = path.resolve(__dirname, 'MailboxView.vue')
  const mailboxContent = fs.readFileSync(mailboxPath, 'utf8')

  const arxivPath = path.resolve(__dirname, 'ArxivFeedView.vue')
  const arxivContent = fs.readFileSync(arxivPath, 'utf8')

  let store = {}
  beforeEach(() => {
    store = {}
    global.localStorage = {
      getItem: vi.fn((key) => store[key] !== undefined ? store[key] : null),
      setItem: vi.fn((key, val) => { store[key] = String(val) }),
      removeItem: vi.fn((key) => { delete store[key] }),
      clear: vi.fn(() => { store = {} })
    }
  })

  it('declares hasSavedConfig reactive ref and uses it inside isConfigured in AssistantView', () => {
    const script = assistantParsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('const hasSavedConfig = ref(Boolean(localStorage.getItem(AI_STORAGE_KEY)))')
    expect(script).toContain('if (!hasSavedConfig.value) return false')
    expect(script).toContain('return Boolean(connectivityPassed.value)')
  })

  it('compiles AssistantView SFC bindings without any missing reactive variables', () => {
    const compiled = compileScript(assistantParsed.descriptor, { id: 'test-assistant-reactivity' })
    const bindings = compiled.bindings || {}
    expect('hasSavedConfig' in bindings).toBe(true)
    expect('connectivityPassed' in bindings).toBe(true)
    expect('isConfigured' in bindings).toBe(true)
  })

  it('automatically persists valid config on successful connectivity test in AssistantView', () => {
    const script = assistantParsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('async function handleTestConnection()')
    expect(script).toContain('if (res.ok) {')
    expect(script).toContain('setAiConnectivityPassed(true)')
    expect(script).toContain('connectivityPassed.value = true')
    expect(script).toContain('saveAiConfig(config)')
    expect(script).toContain('hasSavedConfig.value = true')
  })

  it('updates hasSavedConfig and focuses textarea upon saving configuration in AssistantView', () => {
    const script = assistantParsed.descriptor.scriptSetup?.content || ''
    expect(script).toContain('function handleSaveConfig()')
    expect(script).toContain('hasSavedConfig.value = true')
    expect(script).toContain('textareaRef.value.focus()')
  })

  it('listens for labhub-ai-config-changed event across AssistantView, MailboxView, and ArxivFeedView', () => {
    const assistantScript = assistantParsed.descriptor.scriptSetup?.content || ''
    expect(assistantScript).toContain("window.addEventListener('labhub-ai-config-changed', syncConnectivityState)")
    expect(assistantScript).toContain("window.removeEventListener('labhub-ai-config-changed', syncConnectivityState)")

    expect(mailboxContent).toContain("window.addEventListener('labhub-ai-config-changed', refreshAiState)")
    expect(mailboxContent).toContain("window.removeEventListener('labhub-ai-config-changed', refreshAiState)")

    expect(arxivContent).toContain("window.addEventListener('labhub-ai-config-changed', checkAiReady)")
    expect(arxivContent).toContain("window.removeEventListener('labhub-ai-config-changed', checkAiReady)")
  })

  it('dispatches labhub-ai-config-changed event when saving config or updating connectivity in aiService', () => {
    const events = []
    const originalWindow = global.window
    const fakeWindow = {
      dispatchEvent: vi.fn((evt) => events.push(evt.type))
    }
    global.window = fakeWindow

    try {
      setAiConnectivityPassed(true)
      expect(events).toContain('labhub-ai-config-changed')

      events.length = 0
      saveAiConfig({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1' })
      expect(events).toContain('labhub-ai-config-changed')
    } finally {
      global.window = originalWindow
    }
  })
})
