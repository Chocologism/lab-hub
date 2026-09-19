import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isAiConnectivityPassed,
  setAiConnectivityPassed,
  isAiAssistantReady,
  extractJsonFromText,
  loadPaperTranslations,
  savePaperTranslation,
  extractScheduleFromEmailWithAi,
  extractConferenceFromEmailWithAi,
  extractNoticesFromEmailsWithAi,
  normalizeNoticeDates,
  callAiCompletion,

  sanitizeReasoningEffort,
  saveAiConfig,
  testAiConnection,
  isModelVisionCapable,
  isEmailContentBrief,
  normalizeModelItem,
  convertImageUrlToDataUrl,
  AI_STORAGE_KEY,
  AI_CONNECTIVITY_KEY,
  PAPER_TRANSLATIONS_STORAGE_KEY
} from './aiService'

let store = {}

beforeEach(() => {
  store = {}
  global.localStorage = {
    getItem: vi.fn((key) => (store[key] !== undefined ? store[key] : null)),
    setItem: vi.fn((key, val) => {
      store[key] = String(val)
    }),
    removeItem: vi.fn((key) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    })
  }
  vi.restoreAllMocks()
})

describe('aiService - Connectivity and Readiness State', () => {
  it('detects connectivity status from local storage', () => {
    expect(isAiConnectivityPassed()).toBe(false)
    setAiConnectivityPassed(true)
    expect(isAiConnectivityPassed()).toBe(true)
    expect(store[AI_CONNECTIVITY_KEY]).toBe('true')

    setAiConnectivityPassed(false)
    expect(isAiConnectivityPassed()).toBe(false)
    expect(store[AI_CONNECTIVITY_KEY]).toBeUndefined()
  })

  it('evaluates isAiAssistantReady correctly for ollama without apiKey', () => {
    saveAiConfig({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
      models: [{ id: 'qwen2.5:7b', name: 'Qwen 2.5 7B' }]
    })

    // Connectivity not yet passed
    expect(isAiAssistantReady()).toBe(false)

    // Connectivity passed
    setAiConnectivityPassed(true)
    expect(isAiAssistantReady()).toBe(true)
  })

  it('evaluates isAiAssistantReady correctly for api-key required providers', () => {
    saveAiConfig({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      models: [{ id: 'deepseek-chat', name: 'DeepSeek V3' }]
    })
    setAiConnectivityPassed(true)

    // Missing API Key
    expect(isAiAssistantReady()).toBe(false)

    // With API Key
    saveAiConfig({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-abcdef123456',
      models: [{ id: 'deepseek-chat', name: 'DeepSeek V3' }]
    })
    expect(isAiAssistantReady()).toBe(true)
  })

  it('returns false for isAiAssistantReady when user has never configured AI', () => {
    delete store[AI_STORAGE_KEY]
    setAiConnectivityPassed(true)
    expect(isAiAssistantReady()).toBe(false)
  })

  it('resets connectivity passed state to false when testAiConnection fails', async () => {
    setAiConnectivityPassed(true)
    expect(isAiConnectivityPassed()).toBe(true)

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API Key' } })
    })

    const res = await testAiConnection({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-invalid'
    })

    expect(res.ok).toBe(false)
    expect(isAiConnectivityPassed()).toBe(false)
  })
})

describe('aiService - Robust JSON Extraction', () => {
  it('extracts bare JSON object', () => {
    const raw = '{"title":"宇宙学常数与暗能量","date":"2026-09-23"}'
    const result = extractJsonFromText(raw)
    expect(result).toEqual({
      title: '宇宙学常数与暗能量',
      date: '2026-09-23'
    })
  })

  it('extracts JSON from markdown code block', () => {
    const raw = '以下是提取出的报告信息：\n```json\n{\n  "title": "FAST巡天发现脉冲星",\n  "time": "14:00"\n}\n```\n请核实。'
    const result = extractJsonFromText(raw)
    expect(result).toEqual({
      title: 'FAST巡天发现脉冲星',
      time: '14:00'
    })
  })

  it('extracts JSON when enclosed in text with extra braces', () => {
    const raw = '报告解析结果: {"speaker": "李菂", "notes": "脉冲星偏振观测"} 祝好！'
    const result = extractJsonFromText(raw)
    expect(result).toEqual({
      speaker: '李菂',
      notes: '脉冲星偏振观测'
    })
  })

  it('returns null for non-json strings', () => {
    expect(extractJsonFromText('纯文本无 JSON 格式')).toBeNull()
    expect(extractJsonFromText('')).toBeNull()
    expect(extractJsonFromText('{ 不是合法 json }')).toBeNull()
  })
})

describe('aiService - Paper Translation Persistence', () => {
  it('loads empty translations initially', () => {
    const cache = loadPaperTranslations()
    expect(cache).toEqual({})
  })

  it('saves and reloads paper translations', () => {
    const paperId = '2609.12345'
    savePaperTranslation(paperId, {
      title: '利用高精度恒星光谱揭示行星特征',
      abstract: '在这项研究中，我们分析了高分辨率阶梯光栅光谱仪数据……'
    })

    const cache = loadPaperTranslations()
    expect(cache[paperId]).toBeDefined()
    expect(cache[paperId].title).toBe('利用高精度恒星光谱揭示行星特征')
    expect(cache[paperId].abstract).toContain('高分辨率阶梯光栅光谱仪')
    expect(typeof cache[paperId].updatedAt).toBe('number')
  })
})

describe('aiService - Email Schedule Extraction', () => {
  it('extracts schedule and faithfully preserves fields without greeting as location', async () => {
    const mockEmail = {
      id: 42,
      subject: 'Fw: 南京大学【学术报告】9月23日（周三）上午10点，天文楼302会议室',
      from: 'academic-talks@nju.edu.cn',
      date: '2026-09-20 09:00:00',
      body_text: `各位老师、同学：
大家好！
报告题目: Unveiling Planetary Signatures with High-Precision Stellar Spectroscopy
报告人: Fan Liu
时间: 2026年9月23日（周三）上午10:00
地点: 南京大学天文楼302会议室
摘要: We present high-precision spectroscopic measurements...`
    }

    const mockResponsePayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Unveiling Planetary Signatures with High-Precision Stellar Spectroscopy',
              date: '2026/09/23',
              time: '10:00',
              speaker: 'Fan Liu',
              location: '南京大学天文楼302会议室',
              notes: '报告题目: Unveiling Planetary Signatures...\n摘要: We present high-precision spectroscopic measurements...'
            })
          }
        }
      ]
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponsePayload
    })

    const extracted = await extractScheduleFromEmailWithAi(mockEmail, {
      config: {
        baseUrl: 'http://127.0.0.1:4000/v1',
        model: 'deepseek-flash',
        apiKey: 'sk-test-mock',
        provider: 'deepseek'
      }
    })

    expect(extracted.title).toBe('Unveiling Planetary Signatures with High-Precision Stellar Spectroscopy')
    expect(extracted.date).toBe('2026-09-23')
    expect(extracted.time).toBe('10:00')
    expect(extracted.speaker).toBe('Fan Liu')
    expect(extracted.location).toBe('南大 天文楼302会议室')
    expect(extracted.location).not.toContain('各位老师、同学')
    expect(extracted.notes).toContain('Unveiling Planetary Signatures')
  })

  it('prefers Chinese when email contains dual Chinese and English metadata', async () => {
    const mockEmail = {
      id: 99,
      subject: '学术前沿论坛通知：宇宙加速膨胀射电测量',
      from: 'seminar@lab.edu',
      date: '2026-09-20',
      body_text: `各位老师同学：
题目: 宇宙加速膨胀射电测量 / Radio Measurement of Cosmic Acceleration
报告人: Fan Liu (刘凡)
地点: 5-516 会议室 (Conference Room 5-516)
时间: 2026-09-25 15:30`
    }

    const mockResponsePayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: '宇宙加速膨胀射电测量 / Radio Measurement of Cosmic Acceleration',
              date: '2026-09-25',
              time: '15:30',
              speaker: 'Fan Liu (刘凡)',
              location: '5-516 会议室 (Conference Room 5-516)',
              notes: '题目: 宇宙加速膨胀射电测量...'
            })
          }
        }
      ]
    }

    let capturedBody = null
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => mockResponsePayload
      }
    })

    const extracted = await extractScheduleFromEmailWithAi(mockEmail, {
      config: {
        baseUrl: 'http://127.0.0.1:4000/v1',
        model: 'deepseek-flash',
        apiKey: 'sk-test-mock',
        provider: 'deepseek'
      }
    })

    // 优先填入中文
    expect(extracted.title).toBe('宇宙加速膨胀射电测量')
    expect(extracted.speaker).toBe('刘凡')
    expect(extracted.location).toBe('5-516 会议室')
    // 验证 max_tokens 优化
    expect(capturedBody.max_tokens).toBe(600)
  })
})

describe('aiService - Reasoning Effort Sanitization and Completion Payload', () => {
  it('sanitizes reasoning effort levels correctly', () => {
    expect(sanitizeReasoningEffort('off')).toBeNull()
    expect(sanitizeReasoningEffort('none')).toBeNull()
    expect(sanitizeReasoningEffort('')).toBeNull()
    expect(sanitizeReasoningEffort(null)).toBeNull()
    expect(sanitizeReasoningEffort('invalid_level')).toBeNull()

    expect(sanitizeReasoningEffort('low')).toBe('low')
    expect(sanitizeReasoningEffort('MEDIUM')).toBe('medium')
    expect(sanitizeReasoningEffort('high')).toBe('high')
    expect(sanitizeReasoningEffort('max')).toBe('max')
  })

  it('never sends invalid reasoning_effort: "off" to API in callAiCompletion', async () => {
    let capturedBody = null
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"result":"ok"}' } }]
        })
      }
    })

    const testConfig = {
      baseUrl: 'http://127.0.0.1:4000/v1',
      model: 'deepseek-flash',
      apiKey: 'sk-test-mock',
      provider: 'deepseek',
      models: [
        {
          id: 'deepseek-flash',
          supportsReasoningEffort: true,
          reasoningEffort: 'off'
        }
      ]
    }

    await callAiCompletion({
      config: testConfig,
      messages: [{ role: 'user', content: 'test' }],
      jsonMode: true
    })

    expect(capturedBody).toBeDefined()
    expect(capturedBody.reasoning_effort).toBeUndefined()
    expect(capturedBody.model).toBe('deepseek-flash')
  })
})

describe('aiService - Multimodal Vision and Poster Extraction', () => {
  it('identifies vision-capable models by model name and configuration', () => {
    expect(isModelVisionCapable({ model: 'deepseek-flash' })).toBe(true)
    expect(isModelVisionCapable({ model: 'deepseek-v4.1' })).toBe(true)
    expect(isModelVisionCapable({ model: 'gpt-4o' })).toBe(true)
    expect(isModelVisionCapable({ model: 'gpt-4o-mini' })).toBe(true)
    expect(isModelVisionCapable({ model: 'glm-4v' })).toBe(true)
    expect(isModelVisionCapable({ model: 'Qwen/Qwen2.5-VL-72B-Instruct' })).toBe(true)
    expect(isModelVisionCapable({ model: 'custom-model', models: [{ id: 'custom-model', supportsVision: true }] })).toBe(true)

    expect(isModelVisionCapable({ model: 'deepseek-chat' })).toBe(false)
    expect(isModelVisionCapable({ model: 'qwen2.5-72b' })).toBe(false)
  })

  it('determines whether email body content is brief or lacking talk abstract', () => {
    // 简短且提示“见海报”
    expect(isEmailContentBrief({
      body_text: '各位老师同学：详见海报。祝好！'
    })).toBe(true)

    // 包含“报告详细摘要与个人简介请见海报”字样
    expect(isEmailContentBrief({
      body_text: '各位老师、同学：本周五下午在天文楼举办学术讲座，报告题目《空间引力波探测》，报告详细摘要与主讲人简介请见海报，欢迎准时参会！'
    })).toBe(true)

    // 正文少于120字符
    expect(isEmailContentBrief({
      body_text: '明天上午10点在天文楼开会，欢迎参加。'
    })).toBe(true)

    // 空邮件
    expect(isEmailContentBrief(null)).toBe(true)
    expect(isEmailContentBrief({ body_text: '' })).toBe(true)

    // 详尽正文（包含长篇实质性摘要与具体内容介绍段落）
    expect(isEmailContentBrief({
      body_text: `报告题目: 宇宙第一代恒星与暗物质湮灭
报告人: 张研究员
时间: 2026-09-28 14:00
地点: 实验楼 5-516 会议室
报告摘要: 本次学术报告将系统介绍空间巡天在宇宙第一代恒星形成演化过程中的关键观测证据，深入讨论暗物质粒子湮灭对高红移星系电离结构的影响机制。我们结合最新一代流体动力学数值模拟，详细展示了高能伽马射线背景辐射各向异性谱形的最新拟合结果，并对中国空间站巡天望远镜（CSST）以及未来深空巡天探测规划进行展望。
欢迎各位老师、同学踊跃参会！`
    })).toBe(false)
  })

  it('invokes multimodal vision completion when model supports vision, content is brief, and poster is provided', async () => {
    const briefEmail = {
      id: 101,
      subject: '【学术讲座】引力波电磁对应体探测进展',
      from: 'academic@nju.edu.cn',
      date: '2026-09-21',
      body_text: '各位老师、同学：学术报告海报见附件，欢迎准时参会！',
      poster_url: 'data:image/jpeg;base64,ZmFrZWltYWdlZGF0YQ=='
    }

    const mockVisionResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: '引力波电磁对应体探测进展',
              date: '2026-09-26',
              time: '14:30',
              speaker: '王科研 研究员',
              location: '南京大学天文楼501',
              notes: '海报提取内容：本讲座聚焦引力波暴多波段电磁对应体的高能暂现源观测，详细阐述光学及X射线巡天望远镜阵列的联合后随策略与成果。'
            })
          }
        }
      ]
    }

    let capturedPayload = null
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedPayload = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => mockVisionResponse
      }
    })

    const extracted = await extractScheduleFromEmailWithAi(briefEmail, {
      config: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'deepseek-flash',
        apiKey: 'sk-test'
      },
      posterImageUrl: 'data:image/jpeg;base64,ZmFrZWltYWdlZGF0YQ=='
    })

    expect(extracted.usedVision).toBe(true)
    expect(extracted.notes).toContain('海报提取内容')
    expect(capturedPayload).toBeDefined()
    expect(capturedPayload.max_tokens).toBe(1800)

    // 检查发送的消息结构包含 image_url
    const userMsg = capturedPayload.messages.find(m => m.role === 'user')
    expect(Array.isArray(userMsg.content)).toBe(true)
    const imagePart = userMsg.content.find(p => p.type === 'image_url')
    expect(imagePart).toBeDefined()
    expect(imagePart.image_url.url).toContain('data:image/jpeg;base64')
  })

  it('falls back to text completion if vision request fails', async () => {
    const briefEmail = {
      id: 102,
      subject: '报告通知',
      from: 'admin@lab.edu',
      date: '2026-09-22',
      body_text: '详见海报。',
      poster_url: 'data:image/jpeg;base64,ZmFrZWltYWdlZGF0YQ=='
    }

    let callCount = 0
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        // 多模态图像请求报错 (如第三方端点不支持图片)
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Image input not supported' } })
        }
      }
      // 降级为纯文本请求成功
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: '学术报告',
                  date: '2026-09-25',
                  time: '10:00',
                  speaker: '报告人',
                  location: '实验楼会议室',
                  notes: '详见海报。'
                })
              }
            }
          ]
        })
      }
    })

    const extracted = await extractScheduleFromEmailWithAi(briefEmail, {
      config: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: 'sk-test'
      },
      posterImageUrl: 'data:image/jpeg;base64,ZmFrZWltYWdlZGF0YQ=='
    })

    expect(extracted.usedVision).toBe(false)
    expect(extracted.title).toBe('学术报告')
    expect(callCount).toBe(2) // 首次多模态失败，第二次降级纯文本重试成功
  })

  it('preserves and auto-infers supportsVision in normalizeModelItem', () => {
    // 字符串形式自动推导
    expect(normalizeModelItem('deepseek-flash').supportsVision).toBe(true)
    expect(normalizeModelItem('deepseek-v4.1').supportsVision).toBe(true)
    expect(normalizeModelItem('gpt-4o').supportsVision).toBe(true)
    expect(normalizeModelItem('qwen2.5-vl').supportsVision).toBe(true)
    expect(normalizeModelItem('deepseek-chat').supportsVision).toBe(false)

    // 对象形式显式保留
    const itemWithVision = normalizeModelItem({
      id: 'custom-vlm',
      name: 'Custom Vision Model',
      supportsVision: true
    })
    expect(itemWithVision.supportsVision).toBe(true)

    const itemWithoutVision = normalizeModelItem({
      id: 'custom-text',
      name: 'Custom Text Model',
      supportsVision: false
    })
    expect(itemWithoutVision.supportsVision).toBe(false)
  })

  it('attaches Authorization header in convertImageUrlToDataUrl for API files', async () => {
    store['labhub_token'] = 'valid-jwt-token-xyz'

    let capturedHeaders = null
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedHeaders = options?.headers || {}
      return {
        ok: true,
        blob: async () => ({
          type: 'image/jpeg',
          arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer
        })
      }
    })

    const dataUrl = await convertImageUrlToDataUrl('/api/files/test-file-123')
    expect(dataUrl).toContain('data:image/jpeg;base64,')
    expect(capturedHeaders['Authorization']).toBe('Bearer valid-jwt-token-xyz')
  })

  it('extractConferenceFromEmailWithAi parses conference metadata via AI successfully', async () => {
    const mockEmail = {
      subject: '关于召开2026年现代天文学术年会会议的通知',
      from: '中国天文学会 <astronomy@example.org>',
      date: '2026-09-18',
      body_text: '定于2026年10月16日-19日在河南省开封市举行天文学术年会。'
    }

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: '2026年现代天文学术年会会议',
                sub_type: '年会',
                date: '2026-10-16',
                end_date: '2026-10-19',
                city: '开封',
                location: '开封大河希尔顿逸林酒店',
                organizer: '中国天文学会学术交流委员会',
                abstract_deadline: '2026-09-01',
                early_bird_deadline: '2026-09-15',
                registration_deadline: '2026-09-30',
                website_url: 'https://astro2026.example.org',
                registration_url: 'https://astro2026.example.org/reg',
                notes: '现代天文年度前沿研讨。'
              })
            }
          }
        ]
      })
    }))

    const res = await extractConferenceFromEmailWithAi(mockEmail, {
      config: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'deepseek-chat',
        apiKey: 'sk-test'
      }
    })

    expect(res.title).toBe('2026年现代天文学术年会会议')
    expect(res.sub_type).toBe('年会')
    expect(res.date).toBe('2026-10-16')
    expect(res.end_date).toBe('2026-10-19')
    expect(res.city).toBe('开封')
    expect(res.location).toBe('开封大河希尔顿逸林酒店')
    expect(res.organizer).toBe('中国天文学会学术交流委员会')
    expect(res.abstract_deadline).toBe('2026-09-01')
    expect(res.early_bird_deadline).toBe('2026-09-15')
    expect(res.registration_deadline).toBe('2026-09-30')
    expect(res.website_url).toBe('https://astro2026.example.org')
    expect(res.registration_url).toBe('https://astro2026.example.org/reg')
  })

  it('extractNoticesFromEmailsWithAi identifies academic affairs and facility notices while excluding talks', async () => {
    saveAiConfig({
      baseUrl: 'https://api.openai.com/v1',
      model: 'deepseek-flash',
      apiKey: 'sk-test'
    })

    const mockEmails = [
      {
        msg_uid: 'uid-101',
        subject: '【后勤通知】东区综合楼9月22日电梯年度维保暂停运行通知',
        sender_name: '后勤管理处',
        date_str: '2026-09-18 09:00:00',
        snippet: '各位师生：定于9月22日8:30至17:30对东区综合楼客梯进行年度维保检验，届时暂停运行。',
      },
      {
        msg_uid: 'uid-102',
        subject: '学术报告：宇宙早期原初黑洞形成与探测',
        sender_name: '学术交流办',
        date_str: '2026-09-18 10:00:00',
        snippet: '主讲人：张教授。时间：9月20日14:00。地点：天文大楼302。',
      }
    ]

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                notices: [
                  {
                    source_uid: 'uid-101',
                    source_subject: '【后勤通知】东区综合楼9月22日电梯年度维保暂停运行通知',
                    source_sender: '后勤管理处',
                    title: '东区综合楼9月22日电梯维保暂停运行',
                    content: '定于9月22日8:30至17:30对东区综合楼客梯进行年度维保检验，届时电梯暂停运行，请提前安排出行。',
                    category: 'facility',
                    importance: 'important',
                    start_date: '2026-09-18',
                    end_date: '2026-09-22'
                  }
                ]
              })
            }
          }
        ]
      })
    }))

    const results = await extractNoticesFromEmailsWithAi(mockEmails)
    expect(results).toHaveLength(1)
    expect(results[0].source_uid).toBe('uid-101')
    expect(results[0].title).toBe('东区综合楼9月22日电梯维保暂停运行')
    expect(results[0].category).toBe('facility')
    expect(results[0].importance).toBe('important')
    expect(results[0].end_date).toBe('2026-09-22')
  })

  it('normalizeNoticeDates corrects past-year hallucinations and formats dates', () => {
    // 1. AI 幻觉返回过往年份 (2025 -> 2026)
    const res1 = normalizeNoticeDates('2026-09-13', '2025-09-23', '2026-09-19')
    expect(res1.start_date).toBe('2026-09-13')
    expect(res1.end_date).toBe('2026-09-23')

    // 2. 月日简写自动补全
    const res2 = normalizeNoticeDates('2026-09-13', '9月23日', '2026-09-19')
    expect(res2.end_date).toBe('2026-09-23')

    // 3. 跨年通知 (12月发布，1月截止)
    const res3 = normalizeNoticeDates('2026-12-25', '2026-01-10', '2026-12-25')
    expect(res3.start_date).toBe('2026-12-25')
    expect(res3.end_date).toBe('2027-01-10')

    // 4. 无截止时间保持空串
    const res4 = normalizeNoticeDates('2026-09-16', '', '2026-09-19')
    expect(res4.start_date).toBe('2026-09-16')
    expect(res4.end_date).toBe('')
  })

  it('extractNoticesFromEmailsWithAi auto-corrects hallucinated 2025 deadline and associates attachments', async () => {
    saveAiConfig({
      baseUrl: 'https://api.openai.com/v1',
      model: 'deepseek-flash',
      apiKey: 'sk-test'
    })

    const mockEmails = [
      {
        msg_uid: 'uid-scholarship',
        subject: '关于开展2026年度国家奖学金评选的通知',
        sender_name: '研究生院',
        date_str: '2026-09-13 14:00:00',
        snippet: '请于9月23日前提交相关申请材料。',
        attachments: JSON.stringify([
          { id: 'att-1', filename: '申请表.docx', url: 'https://lab.edu/files/form.docx', size: 24000 }
        ]),
        poster_url: 'https://lab.edu/images/notice.jpg'
      }
    ]

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                notices: [
                  {
                    source_uid: 'uid-scholarship',
                    source_subject: '关于开展2026年度国家奖学金评选的通知',
                    source_sender: '研究生院',
                    title: '2026年度研究生国家奖学金评选申请通知',
                    content: '请各位研究生于9月23日前提交国家奖学金申请表。',
                    category: 'academic_affairs',
                    importance: 'important',
                    start_date: '2026-09-13',
                    // 模拟大模型因训练截止时间输出 2025 年
                    end_date: '2025-09-23'
                  }
                ]
              })
            }
          }
        ]
      })
    }))

    const results = await extractNoticesFromEmailsWithAi(mockEmails)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('2026年度研究生国家奖学金评选申请通知')
    // 关键断言：2025 自动纠偏为 2026
    expect(results[0].end_date).toBe('2026-09-23')
    // 关键断言：源邮件附件与图片被正确保留
    expect(results[0].attachments).toContain('申请表.docx')
    expect(results[0].attachments).toContain('notice.jpg')
  })
})

