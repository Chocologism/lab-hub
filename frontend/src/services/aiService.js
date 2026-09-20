/**
 * AI 大模型前端直连服务 (纯客户端 Direct Fetch 模式)
 * 支持 OpenAI 规范兼容接口（DeepSeek, SiliconFlow, OpenAI, Moonshot, Ollama 等）
 */

import { pickChinesePartIfDual, applyInstitutionLocationPrefix } from '../utils/talkEmail'
import { shanghaiToday } from '../utils/schedule'

export const AI_STORAGE_KEY = 'labhub_ai_config'
export const AI_CHAT_HISTORY_KEY = 'labhub_ai_chat_history'
export const AI_SESSIONS_STORAGE_KEY = 'labhub_ai_chat_sessions'
export const AI_ACTIVE_SESSION_ID_KEY = 'labhub_ai_active_session_id'
export const AI_CONNECTIVITY_KEY = 'labhub_ai_connectivity_passed'
export const PAPER_TRANSLATIONS_STORAGE_KEY = 'labhub_paper_translations'

/**
 * 获取连通性测试是否已通过
 */
export function isAiConnectivityPassed() {
  try {
    return localStorage.getItem(AI_CONNECTIVITY_KEY) === 'true'
  } catch (e) {
    return false
  }
}

function dispatchAiConfigChanged() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      const event = typeof CustomEvent === 'function'
        ? new CustomEvent('labhub-ai-config-changed')
        : { type: 'labhub-ai-config-changed' }
      window.dispatchEvent(event)
    } catch (_) {}
  }
}

/**
 * 设置连通性测试通过状态
 */
export function setAiConnectivityPassed(passed = true) {
  try {
    if (passed) {
      localStorage.setItem(AI_CONNECTIVITY_KEY, 'true')
    } else {
      localStorage.removeItem(AI_CONNECTIVITY_KEY)
    }
    dispatchAiConfigChanged()
  } catch (e) {}
}

/**
 * 检查 AI 助手是否已完整配置且连通性测试通过
 * 规则：
 * 1. 本地必须已保存有用户明确配置的 AI 参数（非纯默认占位对象）
 * 2. Base URL 必须有效填写
 * 3. 需 API Key 的服务商必须填写有效的非空 API Key
 * 4. 必须通过连通性测试 (isAiConnectivityPassed() === true)
 */
export function isAiAssistantReady() {
  try {
    const raw = localStorage.getItem(AI_STORAGE_KEY)
    if (!raw) return false
    const config = loadAiConfig()
    if (!config || !config.baseUrl || !config.baseUrl.trim()) return false
    if (config.provider !== 'ollama' && (!config.apiKey || !config.apiKey.trim())) {
      return false
    }
    return isAiConnectivityPassed()
  } catch (e) {
    return false
  }
}

export const PRESET_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek (官方)',
    baseUrl: 'https://api.deepseek.com/v1',
    noApiKey: false,
    defaultModel: 'deepseek-chat',
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek-V3 (通用对话)',
        contextWindow: 64000,
        supportsReasoningEffort: false,
        reasoningEffort: 'off'
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek-R1 (深度推理)',
        contextWindow: 64000,
        supportsReasoningEffort: true,
        reasoningEffort: 'high'
      }
    ],
    hint: '性价比极高，中文学术理解与推理能力顶尖，官方原生支持浏览器跨域直连。'
  },
  {
    id: 'siliconflow',
    name: '硅基流动 (SiliconFlow)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    noApiKey: false,
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      {
        id: 'deepseek-ai/DeepSeek-V3',
        name: 'DeepSeek-V3 (硅基流动)',
        contextWindow: 64000,
        supportsReasoningEffort: false,
        reasoningEffort: 'off'
      },
      {
        id: 'deepseek-ai/DeepSeek-R1',
        name: 'DeepSeek-R1 (硅基流动)',
        contextWindow: 64000,
        supportsReasoningEffort: true,
        reasoningEffort: 'high'
      },
      {
        id: 'Qwen/Qwen2.5-72B-Instruct',
        name: '通义千问 Qwen2.5-72B',
        contextWindow: 32000,
        supportsReasoningEffort: false,
        reasoningEffort: 'off'
      },
      {
        id: 'Qwen/Qwen2.5-VL-72B-Instruct',
        name: '通义千问 Qwen2.5-VL-72B (多模态视觉)',
        contextWindow: 128000,
        supportsReasoningEffort: false,
        supportsVision: true,
        reasoningEffort: 'off'
      }
    ],
    hint: '国内高并发云原生平台，全面聚合主流开源模型，支持稳定直连。'
  },
  {
    id: 'openai',
    name: 'OpenAI (官方)',
    baseUrl: 'https://api.openai.com/v1',
    noApiKey: false,
    defaultModel: 'gpt-4o-mini',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o (全能旗舰)',
        contextWindow: 128000,
        supportsReasoningEffort: false,
        supportsVision: true,
        reasoningEffort: 'off'
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini (轻量极速)',
        contextWindow: 128000,
        supportsReasoningEffort: false,
        supportsVision: true,
        reasoningEffort: 'off'
      }
    ],
    hint: '国际主流通用大模型。注：在部分浏览器中直接请求官方域名可能受跨域策略或网络环境限制。'
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Moonshot / Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    noApiKey: false,
    defaultModel: 'moonshot-v1-8k',
    models: [
      {
        id: 'moonshot-v1-8k',
        name: 'Kimi v1 (8k 上下文)',
        contextWindow: 8000,
        supportsReasoningEffort: false,
        reasoningEffort: 'off'
      },
      {
        id: 'moonshot-v1-32k',
        name: 'Kimi v1 (32k 长文本)',
        contextWindow: 32000,
        supportsReasoningEffort: false,
        reasoningEffort: 'off'
      }
    ],
    hint: '擅长超长上下文阅读与学术文献分析。'
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    noApiKey: false,
    defaultModel: 'glm-4-flash',
    models: [
      {
        id: 'glm-4-flash',
        name: 'GLM-4-Flash (免费极速)',
        contextWindow: 128000,
        supportsReasoningEffort: false,
        reasoningEffort: 'off'
      },
      {
        id: 'glm-4',
        name: 'GLM-4 (清华智谱旗舰)',
        contextWindow: 128000,
        supportsReasoningEffort: false,
        reasoningEffort: 'off'
      },
      {
        id: 'glm-4v-plus',
        name: 'GLM-4V-Plus (智谱多模态旗舰)',
        contextWindow: 128000,
        supportsReasoningEffort: false,
        supportsVision: true,
        reasoningEffort: 'off'
      }
    ],
    hint: '清华系智谱开放平台，中文理解和代码能力出色。'
  },
  {
    id: 'ollama',
    name: 'Ollama (本地私有)',
    baseUrl: 'http://localhost:11434/v1',
    noApiKey: true,
    defaultModel: 'deepseek-r1:8b',
    models: [
      {
        id: 'deepseek-r1:8b',
        name: 'DeepSeek-R1 (8B 本地)',
        contextWindow: 32000,
        supportsReasoningEffort: true,
        reasoningEffort: 'high'
      },
      {
        id: 'qwen2.5:7b',
        name: 'Qwen 2.5 (7B 本地)',
        contextWindow: 32000,
        supportsReasoningEffort: false,
        reasoningEffort: 'off'
      },
      {
        id: 'llava:7b',
        name: 'LLaVA (7B 本地多模态视觉)',
        contextWindow: 32000,
        supportsReasoningEffort: false,
        supportsVision: true,
        reasoningEffort: 'off'
      }
    ],
    hint: '在本地或局域网工作站运行，完全免费且数据百分之百私密。无需 API Key。'
  },
  {
    id: 'custom',
    name: '自定义 (Custom)',
    baseUrl: '',
    noApiKey: false,
    defaultModel: '',
    models: [],
    hint: '支持任何符合 OpenAI Chat Completions 规范的 API 接口及反向代理端点。'
  }
]

export function normalizeModelItem(item) {
  if (typeof item === 'string') {
    const isReasoning = item.includes('reason') || item.includes('flash') || item.includes('r1') || item.includes('o1')
    const isVision = /(?:deepseek.*(?:-vl|_vl|\bvl\b|flash|v4)|gpt-4o|gpt-4-turbo|gpt-4-vision|vision|\bvl\b|qwen.*vl|glm-4v|internvl|minicpm-v|llava|claude-3|gemini|pixtral|qvq)/i.test(item)
    const isDeepSeekOfficialText = /^(?:deepseek-chat|deepseek-reasoner)$/i.test(item)
    return {
      id: item,
      name: item,
      contextWindow: 1000000,
      supportsReasoningEffort: isReasoning,
      supportsVision: isDeepSeekOfficialText ? false : isVision,
      reasoningEffort: 'off'
    }
  }
  const modelId = item.id || ''
  const modelName = item.name || modelId || ''
  const autoVision = /(?:deepseek.*(?:-vl|_vl|\bvl\b|flash|v4)|gpt-4o|gpt-4-turbo|gpt-4-vision|vision|\bvl\b|qwen.*vl|glm-4v|internvl|minicpm-v|llava|claude-3|gemini|pixtral|qvq)/i.test(`${modelId} ${modelName}`)
  const isDeepSeekOfficialText = /^(?:deepseek-chat|deepseek-reasoner)$/i.test(modelId)
  const isVLabDeepSeek = /(?:deepseek.*(?:-vl|_vl|\bvl\b|flash|v4))/i.test(modelId)
  const supportsVision = isDeepSeekOfficialText
    ? false
    : isVLabDeepSeek
      ? true
      : (item.supportsVision !== undefined ? Boolean(item.supportsVision) : autoVision)
  return {
    id: modelId,
    name: modelName,
    contextWindow: Number(item.contextWindow) || 1000000,
    supportsReasoningEffort: Boolean(item.supportsReasoningEffort),
    supportsVision,
    reasoningEffort: item.reasoningEffort || 'off'
  }
}

/**
 * 规范化并清洗 reasoning_effort 推理深度参数
 * 仅在具有有效推理档位（low, medium, high, max, minimal, xhigh）时返回对应字符串，
 * 若为 off, none 或未启用则返回 null（避免向 API 发送无效的 'off' 字段引发反序列化异常）
 */
export function sanitizeReasoningEffort(effort) {
  if (!effort) return null
  const normalized = String(effort).trim().toLowerCase()
  if (normalized === 'off' || normalized === 'none') {
    return null
  }
  const validLevels = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
  if (validLevels.includes(normalized)) {
    return normalized
  }
  return null
}

export const DEFAULT_AI_CONFIG = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  models: [
    {
      id: 'deepseek-chat',
      name: 'DeepSeek-V3 (通用对话)',
      contextWindow: 64000,
      supportsReasoningEffort: false,
      reasoningEffort: 'off'
    },
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek-R1 (深度推理)',
      contextWindow: 64000,
      supportsReasoningEffort: true,
      reasoningEffort: 'high'
    }
  ],
  temperature: 0.7,
  systemPrompt: '你是课题组科研智能助理。你精通学术文献研读、前沿方法分析与科学计算。请以专业、严谨、详尽的学术风格解答问题，在需要时运用标准的 LaTeX 数学公式和规范的代码示例。'
}

/**
 * 从本地存储加载 AI 配置
 */
export function loadAiConfig() {
  try {
    const raw = localStorage.getItem(AI_STORAGE_KEY)
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG))
    const parsed = JSON.parse(raw)
    const merged = { ...DEFAULT_AI_CONFIG, ...parsed }
    // 兼容历史旧配置格式
    if (!Array.isArray(merged.models) || merged.models.length === 0) {
      const foundProv = PRESET_PROVIDERS.find(p => p.id === merged.provider)
      if (foundProv && foundProv.models?.length) {
        merged.models = JSON.parse(JSON.stringify(foundProv.models))
      } else if (merged.model) {
        merged.models = [normalizeModelItem(merged.model)]
      } else {
        merged.models = JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG.models))
      }
    } else {
      merged.models = merged.models.map(normalizeModelItem)
    }

    if (!merged.model && merged.models.length > 0) {
      merged.model = merged.models[0].id
    }
    return merged
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG))
  }
}

/**
 * 保存 AI 配置到本地存储
 */
export function saveAiConfig(config) {
  try {
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(config))
    dispatchAiConfigChanged()
    return true
  } catch (e) {
    console.error('保存 AI 配置失败:', e)
    return false
  }
}

/**
 * 规范化 Base URL
 */
export function normalizeEndpoint(baseUrl) {
  const clean = (baseUrl || '').trim().replace(/\/+$/, '')
  if (clean.endsWith('/chat/completions')) {
    return clean
  }
  return `${clean}/chat/completions`
}

/**
 * 测试大模型 API 连通性
 */
export async function testAiConnection(config) {
  if (!config.baseUrl) {
    setAiConnectivityPassed(false)
    return { ok: false, message: '请填写接口 Base URL 地址。' }
  }
  if (config.provider !== 'ollama' && !config.apiKey) {
    setAiConnectivityPassed(false)
    return { ok: false, message: '请填写 API Key。' }
  }

  const endpoint = normalizeEndpoint(config.baseUrl)
  const headers = {
    'Content-Type': 'application/json'
  }
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`
  }

  // 监听浏览器是否明确触发了安全策略拦截 (Mixed Content / CSP Violation)
  let mixedContentViolationCaught = false
  const violationHandler = (e) => {
    if (!e) return
    const directive = String(e.effectiveDirective || e.violatedDirective || '')
    const blocked = String(e.blockedURI || '')
    if (directive.includes('connect') || blocked.includes('127.0.0.1') || blocked.includes('localhost') || blocked.startsWith('http:')) {
      mixedContentViolationCaught = true
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('securitypolicyviolation', violationHandler)
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model || 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
        stream: false
      })
    })

    if (response.ok) {
      setAiConnectivityPassed(true)
      return { ok: true, message: '连接成功，模型响应正常。' }
    }

    // 状态码非 200，测试未通过
    setAiConnectivityPassed(false)

    let errMsg = `请求返回状态码 ${response.status}`
    try {
      const errJson = await response.json()
      if (errJson?.error?.message) {
        errMsg = errJson.error.message
      }
    } catch (_) {}

    if (response.status === 401) {
      return { ok: false, message: `认证失败 (401)：API Key 无效或未激活。详细信息: ${errMsg}` }
    }
    if (response.status === 404) {
      return { ok: false, message: `地址错误 (404)：未找到该模型或路径。详细信息: ${errMsg}` }
    }
    if (response.status === 429) {
      return { ok: false, message: `额度或频率受限 (429)：API 额度已用尽或频次过高。详细信息: ${errMsg}` }
    }

    return { ok: false, message: `连接失败 (${response.status}): ${errMsg}` }
  } catch (err) {
    // 异常或网络中断，测试未通过
    setAiConnectivityPassed(false)

    const isCors = err.name === 'TypeError' && /failed to fetch/i.test(err.message)
    const isLocalHttp = Boolean(
      config.baseUrl &&
      (config.baseUrl.includes('127.0.0.1') || config.baseUrl.includes('localhost')) &&
      config.baseUrl.startsWith('http://')
    )

    if (isCors) {
      if (isLocalHttp) {
        // 若确由浏览器安全策略拦截混合内容
        if (mixedContentViolationCaught) {
          return {
            ok: false,
            message: '浏览器安全拦截 (Mixed Content)：当前页面为 HTTPS，浏览器安全策略禁止直接请求本地明文 HTTP 接口 (127.0.0.1)。\n解决方法：在浏览器地址栏左侧点击“网站设置” -> 将“不安全内容”设为“允许”，刷新页面即可。'
          }
        }

        return {
          ok: false,
          message: '无法连接到本地接口服务。请排查：\n1. 确认本地服务已在后台启动并正常监听对应端口；\n2. 若本地服务运行正常仍连接失败，请检查浏览器地址栏网站设置中是否已允许“不安全内容”并刷新网页。'
        }
      }

      return {
        ok: false,
        message: '网络异常或跨域受限 (CORS)：浏览器无法直连该接口，请检查网络代理设置或接口服务商跨域配置。'
      }
    }
    return { ok: false, message: `请求出错: ${err.message || '未知网络错误'}` }
  } finally {
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('securitypolicyviolation', violationHandler)
    }
  }
}

/**
 * 发起流式聊天对话
 * @param {Object} params
 * @param {Object} params.config AI 配置
 * @param {Array} params.messages 历史对话上下文
 * @param {Object} params.activeModel 当前激活的模型对象
 * @param {Function} params.onChunk 普通内容片段回调 (chunkText)
 * @param {Function} params.onReasoningChunk 思考链推理片段回调 (reasoningText)
 * @param {Function} params.onDone 完成回调
 * @param {Function} params.onError 错误回调 (error)
 * @param {AbortSignal} params.signal 中断信号
 */
export async function sendChatMessageStream({
  config,
  messages,
  activeModel,
  paperContext,
  onChunk,
  onReasoningChunk,
  onDone,
  onError,
  signal
}) {
  const endpoint = normalizeEndpoint(config.baseUrl)
  const headers = {
    'Content-Type': 'application/json'
  }
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`
  }

  // 组装带系统提示词的消息队列
  let systemPromptContent = (config.systemPrompt && config.systemPrompt.trim()) ? config.systemPrompt.trim() : ''

  // 若当前会话绑定了研讨论文全文，将全文作为长期基准记忆注入系统上下文中
  if (paperContext && paperContext.fullText) {
    const paperPrompt = [
      '【当前研讨论文全文基准与长期记忆】',
      `论文 arXiv 编号: ${paperContext.arxivId || '未知'}`,
      `论文标题: ${paperContext.title || '未知'}`,
      paperContext.authors ? `论文作者: ${paperContext.authors}` : '',
      '以下为该论文的完整正文内容（包含各章节详述与 LaTeX 数学公式）：',
      '----------------------------------------',
      paperContext.fullText,
      '----------------------------------------',
      '研读与问答指导原则：',
      '1. 你是负责研读该论文的资深天文与天体物理学者。上述全文是本次对话的绝对基准与长期记忆。',
      '2. 用户可向你询问该论文的任何问题（包括背景动机、理论假说、推导过程、观测与数值样本、核心图表分析、讨论与局限性等），请严格基于上述全文事实并结合专业知识解答，不得捏造虚假结论。',
      '3. 若用户请求翻译全文或指定章节/段落，请提供高质量学术中文翻译，严格保留所有 LaTeX 数学公式（$...$ 与 $$...$$）和规范学术术语。'
    ].filter(Boolean).join('\n')

    systemPromptContent = systemPromptContent ? `${systemPromptContent}\n\n${paperPrompt}` : paperPrompt
  }

  const fullMessages = []
  if (systemPromptContent) {
    fullMessages.push({
      role: 'system',
      content: systemPromptContent
    })
  }

  // 追加过滤后的上下文，支持多模态图片数组
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant') {
      if (m.role === 'user' && Array.isArray(m.images) && m.images.length > 0) {
        const parts = []
        if (m.content && m.content.trim()) {
          parts.push({ type: 'text', text: m.content })
        }
        for (const imgUrl of m.images) {
          parts.push({
            type: 'image_url',
            image_url: {
              url: imgUrl
            }
          })
        }
        fullMessages.push({
          role: 'user',
          content: parts
        })
      } else {
        fullMessages.push({
          role: m.role,
          content: m.content
        })
      }
    }
  }

  const modelId = activeModel?.id || config.model || 'deepseek-flash'
  const requestBody = {
    model: modelId,
    messages: fullMessages,
    temperature: typeof config.temperature === 'number' ? config.temperature : 0.7,
    stream: true
  }

  // 注入推理深度参数 (reasoning_effort)
  const validEffort = activeModel?.supportsReasoningEffort
    ? sanitizeReasoningEffort(activeModel?.reasoningEffort)
    : null
  if (validEffort) {
    requestBody.reasoning_effort = validEffort
  }

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal
    })
  } catch (err) {
    if (signal?.aborted) return
    const isCors = err.name === 'TypeError' && /failed to fetch/i.test(err.message)
    let errText = err.message || '网络连接失败'
    if (isCors) {
      const isLocalHttp = Boolean(
        config.baseUrl &&
        (config.baseUrl.includes('127.0.0.1') || config.baseUrl.includes('localhost')) &&
        config.baseUrl.startsWith('http://')
      )
      if (isLocalHttp) {
        errText = '无法连接到本地接口服务。请检查本地后台服务是否已启动并正常监听对应端口。'
      } else {
        errText = '网络连接失败或浏览器跨域受限 (CORS)，请检查 API 端点与网络环境。'
      }
    }
    onError?.(new Error(errText))
    return
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const errJson = await response.json()
      if (errJson?.error?.message) {
        detail = errJson.error.message
      }
    } catch (_) {
      try {
        detail = await response.text()
      } catch (_) {}
    }
    onError?.(new Error(`大模型接口调用失败 (${response.status}): ${detail}`))
    return
  }

  if (!response.body) {
    onError?.(new Error('接口未返回流式响应体。'))
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue

        if (trimmed === 'data: [DONE]') {
          onDone?.()
          return
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim()
          if (!jsonStr) continue

          try {
            const data = JSON.parse(jsonStr)
            const choice = data?.choices?.[0]
            if (choice) {
              const delta = choice.delta
              if (delta) {
                // 捕获思考链内容 (如 DeepSeek-R1, OpenAI o1 等模型)
                const reasoning = delta.reasoning_content || delta.reasoning
                if (reasoning) {
                  onReasoningChunk?.(reasoning)
                }
                // 捕获正文生成内容
                const content = delta.content || delta.text
                if (content) {
                  onChunk?.(content)
                }
              }
            }
          } catch (_) {
            // 忽略非标准 chunk JSON 截断错误，继续接收
          }
        }
      }
    }

    // 处理流结束时缓冲区可能剩余的单行
    if (buffer && buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
        try {
          const data = JSON.parse(trimmed.slice(6).trim())
          const delta = data?.choices?.[0]?.delta
          if (delta) {
            const reasoning = delta.reasoning_content || delta.reasoning
            if (reasoning) onReasoningChunk?.(reasoning)
            const content = delta.content || delta.text
            if (content) onChunk?.(content)
          }
        } catch (_) {}
      }
    }

    setAiConnectivityPassed(true)
    onDone?.()
  } catch (err) {
    if (signal?.aborted) {
      // 主动取消，不视为报错
      onDone?.()
      return
    }
    onError?.(err)
  }
}

/**
 * 创建空白初始会话
 */
export function createDefaultSession(title = '新对话', options = {}) {
  const now = Date.now()
  return {
    id: `session_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    paperContext: options.paperContext || null
  }
}

/**
 * 加载所有会话列表（内置针对旧版单一历史记录的无损兼容迁移）
 */
export function loadAiSessions() {
  try {
    const rawSessions = localStorage.getItem(AI_SESSIONS_STORAGE_KEY)
    if (rawSessions) {
      const parsed = JSON.parse(rawSessions)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }

    // 检查旧版单一聊天记录并执行无损迁移
    const legacyRaw = localStorage.getItem(AI_CHAT_HISTORY_KEY)
    if (legacyRaw) {
      const legacyMsgs = JSON.parse(legacyRaw)
      if (Array.isArray(legacyMsgs) && legacyMsgs.length > 0) {
        const firstUser = legacyMsgs.find(m => m.role === 'user')
        let derivedTitle = '历史对话'
        if (firstUser && firstUser.content) {
          derivedTitle = firstUser.content.trim().slice(0, 20)
        }
        const migratedSession = {
          id: `session_${Date.now()}_legacy`,
          title: derivedTitle,
          createdAt: legacyMsgs[0]?.timestamp || Date.now(),
          updatedAt: legacyMsgs[legacyMsgs.length - 1]?.timestamp || Date.now(),
          messages: legacyMsgs
        }
        const initialList = [migratedSession]
        localStorage.setItem(AI_SESSIONS_STORAGE_KEY, JSON.stringify(initialList))
        return initialList
      }
    }

    // 没有任何记录，生成初始空会话
    const defaultSession = createDefaultSession()
    localStorage.setItem(AI_SESSIONS_STORAGE_KEY, JSON.stringify([defaultSession]))
    return [defaultSession]
  } catch (e) {
    console.error('加载会话失败:', e)
    return [createDefaultSession()]
  }
}

/**
 * 持久化保存所有会话
 */
export function saveAiSessions(sessions) {
  try {
    localStorage.setItem(AI_SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
  } catch (e) {
    console.error('保存会话列表失败:', e)
  }
}

/**
 * 加载当前激活会话 ID
 */
export function loadActiveSessionId() {
  try {
    return localStorage.getItem(AI_ACTIVE_SESSION_ID_KEY) || ''
  } catch (e) {
    return ''
  }
}

/**
 * 保存当前激活会话 ID
 */
export function saveActiveSessionId(id) {
  try {
    if (id) {
      localStorage.setItem(AI_ACTIVE_SESSION_ID_KEY, id)
    } else {
      localStorage.removeItem(AI_ACTIVE_SESSION_ID_KEY)
    }
  } catch (e) {}
}

/**
 * 清空所有会话数据
 */
export function clearAllAiSessions() {
  try {
    localStorage.removeItem(AI_SESSIONS_STORAGE_KEY)
    localStorage.removeItem(AI_ACTIVE_SESSION_ID_KEY)
    localStorage.removeItem(AI_CHAT_HISTORY_KEY)
  } catch (e) {}
}

/**
 * 兼容旧版：加载历史对话记录
 */
export function loadAiChatHistory() {
  const sessions = loadAiSessions()
  return sessions[0]?.messages || []
}

/**
 * 兼容旧版：保存历史对话记录
 */
export function saveAiChatHistory(history) {
  const sessions = loadAiSessions()
  if (sessions.length > 0) {
    sessions[0].messages = history
    sessions[0].updatedAt = Date.now()
    saveAiSessions(sessions)
  }
}

/**
 * 兼容旧版：清空历史对话记录
 */
export function clearAiChatHistory() {
  clearAllAiSessions()
}

/**
 * 加载本地保存的所有文献翻译缓存
 */
export function loadPaperTranslations() {
  try {
    const raw = localStorage.getItem(PAPER_TRANSLATIONS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch (e) {
    return {}
  }
}

/**
 * 持久化保存单篇文献的翻译结果
 */
export function savePaperTranslation(paperKey, translation) {
  try {
    if (!paperKey || !translation) return
    const all = loadPaperTranslations()
    all[paperKey] = {
      ...translation,
      updatedAt: Date.now()
    }
    localStorage.setItem(PAPER_TRANSLATIONS_STORAGE_KEY, JSON.stringify(all))
    return all
  } catch (e) {
    console.error('保存文献翻译缓存失败:', e)
  }
}

/**
 * 健壮地从大模型输出中提取并解析 JSON 对象
 */
export function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') return null
  const trimmed = text.trim()

  // 1. 直接 JSON 解析
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null) return parsed
  } catch (_) {}

  // 2. 匹配 Markdown 代码块 ```json ... ``` 或 ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim())
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch (_) {}
  }

  // 3. 截取最外层大括号 {...}
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch (_) {}
  }

  return null
}

/**
 * 判断当前配置的模型是否具备多模态视觉处理能力
 */
export function isModelVisionCapable(config) {
  const aiConfig = config || loadAiConfig()
  if (!aiConfig || !aiConfig.model) return false
  const modelId = String(aiConfig.model).toLowerCase()

  // 1. DeepSeek 官方 api.deepseek.com 上的 deepseek-chat 和 deepseek-reasoner 确为纯文本
  if (aiConfig.provider === 'deepseek' || /^(?:deepseek-chat|deepseek-reasoner)$/i.test(modelId)) {
    return false
  }

  // 2. USTC VLab 平台或 DeepSeek Flash / V4 / VL 系列支持视觉图片输入
  if (aiConfig.provider === 'ustc_vlab' || /(?:deepseek.*(?:-vl|_vl|\bvl\b|flash|v4))/i.test(modelId)) {
    return true
  }

  // 3. 模型列表中的显式配置
  if (Array.isArray(aiConfig.models)) {
    const found = aiConfig.models.find(m => m.id === aiConfig.model)
    if (found && typeof found.supportsVision === 'boolean') {
      return found.supportsVision
    }
  }

  // 4. 预设模型库中的匹配
  for (const p of PRESET_PROVIDERS) {
    const found = (p.models || []).find(m => m.id === aiConfig.model)
    if (found && typeof found.supportsVision === 'boolean') {
      return found.supportsVision
    }
  }

  // 5. 通用多模态模型名模式识别 (GPT-4o, Claude 3.5 Sonnet, Gemini, Qwen-VL, GLM-4V 等)
  if (/(?:gpt-4o|gpt-4-turbo|gpt-4-vision|vision|\bvl\b|qwen.*vl|glm-4v|internvl|minicpm-v|llava|claude-3|gemini|pixtral|qvq)/i.test(modelId)) {
    return true
  }

  return false
}

/**
 * 判断邮件正文内容是否过少或缺乏具体学术报告内容描述
 */
export function isEmailContentBrief(email) {
  if (!email) return true
  const rawBody = (email.body_text || email.snippet || '').trim()
  if (!rawBody) return true

  // 剥离日常问候语与末尾礼貌落款
  const cleaned = rawBody
    .replace(/(?:各位老师|各位同学|大家好|各位同仁|老师们|同学们|各位同事|Dear\s+all|Hi\s+all)[\s\S]{0,30}?[，,：:\n]/gi, '')
    .replace(/(?:此致|敬礼|祝好|顺祝商祺|Best\s+regards|Regards|Thanks|Thank\s+you)[\s\S]*/gi, '')
    .trim()

  // 若正文去除礼貌语后少于 120 字符，通常仅包含一两句通知甚至纯问候
  if (cleaned.length < 120) {
    return true
  }

  // 若正文提及“见海报”、“见附件”、“海报如下”等且字符数较短 (< 380 字符)
  if (/见(?:海报|附件|图片)|海报如下|详见附图|参见海报|海报请见|详见海报|参阅海报|海报在附件|附图所示|see\s+attached/i.test(cleaned) && cleaned.length < 380) {
    return true
  }

  // 检查正文是否真正具备充实的实质性学术报告内容/摘要段落
  // 真正的学术报告摘要通常是一段深入阐述研究背景、方法和观测/理论结论的连续详尽段落（>= 100 字符）
  // 若正文仅简单罗列报告人、时间、地点、腾讯会议号等元数据而未深入展开报告内容，应允许海报视觉深度补充
  const hasSubstantiveAbstract = /(?:报告摘要|内容简介|学术摘要|报告内容|abstract|introduction|overview)[\s\S]{100,}/i.test(cleaned)
  if (!hasSubstantiveAbstract) {
    return true
  }

  return false
}

/**
 * 将图片 URL 转换为 Base64 Data URL (用于多模态视觉请求，客户端自动 Canvas 缩放与高质量压缩)
 */
export async function convertImageUrlToDataUrl(url, signal, { maxWidth = 1600, maxHeight = 1600, quality = 0.82 } = {}) {
  if (!url || typeof url !== 'string') return null
  if (url.startsWith('data:')) return url
  try {
    const token = (typeof localStorage !== 'undefined')
      ? (localStorage.getItem('labhub_token') || localStorage.getItem('laborbit_token') || '')
      : ''
    const headers = {}
    if (token && (url.startsWith('/') || url.includes('/api/files/'))) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const res = await fetch(url, { headers, signal })
    if (!res.ok) {
      console.warn(`读取海报图片失败 (HTTP ${res.status}):`, url)
      return null
    }
    const blob = await res.blob()

    // 浏览器环境下优先通过 Canvas 压缩为标准尺寸并转为 DataURL
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof Image !== 'undefined') {
      try {
        const compressed = await new Promise((resolve) => {
          const img = new Image()
          const objectUrl = URL.createObjectURL(blob)
          img.onload = () => {
            URL.revokeObjectURL(objectUrl)
            let { width, height } = img
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height)
              width = Math.max(1, Math.round(width * ratio))
              height = Math.max(1, Math.round(height * ratio))
            }
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (!ctx) {
              resolve(null)
              return
            }
            ctx.drawImage(img, 0, 0, width, height)
            resolve(canvas.toDataURL('image/jpeg', quality))
          }
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            resolve(null)
          }
          img.src = objectUrl
        })
        if (compressed) return compressed
      } catch (_) {}
    }

    const mimeType = blob.type || 'image/jpeg'
    if (typeof FileReader !== 'undefined') {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } else {
      const arrayBuffer = await blob.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      return `data:${mimeType};base64,${base64}`
    }
  } catch (err) {
    console.warn('转换为 Base64 失败:', err)
    return null
  }
}

/**
 * 清洗 AI 模型提取的字段文本，滤除指令 Prompt 模板、占位符及无实质内容的提示
 */
export function cleanAiExtractedText(val, fallback = '') {
  if (!val || typeof val !== 'string') return fallback
  const clean = val.trim()
  if (!clean) return fallback
  if (/^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(clean)) return fallback
  if (/请根据随附.*(?:海报|图片|文件)|详细识别并提取/i.test(clean)) return fallback
  if (/未提供海报图片内容|未提供文字描述.*无法提取|正文未提供文字描述|详见随附学术(?:会议|报告)海报/i.test(clean)) return fallback
  return clean
}

/**
 * 发起非流式单次 Completion 请求
 */
export async function callAiCompletion({
  config,
  messages,
  temperature = 0.3,
  maxTokens,
  jsonMode = false,
  signal
} = {}) {
  const aiConfig = config || loadAiConfig()
  if (!aiConfig.baseUrl) {
    throw new Error('未配置大模型 Base URL 地址。')
  }
  if (aiConfig.provider !== 'ollama' && !aiConfig.apiKey) {
    throw new Error('未配置大模型 API Key。')
  }

  const endpoint = normalizeEndpoint(aiConfig.baseUrl)
  const headers = {
    'Content-Type': 'application/json'
  }
  if (aiConfig.apiKey) {
    headers['Authorization'] = `Bearer ${aiConfig.apiKey.trim()}`
  }

  const payload = {
    model: aiConfig.model || 'deepseek-chat',
    messages,
    temperature,
    stream: false
  }
  if (maxTokens) {
    payload.max_tokens = maxTokens
  }
  if (jsonMode) {
    payload.response_format = { type: 'json_object' }
  }

  // 检查当前模型是否支持 reasoningEffort，且仅在非 jsonMode 且档位有效时按需透传
  const currentModelObj = Array.isArray(aiConfig.models)
    ? aiConfig.models.find(m => m.id === aiConfig.model)
    : null
  const validEffort = currentModelObj?.supportsReasoningEffort
    ? sanitizeReasoningEffort(currentModelObj?.reasoningEffort)
    : null
  // 结构化 JSON 生成（如文献翻译、日程抽取）无需深度思考；仅在明确需要非 JSON 对话时注入有效档位
  if (validEffort && !jsonMode) {
    payload.reasoning_effort = validEffort
  }

  let response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal
  })

  // 若部分代理/模型对 response_format 不支持报错，降级重试
  if (!response.ok && jsonMode && payload.response_format) {
    try {
      const peekJson = await response.clone().json()
      const msg = peekJson?.error?.message || ''
      if (/response_format/i.test(msg) || /json_object/i.test(msg)) {
        delete payload.response_format
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal
        })
      }
    } catch (_) {}
  }

  if (!response.ok) {
    let errMsg = `请求返回状态码 ${response.status}`
    try {
      const errJson = await response.json()
      if (errJson?.error?.message) {
        errMsg = errJson.error.message
      }
    } catch (_) {}
    throw new Error(errMsg)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''
  setAiConnectivityPassed(true)
  return content
}

/**
 * 使用大模型专业翻译天文/物理学术文献（标题与摘要）
 * 严格保留 LaTeX 公式，精准转换学术术语
 */
export async function translatePaperWithAi({ title = '', abstract = '', config, signal } = {}) {
  const systemPrompt = `你是一个资深学术文献翻译专家。请将给出的英文学术论文标题和摘要翻译为规范、严谨、专业的学术中文。

翻译规范与硬性要求：
1. 必须原样严格保留所有 LaTeX 数学物理公式（如 $...$、$$...$$、\\( ... \\)、\\[ ... \\] 及所有专业数学符号），切勿篡改或翻译公式内的数学变量；
2. 准确翻译天文学术专用术语（例如：redshift -> 红移，gravitational waves -> 引力波，accretion disk -> 吸积盘，dark matter halo -> 暗物质晕，supernova -> 超新星，spectroscopy -> 光谱学，cosmic microwave background -> 宇宙微波背景 等）；
3. 语调忠实学术原文，用词精炼严谨，避免口语化；
4. 必须输出严格的 JSON 格式，不要输出任何多余的开头或结尾寒暄：
{
  "title": "中文翻译标题",
  "abstract": "中文翻译摘要"
}`

  const userPrompt = `【待翻译英文标题】:
${title}

【待翻译英文摘要】:
${abstract}`

  const content = await callAiCompletion({
    config,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    jsonMode: true,
    signal
  })

  const extracted = extractJsonFromText(content)
  if (!extracted || typeof extracted !== 'object') {
    throw new Error('模型返回格式异常，未成功解析出翻译 JSON。')
  }

  return {
    title: extracted.title || title,
    abstract: extracted.abstract || abstract
  }
}

/**
 * 使用大模型从学术通知邮件中智能提取日程信息
 * 严格忠实原邮件与海报，若邮件正文简短且有海报则结合海报 OCR 充实摘要说明
 */
export async function extractScheduleFromEmailWithAi(email, { config, signal, posterImageUrl } = {}) {
  if (!email) throw new Error('邮件数据为空')

  const aiConfig = config || loadAiConfig()
  const rawBody = (email.body_text || email.snippet || '').trim()
  const truncatedBody = rawBody.length > 2500 ? rawBody.slice(0, 2500) : rawBody
  const isPromptOnly = /请根据随附.*(?:海报|图片|文件).*提取/i.test(rawBody) ||
    /^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(rawBody)
  const hasSubstantiveText = rawBody.length > 20 && !isPromptOnly

  const isVision = isModelVisionCapable(aiConfig)
  const imageCandidate = posterImageUrl || email.poster_url || (Array.isArray(email.attachments) && email.attachments[0]?.url) || ''

  if (!isVision && !hasSubstantiveText && Boolean(imageCandidate)) {
    throw new Error(`您当前配置的模型（${aiConfig.model || '纯文本模型'}）不支持图像视觉识别。对于仅提供海报的学术日程条目，请在「AI 科研助手」->「模型配置」中切换为支持视觉的多模态模型（如 通义千问 Qwen2.5-VL / GPT-4o 等），或先输入/勾选文本内容。`)
  }

  const mailContent = `邮件主题: ${email.subject || ''}
发件人: ${email.from || ''}
邮件时间: ${email.date || ''}
邮件正文:
${hasSubstantiveText ? truncatedBody : '（正文未提供文字描述，详见随附学术报告海报）'}`

  const isBrief = isEmailContentBrief(email)
  let usedVision = false
  let userContent = mailContent
  let maxTokensToUse = 600

  // 只要大模型具备多模态视觉能力且存在海报图片，并且正文简略或正文未提供详尽长篇预印本文本，激活多模态海报深度 OCR 与摘要提取
  const shouldTryVision = isVision && (isBrief || !hasSubstantiveText || email.body_text?.length < 800) && Boolean(imageCandidate)

  if (shouldTryVision) {
    try {
      const dataUrl = await convertImageUrlToDataUrl(imageCandidate, signal)
      if (dataUrl) {
        userContent = [
          {
            type: 'text',
            text: `${hasSubstantiveText ? mailContent : '【提示：本场学术报告的关键信息主要记录在随附的海报图片中】'}\n\n【多模态海报内容提取核心指令】：
该学术日程已随附报告海报图片。
请你仔细阅读并 OCR 识别海报图片中的所有文字，重点提取：
1. 报告题目 (title)；
2. 报告日期 (date, YYYY-MM-DD) 与开始时间 (time, HH:mm)；
3. 报告人姓名与职称单位 (speaker)；
4. 地点或会议号 (location)；
5. 报告摘要 / 研究内容简介 (Abstract / Overview)；
6. 报告人简介 / 背景介绍 (Speaker Bio)；
7. 任何邮件正文中遗漏的报告核心信息。
请将海报中记载的报告摘要、研究内容简介与主讲人背景充实、客观、忠实地填充到 notes（说明）字段中，务求完整呈现学术报告的核心内容！`
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl }
          }
        ]
        usedVision = true
        maxTokensToUse = 1800
      }
    } catch (e) {
      console.warn('获取海报图片进行视觉识别失败:', e)
      if (!hasSubstantiveText) {
        throw new Error(`获取学术报告海报图片失败（${e.message || '图片读取错误'}）。请检查图片有效性或网络。`)
      }
    }
  }

  const systemPrompt = `你是一个科研学术日程结构化提取助手。请从给定的学术讲座/报告通知${usedVision ? '以及随附的海报图片' : ''}中精准提取日程字段。

提取硬性规范：
1. 忠实原信息与海报：不要进行主观总结或润色，提取客观日程信息；
2. 中文优先原则：若原文或海报中同时出现标题的中英文、报告人的中英文或地点的中英文，必须优先填入中文；仅当原文只有英文时才填入英文；
3. 地点规范：提取真实的会议室、报告厅或会议号。严禁将正文称谓误作为地点；
4. 标题(title)：纯正报告题目。必须自动剥离“Fw:”、“转发:”、“【学术报告】”、“讲座通知:”等前缀；若同时有中英文标题，优先提取中文标题；
5. 日期(date)：公历日期，严格格式 "YYYY-MM-DD"；
6. 时间(time)：24小时制，严格格式 "HH:mm"；
7. 报告人(speaker)：主讲人姓名与职称单位，优先中文；若仅有英文则保留英文；切勿将称谓误当作报告人；
8. 地点(location)：真实会议室或会议号，优先中文；
9. 说明(notes)：报告摘要全文或背景要点。${usedVision ? '【特别强调】：当前已随附海报图片，请务必仔细阅读并 OCR 识别海报上的文字，将海报中记载的报告摘要、研究内容简介与主讲人背景忠实完整地填入 notes 中，严禁只输出空或简略的一两句话！' : '忠实原内容，无需主观发挥'}；
10. 必须输出严格 JSON 格式：
{
  "title": "报告标题",
  "date": "YYYY-MM-DD",
  "time": "HH:mm",
  "speaker": "报告人",
  "location": "地点或会议号",
  "notes": "说明/正文摘要"
}幻觉防范：不要把指令提示字符串或空占位符输出到 title 或 notes 中。`

  let content = ''
  try {
    content = await callAiCompletion({
      config: aiConfig,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.1,
      maxTokens: maxTokensToUse,
      jsonMode: true,
      signal
    })
  } catch (err) {
    if (usedVision && hasSubstantiveText) {
      console.warn('多模态视觉请求失败，自动降级为纯文本提取:', err)
      usedVision = false
      content = await callAiCompletion({
        config: aiConfig,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: mailContent }
        ],
        temperature: 0.1,
        maxTokens: 600,
        jsonMode: true,
        signal
      })
    } else {
      if (usedVision && !hasSubstantiveText) {
        throw new Error(`海报多模态视觉识别失败（${err.message || '模型调用异常'}）。当前大模型可能不支持图片输入或网络超时。请切换为支持视觉的多模态模型（如 Qwen2.5-VL / GPT-4o 等），或在左侧输入具体文字描述。`)
      }
      throw err
    }
  }

  const extracted = extractJsonFromText(content)
  if (!extracted || typeof extracted !== 'object') {
    throw new Error('模型未能正确输出学术报告 JSON 结构。')
  }

  // 日期容错处理
  let finalDate = extracted.date || ''
  if (finalDate) {
    finalDate = finalDate.replace(/\//g, '-').trim()
    const dateMatch = finalDate.match(/\d{4}-\d{1,2}-\d{1,2}/)
    if (dateMatch) {
      const parts = dateMatch[0].split('-')
      finalDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    }
  }

  // 时间容错处理
  let finalTime = extracted.time || ''
  if (finalTime) {
    const timeMatch = finalTime.match(/(\d{1,2})[:：](\d{2})/)
    if (timeMatch) {
      finalTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
    }
  }

  // 中文优先二次保障（若模型输出了中英双语，优先选取中文部分）
  const cleanTitle = cleanAiExtractedText(pickChinesePartIfDual(extracted.title || ''))
  const cleanSpeaker = cleanAiExtractedText(pickChinesePartIfDual(extracted.speaker || ''))
  let cleanLocation = cleanAiExtractedText(pickChinesePartIfDual(extracted.location || ''))

  // 执行地点规范化保障
  const fullContext = `${email.subject || ''} ${email.from || ''} ${rawBody}`
  cleanLocation = applyInstitutionLocationPrefix(cleanLocation, fullContext)

  const finalTitle = cleanTitle || cleanAiExtractedText(email.subject) || (imageCandidate ? '学术报告（海报）' : '学术报告')
  const finalNotes = cleanAiExtractedText(extracted.notes) || (hasSubstantiveText ? rawBody : (imageCandidate ? '详见随附学术报告海报' : ''))

  return {
    title: finalTitle,
    date: finalDate,
    time: finalTime,
    speaker: cleanSpeaker,
    location: cleanLocation,
    notes: finalNotes,
    usedVision
  }
}

/**
 * 从邮件内容与海报中智能识别学术会议/研讨会信息
 * @param {Object} email - 邮件对象
 * @param {Object} options - 可选参数 { config, posterImageUrl, pdfAttachmentUrl, signal }
 * @returns {Promise<Object>} 结构化的学术会议元数据对象
 */
export async function extractConferenceFromEmailWithAi(email, { config, posterImageUrl, pdfAttachmentUrl, signal } = {}) {
  const aiConfig = config || loadAiConfig()
  if (!aiConfig.baseUrl) {
    throw new Error('未配置大模型 Base URL 地址，请在个人中心或设置中配置。')
  }

  const rawBody = (email.body_text || email.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const isPromptOnly = /请根据随附.*(?:海报|图片|文件).*提取/i.test(rawBody) ||
    /^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(rawBody)
  const hasSubstantiveText = rawBody.length > 20 && !isPromptOnly

  const isVision = isModelVisionCapable(aiConfig)
  const imageCandidate = posterImageUrl || email.poster_url || (Array.isArray(email.attachments) && email.attachments[0]?.url) || ''

  if (!isVision && !hasSubstantiveText && Boolean(imageCandidate)) {
    throw new Error(`您当前配置的模型（${aiConfig.model || '纯文本模型'}）不支持图像视觉识别。对于仅提供海报的会议条目，请在「AI 科研助手」->「模型配置」中切换为支持视觉的多模态模型（如 通义千问 Qwen2.5-VL / GPT-4o 等），或先输入/勾选文本内容。`)
  }

  const mailContent = `邮件主题: ${email.subject || '无'}
发件人: ${email.from || email.sender || '无'}
发信日期: ${email.date || '无'}
邮件正文:
${hasSubstantiveText ? rawBody.slice(0, 3000) : '（正文未提供文字描述，详见随附学术会议海报）'}`

  let usedVision = false
  let userContent = mailContent
  let maxTokensToUse = 1000

  const shouldTryVision = isVision && (!hasSubstantiveText || rawBody.length < 800) && Boolean(imageCandidate)
  if (shouldTryVision) {
    try {
      const dataUrl = await convertImageUrlToDataUrl(imageCandidate, signal)
      if (dataUrl) {
        userContent = [
          {
            type: 'text',
            text: `${hasSubstantiveText ? mailContent : '【提示：本学术会议日程信息主要记录在随附的会议海报中】'}\n\n【多模态会议海报 OCR 识别核心指令】：
该条目已随附会议海报图片。请你仔细阅读并 OCR 识别海报图片中的全部文字，重点提取：
1. 会议完整正式名称 (title)；
2. 会议起始日期 (date) 与结束日期 (end_date)（格式 YYYY-MM-DD）；
3. 举办城市 (city) 与具体会场地点 (location)；
4. 主办或承办单位 (organizer)；
5. 各关键截止时间（abstract_deadline / early_bird_deadline / registration_deadline）；
6. 官方网址与报名网址；
7. 会议主要日程议程与主题说明 (notes)。
请务必完整、准确地填充到对应字段中！`
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl }
          }
        ]
        usedVision = true
        maxTokensToUse = 1800
      }
    } catch (e) {
      console.warn('获取会议海报图片进行视觉识别失败:', e)
      if (!hasSubstantiveText) {
        throw new Error(`获取学术会议海报图片失败（${e.message || '图片读取错误'}）。请检查图片有效性或网络。`)
      }
    }
  }

  const systemPrompt = `你是一位专业的高校与科研院所课题组学术助手。
你的任务是从给定的邮件内容（${usedVision ? '以及随附的会议海报图片' : '及可能附加的会议通知图片'}）中，准确提取学术会议（如学术年会、研讨会、Colloquium、Symposium、高峰论坛等）的关键结构化信息。

请按以下要求提取并输出 JSON：
1. 完整会议名称 (title)：如“2026年天体物理与宇宙学前沿研讨会”；
2. 会议类别 (sub_type)：必须是以下之一：年会、研讨会、学术交流、其他学术会议；
3. 会议起始日期 (date)：格式 "YYYY-MM-DD"；
4. 会议结束日期 (end_date)：格式 "YYYY-MM-DD"（若为单日会议可与 date 相同或为空）；
5. 举办城市 (city)：如“开封”、“南京”、“北京”等；
6. 具体地点/会场 (location)：如酒店、报告厅、大学校区或园区会议中心；
7. 主办/承办单位 (organizer)：如“中国天文学会学术交流专业委员会”；
8. 关键重要截止时间：
   - abstract_deadline: 摘要提交/报告申请截止日期（格式 "YYYY-MM-DD"，无则空 ""）
   - early_bird_deadline: 早鸟注册/优惠截止日期（格式 "YYYY-MM-DD"，无则空 ""）
   - registration_deadline: 正式注册/报名截止日期（格式 "YYYY-MM-DD"，无则空 ""）
9. 网址与链接：
   - website_url: 会议官方网站（有效 http/https 网址，无则空 ""）
   - registration_url: 在线报名注册入口（有效 http/https 网址，无则空 ""）
10. 说明 (notes)：会议核心说明与摘要；
11. 必须输出严格 JSON 格式：
{
  "title": "会议全称",
  "sub_type": "年会",
  "date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "city": "城市名",
  "location": "会场或酒店",
  "organizer": "主办单位",
  "abstract_deadline": "YYYY-MM-DD",
  "early_bird_deadline": "YYYY-MM-DD",
  "registration_deadline": "YYYY-MM-DD",
  "website_url": "https://...",
  "registration_url": "https://...",
  "notes": "会议核心说明"
}幻觉防范：不要把指令提示字符串或空占位符输出到 title 或 notes 中。`

  let content = ''
  try {
    content = await callAiCompletion({
      config: aiConfig,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.1,
      maxTokens: maxTokensToUse,
      jsonMode: true,
      signal
    })
  } catch (err) {
    if (usedVision && hasSubstantiveText) {
      console.warn('多模态会议海报识别失败，降级为文本识别:', err)
      usedVision = false
      content = await callAiCompletion({
        config: aiConfig,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: mailContent }
        ],
        temperature: 0.1,
        maxTokens: 1000,
        jsonMode: true,
        signal
      })
    } else {
      if (usedVision && !hasSubstantiveText) {
        throw new Error(`会议海报多模态视觉识别失败（${err.message || '模型调用异常'}）。当前大模型可能不支持图片输入或网络超时。请切换为支持视觉的多模态模型（如 Qwen2.5-VL / GPT-4o 等），或在左侧输入具体文字描述。`)
      }
      throw err
    }
  }

  const extracted = extractJsonFromText(content)
  if (!extracted || typeof extracted !== 'object') {
    throw new Error('模型未能正确输出学术会议 JSON 结构。')
  }

  function cleanDate(d) {
    if (!d || typeof d !== 'string') return ''
    const m = d.replace(/\//g, '-').match(/\d{4}-\d{1,2}-\d{1,2}/)
    if (m) {
      const [y, mon, day] = m[0].split('-')
      return `${y}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    return ''
  }

  const finalTitle = cleanAiExtractedText(extracted.title) || cleanAiExtractedText(email.subject) || (imageCandidate ? '学术会议（海报）' : '学术会议')
  const finalNotes = cleanAiExtractedText(extracted.notes) || (hasSubstantiveText ? rawBody.slice(0, 500) : (imageCandidate ? '详见随附学术会议海报' : ''))

  return {
    title: finalTitle,
    sub_type: extracted.sub_type || '研讨会',
    date: cleanDate(extracted.date),
    end_date: cleanDate(extracted.end_date),
    city: cleanAiExtractedText(extracted.city),
    location: cleanAiExtractedText(extracted.location),
    organizer: cleanAiExtractedText(extracted.organizer),
    abstract_deadline: cleanDate(extracted.abstract_deadline),
    early_bird_deadline: cleanDate(extracted.early_bird_deadline),
    registration_deadline: cleanDate(extracted.registration_deadline),
    website_url: cleanAiExtractedText(extracted.website_url),
    registration_url: cleanAiExtractedText(extracted.registration_url),
    notes: finalNotes,
    usedVision
  }
}

/**
 * 规范化并纠偏通知日期与截止时间
 * 1. 自动对齐 YYYY-MM-DD 格式
 * 2. 补全月日简写（如 "9月23日" 自动补充参考年份）
 * 3. 核心纠偏：若 LLM 幻觉产生过往年份（如 2025/2024 等早于当前参考年份 2026），自动纠偏为当前年份
 * 4. 时序校验：若截止日期早于生效日期且跨年（如12月到次年1月），自动将截止年份递增；若同一月份截止日早于开始日，则至少保障年份一致
 * @param {string} startDateRaw 
 * @param {string} endDateRaw 
 * @param {string} referenceDate 基准参考日期 (YYYY-MM-DD)
 * @returns {{ start_date: string, end_date: string }}
 */
export function normalizeNoticeDates(startDateRaw, endDateRaw, referenceDate = shanghaiToday()) {
  const currentYear = parseInt(String(referenceDate || '').slice(0, 4), 10) || 2026

  function parsePart(d) {
    if (!d || typeof d !== 'string') return null
    const clean = d.replace(/[/.]/g, '-').trim()
    const fullMatch = clean.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (fullMatch) {
      return {
        y: parseInt(fullMatch[1], 10),
        m: String(parseInt(fullMatch[2], 10)).padStart(2, '0'),
        day: String(parseInt(fullMatch[3], 10)).padStart(2, '0')
      }
    }
    const mdMatch = clean.match(/(?:^|[^\d])(\d{1,2})[-月](\d{1,2})/)
    if (mdMatch) {
      return {
        y: currentYear,
        m: String(parseInt(mdMatch[1], 10)).padStart(2, '0'),
        day: String(parseInt(mdMatch[2], 10)).padStart(2, '0')
      }
    }
    return null
  }

  let start = parsePart(startDateRaw)
  let end = parsePart(endDateRaw)

  if (start && start.y < currentYear) {
    start.y = currentYear
  }
  const startDateStr = start ? `${start.y}-${start.m}-${start.day}` : (startDateRaw ? startDateRaw.slice(0, 10) : referenceDate)

  let endDateStr = ''
  if (end) {
    if (end.y < currentYear) {
      end.y = currentYear
    }
    if (start && end.y < start.y) {
      end.y = start.y
    }
    if (start && parseInt(end.m, 10) < parseInt(start.m, 10) && `${end.y}-${end.m}-${end.day}` < startDateStr) {
      end.y = start.y + 1
    }
    endDateStr = `${end.y}-${end.m}-${end.day}`
  }

  return {
    start_date: startDateStr,
    end_date: endDateStr
  }
}

/**
 * 访问最近一周内邮件，智能识别出重要的教务通知与公共事务通知（奖学金、学分要求、放假调休、电梯维修、停水停电断网等），
 * 严格区别于学术报告/研讨会/学术会议活动，提取结构化通知卡片数组，并关联源邮件附件与图片。
 *
 * @param {Array} emails - 待分析邮件列表
 * @param {Object} options - 可选参数 { signal, onProgress }
 * @returns {Promise<Array>} 识别出的通知对象列表
 */
export async function extractNoticesFromEmailsWithAi(emails, { signal, onProgress } = {}) {
  if (!Array.isArray(emails) || emails.length === 0) return []

  const aiConfig = loadAiConfig()
  if (!aiConfig.baseUrl) {
    throw new Error('未配置大模型 Base URL 地址，请在个人中心或设置中配置。')
  }

  const todayStr = shanghaiToday()
  const currentYear = parseInt(todayStr.slice(0, 4), 10) || 2026

  // 1. 过滤与精简邮件信息（避免无关超长邮件与上下文溢出）
  const emailCandidates = emails.map(email => {
    const uid = String(email.msg_uid || email.id || '').trim()
    const subject = (email.subject || '').trim()
    const sender = (email.sender_name || email.sender_email || '').trim()
    const date = (email.date_str || '').trim()

    let text = (email.body_text || email.snippet || '').trim()
    if (!text && email.body_html) {
      text = email.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    const snippet = text.slice(0, 1000)

    let attachmentNames = []
    try {
      const atts = Array.isArray(email.attachments) 
        ? email.attachments 
        : JSON.parse(email.attachments || '[]')
      attachmentNames = atts.map(a => a.filename || a.name).filter(Boolean)
    } catch {}

    return {
      uid,
      subject,
      sender,
      date,
      snippet,
      attachments: attachmentNames.length > 0 ? attachmentNames.join(', ') : '',
      rawEmail: email
    }
  }).filter(e => e.uid && (e.subject || e.snippet))

  if (emailCandidates.length === 0) return []

  // 2. 分批处理：每批最多 10 封邮件，避免单次 Prompt 上下文过大并提升响应速度
  const BATCH_SIZE = 10
  const batches = []
  for (let i = 0; i < emailCandidates.length; i += BATCH_SIZE) {
    batches.push(emailCandidates.slice(i, i + BATCH_SIZE))
  }

  const systemPrompt = `你是一位严谨高效的高校与科研院所课题组行政与教务助手。
你的核心职责是从用户最近一周收到的邮件中，准确甄别出【重要教务通知】与【重要公共事务/园区后勤通知】，并输出结构化 JSON。
当前系统基准时间：${todayStr}（基准年份：${currentYear} 年）。

【必须识别并提取的重要通知包括】：
1. 教务与培养通知：国家奖学金、学业奖学金、专项奖学金评定与申请、学分认定要求与审核、开题/中期考核、毕业答辩审核、选课与补退选等；
2. 节假日与放假调休：中秋节、国庆节、元旦、寒暑假等校历放假与调休补课安排、作息时间调整；
3. 后勤设施与网络水电：电梯年检/维修/停运、计划停电、校园网割接/断网维护、停水/清洗水箱、空调维保/供暖防冻、宿舍/实验室保洁与门禁；
4. 校园与实验室安全：消防演习、危化品检查、实验室安全大排查、台风/暴雨极端天气预警；
5. 其他面向全组/全体师生的重要综合行政管理通告。

【严格排除并忽略的邮件类型（绝对不要提取）】：
- 任何学术报告、研讨会、Colloquium、Seminar、Symposium、学术年会、学术会议（因为它们属于学术日程模块，不属于本栏目）；
- 期刊文献推送、arXiv 论文提醒、学术订阅邮件；
- 个人私信交流、推销垃圾邮件、系统自动回复。

若某封邮件不属于上述重要通知类型，请直接忽略它，不要生成任何卡片！

【日期与截止时间（时效性）推断严格准则】：
1. 邮件中出现的截止日期往往只写月日（例如“9月23日”、“下周三”）。请务必结合发件日期或基准年份 ${currentYear} 补充完整四位年份 YYYY-MM-DD，绝对不可推断为过往年份（严禁生成如 2024、2025 等早于 ${currentYear} 的过去年份）！
2. 截止日期 end_date 的年份绝不能早于通知发件年份或当前基准年份 ${currentYear}。
3. 若通知正文或附件中没有明确截止时间、或属于长期有效的管理规章/日常要求，end_date 必须填空字符串 ""。

【输出格式要求】：
请务必返回合法的 JSON 对象，格式严格如下：
{
  "notices": [
    {
      "source_uid": "对应邮件的 uid（必须原样返回）",
      "source_subject": "对应邮件的原始主题",
      "source_sender": "对应发件人",
      "title": "简短描述作为标题（15~35字，文字洗练准确，适合走马灯滚动和卡片标题，例如：东区综合楼9月22日电梯维保暂停运行、2026年研究生国家奖学金评选申请通知）",
      "content": "详细通知内容摘要（保留核心通知事项、办理要求、影响时间与范围、联系人方式，支持段落换行）",
      "category": "分类枚举，必须是以下之一：academic_affairs (教务学分奖学金), holiday (放假调休), facility (水电梯网后勤), administrative (行政事务), safety (校园安全), general (综合通知)",
      "importance": "重要程度，必须是以下之一：urgent (紧急事项，如近两日停水停电断网、紧急截止申报), important (重要事项，如奖学金申请、放假调休), normal (普通事务)",
      "start_date": "通知生效或开始日期，格式 YYYY-MM-DD，若无法确认请留空",
      "end_date": "时效截止日期，格式 YYYY-MM-DD（如申请截止时间、停水结束时间、放假结束时间；若无明确截止时效或长期有效则填空字符串 \"\"）"
    }
  ]
}`

  const allResults = []

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const currentBatch = batches[bIdx]
    onProgress?.({
      currentBatch: bIdx + 1,
      totalBatches: batches.length,
      processedEmails: Math.min(bIdx * BATCH_SIZE + currentBatch.length, emailCandidates.length),
      totalEmails: emailCandidates.length
    })

    const userPrompt = `请分析以下 ${currentBatch.length} 封邮件，识别出符合要求的教务与事务通知：\n\n` +
      currentBatch.map((em, idx) => {
        return `[邮件 ${idx + 1}]
UID: ${em.uid}
主题: ${em.subject}
发件人: ${em.sender}
日期: ${em.date}
附件: ${em.attachments || '无'}
正文片段:
${em.snippet}
`
      }).join('\n----------------------------------------\n')

    try {
      const responseText = await callAiCompletion({
        config: aiConfig,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        maxTokens: 2000,
        jsonMode: true,
        signal
      })

      const parsed = extractJsonFromText(responseText)
      if (parsed && Array.isArray(parsed.notices)) {
        for (const item of parsed.notices) {
          if (item && item.title && item.content) {
            let cat = item.category || 'general'
            if (!['academic_affairs', 'holiday', 'facility', 'administrative', 'safety', 'general'].includes(cat)) {
              cat = 'general'
            }
            let imp = item.importance || 'normal'
            if (!['urgent', 'important', 'normal'].includes(imp)) {
              imp = 'normal'
            }
            const normalizedDates = normalizeNoticeDates(item.start_date, item.end_date, todayStr)

            // 提取源邮件关联的所有图片与附件
            const matchedCandidate = currentBatch.find(c => String(c.uid) === String(item.source_uid))
            let emailAttachments = []
            if (matchedCandidate && matchedCandidate.rawEmail) {
              const raw = matchedCandidate.rawEmail
              try {
                if (Array.isArray(raw.attachments)) {
                  emailAttachments = [...raw.attachments]
                } else if (typeof raw.attachments === 'string' && raw.attachments.trim() && raw.attachments !== '[]') {
                  const parsedAtts = JSON.parse(raw.attachments)
                  if (Array.isArray(parsedAtts)) emailAttachments = [...parsedAtts]
                }
              } catch {}
              if (raw.poster_url && !emailAttachments.some(a => a && a.url === raw.poster_url)) {
                emailAttachments.unshift({
                  id: 'email-poster',
                  filename: '通知图片.jpg',
                  url: raw.poster_url,
                  content_type: 'image/jpeg'
                })
              }
            }

            allResults.push({
              source_uid: item.source_uid || '',
              source_subject: item.source_subject || '',
              source_sender: item.source_sender || '',
              title: item.title.trim(),
              content: item.content.trim(),
              category: cat,
              importance: imp,
              start_date: normalizedDates.start_date,
              end_date: normalizedDates.end_date,
              attachments: emailAttachments.length > 0 ? JSON.stringify(emailAttachments) : '[]'
            })
          }
        }
      }
    } catch (batchErr) {
      console.warn(`第 ${bIdx + 1} 批次邮件通知识别异常:`, batchErr)
    }
  }

  return allResults
}

/**
 * 从单篇文本中通过 AI 智能提取结构化通知字段
 *
 * @param {string} text - 原始通知文本
 * @param {Object} options - 可选配置 { config, signal, attachments }
 * @returns {Promise<Object>} 结构化通知对象
 */
export async function extractSingleNoticeWithAi(text, { config, signal, attachments = [], posterImageUrl } = {}) {
  const aiConfig = config || loadAiConfig()
  if (!aiConfig.baseUrl) {
    throw new Error('未配置大模型 Base URL 地址，请在个人中心或设置中配置。')
  }

  const rawText = (text || '').trim()
  const isPromptOnly = /请根据随附.*(?:海报|图片|文件).*提取/i.test(rawText) ||
    /^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(rawText)
  const hasSubstantiveText = rawText.length > 20 && !isPromptOnly

  const imgAttachment = posterImageUrl || (Array.isArray(attachments) ? attachments.find(a =>
    a.content_type?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.url || a.filename || '')
  )?.url : '')

  if (!hasSubstantiveText && !imgAttachment) {
    throw new Error('通知文本内容为空')
  }

  const isVision = isModelVisionCapable(aiConfig)

  if (!isVision && !hasSubstantiveText && Boolean(imgAttachment)) {
    throw new Error(`您当前配置的模型（${aiConfig.model || '纯文本模型'}）不支持图像视觉识别。对于仅提供图片的通知条目，请在「AI 科研助手」->「模型配置」中切换为支持视觉的多模态模型（如 Qwen2.5-VL / GPT-4o 等），或先输入/勾选文本内容。`)
  }

  const todayStr = shanghaiToday()
  const currentYear = parseInt(todayStr.slice(0, 4), 10) || 2026

  let usedVision = false
  let userContent = hasSubstantiveText ? rawText.slice(0, 4000) : '（正文未提供文字描述，详见随附通知附图）'
  let maxTokensToUse = 1000

  if (isVision && Boolean(imgAttachment) && (!hasSubstantiveText || rawText.length < 800)) {
    try {
      const dataUrl = await convertImageUrlToDataUrl(imgAttachment, signal)
      if (dataUrl) {
        userContent = [
          {
            type: 'text',
            text: `${hasSubstantiveText ? rawText.slice(0, 3000) : '【提示：本通知信息主要记录在随附的通知附图中】'}\n\n【多模态通知图片 OCR 提取核心指令】：\n该条目已随附通知图片。请仔细阅读并 OCR 识别图片中的文字，提取通知标题 (title)、分类 (category)、重要程度 (importance)、起止日期 (start_date/end_date) 与详细正文 (content)。`
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl }
          }
        ]
        usedVision = true
        maxTokensToUse = 1800
      }
    } catch (e) {
      console.warn('获取通知图片进行视觉识别失败:', e)
      if (!hasSubstantiveText) {
        throw new Error(`获取通知附图失败（${e.message || '图片读取错误'}）。请检查图片有效性或网络。`)
      }
    }
  }

  const systemPrompt = `你是一位严谨高效的高校与科研院所课题组行政与教务助手。
你的核心职责是从用户提供的通知通告${usedVision ? '及随附图片' : '文本'}中，精准提取结构化通知字段并返回严格的 JSON。
当前系统基准时间：${todayStr}（基准年份：${currentYear} 年）。

【输出格式要求】：
请务必返回合法的 JSON 对象，格式严格如下：
{
  "title": "简短描述作为标题（15~35字，文字洗练准确，适合走马灯滚动和卡片标题，例如：东区综合楼9月22日电梯维保暂停运行、2026年研究生国家奖学金评选申请通知）",
  "content": "详细通知内容摘要（保留核心通知事项、办理要求、影响时间与范围、联系人方式，支持段落换行）",
  "category": "academic_affairs | holiday | facility | administrative | safety | general",
  "importance": "urgent | important | normal",
  "start_date": "通知生效或开始日期，格式 YYYY-MM-DD，若无法确认请留空",
  "end_date": "时效截止日期，格式 YYYY-MM-DD（如申请截止时间、停水结束时间、放假结束时间；若无明确截止时效或长期有效则填空字符串 \"\"）"
}
幻觉防范：不要把指令提示字符串或空占位符输出到 title 或 content 中。`

  let responseText = ''
  try {
    responseText = await callAiCompletion({
      config: aiConfig,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.1,
      maxTokens: maxTokensToUse,
      jsonMode: true,
      signal
    })
  } catch (err) {
    if (usedVision && hasSubstantiveText) {
      console.warn('多模态通知识别失败，降级为纯文本提取:', err)
      usedVision = false
      responseText = await callAiCompletion({
        config: aiConfig,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText ? rawText.slice(0, 4000) : '综合通知' }
        ],
        temperature: 0.1,
        maxTokens: 1000,
        jsonMode: true,
        signal
      })
    } else {
      if (usedVision && !hasSubstantiveText) {
        throw new Error(`通知图片多模态视觉识别失败（${err.message || '模型调用异常'}）。当前大模型可能不支持图片输入或网络超时。请切换为支持视觉的多模态模型（如 Qwen2.5-VL / GPT-4o 等），或补充文字描述。`)
      }
      throw err
    }
  }

  const parsed = extractJsonFromText(responseText)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('未能从模型回复中解析出有效的通知 JSON')
  }

  let cat = parsed.category || 'general'
  if (!['academic_affairs', 'holiday', 'facility', 'administrative', 'safety', 'general'].includes(cat)) {
    cat = 'general'
  }
  let imp = parsed.importance || 'normal'
  if (!['urgent', 'important', 'normal'].includes(imp)) {
    imp = 'normal'
  }

  const normalizedDates = normalizeNoticeDates(parsed.start_date, parsed.end_date, todayStr)

  const finalTitle = cleanAiExtractedText(parsed.title) || (imgAttachment ? '综合事务通知（附图）' : '综合事务通知')
  const finalContent = cleanAiExtractedText(parsed.content) || (hasSubstantiveText ? rawText : (imgAttachment ? '详见随附通知图片' : ''))

  return {
    title: finalTitle,
    content: finalContent,
    category: cat,
    importance: imp,
    start_date: normalizedDates.start_date,
    end_date: normalizedDates.end_date,
    attachments: Array.isArray(attachments) ? attachments : []
  }
}
