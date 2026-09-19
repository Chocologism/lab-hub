import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  AI_STORAGE_KEY,
  AI_CHAT_HISTORY_KEY,
  AI_SESSIONS_STORAGE_KEY,
  AI_ACTIVE_SESSION_ID_KEY,
  PRESET_PROVIDERS,
  DEFAULT_AI_CONFIG,
  createDefaultSession,
  normalizeModelItem,
  normalizeEndpoint,
  loadAiConfig,
  saveAiConfig,
  loadAiSessions,
  saveAiSessions,
  loadActiveSessionId,
  saveActiveSessionId,
  clearAllAiSessions,
  loadAiChatHistory,
  saveAiChatHistory,
  clearAiChatHistory,
  sendChatMessageStream,
  testAiConnection,
  isAiConnectivityPassed,
  setAiConnectivityPassed
} from './aiService'

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

describe('aiService - Provider & Model Configuration', () => {
  it('contains deepseek provider as default', () => {
    const ds = PRESET_PROVIDERS.find(p => p.id === 'deepseek')
    expect(ds).toBeDefined()
    expect(ds.noApiKey).toBe(false)
    expect(ds.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(ds.models.length).toBeGreaterThan(0)
  })

  it('normalizes string model to model object with reasoning defaults', () => {
    const item = normalizeModelItem('deepseek-flash')
    expect(item.id).toBe('deepseek-flash')
    expect(item.name).toBe('deepseek-flash')
    expect(item.contextWindow).toBe(1000000)
    expect(item.supportsReasoningEffort).toBe(true)
    expect(item.reasoningEffort).toBe('off')
  })

  it('normalizes object model item', () => {
    const item = normalizeModelItem({
      id: 'gpt-4o',
      name: 'GPT 4o',
      contextWindow: 128000,
      supportsReasoningEffort: false,
      reasoningEffort: 'off'
    })
    expect(item.id).toBe('gpt-4o')
    expect(item.name).toBe('GPT 4o')
    expect(item.contextWindow).toBe(128000)
    expect(item.supportsReasoningEffort).toBe(false)
  })

  it('normalizes endpoint with /chat/completions', () => {
    expect(normalizeEndpoint('http://127.0.0.1:4000/v1')).toBe('http://127.0.0.1:4000/v1/chat/completions')
    expect(normalizeEndpoint('http://127.0.0.1:4000/v1/')).toBe('http://127.0.0.1:4000/v1/chat/completions')
    expect(normalizeEndpoint('http://127.0.0.1:4000/v1/chat/completions')).toBe('http://127.0.0.1:4000/v1/chat/completions')
  })
})

describe('aiService - Config Storage', () => {
  it('returns default config when storage is empty', () => {
    const config = loadAiConfig()
    expect(config.provider).toBe('deepseek')
    expect(config.model).toBe('deepseek-chat')
    expect(Array.isArray(config.models)).toBe(true)
  })

  it('saves and loads customized config', () => {
    const custom = {
      ...DEFAULT_AI_CONFIG,
      provider: 'deepseek',
      apiKey: 'sk-test-12345'
    }
    saveAiConfig(custom)
    const loaded = loadAiConfig()
    expect(loaded.provider).toBe('deepseek')
    expect(loaded.apiKey).toBe('sk-test-12345')
  })
})

describe('aiService - Multi-Session Management', () => {
  it('creates default session with empty messages and standard title', () => {
    const session = createDefaultSession()
    expect(session.id).toMatch(/^session_\d+_\w+$/)
    expect(session.title).toBe('新对话')
    expect(session.messages).toEqual([])
    expect(typeof session.createdAt).toBe('number')
    expect(typeof session.updatedAt).toBe('number')
  })

  it('generates a default session when localStorage is clean', () => {
    const sessions = loadAiSessions()
    expect(sessions.length).toBe(1)
    expect(sessions[0].title).toBe('新对话')
    expect(sessions[0].messages).toEqual([])
  })

  it('persists and retrieves multiple sessions', () => {
    const s1 = { id: 's1', title: 'Session 1', createdAt: 100, updatedAt: 100, messages: [{ role: 'user', content: 'hello' }] }
    const s2 = { id: 's2', title: 'Session 2', createdAt: 200, updatedAt: 200, messages: [{ role: 'user', content: 'test' }] }
    saveAiSessions([s1, s2])

    const loaded = loadAiSessions()
    expect(loaded.length).toBe(2)
    expect(loaded[0].id).toBe('s1')
    expect(loaded[1].id).toBe('s2')
  })

  it('manages active session id correctly', () => {
    expect(loadActiveSessionId()).toBe('')
    saveActiveSessionId('test_session_id')
    expect(loadActiveSessionId()).toBe('test_session_id')
    saveActiveSessionId('')
    expect(loadActiveSessionId()).toBe('')
  })

  it('migrates legacy single history seamlessly into sessions', () => {
    const legacyData = [
      { id: '1', role: 'user', content: '请帮我推导红移与膨胀距离公式', timestamp: 1000 },
      { id: '2', role: 'assistant', content: '根据现代宇宙学模型，红移与光度距离关系为...', timestamp: 2000 }
    ]
    localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(legacyData))

    const sessions = loadAiSessions()
    expect(sessions.length).toBe(1)
    expect(sessions[0].title).toBe('请帮我推导红移与膨胀距离公式')
    expect(sessions[0].messages.length).toBe(2)
    expect(sessions[0].messages[0].content).toContain('红移')
  })

  it('clears all sessions properly', () => {
    saveAiSessions([{ id: 's1', title: 'Test', messages: [] }])
    saveActiveSessionId('s1')
    localStorage.setItem(AI_CHAT_HISTORY_KEY, '[]')

    clearAllAiSessions()
    expect(localStorage.getItem(AI_SESSIONS_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(AI_ACTIVE_SESSION_ID_KEY)).toBeNull()
    expect(localStorage.getItem(AI_CHAT_HISTORY_KEY)).toBeNull()
  })

  it('maintains backward compatibility with legacy history functions', () => {
    const history = [
      { role: 'user', content: 'test legacy' }
    ]
    saveAiChatHistory(history)
    const loaded = loadAiChatHistory()
    expect(loaded.length).toBe(1)
    expect(loaded[0].content).toBe('test legacy')

    clearAiChatHistory()
    expect(loadAiSessions()[0].messages).toEqual([])
  })

  it('supports paperContext in createDefaultSession', () => {
    const paperContext = {
      arxivId: '2609.19132v1',
      title: 'Dark Matter in Galaxies',
      fullText: 'Section 1. Introduction...',
      wordCount: 1500
    }
    const session = createDefaultSession('研读: 2609.19132v1', { paperContext })
    expect(session.title).toBe('研读: 2609.19132v1')
    expect(session.paperContext).toEqual(paperContext)
  })

  it('injects paperContext into sendChatMessageStream system message', async () => {
    const originalFetch = globalThis.fetch
    let capturedBody = null
    globalThis.fetch = vi.fn().mockImplementation((url, options) => {
      capturedBody = JSON.parse(options.body)
      return Promise.resolve({
        ok: true,
        body: {
          getReader() {
            let readCount = 0
            return {
              read() {
                if (readCount++ === 0) {
                  return Promise.resolve({
                    done: false,
                    value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"测试回答"}}]}\n\ndata: [DONE]\n\n')
                  })
                }
                return Promise.resolve({ done: true, value: undefined })
              }
            }
          }
        }
      })
    })

    const paperContext = {
      arxivId: '2609.19132v1',
      title: 'Dark Matter in Galaxies',
      authors: 'Author A, Author B',
      fullText: 'Section 1: Full text of galaxy dark matter study.'
    }

    let chunkResult = ''
    await sendChatMessageStream({
      config: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test' },
      messages: [{ role: 'user', content: '请问文章结论是什么？' }],
      paperContext,
      onChunk: (c) => { chunkResult += c }
    })

    expect(chunkResult).toBe('测试回答')
    expect(capturedBody).toBeDefined()
    const sysMsg = capturedBody.messages.find(m => m.role === 'system')
    expect(sysMsg).toBeDefined()
    expect(sysMsg.content).toContain('当前研讨论文全文基准与长期记忆')
    expect(sysMsg.content).toContain('论文 arXiv 编号: 2609.19132v1')
    expect(sysMsg.content).toContain('Dark Matter in Galaxies')
    expect(sysMsg.content).toContain('Section 1: Full text of galaxy dark matter study.')

    globalThis.fetch = originalFetch
  })
})

describe('aiService - testAiConnection & Accurate Error Diagnosis', () => {
  const originalFetch = globalThis.fetch

  it('fails fast if baseUrl is empty', async () => {
    const res = await testAiConnection({ baseUrl: '' })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('请填写接口 Base URL 地址')
    expect(isAiConnectivityPassed()).toBe(false)
  })

  it('fails fast if apiKey is missing for providers other than ollama', async () => {
    const res = await testAiConnection({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', apiKey: '' })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('请填写 API Key')
    expect(isAiConnectivityPassed()).toBe(false)
  })

  it('differentiates local connection failure on local baseUrl', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const res = await testAiConnection({
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/v1'
    })

    expect(res.ok).toBe(false)
    expect(res.message).toContain('无法连接到本地接口服务')
    expect(isAiConnectivityPassed()).toBe(false)

    globalThis.fetch = originalFetch
  })

  it('diagnoses Mixed Content restriction when securitypolicyviolation is triggered', async () => {
    let violationListener = null
    const originalAddEventListener = globalThis.document?.addEventListener
    const originalRemoveEventListener = globalThis.document?.removeEventListener

    globalThis.document = {
      addEventListener: vi.fn((event, handler) => {
        if (event === 'securitypolicyviolation') {
          violationListener = handler
        }
      }),
      removeEventListener: vi.fn()
    }

    globalThis.fetch = vi.fn().mockImplementation(() => {
      // 模拟浏览器拦截 Mixed Content 并抛出 securitypolicyviolation
      if (violationListener) {
        violationListener({
          effectiveDirective: 'connect-src',
          blockedURI: 'http://127.0.0.1:11434/v1/chat/completions'
        })
      }
      return Promise.reject(new TypeError('Failed to fetch'))
    })

    const res = await testAiConnection({
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/v1'
    })

    expect(res.ok).toBe(false)
    expect(res.message).toContain('Mixed Content')
    expect(res.message).toContain('不安全内容')

    globalThis.fetch = originalFetch
    if (originalAddEventListener) globalThis.document.addEventListener = originalAddEventListener
    if (originalRemoveEventListener) globalThis.document.removeEventListener = originalRemoveEventListener
  })

  it('marks connectivity passed and returns ok true when response is 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }] })
    })

    const res = await testAiConnection({
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/v1'
    })

    expect(res.ok).toBe(true)
    expect(res.message).toContain('连接成功')
    expect(isAiConnectivityPassed()).toBe(true)

    globalThis.fetch = originalFetch
  })
})

