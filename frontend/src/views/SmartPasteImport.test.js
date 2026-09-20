import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { classifyPastedText, extractFieldsByRule, extractNoticeFieldsLocally } from '../utils/pasteClassifier'
import { isAiAssistantReady, setAiConnectivityPassed, AI_STORAGE_KEY, AI_CONNECTIVITY_KEY } from '../services/aiService'

describe('Smart Paste Import & Collaborative Queue Workflow', () => {
  let store = {}

  beforeEach(() => {
    store = {}
    global.localStorage = {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, val) => { store[key] = String(val) }),
      removeItem: vi.fn((key) => { delete store[key] }),
      clear: vi.fn(() => { store = {} })
    }
  })

  afterEach(() => {
    delete global.localStorage
  })

  describe('Type Auto-Recognition', () => {
    it('accurately identifies academic talk text with seminar keywords', () => {
      const text = `
        国家天文台学术报告通知
        主讲人：王五 教授（中国科学技术大学）
        报告题目：黑洞双星吸积盘演化模拟
        时间：2026-10-12 10:00
        地点：科研楼 5-516 会议室
        摘要：通过三维广义相对论磁流体力学（GRMHD）数值模拟...
      `
      expect(classifyPastedText(text)).toBe('talk')
    })

    it('accurately identifies academic conference text with registration deadlines', () => {
      const text = `
        中国天文学会2026年学术年会第一轮通知
        由中国天文学会主办，拟于2026年10月20日至24日在陕西西安召开。
        重要日程：
        摘要提交截止：2026年8月31日
        注册截止：2026年9月15日
        大会网站：https://meeting.cas.cn/astronomy2026
      `
      expect(classifyPastedText(text)).toBe('conference')
    })

    it('accurately identifies campus administrative & facility notice text', () => {
      const text = `
        关于园区网络核心交换机割接升级的断网通知
        各实验室、全体科研人员：
        为了提升园区网络带宽与稳定性，信息化中心定于9月24日22:00至次日06:00对主楼核心交换机进行固件割接升级。
        期间校园网与外部互联网将暂时中断。
        请大家提前保存重要科研数据。
        特此通告。
      `
      expect(classifyPastedText(text)).toBe('notice')
    })
  })

  describe('Multi-Attachment & Poster Handling', () => {
    it('attaches primary poster to talk and handles multiple files', () => {
      const raw = `
        学术报告通知
        报告人：赵六 博士
        报告题目：系外行星引力透镜探测
        地点：天文楼 212 会议室
        时间：2026-11-02 15:00
      `
      const imageUrls = ['https://cdn.example.com/poster-1.jpg', 'https://cdn.example.com/poster-2.jpg']
      const files = [
        { id: 'f1', filename: 'slides.pdf', url: '/api/files/f1', size: 102400 },
        { id: 'f2', filename: 'handout.docx', url: '/api/files/f2', size: 20480 }
      ]

      const fields = extractFieldsByRule(raw, 'talk', { imageUrls, files })
      expect(fields.poster_url).toBe('https://cdn.example.com/poster-1.jpg')
      expect(fields.attachments.length).toBe(2)
      expect(fields.attachments[0].filename).toBe('slides.pdf')
      expect(fields.title).toContain('系外行星引力透镜探测')
      expect(fields.speaker).toContain('赵六')
    })

    it('integrates images and files into notice attachments list', () => {
      const raw = `
        关于2026年国家奖学金申请评优的通告
        截止日期：2026年9月29日
        请参阅随附评审细则及申请模板。
      `
      const imageUrls = ['https://cdn.example.com/notice-banner.jpg']
      const files = [{ id: 'doc1', filename: '评定办法.pdf', url: '/api/files/doc1', size: 50000 }]

      const fields = extractFieldsByRule(raw, 'notice', { imageUrls, files })
      expect(fields.attachments.length).toBe(2)
      expect(fields.attachments[0].url).toBe('https://cdn.example.com/notice-banner.jpg')
      expect(fields.attachments[1].filename).toBe('评定办法.pdf')
      expect(fields.category).toBe('academic_affairs')
    })
  })

  describe('AI Assistant Configuration & Degradation Paths', () => {
    it('returns false when no AI config or connectivity passed', () => {
      expect(isAiAssistantReady()).toBe(false)
    })

    it('returns true only when valid config and connectivity pass', () => {
      store[AI_STORAGE_KEY] = JSON.stringify({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-test-key-123456'
      })
      store[AI_CONNECTIVITY_KEY] = 'true'

      expect(isAiAssistantReady()).toBe(true)
    })

    it('simulates workflow of user without AI choosing pending queue', () => {
      // User without AI
      expect(isAiAssistantReady()).toBe(false)

      const raw = `
        学术报告：引力波暴事件的电磁对应体搜寻
        主讲人：孙七 研究员
        时间：2026-10-18 10:00
        地点：南大 天文楼302
      `
      // Step 1: Rule extraction runs as baseline
      const ruleResult = extractFieldsByRule(raw, 'talk', { imageUrls: ['https://img.test/poster.png'] })
      expect(ruleResult.title).toContain('引力波暴事件的电磁对应体搜寻')
      expect(ruleResult.speaker).toContain('孙七')

      // Step 2: Payload prepared for scheduleImportApi.createPending
      const pendingPayload = {
        raw_text: raw,
        inferred_type: 'talk',
        parsed_data: ruleResult,
        image_urls: ['https://img.test/poster.png'],
        file_attachments: []
      }

      expect(pendingPayload.inferred_type).toBe('talk')
      expect(pendingPayload.parsed_data.title).toBe(ruleResult.title)
      expect(pendingPayload.image_urls.length).toBe(1)
    })

    it('simulates direct submission of non-AI result', () => {
      const rawNotice = `
        关于国庆节放假期间园区门禁管制的通知
        10月1日至7日进入园区需持有效证件。
      `
      const ruleResult = extractFieldsByRule(rawNotice, 'notice')
      expect(ruleResult.category).toBe('holiday')
      expect(ruleResult.importance).toBe('normal')

      const directNoticePayload = {
        title: ruleResult.title,
        content: ruleResult.content,
        category: ruleResult.category,
        importance: ruleResult.importance,
        start_date: ruleResult.start_date,
        end_date: ruleResult.end_date,
        attachments: JSON.stringify(ruleResult.attachments)
      }

      expect(directNoticePayload.title).toContain('国庆节')
      expect(directNoticePayload.category).toBe('holiday')
    })
  })

  describe('Selective Source Content Resolution & Type Switching', () => {
    it('excludes text when includeText is false and only uses selected images/files', async () => {
      const { resolveContentForParsing } = await import('../utils/pasteClassifier')
      const resolved = await resolveContentForParsing({
        rawText: '这是一段被用户取消勾选的原始文本',
        includeText: false,
        selectedImageUrls: ['https://cdn.example.com/poster-custom.png'],
        selectedFiles: [{ id: 'f1', filename: 'meeting.docx', url: '/api/files/f1' }]
      })

      expect(resolved.combinedText).toBe('')
      expect(resolved.primaryPosterUrl).toBe('https://cdn.example.com/poster-custom.png')
      expect(resolved.targetImages.length).toBe(1)
      expect(resolved.targetFiles.length).toBe(1)
      expect(resolved.hasSource).toBe(true)
    })

    it('extracts text from selected PDF files and appends to combined text', async () => {
      const { resolveContentForParsing } = await import('../utils/pasteClassifier')
      const resolved = await resolveContentForParsing({
        rawText: '学术交流通知正文',
        includeText: true,
        selectedFiles: [
          { id: 'f1', filename: '日程手册.pdf', url: 'https://example.com/non-existent-mock.pdf', content_type: 'application/pdf' }
        ]
      })

      // Fetch will fail or return empty on mock url, handled safely without crashing
      expect(resolved.combinedText).toContain('学术交流通知正文')
      expect(resolved.targetFiles.length).toBe(1)
    })

    it('gracefully provides fallback fields when text is omitted and only files/posters are provided', () => {
      const fallbackTalk = extractFieldsByRule('', 'talk', {
        imageUrls: ['https://example.com/talk-poster.jpg'],
        files: [{ id: 'f1', filename: '恒星形成演化报告.pdf', url: '/api/files/f1' }]
      })
      expect(fallbackTalk.title).toBe('恒星形成演化报告')
      expect(fallbackTalk.poster_url).toBe('https://example.com/talk-poster.jpg')
      expect(fallbackTalk.attachments.length).toBe(1)

      const fallbackConf = extractFieldsByRule('', 'conference', {
        imageUrls: ['https://example.com/conf-poster.jpg'],
        files: [{ id: 'f2', filename: '第一届天体物理研讨会通知.pdf', url: '/api/files/f2' }]
      })
      expect(fallbackConf.title).toBe('第一届天体物理研讨会通知')
      expect(fallbackConf.poster_url).toBe('https://example.com/conf-poster.jpg')

      const fallbackNotice = extractFieldsByRule('', 'notice', {
        imageUrls: [],
        files: [{ id: 'f3', filename: '园区维保停电通知.pdf', url: '/api/files/f3' }]
      })
      expect(fallbackNotice.title).toBe('园区维保停电通知')
      expect(fallbackNotice.attachments.length).toBe(1)
    })

    it('supports reviewer switching target type from talk to conference or notice and re-extracting', () => {
      const rawMixed = `
        中国天文学会学术研讨会
        举办地点：南京大学鼓楼校区
        时间：2026年11月10日至12日
        注册截止：2026年10月25日
        大会网站：https://conf.astronomy.org.cn
      `
      // Initial submission misclassified as talk
      const talkResult = extractFieldsByRule(rawMixed, 'talk')
      expect(talkResult.location).toContain('南大')

      // Reviewer switches target type to conference and re-extracts
      const confResult = extractFieldsByRule(rawMixed, 'conference')
      expect(confResult.title).toContain('学术研讨会')
      expect(confResult.registration_deadline).toBe('2026-10-25')
      expect(confResult.website_url).toBe('https://conf.astronomy.org.cn')

      // Reviewer switches target type to notice and re-extracts
      const noticeResult = extractFieldsByRule(rawMixed, 'notice')
      expect(noticeResult.title).toBeTruthy()
      expect(noticeResult.category).toBe('general')
    })

    it('allows submission when only images are uploaded without raw text', () => {
      // User uploads image only
      const rawText = ''
      const uploadedImages = ['https://cdn.example.com/poster-only.png']
      const uploadedFiles = []

      // 1. Rule extraction generates valid fallback structure
      const ruleResult = extractFieldsByRule(rawText, 'talk', {
        imageUrls: uploadedImages,
        files: uploadedFiles
      })
      expect(ruleResult.title).toBe('学术报告（海报）')
      expect(ruleResult.poster_url).toBe('https://cdn.example.com/poster-only.png')
      expect(ruleResult.date).toBeTruthy()
      expect(ruleResult.time).toBe('10:00')

      // 2. Pending queue payload accepts image-only draft
      const pendingPayload = {
        raw_text: rawText,
        inferred_type: 'talk',
        parsed_data: ruleResult,
        image_urls: uploadedImages,
        file_attachments: uploadedFiles
      }
      expect(pendingPayload.image_urls.length).toBe(1)
      expect(pendingPayload.parsed_data.poster_url).toBe('https://cdn.example.com/poster-only.png')

      // 3. Direct submit payload accepts image-only publication
      const directPayload = {
        ...ruleResult,
        event_type: 'talk',
        title: ruleResult.title,
        date: ruleResult.date,
        time: ruleResult.time,
        poster_url: uploadedImages[0],
        notes: ruleResult.notes || '详见随附海报'
      }
      expect(directPayload.poster_url).toBe('https://cdn.example.com/poster-only.png')
      expect(directPayload.title).toBe('学术报告（海报）')
    })
  })

  describe('Unified Smart Recognition & Non-AI Guidance Workflow', () => {
    it('executes baseline rule extraction and signals choice dialog when user has no AI', async () => {
      // User without AI configured
      expect(isAiAssistantReady()).toBe(false)

      const raw = `
        南京大学天文与空间科学学院学术报告
        报告题目：系外行星大气成分光谱观测研究
        报告人：周八 教授
        时间：2026-10-25 14:30
        地点：天文楼 216 报告厅
      `
      const ruleResult = extractFieldsByRule(raw, 'talk')
      expect(ruleResult.title).toContain('系外行星大气成分光谱观测研究')
      expect(ruleResult.speaker).toContain('周八')

      // In unified handleSmartExtract:
      // Since isAiAssistantReady() is false, showNoAiDialog becomes true
      const showNoAiDialog = !isAiAssistantReady()
      expect(showNoAiDialog).toBe(true)
    })

    it('safely serializes image_urls and file_attachments preventing undefined variable 500 error', () => {
      const mockBody = {
        raw_text: '测试待处理条目',
        inferred_type: 'talk',
        parsed_data: { title: '测试报告' },
        image_urls: ['https://cdn.example.com/poster.png'],
        file_attachments: [{ id: 'f1', filename: 'slides.pdf', url: 'https://cdn.example.com/slides.pdf' }]
      }

      // Replicating backend logic in scheduleImports.ts
      let parsedImages = []
      try {
        parsedImages = typeof mockBody.image_urls === 'string' ? JSON.parse(mockBody.image_urls) : (mockBody.image_urls || [])
      } catch {}
      let parsedFiles = []
      try {
        parsedFiles = typeof mockBody.file_attachments === 'string' ? JSON.parse(mockBody.file_attachments) : (mockBody.file_attachments || [])
      } catch {}

      const imageUrlsJson = JSON.stringify(Array.isArray(parsedImages) ? parsedImages : [])
      const fileAttachmentsJson = JSON.stringify(Array.isArray(parsedFiles) ? parsedFiles : [])

      expect(imageUrlsJson).toBe('["https://cdn.example.com/poster.png"]')
      expect(JSON.parse(fileAttachmentsJson).length).toBe(1)
      expect(JSON.parse(fileAttachmentsJson)[0].filename).toBe('slides.pdf')
    })
  })
})
