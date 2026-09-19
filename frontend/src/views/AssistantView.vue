<script setup>
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount, onActivated, onDeactivated, watch } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { renderMarkdown } from '../utils/markdown.js'
import { notify, confirmAction } from '../composables/feedback.js'
import { isAiGeneratingGlobally } from '../composables/useAiAssistantState.js'
import {
  loadAiConfig,
  saveAiConfig,
  testAiConnection,
  sendChatMessageStream,
  loadAiSessions,
  saveAiSessions,
  loadActiveSessionId,
  saveActiveSessionId,
  createDefaultSession,
  clearAllAiSessions,
  normalizeModelItem,
  PRESET_PROVIDERS,
  AI_STORAGE_KEY,
  isAiConnectivityPassed,
  setAiConnectivityPassed
} from '../services/aiService.js'
import { useRoute, useRouter } from 'vue-router'
import {
  cleanArxivId,
  getArxivHtmlUrl,
  fetchArxivPaperFulltext
} from '../utils/arxivHtml.js'
import { useTutorial } from '../composables/useTutorial.js'

defineOptions({
  name: 'AssistantView'
})

// 新手引导状态联动（引导过程中避免自动弹出大模型配置框打断正常体验）
const { showTutorial } = useTutorial()

// 组件是否处于 KeepAlive 离开激活态
const isDeactivated = ref(false)

// 当前登录用户
const currentUser = computed(() => {
  try {
    const raw = localStorage.getItem('labhub_user')
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
})

// 模型配置状态
const config = reactive(loadAiConfig())
const showConfigModal = ref(false)

watch(showTutorial, (isActive) => {
  if (isActive) {
    showConfigModal.value = false
  }
})

const showApiKey = ref(false)
const testingConnection = ref(false)
const testResult = ref(null)

// 会话列表与当前激活会话
const sessions = ref(loadAiSessions())
const activeSessionId = ref(loadActiveSessionId() || (sessions.value[0]?.id || ''))
if (!activeSessionId.value && sessions.value.length > 0) {
  activeSessionId.value = sessions.value[0].id
  saveActiveSessionId(activeSessionId.value)
}

// 侧边栏折叠状态
const isSidebarCollapsed = ref(localStorage.getItem('labhub_ai_sidebar_collapsed') === 'true')
function toggleSidebar() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
  localStorage.setItem('labhub_ai_sidebar_collapsed', String(isSidebarCollapsed.value))
}

// 当前激活会话对象
const currentSession = computed(() => {
  return sessions.value.find(s => s.id === activeSessionId.value) || sessions.value[0] || null
})

// 当前激活会话的消息队列（直接映射到 currentSession.messages）
const messages = computed(() => {
  return currentSession.value ? currentSession.value.messages : []
})

// 会话行内重命名状态
const editingSessionId = ref('')
const editingSessionTitle = ref('')
const renameInputRef = ref(null)

const inputContent = ref('')
const isStreaming = ref(false)
const streamingIndex = ref(-1)
const currentReasoning = ref('')
const currentResponse = ref('')
let abortController = null
let streamRafId = null

// 同步全局 AI 生成状态
watch(isStreaming, (val) => {
  isAiGeneratingGlobally.value = Boolean(val)
}, { immediate: true })

// 监听配置弹窗开关状态：打开时重新加载已保存配置，关闭且配置就绪时自动聚焦输入框
watch(showConfigModal, (isOpen) => {
  if (isOpen) {
    const saved = loadAiConfig()
    Object.assign(config, saved)
    testResult.value = null
  } else if (isConfigured.value) {
    nextTick(() => {
      if (textareaRef.value && typeof textareaRef.value.focus === 'function') {
        textareaRef.value.focus()
      }
    })
  }
})

// 多模态图片上传与剪贴板粘贴
const pendingImages = ref([])
const fileInputRef = ref(null)
const previewImageModal = ref(null)

const chatContainerRef = ref(null)
const textareaRef = ref(null)

// 预设问题卡片
const promptSuggestions = [
  {
    title: '文献创新点剖析',
    prompt: '请帮我梳理一篇前沿天文物理学论文的核心创新点、观测方法与结论局限性。'
  },
  {
    title: '宇宙学公式推导',
    prompt: '请写出标准宇宙学模型（LCDM）下光度距离与红移 z 的积分关系式，并给出关键参数的物理意义。'
  },
  {
    title: '科学数据处理脚本',
    prompt: '请写一段使用 Python 和 Astropy 库读取 FITS 天文图像并绘制平滑天体射电轮廓图的示例代码。'
  },
  {
    title: '学术摘要中英润色',
    prompt: '请将以下中文段落润色为符合 MNRAS 或 ApJ 期刊风格的严谨英文学术摘要：\n'
  }
]

// 计算当前提供商信息
const currentProviderInfo = computed(() => {
  return PRESET_PROVIDERS.find(p => p.id === config.provider) || PRESET_PROVIDERS[0]
})

// 当前激活的模型配置
const activeModel = computed(() => {
  if (!Array.isArray(config.models) || config.models.length === 0) {
    return {
      id: config.model || 'deepseek-chat',
      name: config.model || 'DeepSeek-V3',
      contextWindow: 64000,
      supportsReasoningEffort: false,
      reasoningEffort: 'off'
    }
  }
  const found = config.models.find(m => m.id === config.model)
  return found || config.models[0]
})

// 连通性测试通过状态（响应式引用）
const connectivityPassed = ref(isAiConnectivityPassed())

// 是否已保存配置（响应式引用，确保与 localStorage 变更同步并触发即时响应式重新计算）
const hasSavedConfig = ref(Boolean(localStorage.getItem(AI_STORAGE_KEY)))

// 是否已配置就绪（必须在本地保存有配置，且必须通过连通性测试；配置成功前严禁开启对话）
const isConfigured = computed(() => {
  if (!hasSavedConfig.value) return false
  if (config.provider !== 'ollama') {
    if (!config.apiKey || !config.apiKey.trim()) return false
  }
  if (!config.baseUrl || !config.baseUrl.trim()) return false
  return Boolean(connectivityPassed.value)
})

const route = useRoute()
const router = useRouter()

async function fetchPaperContentForSession(session, cleanId, fallbackMeta = {}) {
  try {
    session.paperContext.status = 'loading'
    const result = await fetchArxivPaperFulltext(cleanId)
    if (result.ok && result.fullText) {
      session.paperContext.fullText = result.fullText
      session.paperContext.wordCount = result.wordCount || result.fullText.length
      if (result.title) session.paperContext.title = result.title
      if (result.authors) session.paperContext.authors = result.authors
      if (result.abstract) session.paperContext.abstract = result.abstract
      session.paperContext.status = 'ready'

      if (session.messages && session.messages.length > 0 && session.messages[0].role === 'assistant') {
        session.messages[0].content = `论文 **《${session.paperContext.title}》**（arXiv: \`${cleanId}\`）的 HTML 全文已解析完成并注入为专属长期记忆（正文约 ${(session.paperContext.wordCount || 0).toLocaleString()} 字符）。\n\n您可以随时向我提问：\n- **核心内容与创新点**：如“请用中文详细阐述这篇文章的主要贡献与创新点”\n- **全文或指定段落翻译**：如“请翻译第 3 节的内容”、“翻译引言”\n- **公式推导与实验细节**：如“解释文中的主要公式和物理意义”\n- **对比与局限性**：如“本文方法相较于前人工作有何突破与不足”`
      }
    } else {
      const is404 = result.error && result.error.includes('404')
      session.paperContext.status = is404 ? 'fallback' : 'error'
      session.paperContext.fullText = fallbackMeta.abstract ? `Abstract:\n${fallbackMeta.abstract}` : ''
      session.paperContext.wordCount = session.paperContext.fullText.length

      if (session.messages && session.messages.length > 0 && session.messages[0].role === 'assistant') {
        const reason = is404
          ? '该论文在 arXiv 官方尚未提供 HTML 网页版本（通常见于早期论文）'
          : (result.error || '获取 HTML 网页遇到异常')
        session.messages[0].content = `论文 **《${session.paperContext.title || fallbackMeta.title || cleanId}》**（arXiv: \`${cleanId}\`）HTML 全文拉取提示：${reason}。\n\n系统已自动将论文元数据及摘要作为基础背景记忆。您依然可以随时针对该论文的背景、研究主题或您粘贴的具体段落向我提问或进行翻译。`
      }
    }
  } catch (err) {
    session.paperContext.status = 'error'
    session.paperContext.fullText = fallbackMeta.abstract ? `Abstract:\n${fallbackMeta.abstract}` : ''
    session.paperContext.wordCount = session.paperContext.fullText.length

    if (session.messages && session.messages.length > 0 && session.messages[0].role === 'assistant') {
      session.messages[0].content = `论文 **《${session.paperContext.title || fallbackMeta.title || cleanId}》**（arXiv: \`${cleanId}\`）HTML 全文拉取遇到网络波动。\n\n系统已自动切换至摘要背景记忆，您可以继续在此提问或粘贴感兴趣的论文段落进行深入探讨。`
    }
  } finally {
    session.updatedAt = Date.now()
    saveAiSessions(sessions.value)
    if (!isDeactivated.value) {
      nextTick(() => {
        scrollToBottom(false)
        enhanceCodeBlocks()
      })
    }
  }
}

function retryFetchPaperContent() {
  if (!currentSession.value || !currentSession.value.paperContext) return
  const pCtx = currentSession.value.paperContext
  fetchPaperContentForSession(currentSession.value, pCtx.arxivId, {
    title: pCtx.title,
    authors: pCtx.authors,
    abstract: pCtx.abstract
  })
}

async function handleRouteDiscussArxiv(rawArxivId) {
  if (!rawArxivId) return
  const cleanId = cleanArxivId(rawArxivId)
  if (!cleanId) return

  if (isStreaming.value) {
    handleStopGeneration()
  }

  let paperInfo = null
  try {
    const raw = sessionStorage.getItem('labhub_pending_discuss_paper')
    if (raw) {
      paperInfo = JSON.parse(raw)
      sessionStorage.removeItem('labhub_pending_discuss_paper')
    }
  } catch (_) {}

  const title = paperInfo?.title || `arXiv: ${cleanId}`
  const authors = paperInfo?.authors || ''
  const abstract = paperInfo?.abstract || ''

  let targetSession = sessions.value.find(s => s.paperContext?.arxivId === cleanId)

  if (!targetSession) {
    const sessionTitle = `研读: ${cleanId}`
    targetSession = createDefaultSession(sessionTitle, {
      paperContext: {
        arxivId: cleanId,
        title,
        authors,
        abstract,
        htmlUrl: getArxivHtmlUrl(cleanId),
        status: 'loading',
        fullText: '',
        wordCount: 0
      }
    })

    targetSession.messages.push({
      role: 'assistant',
      content: `已为您开启针对论文 **《${title}》**（arXiv: \`${cleanId}\`）的研讨专属对话。\n\n正在通过 arXiv 官方 HTML 服务（[${getArxivHtmlUrl(cleanId)}](${getArxivHtmlUrl(cleanId)})）获取文章完整源码与正文解析，作为本次对话的专属长期记忆基准...`,
      reasoning: '',
      reasoningOpen: false,
      timestamp: Date.now()
    })

    sessions.value.unshift(targetSession)
    activeSessionId.value = targetSession.id
    saveActiveSessionId(targetSession.id)
    saveAiSessions(sessions.value)

    fetchPaperContentForSession(targetSession, cleanId, { title, authors, abstract })
  } else {
    activeSessionId.value = targetSession.id
    saveActiveSessionId(targetSession.id)
  }

  if (route.query.discussArxiv) {
    router.replace({ path: route.path, query: {} })
  }
}

watch(
  () => route.query.discussArxiv,
  (newVal) => {
    if (newVal) {
      handleRouteDiscussArxiv(newVal)
    }
  }
)

function handleVisibilityChange() {
  if (typeof document !== 'undefined' && !document.hidden && !isDeactivated.value) {
    nextTick(() => {
      scrollToBottom(false)
      enhanceCodeBlocks()
    })
  }
}

function syncConnectivityState() {
  connectivityPassed.value = isAiConnectivityPassed()
  hasSavedConfig.value = Boolean(localStorage.getItem(AI_STORAGE_KEY))
}

// 初始化检查配置
onMounted(() => {
  connectivityPassed.value = isAiConnectivityPassed()
  hasSavedConfig.value = Boolean(localStorage.getItem(AI_STORAGE_KEY))
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', syncConnectivityState)
    window.addEventListener('focus', syncConnectivityState)
    window.addEventListener('labhub-ai-config-changed', syncConnectivityState)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
  if (route.query.discussArxiv) {
    handleRouteDiscussArxiv(route.query.discussArxiv)
  }
  if (Array.isArray(config.models)) {
    // 默认设置推理深度为 off 以提供快速响应
    let hasUpdated = false
    config.models.forEach(m => {
      if (!m.reasoningEffort || m.reasoningEffort === 'high') {
        m.reasoningEffort = 'off'
        hasUpdated = true
      }
    })
    if (hasUpdated && localStorage.getItem(AI_STORAGE_KEY)) {
      saveAiConfig(config)
    }
  }
  if (!isConfigured.value && !showTutorial.value) {
    showConfigModal.value = true
  }
  nextTick(() => {
    scrollToBottom(false)
    enhanceCodeBlocks()
  })
})

onActivated(() => {
  isDeactivated.value = false
  if (showTutorial.value) {
    showConfigModal.value = false
  }
  connectivityPassed.value = isAiConnectivityPassed()
  hasSavedConfig.value = Boolean(localStorage.getItem(AI_STORAGE_KEY))
  if (route.query.discussArxiv) {
    handleRouteDiscussArxiv(route.query.discussArxiv)
  }
  nextTick(() => {
    scrollToBottom(false)
    enhanceCodeBlocks()
  })
})

onDeactivated(() => {
  isDeactivated.value = true
  if (streamRafId) {
    cancelAnimationFrame(streamRafId)
    streamRafId = null
  }
  saveAiSessions(sessions.value)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('storage', syncConnectivityState)
    window.removeEventListener('focus', syncConnectivityState)
    window.removeEventListener('labhub-ai-config-changed', syncConnectivityState)
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
  if (streamRafId) {
    cancelAnimationFrame(streamRafId)
    streamRafId = null
  }
  isAiGeneratingGlobally.value = false
})

// 监听会话列表变化并持久化至本地存储
watch(
  sessions,
  (newSessions) => {
    saveAiSessions(newSessions)
    nextTick(() => {
      enhanceCodeBlocks()
    })
  },
  { deep: true }
)

// 用户主动上滑阅读标记
const isUserScrolledUp = ref(false)

function handleContainerScroll() {
  const el = chatContainerRef.value
  if (!el) return
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  // 若距离底部超过 80px，说明用户正主动上滑回看或精读上方内容
  if (distanceToBottom > 80) {
    isUserScrolledUp.value = true
  } else if (distanceToBottom < 30) {
    // 重新滑至接近底部（30px 以内），自动恢复吸底跟随
    isUserScrolledUp.value = false
  }
}

// 滚动到底部（默认若用户处于主动上滑阅读状态，则跳过滚动，保障阅读不被打断）
function scrollToBottom(smooth = true, force = false) {
  if (!chatContainerRef.value) return
  if (!force && isUserScrolledUp.value) return
  chatContainerRef.value.scrollTo({
    top: chatContainerRef.value.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  })
}

// 用户点击「回到底部」快捷按钮
function jumpToBottom() {
  isUserScrolledUp.value = false
  scrollToBottom(true, true)
}

// 自动调整输入框高度
function adjustTextareaHeight() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const nextHeight = Math.min(el.scrollHeight, 220)
  el.style.height = `${Math.max(nextHeight, 52)}px`
}

// 为渲染后的代码块挂载复制按钮
function enhanceCodeBlocks() {
  if (!chatContainerRef.value) return
  const preElements = chatContainerRef.value.querySelectorAll('pre:not(.has-copy-btn)')
  preElements.forEach((pre) => {
    pre.classList.add('has-copy-btn')
    const copyBtn = document.createElement('button')
    copyBtn.type = 'button'
    copyBtn.className = 'code-copy-btn'
    copyBtn.innerText = '复制代码'
    copyBtn.setAttribute('aria-label', '复制代码到剪贴板')
    copyBtn.onclick = (e) => {
      e.stopPropagation()
      const codeEl = pre.querySelector('code')
      const text = codeEl ? codeEl.innerText : pre.innerText
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerText = '已复制'
        copyBtn.classList.add('is-copied')
        setTimeout(() => {
          copyBtn.innerText = '复制代码'
          copyBtn.classList.remove('is-copied')
        }, 2000)
      })
    }
    pre.appendChild(copyBtn)
  })
}

// 选择预设服务商联动
function handleProviderChange(providerId) {
  config.provider = providerId
  const found = PRESET_PROVIDERS.find(p => p.id === providerId)
  if (found) {
    if (found.baseUrl) config.baseUrl = found.baseUrl
    if (Array.isArray(found.models) && found.models.length > 0) {
      config.models = JSON.parse(JSON.stringify(found.models))
      config.model = found.defaultModel || found.models[0].id
    }
  }
  testResult.value = null
}

// 切换当前使用的模型
function handleSelectModel(modelId) {
  config.model = modelId
  saveAiConfig(config)
}

// 切换推理档位 (off / low / high / max)
function setReasoningEffort(level) {
  if (activeModel.value) {
    activeModel.value.reasoningEffort = level
    saveAiConfig(config)
    notify(`推理档位已调整为: ${level}`, 'info')
  }
}

// 模型管理：添加新模型
function addCustomModel() {
  if (!Array.isArray(config.models)) {
    config.models = []
  }
  const newModel = {
    id: `custom-model-${config.models.length + 1}`,
    name: '新建自定义模型',
    contextWindow: 1000000,
    supportsReasoningEffort: false,
    supportsVision: false,
    reasoningEffort: 'off'
  }
  config.models.push(newModel)
  config.model = newModel.id
}

// 模型管理：删除模型
function removeCustomModel(index) {
  if (config.models.length <= 1) {
    notify('请至少保留一个可用模型。', 'error')
    return
  }
  const removed = config.models.splice(index, 1)[0]
  if (config.model === removed.id) {
    config.model = config.models[0].id
  }
}

// 保存配置
function handleSaveConfig() {
  if (config.provider !== 'ollama' && !config.apiKey.trim()) {
    notify('请填写有效的 API Key 后再保存。', 'error')
    return
  }
  if (!config.baseUrl.trim()) {
    notify('请填写 Base URL 地址。', 'error')
    return
  }
  if (!config.models || config.models.length === 0) {
    notify('请至少配置一个模型。', 'error')
    return
  }
  if (!config.model) {
    config.model = config.models[0].id
  }

  const prevConfig = loadAiConfig()
  const credentialsChanged = prevConfig.provider !== config.provider ||
    prevConfig.baseUrl !== config.baseUrl ||
    prevConfig.apiKey !== config.apiKey

  const success = saveAiConfig(config)
  if (success) {
    hasSavedConfig.value = true
    if (testResult.value && testResult.value.ok) {
      setAiConnectivityPassed(true)
      connectivityPassed.value = true
    } else if (credentialsChanged || !isAiConnectivityPassed()) {
      setAiConnectivityPassed(false)
      connectivityPassed.value = false
    } else {
      connectivityPassed.value = isAiConnectivityPassed()
    }
    notify('大模型配置已保存。', 'success')
    showConfigModal.value = false
    testResult.value = null
    nextTick(() => {
      if (isConfigured.value && textareaRef.value && typeof textareaRef.value.focus === 'function') {
        textareaRef.value.focus()
      }
    })
  } else {
    notify('保存配置时发生错误，请重试。', 'error')
  }
}

// 模态弹窗遮罩层交互控制（防止用户拖拽选中文本滑出弹窗边界时误触发关闭）
let isConfigBackdropMouseDown = false

function handleConfigOverlayMouseDown(event) {
  isConfigBackdropMouseDown = (event.target === event.currentTarget)
}

function handleConfigOverlayMouseUp(event) {
  if (event.target !== event.currentTarget) {
    isConfigBackdropMouseDown = false
  }
}

function handleConfigOverlayClick(event) {
  // 只有在遮罩层上同时完成按下与释放，才视为主动点击遮罩关闭弹窗
  if (isConfigBackdropMouseDown && event.target === event.currentTarget) {
    showConfigModal.value = false
  }
  isConfigBackdropMouseDown = false
}

let isImageLightboxMouseDown = false

function handleImageLightboxMouseDown(event) {
  isImageLightboxMouseDown = (event.target === event.currentTarget)
}

function handleImageLightboxMouseUp(event) {
  if (event.target !== event.currentTarget) {
    isImageLightboxMouseDown = false
  }
}

function handleImageLightboxClick(event) {
  if (isImageLightboxMouseDown && event.target === event.currentTarget) {
    previewImageModal.value = null
  }
  isImageLightboxMouseDown = false
}

// 测试连通性
async function handleTestConnection() {
  testingConnection.value = true
  testResult.value = null
  try {
    const res = await testAiConnection(config)
    testResult.value = res
    if (res.ok) {
      setAiConnectivityPassed(true)
      connectivityPassed.value = true
      // 测试通过后，自动将已验证的配置持久化至本地存储，并同步响应式就绪状态
      saveAiConfig(config)
      hasSavedConfig.value = true
    } else {
      setAiConnectivityPassed(false)
      connectivityPassed.value = false
    }
  } finally {
    testingConnection.value = false
  }
}

// 处理图片文件
function processImageFile(file) {
  if (!file.type.startsWith('image/')) {
    notify('仅支持上传图片格式文件。', 'error')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    notify('单张图片大小不能超过 10MB。', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    pendingImages.value.push({
      id: Date.now() + Math.random().toString(36).substring(2, 7),
      url: e.target.result,
      name: file.name
    })
    nextTick(() => {
      adjustTextareaHeight()
    })
  }
  reader.readAsDataURL(file)
}

// 文件选择上传
function triggerFileUpload() {
  fileInputRef.value?.click()
}

function handleFileInputChange(e) {
  const files = e.target.files
  if (!files || files.length === 0) return
  for (let i = 0; i < files.length; i++) {
    processImageFile(files[i])
  }
  e.target.value = ''
}

// 剪贴板粘贴图片 (Ctrl+V / Cmd+V)
function handlePaste(e) {
  const clipboardData = e.clipboardData || window.clipboardData
  if (!clipboardData) return
  const items = clipboardData.items
  if (!items) return

  let hasImage = false
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.indexOf('image') !== -1) {
      hasImage = true
      const file = item.getAsFile()
      if (file) {
        processImageFile(file)
      }
    }
  }
  if (hasImage) {
    notify('已成功粘贴剪贴板图片。', 'info')
  }
}

// 拖拽上传图片
function handleDrop(e) {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  for (let i = 0; i < files.length; i++) {
    processImageFile(files[i])
  }
}

function removePendingImage(index) {
  pendingImages.value.splice(index, 1)
  nextTick(() => {
    adjustTextareaHeight()
  })
}

// 采用快捷提问
function usePromptSuggestion(prompt) {
  if (!isConfigured.value) {
    notify('请先完成大模型配置并在设置中「测试连通性」通过后再开启对话。', 'warning')
    showConfigModal.value = true
    return
  }
  inputContent.value = prompt
  nextTick(() => {
    adjustTextareaHeight()
    sendMessage()
  })
}

// 发送消息
async function sendMessage() {
  const text = inputContent.value.trim()
  const imagesToSend = pendingImages.value.map(img => img.url)

  if ((!text && imagesToSend.length === 0) || isStreaming.value) return

  if (!isConfigured.value) {
    notify('请先完成大模型配置并在设置中「测试连通性」通过后再开启对话。', 'warning')
    showConfigModal.value = true
    return
  }

  // 追加用户提问
  messages.value.push({
    role: 'user',
    content: text,
    images: imagesToSend,
    timestamp: Date.now()
  })

  // 若会话标题仍为默认 "新对话"，且这是第一条提问，根据输入内容自动命名会话
  if (currentSession.value) {
    if (currentSession.value.title === '新对话' || currentSession.value.messages.length <= 1) {
      const summary = (text || '图片分析').trim().slice(0, 18)
      if (summary) {
        currentSession.value.title = summary + ((text || '').trim().length > 18 ? '...' : '')
      }
    }
    currentSession.value.updatedAt = Date.now()
  }

  // 清空输入框与待发图片
  inputContent.value = ''
  pendingImages.value = []
  adjustTextareaHeight()

  // 准备助手消息占位
  const assistantMsgIndex = messages.value.length
  messages.value.push({
    role: 'assistant',
    content: '',
    reasoning: '',
    reasoningOpen: true,
    timestamp: Date.now()
  })

  isStreaming.value = true
  streamingIndex.value = assistantMsgIndex
  currentResponse.value = ''
  currentReasoning.value = ''
  abortController = new AbortController()

  isUserScrolledUp.value = false
  nextTick(() => {
    scrollToBottom(false, true)
  })

  // 流式高频缓冲与调度渲染，避免每次 chunk 同步触发 Markdown/KaTeX 解析及平滑滚动动画引擎冲突
  let pendingContent = ''
  let pendingReasoning = ''
  let lastScrollTime = 0
  let lastSaveTime = Date.now()

  function flushStreamToUI() {
    streamRafId = null
    const targetMsg = messages.value[assistantMsgIndex]
    if (!targetMsg) return

    let updated = false
    if (targetMsg.content !== pendingContent) {
      targetMsg.content = pendingContent
      currentResponse.value = pendingContent
      updated = true
    }
    if (targetMsg.reasoning !== pendingReasoning) {
      targetMsg.reasoning = pendingReasoning
      currentReasoning.value = pendingReasoning
      updated = true
    }

    if (updated && !isDeactivated.value && typeof document !== 'undefined' && !document.hidden) {
      const now = performance.now()
      // 节流滚动频次（约 25fps），并使用 auto 避免与浏览器平滑滚动动画引擎竞争冲突
      if (now - lastScrollTime > 40) {
        scrollToBottom(false)
        lastScrollTime = now
      }
    }
  }

  function scheduleStreamUpdate() {
    // 当处于后台页面或隐藏标签页时，rAF 会被浏览器挂起，此处立即同步状态保证后台输出不中断
    if (isDeactivated.value || (typeof document !== 'undefined' && document.hidden)) {
      flushStreamToUI()
      return
    }
    if (!streamRafId) {
      streamRafId = requestAnimationFrame(flushStreamToUI)
    }
  }

  function maybeAutoSaveStream() {
    const now = Date.now()
    if (now - lastSaveTime > 1500) {
      saveAiSessions(sessions.value)
      lastSaveTime = now
    }
  }

  try {
    await sendChatMessageStream({
      config,
      messages: messages.value.slice(0, assistantMsgIndex),
      activeModel: activeModel.value,
      paperContext: currentSession.value?.paperContext || null,
      onChunk: (chunk) => {
        pendingContent += chunk
        scheduleStreamUpdate()
        maybeAutoSaveStream()
      },
      onReasoningChunk: (reasoningChunk) => {
        pendingReasoning += reasoningChunk
        scheduleStreamUpdate()
        maybeAutoSaveStream()
      },
      onDone: () => {
        if (streamRafId) {
          cancelAnimationFrame(streamRafId)
          streamRafId = null
        }
        if (messages.value[assistantMsgIndex]) {
          messages.value[assistantMsgIndex].content = pendingContent
          messages.value[assistantMsgIndex].reasoning = pendingReasoning
        }
        currentResponse.value = pendingContent
        currentReasoning.value = pendingReasoning
        isStreaming.value = false
        streamingIndex.value = -1
        abortController = null
        saveAiSessions(sessions.value)
        if (!isDeactivated.value) {
          nextTick(() => {
            scrollToBottom(false)
            enhanceCodeBlocks()
          })
        }
      },
      onError: (err) => {
        if (streamRafId) {
          cancelAnimationFrame(streamRafId)
          streamRafId = null
        }
        if (messages.value[assistantMsgIndex]) {
          messages.value[assistantMsgIndex].content = pendingContent
          messages.value[assistantMsgIndex].reasoning = pendingReasoning
        }
        currentResponse.value = pendingContent
        currentReasoning.value = pendingReasoning
        isStreaming.value = false
        streamingIndex.value = -1
        abortController = null
        const errNotice = `\n\n> 发生错误: ${err.message}`
        if (messages.value[assistantMsgIndex]) {
          messages.value[assistantMsgIndex].content += errNotice
        }
        saveAiSessions(sessions.value)
        notify(err.message, 'error')
        if (!isDeactivated.value) {
          nextTick(() => {
            scrollToBottom(false)
            enhanceCodeBlocks()
          })
        }
      },
      signal: abortController.signal
    })
  } catch (e) {
    if (streamRafId) {
      cancelAnimationFrame(streamRafId)
      streamRafId = null
    }
    isStreaming.value = false
    streamingIndex.value = -1
    abortController = null
    saveAiSessions(sessions.value)
  }
}

// 停止生成
function handleStopGeneration() {
  if (streamRafId) {
    cancelAnimationFrame(streamRafId)
    streamRafId = null
  }
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  isStreaming.value = false
  streamingIndex.value = -1
  notify('已停止生成。', 'info')
}

// 键盘事件处理：Enter 发送，Shift+Enter 换行
function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// 新建对话
function handleCreateNewSession() {
  if (isStreaming.value) {
    notify('当前正在生成回答，请稍候或先停止生成。', 'warning')
    return
  }
  // 若当前会话已是空会话，直接保留并聚焦输入框
  if (currentSession.value && currentSession.value.messages.length === 0) {
    notify('当前已处于新对话中。', 'info')
    if (textareaRef.value) {
      textareaRef.value.focus()
    }
    return
  }
  const newSession = createDefaultSession('新对话')
  sessions.value.unshift(newSession)
  activeSessionId.value = newSession.id
  saveActiveSessionId(newSession.id)
  inputContent.value = ''
  pendingImages.value = []
  isUserScrolledUp.value = false
  nextTick(() => {
    scrollToBottom(false, true)
    if (textareaRef.value) {
      textareaRef.value.focus()
    }
  })
}

// 切换会话
function handleSwitchSession(sessionId) {
  if (sessionId === activeSessionId.value) return
  if (isStreaming.value) {
    notify('当前对话正在生成中，请先停止生成后再切换。', 'warning')
    return
  }
  activeSessionId.value = sessionId
  saveActiveSessionId(sessionId)
  editingSessionId.value = ''
  isUserScrolledUp.value = false
  nextTick(() => {
    scrollToBottom(false, true)
    enhanceCodeBlocks()
  })
}

// 删除指定会话
async function handleDeleteSession(sessionId) {
  if (isStreaming.value && sessionId === activeSessionId.value) {
    notify('当前会话正在生成中，无法删除。', 'warning')
    return
  }
  const target = sessions.value.find(s => s.id === sessionId)
  const title = target?.title || '此对话'
  const confirmed = await confirmAction(`确定要删除对话“${title}”吗？删除后将无法恢复。`, {
    title: '删除对话',
    confirmLabel: '删除',
    danger: true
  })
  if (!confirmed) return

  const idx = sessions.value.findIndex(s => s.id === sessionId)
  if (idx !== -1) {
    sessions.value.splice(idx, 1)
  }

  // 若清空了所有会话，自动生成一个初始空会话
  if (sessions.value.length === 0) {
    const freshSession = createDefaultSession()
    sessions.value.push(freshSession)
    activeSessionId.value = freshSession.id
    saveActiveSessionId(freshSession.id)
  } else if (activeSessionId.value === sessionId) {
    // 切换到相邻会话
    const nextSession = sessions.value[idx] || sessions.value[idx - 1] || sessions.value[0]
    activeSessionId.value = nextSession.id
    saveActiveSessionId(nextSession.id)
  }
  notify('对话已删除。', 'success')
}

// 开始重命名
function startRename(session) {
  editingSessionId.value = session.id
  editingSessionTitle.value = session.title
  nextTick(() => {
    if (renameInputRef.value) {
      if (Array.isArray(renameInputRef.value)) {
        renameInputRef.value[0]?.focus()
        renameInputRef.value[0]?.select()
      } else {
        renameInputRef.value.focus()
        renameInputRef.value.select()
      }
    }
  })
}

// 保存重命名
function saveRename(sessionId) {
  if (!editingSessionId.value) return
  const target = sessions.value.find(s => s.id === sessionId)
  if (target) {
    const trimmed = editingSessionTitle.value.trim()
    if (trimmed) {
      target.title = trimmed
      target.updatedAt = Date.now()
    }
  }
  editingSessionId.value = ''
  editingSessionTitle.value = ''
}

// 取消重命名
function cancelRename() {
  editingSessionId.value = ''
  editingSessionTitle.value = ''
}

// 清空所有历史对话
async function handleClearAllSessions() {
  const confirmed = await confirmAction('确定要清空所有历史对话记录吗？所有会话将被永久删除。', {
    title: '清空所有对话',
    confirmLabel: '全部清空',
    danger: true
  })
  if (!confirmed) return
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  isStreaming.value = false
  streamingIndex.value = -1

  clearAllAiSessions()
  const fresh = createDefaultSession()
  sessions.value = [fresh]
  activeSessionId.value = fresh.id
  saveActiveSessionId(fresh.id)
  notify('所有对话记录已清空。', 'success')
}

// 格式化会话相对时间
function formatSessionTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}

// 清空当前对话
async function handleClearChat() {
  if (messages.value.length === 0) return
  const confirmed = await confirmAction('确定要清空当前对话的消息记录吗？清空后将无法恢复。', {
    title: '清空当前对话',
    confirmLabel: '清空',
    danger: true
  })
  if (confirmed && currentSession.value) {
    currentSession.value.messages = []
    currentSession.value.updatedAt = Date.now()
    notify('当前对话记录已清空。', 'success')
  }
}
</script>

<template>
  <div class="assistant-page workspace">
    <!-- 核心左侧侧边栏：多轮历史对话管理 -->
    <aside class="assistant-sidebar glass-card" :class="{ 'is-collapsed': isSidebarCollapsed }">
      <div class="sidebar-top">
        <button
          type="button"
          class="new-chat-btn"
          title="新建对话"
          @click="handleCreateNewSession"
        >
          <AppIcon name="plus" :size="16" />
          <span v-if="!isSidebarCollapsed">新建对话</span>
        </button>
        <button
          type="button"
          class="sidebar-toggle-btn"
          :title="isSidebarCollapsed ? '展开历史对话' : '收起历史对话'"
          @click="toggleSidebar"
        >
          <AppIcon :name="isSidebarCollapsed ? 'right' : 'left'" :size="14" />
        </button>
      </div>

      <!-- 会话历史列表 -->
      <div v-if="!isSidebarCollapsed" class="sidebar-session-list custom-scrollbar">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="session-item"
          :class="{ 'is-active': session.id === activeSessionId }"
          @click="handleSwitchSession(session.id)"
        >
          <div class="session-lead-icon" :class="{ 'is-paper': Boolean(session.paperContext) }">
            <AppIcon :name="session.paperContext ? 'article' : 'chat'" :size="15" />
          </div>
          <div class="session-main">
            <!-- 编辑标题模式 -->
            <div v-if="editingSessionId === session.id" class="session-rename-box" @click.stop>
              <input
                ref="renameInputRef"
                v-model="editingSessionTitle"
                class="session-rename-input"
                maxlength="50"
                @keydown.enter="saveRename(session.id)"
                @keydown.esc="cancelRename"
                @blur="saveRename(session.id)"
              />
            </div>
            <!-- 正常展示模式 -->
            <template v-else>
              <span class="session-title-text" :title="session.title">{{ session.title }}</span>
              <span class="session-meta-text">
                <span v-if="session.paperContext" class="session-arxiv-tag">arXiv</span>
                {{ formatSessionTime(session.updatedAt) }} · {{ session.messages ? session.messages.length : 0 }}条
              </span>
            </template>
          </div>

          <!-- 悬浮操作菜单 -->
          <div v-if="editingSessionId !== session.id" class="session-actions-overlay" @click.stop>
            <button
              type="button"
              class="session-action-btn"
              title="重命名对话"
              @click="startRename(session)"
            >
              <AppIcon name="edit" :size="13" />
            </button>
            <button
              type="button"
              class="session-action-btn danger"
              title="删除对话"
              @click="handleDeleteSession(session.id)"
            >
              <AppIcon name="trash" :size="13" />
            </button>
          </div>
        </div>
      </div>

      <!-- 侧边栏底部操作区 -->
      <div v-if="!isSidebarCollapsed" class="sidebar-bottom-bar">
        <button
          type="button"
          class="clear-all-sessions-btn"
          title="清空所有历史对话记录"
          @click="handleClearAllSessions"
        >
          <AppIcon name="trash" :size="13" />
          <span>清空所有记录</span>
        </button>
      </div>
    </aside>

    <!-- 右侧主对话视口区域 -->
    <section class="assistant-main-pane">
      <!-- 顶部卡片栏：模型切换与控制操作 -->
      <header class="assistant-header glass-card">
        <div class="header-left">
          <button
            v-if="isSidebarCollapsed"
            type="button"
            class="sidebar-expand-header-btn"
            title="展开历史对话"
            aria-label="展开历史对话"
            @click="toggleSidebar"
          >
            <AppIcon name="list" :size="16" />
            <span class="expand-header-label">展开侧栏</span>
          </button>
        <div class="assistant-avatar-badge">
          <AppIcon name="robot" :size="24" class="robot-icon" />
        </div>
        <div class="assistant-meta">
          <div class="meta-title-row">
            <h1 class="assistant-title">AI 科研助手</h1>

            <!-- 核心功能：模型切换下拉选择器 -->
            <div class="model-select-wrapper">
              <span class="status-dot"></span>
              <select
                :value="config.model"
                class="model-select-dropdown"
                @change="handleSelectModel($event.target.value)"
                title="点击切换当前模型"
              >
                <option
                  v-for="m in config.models"
                  :key="m.id"
                  :value="m.id"
                >
                  {{ m.name || m.id }}
                </option>
              </select>
              <AppIcon name="down" :size="12" class="select-arrow" />
            </div>

            <!-- 核心功能：推理档位调节器 (off / low / high / max) -->
            <div
              v-if="activeModel?.supportsReasoningEffort"
              class="reasoning-effort-widget"
              title="调节当前模型的推理思考深度 (reasoningEffort)"
            >
              <span class="effort-caption">推理深度:</span>
              <div class="effort-button-group">
                <button
                  v-for="lvl in ['off', 'low', 'high', 'max']"
                  :key="lvl"
                  type="button"
                  class="effort-btn"
                  :class="{ 'is-active': (activeModel.reasoningEffort || 'off') === lvl }"
                  @click="setReasoningEffort(lvl)"
                >
                  {{ lvl }}
                </button>
              </div>
            </div>
          </div>

          <p class="meta-desc">
            平台: {{ currentProviderInfo?.name }} · 上下文限制: {{ (activeModel?.contextWindow || 1000000).toLocaleString() }} Tokens · 支持图片多模态与公式推导
          </p>
        </div>
      </div>

      <div class="header-actions">
        <button
          v-if="messages.length > 0"
          type="button"
          class="button secondary small"
          @click="handleClearChat"
          :disabled="isStreaming"
          title="清空当前对话"
        >
          <AppIcon name="trash" :size="16" />
          <span>清空对话</span>
        </button>

        <button
          type="button"
          class="button primary small"
          @click="showConfigModal = true"
          title="配置大模型服务商与模型列表"
        >
          <AppIcon name="gear" :size="16" />
          <span>模型配置</span>
        </button>
      </div>
    </header>

    <!-- 聊天交互主容器 -->
    <main class="chat-viewport glass-card">
      <!-- 研讨论文专属长期记忆基准横幅 -->
      <div v-if="currentSession?.paperContext" class="session-paper-banner">
        <div class="banner-main-row">
          <div class="banner-lead-icon">
            <AppIcon name="article" :size="20" />
          </div>
          <div class="banner-info">
            <div class="banner-top-line">
              <span class="paper-arxiv-pill">arXiv: {{ currentSession.paperContext.arxivId }}</span>
              <a
                :href="`https://arxiv.org/abs/${currentSession.paperContext.arxivId}`"
                target="_blank"
                rel="noreferrer"
                class="banner-link-btn"
                title="打开 arXiv 官方摘要页面"
              >
                <span>官方摘要</span>
                <AppIcon name="arrow-up-right" :size="11" />
              </a>
              <a
                :href="`https://arxiv.org/html/${currentSession.paperContext.arxivId}`"
                target="_blank"
                rel="noreferrer"
                class="banner-link-btn"
                title="打开 arXiv 官方 HTML 网页"
              >
                <span>HTML 原文</span>
                <AppIcon name="arrow-up-right" :size="11" />
              </a>
            </div>
            <h3 class="banner-paper-title" :title="currentSession.paperContext.title">
              {{ currentSession.paperContext.title }}
            </h3>
            <div class="banner-meta-line">
              <span v-if="currentSession.paperContext.authors" class="banner-authors" :title="currentSession.paperContext.authors">
                {{ currentSession.paperContext.authors }}
              </span>
              <span v-if="currentSession.paperContext.authors" class="banner-sep">·</span>
              <span v-if="currentSession.paperContext.status === 'loading'" class="status-badge loading">
                <AppIcon name="undo" :size="12" class="spin-icon" />
                <span>正在抓取并解析 HTML 全文...</span>
              </span>
              <span v-else-if="currentSession.paperContext.status === 'ready'" class="status-badge ready">
                <AppIcon name="check" :size="12" />
                <span>HTML 全文基准已加载 (约 {{ (currentSession.paperContext.wordCount || 0).toLocaleString() }} 字符)</span>
              </span>
              <span v-else-if="currentSession.paperContext.status === 'fallback'" class="status-badge fallback">
                <AppIcon name="warning" :size="12" />
                <span>暂无官方 HTML，已自动转为摘要背景记忆</span>
              </span>
              <span v-else class="status-badge error">
                <AppIcon name="warning" :size="12" />
                <span>全文拉取异常，已降级为摘要记忆</span>
              </span>

              <button
                v-if="currentSession.paperContext.status === 'error' || currentSession.paperContext.status === 'fallback'"
                type="button"
                class="banner-retry-btn"
                title="重新尝试抓取 HTML 全文"
                @click="retryFetchPaperContent"
              >
                <AppIcon name="undo" :size="11" />
                <span>重试抓取</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 研讨快捷动作提示词标签 -->
        <div class="banner-quick-actions">
          <span class="quick-caption">快捷研讨:</span>
          <button
            type="button"
            class="quick-action-pill"
            @click="usePromptSuggestion('请结合论文全文，详细阐述本文的研究动机、核心创新点与主要结论。')"
          >
            创新点剖析
          </button>
          <button
            type="button"
            class="quick-action-pill"
            @click="usePromptSuggestion('请将这篇论文的主要章节内容高质量翻译为学术中文，保留专业物理术语与 LaTeX 数学公式。')"
          >
            学术翻译
          </button>
          <button
            type="button"
            class="quick-action-pill"
            @click="usePromptSuggestion('请系统梳理文中的关键物理公式和理论推导，并解释各参数物理意义。')"
          >
            物理公式推导
          </button>
          <button
            type="button"
            class="quick-action-pill"
            @click="usePromptSuggestion('请客观分析本文所使用的观测样本/数值模型假设，指出其局限性与未来研究方向。')"
          >
            模型局限性
          </button>
        </div>
      </div>

      <div ref="chatContainerRef" class="chat-messages-container" @scroll.passive="handleContainerScroll">
        <!-- 未配置时的首屏引导卡片 -->
        <div v-if="!isConfigured" class="unconfigured-banner">
          <div class="unconfigured-icon-wrap">
            <AppIcon name="robot" :size="38" />
          </div>
          <h3>开启大模型科研对话</h3>
          <p>
            当前尚未完成大模型配置或连通性测试。请点击下方按钮配置 API Key 及服务商（支持 DeepSeek、SiliconFlow、Ollama 等），测试连通成功后即可开启对话。
          </p>
          <div class="unconfigured-actions">
            <button type="button" class="button primary" @click="showConfigModal = true">
              <AppIcon name="gear" :size="18" />
              <span>立即配置大模型</span>
            </button>
          </div>
        </div>

        <!-- 历史消息为空时的建议问答卡片 -->
        <div v-else-if="messages.length === 0" class="welcome-guide">
          <div class="welcome-badge">
            <AppIcon name="sparkle" :size="28" />
          </div>
          <h2 class="welcome-title">您好，我是科研智能助理</h2>
          <p class="welcome-desc">
            当前就绪模型: <strong>{{ activeModel?.name || activeModel?.id }}</strong>。支持学术提问、LaTeX 物理公式推导、数值模拟代码编写与图文多模态分析。
          </p>

          <div class="prompt-grid">
            <div
              v-for="(item, idx) in promptSuggestions"
              :key="idx"
              class="prompt-card"
              @click="usePromptSuggestion(item.prompt)"
            >
              <div class="prompt-card-top">
                <span class="prompt-card-tag">{{ item.title }}</span>
                <AppIcon name="right" :size="14" class="prompt-arrow" />
              </div>
              <p class="prompt-card-text">{{ item.prompt }}</p>
            </div>
          </div>
        </div>

        <!-- 对话消息列表 -->
        <div v-else class="messages-thread">
          <div
            v-for="(msg, index) in messages"
            :key="index"
            class="message-row"
            :class="msg.role"
          >
            <!-- 角色头像 -->
            <div class="message-avatar-wrap">
              <div v-if="msg.role === 'assistant'" class="assistant-avatar">
                <AppIcon name="robot" :size="20" />
              </div>
              <UserAvatar v-else :user="currentUser || { nickname: '我' }" />
            </div>

            <!-- 消息主体 -->
            <div class="message-bubble-wrapper">
              <div class="message-role-label">
                {{ msg.role === 'assistant' ? (activeModel?.name || config.model || 'AI 助手') : (currentUser?.nickname || currentUser?.name || '您') }}
              </div>

              <!-- 用户消息中包含的图片展示 -->
              <div v-if="msg.images && msg.images.length > 0" class="message-images-grid">
                <img
                  v-for="(imgUrl, imgIdx) in msg.images"
                  :key="imgIdx"
                  :src="imgUrl"
                  alt="附带图片"
                  class="message-thumbnail"
                  @click="previewImageModal = imgUrl"
                />
              </div>

              <!-- 推理思维链折叠区域 (针对 DeepSeek-R1 / V4 推理模型) -->
              <details
                v-if="msg.reasoning"
                class="reasoning-disclosure"
                :open="msg.reasoningOpen !== false"
                @toggle="msg.reasoningOpen = $event.target.open"
              >
                <summary class="reasoning-summary">
                  <AppIcon name="sparkle" :size="14" />
                  <span>深度思考过程 (Reasoning)</span>
                  <span v-if="isStreaming && index === streamingIndex && !msg.content" class="thinking-pulse">思考中...</span>
                </summary>
                <div class="reasoning-content mono">
                  {{ msg.reasoning }}
                </div>
              </details>

              <!-- 正文内容渲染 -->
              <div
                v-if="msg.content"
                class="message-content markdown-body"
              >
                <div class="markdown-rendered-body" v-html="renderMarkdown(msg.content)"></div>
                <!-- 核心功能：若输出尚未完成，在消息末尾展示动态省略号指示器 -->
                <div
                  v-if="isStreaming && index === streamingIndex"
                  class="streaming-trailing-status"
                >
                  <span class="streaming-dynamic-ellipsis" title="生成中，请稍候">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                  </span>
                  <span class="streaming-status-hint">正在生成中...</span>
                </div>
              </div>

              <!-- 生成中尚未输出正文时的打字机占位指示 (包含思考完毕等待正文或初始等待) -->
              <div
                v-else-if="isStreaming && index === streamingIndex"
                class="streaming-typing"
              >
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="streaming-waiting-text">{{ msg.reasoning ? '思考完成，正在生成正文...' : '正在思考与响应中...' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部输入操作区域 -->
      <footer id="tour-assistant-workspace" class="chat-input-section">
        <!-- 停止生成控制条 -->
        <div v-if="isStreaming" class="stop-generating-wrap">
          <button type="button" class="button secondary small stop-btn" @click="handleStopGeneration">
            <AppIcon name="stop" :size="14" />
            <span>停止生成</span>
          </button>
        </div>

        <!-- 待发送图片缩略预览栏 -->
        <div v-if="pendingImages.length > 0" class="pending-images-bar">
          <div
            v-for="(img, imgIdx) in pendingImages"
            :key="img.id"
            class="pending-image-card"
          >
            <img :src="img.url" :alt="img.name" class="pending-thumb" />
            <button
              type="button"
              class="remove-image-btn"
              @click="removePendingImage(imgIdx)"
              title="移除此图片"
            >
              <AppIcon name="close" :size="12" />
            </button>
          </div>
        </div>

        <div class="input-composer">
          <!-- 隐藏的文件上传原生 input -->
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            multiple
            class="hidden-file-input"
            @change="handleFileInputChange"
          />

          <!-- 图片上传触发按钮 -->
          <button
            type="button"
            class="icon-button upload-image-btn"
            title="上传图片或截图 (支持直接按 Ctrl+V / Cmd+V 粘贴)"
            :disabled="!isConfigured || isStreaming"
            @click="triggerFileUpload"
          >
            <AppIcon name="image" :size="20" />
          </button>

          <textarea
            ref="textareaRef"
            v-model="inputContent"
            rows="1"
            class="chat-textarea"
            :placeholder="isConfigured ? '输入您的问题，支持粘贴 (Ctrl+V) 图片... (Enter 发送，Shift + Enter 换行)' : '请先完成大模型配置并在设置中「测试连通性」通过后再开启对话...'"
            :disabled="!isConfigured || isStreaming"
            @input="adjustTextareaHeight"
            @keydown="handleKeydown"
            @paste="handlePaste"
            @dragover.prevent
            @drop="handleDrop"
          ></textarea>

          <button
            type="button"
            class="button primary send-btn"
            :disabled="(!inputContent.trim() && pendingImages.length === 0) || !isConfigured || isStreaming"
            @click="sendMessage"
            title="发送消息"
          >
            <AppIcon name="send" :size="18" />
          </button>
        </div>

        <div class="composer-footnote">
          <span>内容由大模型生成，请结合专业学术文献与天文实际数据进行核验。</span>
        </div>
      </footer>

      <!-- 浮动「回到底部」快捷按钮 -->
      <Transition name="scroll-down-fade">
        <button
          v-if="isUserScrolledUp && messages.length > 0"
          type="button"
          class="scroll-to-bottom-btn"
          title="回到底部查看最新消息"
          @click="jumpToBottom"
        >
          <AppIcon name="down" :size="13" />
          <span>回到底部</span>
          <span v-if="isStreaming" class="streaming-dot-pulse" title="正在生成中"></span>
        </button>
      </Transition>
    </main>
    </section>

    <!-- 图片大图预览模态弹窗 (Lightbox) -->
    <div
      v-if="previewImageModal"
      class="image-lightbox-overlay"
      @mousedown="handleImageLightboxMouseDown"
      @mouseup="handleImageLightboxMouseUp"
      @click="handleImageLightboxClick"
    >
      <div class="image-lightbox-card" @click.stop @mousedown.stop>
        <button
          type="button"
          class="lightbox-close-btn"
          @click="previewImageModal = null"
          title="关闭大图预览"
        >
          <AppIcon name="close" :size="20" />
        </button>
        <img :src="previewImageModal" class="lightbox-img" alt="大图详情" />
      </div>
    </div>

    <!-- 大模型配置模态弹窗 -->
    <div
      v-if="showConfigModal"
      class="config-modal-overlay"
      @mousedown="handleConfigOverlayMouseDown"
      @mouseup="handleConfigOverlayMouseUp"
      @click="handleConfigOverlayClick"
    >
      <div class="config-modal-card glass-card" @mousedown.stop>
        <div class="modal-header">
          <div class="modal-title-wrap">
            <AppIcon name="gear" :size="20" class="modal-title-icon" />
            <h2>配置大模型服务</h2>
          </div>
          <button type="button" class="icon-button close-btn" @click="showConfigModal = false">
            <AppIcon name="close" :size="18" />
          </button>
        </div>

        <div class="modal-body">
          <!-- 提供商选择 -->
          <div class="form-group">
            <label class="form-label">选择模型服务商 (Provider)</label>
            <div class="provider-selector-grid">
              <button
                v-for="prov in PRESET_PROVIDERS"
                :key="prov.id"
                type="button"
                class="provider-pill-btn"
                :class="{
                  'is-selected': config.provider === prov.id
                }"
                @click="handleProviderChange(prov.id)"
              >
                {{ prov.name }}
              </button>
            </div>
            <p class="field-hint">{{ currentProviderInfo?.hint }}</p>
          </div>

          <!-- API Key: 当为 Ollama 时免输 -->
          <div v-if="config.provider !== 'ollama'" class="form-group">
            <label class="form-label">
              <span>API Key</span>
              <button type="button" class="text-toggle-btn" @click="showApiKey = !showApiKey">
                {{ showApiKey ? '隐藏明文' : '显示明文' }}
              </button>
            </label>
            <div class="input-with-action">
              <input
                :type="showApiKey ? 'text' : 'password'"
                v-model="config.apiKey"
                class="form-input mono"
                placeholder="例如: sk-..."
              />
            </div>
            <p class="field-hint">您的密钥仅保存在本地浏览器，绝不上传至任何集中服务器。</p>
          </div>

          <!-- Base URL -->
          <div class="form-group">
            <label class="form-label">API 接口地址 (Base URL)</label>
            <input
              type="text"
              v-model="config.baseUrl"
              class="form-input mono"
              placeholder="http://127.0.0.1:4000/v1"
            />
            <p class="field-hint">OpenAI 兼容接口基地址，通常以 /v1 结尾。</p>
          </div>

          <!-- 核心功能：模型管理列表 (多模型支持，包含名称、contextWindow、reasoningEffort) -->
          <div class="form-group">
            <div class="models-header-row">
              <label class="form-label">已配置模型列表 (Models)</label>
              <button type="button" class="text-add-btn" @click="addCustomModel">
                <AppIcon name="plus" :size="14" />
                <span>添加模型</span>
              </button>
            </div>

            <div class="models-table-list">
              <div
                v-for="(m, mIdx) in config.models"
                :key="m.id"
                class="model-item-card"
                :class="{ 'is-current-active': config.model === m.id }"
              >
                <div class="model-item-top">
                  <label class="model-radio-wrap" title="设为当前生效模型">
                    <input
                      type="radio"
                      name="activeModelRadio"
                      :value="m.id"
                      :checked="config.model === m.id"
                      @change="config.model = m.id"
                    />
                    <span class="model-radio-custom"></span>
                  </label>

                  <input
                    type="text"
                    v-model="m.name"
                    class="model-name-input"
                    placeholder="模型显示名称"
                    title="显示名称"
                  />

                  <button
                    v-if="config.models.length > 1"
                    type="button"
                    class="model-del-btn"
                    @click="removeCustomModel(mIdx)"
                    title="移除此模型"
                  >
                    <AppIcon name="trash" :size="14" />
                  </button>
                </div>

                <div class="model-item-details">
                  <div class="model-field-inline">
                    <span class="field-label-tiny">ID:</span>
                    <input
                      type="text"
                      v-model="m.id"
                      class="model-id-input mono"
                      placeholder="接口模型ID (如 deepseek-flash)"
                    />
                  </div>

                  <div class="model-field-inline">
                    <span class="field-label-tiny">上下文:</span>
                    <input
                      type="number"
                      v-model.number="m.contextWindow"
                      class="model-context-input mono"
                      placeholder="1000000"
                      title="contextWindow 上下文窗口限制"
                    />
                  </div>

                  <label class="reasoning-toggle-wrap">
                    <input
                      type="checkbox"
                      v-model="m.supportsReasoningEffort"
                      class="checkbox-input"
                    />
                    <span class="reasoning-toggle-label">支持深度推理 (reasoningEffort)</span>
                  </label>

                  <label class="reasoning-toggle-wrap vision-toggle-wrap">
                    <input
                      type="checkbox"
                      v-model="m.supportsVision"
                      class="checkbox-input"
                    />
                    <span class="reasoning-toggle-label">支持多模态视觉 (Vision / 识图)</span>
                  </label>
                </div>
              </div>
            </div>
            <p class="field-hint">可以在主界面随时切换上方已配置的模型；点选左侧单选框可设置初始生效模型。</p>
          </div>

          <!-- 系统提示词 (System Prompt) -->
          <div class="form-group">
            <label class="form-label">系统人设与提示词 (System Prompt)</label>
            <textarea
              v-model="config.systemPrompt"
              rows="3"
              class="form-input form-textarea"
              placeholder="定义 AI 的角色定位与行为边界..."
            ></textarea>
          </div>

          <!-- 温度参数 (Temperature) -->
          <div class="form-group">
            <label class="form-label">
              <span>创造度 / 温度 (Temperature): {{ config.temperature }}</span>
              <span class="field-subnote">较低更严谨精准，较高更具发散创造力</span>
            </label>
            <input
              type="range"
              v-model.number="config.temperature"
              min="0"
              max="1.5"
              step="0.1"
              class="range-slider"
            />
          </div>

          <!-- 连通性测试结果反馈 -->
          <div v-if="testResult" class="test-result-banner" :class="testResult.ok ? 'is-ok' : 'is-err'">
            <AppIcon :name="testResult.ok ? 'check' : 'warning'" :size="18" class="test-result-icon" />
            <span class="test-msg">{{ testResult.message }}</span>
          </div>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="button secondary"
            :disabled="testingConnection"
            @click="handleTestConnection"
          >
            <AppIcon v-if="testingConnection" name="undo" class="spin-icon" :size="16" />
            <AppIcon v-else name="sparkle" :size="16" />
            <span>{{ testingConnection ? '测试中...' : '测试连通性' }}</span>
          </button>

          <div class="footer-right">
            <button type="button" class="button ghost" @click="showConfigModal = false">
              取消
            </button>
            <button type="button" class="button primary" @click="handleSaveConfig">
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assistant-page {
  display: flex;
  flex-direction: row;
  height: calc(100vh - 40px);
  min-height: 540px;
  gap: 16px;
  padding-bottom: 24px;
  position: relative;
}

/* 左侧会话历史侧边栏 */
.assistant-sidebar {
  width: 260px;
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg, 16px);
  padding: 12px;
  gap: 10px;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.25s ease;
  overflow: hidden;
  position: relative;
}

.assistant-sidebar.is-collapsed {
  width: 58px;
  padding: 12px 8px;
  align-items: stretch;
}

.sidebar-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.new-chat-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  overflow: hidden;
}

.new-chat-btn:hover {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  border-color: var(--accent);
}

.assistant-sidebar.is-collapsed .sidebar-top {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.assistant-sidebar.is-collapsed .new-chat-btn {
  padding: 0;
  width: 100%;
  height: 38px;
  border-radius: 10px;
}

.sidebar-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--soft);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.sidebar-toggle-btn:hover {
  background: var(--raised);
  color: var(--text);
  border-color: var(--accent);
}

.assistant-sidebar.is-collapsed .sidebar-toggle-btn {
  display: flex !important;
  order: -1;
  width: 100%;
  height: 38px;
  border-radius: 10px;
}

.assistant-sidebar.is-collapsed .sidebar-toggle-btn:hover {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border-color: var(--accent);
  color: var(--accent);
}

/* 侧栏会话列表 */
.sidebar-session-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 2px;
}

.sidebar-session-list::-webkit-scrollbar {
  width: 4px;
}

.sidebar-session-list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  border-radius: 4px;
}

.sidebar-session-list::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--accent) 40%, transparent);
}

.session-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: background 0.15s ease, border-color 0.15s ease;
  border: 1px solid transparent;
  user-select: none;
}

.session-item:hover {
  background: var(--raised);
}

.session-item.is-active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border-color: color-mix(in srgb, var(--accent) 32%, transparent);
}

.session-lead-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--soft);
  flex-shrink: 0;
}

.session-item.is-active .session-lead-icon {
  color: var(--accent);
}

.session-lead-icon.is-paper {
  color: var(--accent);
}

.session-arxiv-tag {
  display: inline-block;
  padding: 0 4px;
  margin-right: 4px;
  font-size: 10px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-weight: 600;
  vertical-align: baseline;
}

.session-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.session-title-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.session-meta-text {
  font-size: 11px;
  color: var(--soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.session-actions-overlay {
  display: none;
  align-items: center;
  gap: 2px;
  position: absolute;
  right: 6px;
  background: var(--surface);
  padding: 2px 4px;
  border-radius: 6px;
  border: 1px solid var(--border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.session-item:hover .session-actions-overlay,
.session-item.is-active .session-actions-overlay {
  display: flex;
}

.session-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--soft);
  cursor: pointer;
  transition: all 0.15s ease;
}

.session-action-btn:hover {
  background: var(--raised);
  color: var(--text);
}

.session-action-btn.danger:hover {
  background: rgba(245, 101, 101, 0.15);
  color: #fc8181;
}

.session-rename-box {
  width: 100%;
}

.session-rename-input {
  width: 100%;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: var(--bg);
  color: var(--text);
  outline: none;
}

/* 侧边栏底部操作区 */
.sidebar-bottom-bar {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.clear-all-sessions-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--soft);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.clear-all-sessions-btn:hover {
  background: rgba(245, 101, 101, 0.12);
  color: #fc8181;
}

/* 右侧主视口面板 */
.assistant-main-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
  overflow: hidden;
}

.sidebar-expand-header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  margin-right: 4px;
}

.sidebar-expand-header-btn:hover {
  background: var(--raised);
  color: var(--accent);
  border-color: var(--accent);
}

.expand-header-label {
  white-space: nowrap;
}

@media (max-width: 640px) {
  .expand-header-label {
    display: none;
  }
}

/* 顶部操作卡片 */
.assistant-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.assistant-avatar-badge {
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--accent);
}

.assistant-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
}

.meta-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

/* 核心功能：模型切换下拉选择器 */
.model-select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 999px;
  padding: 2px 28px 2px 10px;
  transition: all 0.2s ease;
}

.model-select-wrapper:hover {
  background: var(--raised);
  border-color: var(--accent);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #68d391;
  box-shadow: 0 0 6px rgba(104, 211, 145, 0.6);
  margin-right: 6px;
  flex-shrink: 0;
}

.model-select-dropdown {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  padding: 4px 0;
  max-width: 260px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.model-select-dropdown option {
  background: #0c081e;
  color: var(--text);
}

[data-color-scheme="classic-cyan"] .model-select-dropdown option {
  background: #092029;
  color: #f5f8f6;
}

.select-arrow {
  position: absolute;
  right: 10px;
  pointer-events: none;
  color: var(--muted);
}

/* 核心功能：推理档位调节组件 */
.reasoning-effort-widget {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
}

.effort-caption {
  font-size: 11px;
  color: var(--muted);
  font-weight: 500;
  padding-left: 4px;
}

.effort-button-group {
  display: inline-flex;
  gap: 3px;
}

.effort-btn {
  padding: 2px 8px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  text-transform: uppercase;
}

.effort-btn:hover {
  color: var(--text);
}

.effort-btn.is-active {
  background: var(--accent);
  color: #070314;
}

[data-color-scheme="classic-cyan"] .effort-btn.is-active {
  color: #102f33;
}

.meta-desc {
  font-size: 13px;
  color: var(--muted);
  margin-top: 4px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 主视口容器 */
.chat-viewport {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* 研讨论文专属横幅 */
.session-paper-banner {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 18px;
  background: color-mix(in srgb, var(--accent) 5%, var(--panel));
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  animation: bannerFadeIn 0.25s ease-out;
}

@keyframes bannerFadeIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

.banner-main-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.banner-lead-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.banner-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.banner-top-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.paper-arxiv-pill {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  padding: 1px 7px;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
}

.banner-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--muted);
  text-decoration: none;
  padding: 1px 6px;
  border-radius: 5px;
  transition: all 0.15s ease;
}

.banner-link-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.banner-paper-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.banner-meta-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  flex-wrap: wrap;
}

.banner-authors {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.banner-sep {
  color: var(--border);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
}

.status-badge.loading {
  color: var(--accent);
}

.status-badge.ready {
  color: #10b981;
}

.status-badge.fallback,
.status-badge.error {
  color: #f59e0b;
}

.banner-retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--soft);
  font-size: 11px;
  padding: 1px 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.banner-retry-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.banner-quick-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px dashed color-mix(in srgb, var(--border) 60%, transparent);
}

.quick-caption {
  font-size: 11px;
  color: var(--soft);
  margin-right: 2px;
}

.quick-action-pill {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.quick-action-pill:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: var(--accent);
  color: var(--accent);
}

.chat-messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
}

/* 未配置状态引导 */
.unconfigured-banner {
  margin: auto;
  max-width: 520px;
  text-align: center;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.unconfigured-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.unconfigured-banner h3 {
  font-size: 22px;
  font-weight: 600;
  color: var(--text);
}

.unconfigured-banner p {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.6;
}

.unconfigured-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
}

/* 欢迎页与预设问答卡片 */
.welcome-guide {
  margin: auto;
  max-width: 720px;
  text-align: center;
  padding: 40px 16px;
}

.welcome-badge {
  width: 58px;
  height: 58px;
  margin: 0 auto 16px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.welcome-title {
  font-size: 24px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 8px;
}

.welcome-desc {
  font-size: 14px;
  color: var(--muted);
  max-width: 560px;
  margin: 0 auto 28px;
  line-height: 1.6;
}

.prompt-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  text-align: left;
}

.prompt-card {
  padding: 16px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  cursor: pointer;
  transition: all 0.2s ease;
}

.prompt-card:hover {
  background: var(--raised);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  transform: translateY(-2px);
}

.prompt-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.prompt-card-tag {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

.prompt-arrow {
  color: var(--muted);
  transition: transform 0.2s ease;
}

.prompt-card:hover .prompt-arrow {
  transform: translateX(3px);
  color: var(--accent);
}

.prompt-card-text {
  font-size: 13px;
  color: var(--soft);
  line-height: 1.5;
}

/* 消息列表 */
.messages-thread {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
}

.message-row {
  display: flex;
  gap: 14px;
  max-width: 92%;
}

.message-row.user {
  margin-left: auto;
  flex-direction: row-reverse;
}

.message-avatar-wrap {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
}

.assistant-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.message-bubble-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
}

.message-role-label {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
  padding: 0 4px;
}

.message-row.user .message-role-label {
  text-align: right;
}

/* 用户发送的图片展示 */
.message-images-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.message-thumbnail {
  max-width: 220px;
  max-height: 180px;
  border-radius: 12px;
  border: 1px solid var(--line);
  cursor: zoom-in;
  object-fit: cover;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.message-thumbnail:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.message-content {
  padding: 16px 22px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 15px;
  line-height: 1.82;
  letter-spacing: 0.012em;
  overflow-wrap: break-word;
}

.message-row.user .message-content {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 25%, transparent);
}

/* AI 对话消息 Markdown 与公式深度排版优化（缓解视觉疲劳，增强通透感） */
:deep(.markdown-rendered-body) {
  font-size: 15px;
  line-height: 1.82;
  letter-spacing: 0.012em;
  color: var(--text);
}

:deep(.markdown-rendered-body > *:first-child) {
  margin-top: 0 !important;
}

:deep(.markdown-rendered-body > *:last-child) {
  margin-bottom: 0 !important;
}

:deep(.markdown-rendered-body p) {
  margin: 0 0 14px 0;
  line-height: 1.82;
}

:deep(.markdown-rendered-body h1),
:deep(.markdown-rendered-body h2),
:deep(.markdown-rendered-body h3),
:deep(.markdown-rendered-body h4),
:deep(.markdown-rendered-body h5),
:deep(.markdown-rendered-body h6) {
  margin: 22px 0 12px 0;
  font-weight: 600;
  line-height: 1.45;
  color: var(--text);
}

:deep(.markdown-rendered-body h1) {
  font-size: 1.35em;
  border-bottom: 1px solid var(--line);
  padding-bottom: 8px;
}

:deep(.markdown-rendered-body h2) {
  font-size: 1.22em;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  padding-bottom: 6px;
}

:deep(.markdown-rendered-body h3) {
  font-size: 1.1em;
}

:deep(.markdown-rendered-body h4) {
  font-size: 1.02em;
}

:deep(.markdown-rendered-body ul),
:deep(.markdown-rendered-body ol) {
  margin: 8px 0 14px 0;
  padding-left: 24px;
}

:deep(.markdown-rendered-body ul) {
  list-style-type: disc;
}

:deep(.markdown-rendered-body ol) {
  list-style-type: decimal;
}

:deep(.markdown-rendered-body li) {
  margin: 6px 0;
  line-height: 1.8;
}

:deep(.markdown-rendered-body li > p) {
  margin: 4px 0;
}

:deep(.markdown-rendered-body blockquote) {
  margin: 14px 0;
  padding: 10px 16px;
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  border-radius: 0 8px 8px 0;
  color: var(--text-secondary, var(--text));
  font-style: italic;
  line-height: 1.75;
}

:deep(.markdown-rendered-body code:not(pre code)) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
  padding: 2px 6px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  color: var(--accent);
}

:deep(.markdown-rendered-body table) {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
  font-size: 14px;
  border-radius: 8px;
  overflow: hidden;
}

:deep(.markdown-rendered-body th),
:deep(.markdown-rendered-body td) {
  border: 1px solid var(--line);
  padding: 9px 13px;
  text-align: left;
  line-height: 1.6;
}

:deep(.markdown-rendered-body th) {
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  font-weight: 600;
}

:deep(.markdown-rendered-body hr) {
  border: none;
  border-top: 1px solid var(--line);
  margin: 20px 0;
}

/* KaTeX 块级公式与行内公式排版微调 */
:deep(.markdown-rendered-body .katex-display) {
  margin: 16px 0 !important;
  padding: 6px 2px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

:deep(.markdown-rendered-body .katex) {
  font-size: 1.05em;
  line-height: 1.25;
  text-rendering: auto;
}

/* 思考过程折叠栏 */
.reasoning-disclosure {
  border: 1px dashed color-mix(in srgb, var(--accent) 25%, var(--line));
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.15);
  margin-bottom: 8px;
  overflow: hidden;
}

.reasoning-summary {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.reasoning-summary:hover {
  color: var(--accent);
}

.thinking-pulse {
  font-size: 11px;
  color: var(--accent);
  animation: pulseOpacity 1.5s infinite;
}

@keyframes pulseOpacity {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.reasoning-content {
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.68;
  letter-spacing: 0.01em;
  color: var(--muted);
  border-top: 1px solid var(--line);
  white-space: pre-wrap;
  font-style: italic;
  max-height: 320px;
  overflow-y: auto;
}

/* 打字机动画指示 */
.streaming-typing {
  padding: 12px 18px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  display: inline-flex;
  gap: 8px;
  align-items: center;
  box-shadow: var(--shadow-sm);
}

.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: typingBounce 1.2s infinite ease-in-out;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typingBounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.streaming-waiting-text {
  font-size: 13px;
  color: var(--text-secondary);
  letter-spacing: 0.2px;
}

/* 消息正文末尾动态省略号指示器 */
.streaming-trailing-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 4px 12px;
  border-radius: 9999px;
  background: var(--surface-hover);
  border: 1px solid var(--line);
  width: fit-content;
  user-select: none;
  animation: fadeInStatus 0.3s ease-out;
}

@keyframes fadeInStatus {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.streaming-dynamic-ellipsis {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.streaming-dynamic-ellipsis .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: dynamicDotWave 1.2s infinite ease-in-out;
}

.streaming-dynamic-ellipsis .dot:nth-child(2) { animation-delay: 0.2s; }
.streaming-dynamic-ellipsis .dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dynamicDotWave {
  0%, 80%, 100% {
    transform: scale(0.65);
    opacity: 0.35;
  }
  40% {
    transform: scale(1.15);
    opacity: 1;
    box-shadow: 0 0 6px var(--accent);
  }
}

.streaming-status-hint {
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.2px;
  font-weight: 500;
}

/* 底部输入区 */
.chat-input-section {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--line);
  background: var(--panel);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stop-generating-wrap {
  position: absolute;
  top: -42px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
}

.stop-btn {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}

/* 待发送图片胶囊栏 */
.pending-images-bar {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  overflow-x: auto;
}

.pending-image-card {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 10px;
  border: 1px solid var(--line);
  overflow: hidden;
  background: var(--surface);
}

.pending-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-image-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.input-composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  position: relative;
}

.hidden-file-input {
  display: none;
}

.upload-image-btn {
  height: 48px;
  width: 48px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--soft);
}

.upload-image-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.chat-textarea {
  flex: 1;
  min-height: 48px;
  max-height: 220px;
  padding: 12px 16px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  transition: border-color 0.2s ease;
}

.chat-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.send-btn {
  height: 48px;
  width: 48px;
  padding: 0;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.composer-footnote {
  text-align: center;
  font-size: 11px;
  color: var(--muted);
}

/* 浮动回到底部快捷按钮 */
.scroll-to-bottom-btn {
  position: absolute;
  right: 24px;
  bottom: 128px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.scroll-to-bottom-btn:hover {
  background: color-mix(in srgb, var(--accent) 15%, var(--surface));
  border-color: var(--accent);
  color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 25%, transparent);
}

.scroll-to-bottom-btn:active {
  transform: translateY(0);
}

.streaming-dot-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: streamDotPulse 1.2s infinite ease-in-out;
}

@keyframes streamDotPulse {
  0%, 100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
  }
}

.scroll-down-fade-enter-active,
.scroll-down-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.scroll-down-fade-enter-from,
.scroll-down-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* 图片全屏灯箱 */
.image-lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.image-lightbox-card {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.lightbox-img {
  max-width: 100%;
  max-height: 85vh;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8);
}

.lightbox-close-btn {
  position: absolute;
  top: -40px;
  right: 0;
  background: transparent;
  border: none;
  color: #fff;
  cursor: pointer;
}

/* 配置模态窗 */
.config-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.config-modal-card {
  width: 100%;
  max-width: 620px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--panel-solid, #0c0a1a);
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  isolation: isolate;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--line);
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title-wrap h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}

.modal-title-icon {
  color: var(--accent);
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  transform: translateZ(0);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--soft);
}

.text-toggle-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
}

.provider-selector-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.provider-pill-btn {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--soft);
  cursor: pointer;
  transition: all 0.15s ease;
}

.provider-pill-btn:hover {
  background: var(--raised);
  color: var(--text);
}

.provider-pill-btn.is-selected {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

/* 模型管理表格样式 */
.models-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.text-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 4px;
}

.text-add-btn:hover {
  text-decoration: underline;
}

.models-table-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.model-item-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s ease;
}

.model-item-card.is-current-active {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}

.model-item-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.model-radio-wrap {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.model-radio-wrap input {
  display: none;
}

.model-radio-custom {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--line);
  display: inline-block;
  position: relative;
  transition: all 0.2s ease;
}

.model-radio-wrap input:checked + .model-radio-custom {
  border-color: var(--accent);
}

.model-radio-wrap input:checked + .model-radio-custom::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--accent);
}

.model-name-input {
  flex: 1;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
}

.model-name-input:focus {
  outline: none;
  border-color: var(--accent);
}

.model-del-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}

.model-del-btn:hover {
  color: #f56565;
}

.model-item-details {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.model-field-inline {
  display: flex;
  align-items: center;
  gap: 6px;
}

.field-label-tiny {
  font-size: 11px;
  color: var(--muted);
}

.model-id-input {
  width: 170px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 12px;
}

.model-context-input {
  width: 90px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 12px;
}

.reasoning-toggle-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  margin-left: auto;
}

.checkbox-input {
  accent-color: var(--accent);
  cursor: pointer;
}

.reasoning-toggle-label {
  font-size: 11px;
  color: var(--soft);
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 13px;
  transition: border-color 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
}

.form-textarea {
  resize: vertical;
  line-height: 1.5;
}

.field-hint {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.4;
}

.field-hint .hint-link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: opacity 0.15s ease, color 0.15s ease;
}

.field-hint .hint-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}

.field-subnote {
  font-size: 11px;
  color: var(--muted);
}

.range-slider {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}

.test-result-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-line;
}

.test-result-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.test-msg-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.test-guide-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  padding: 0;
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: opacity 0.2s ease;
  width: fit-content;
}

.test-guide-link-btn:hover {
  opacity: 0.8;
}

.test-result-banner.is-ok {
  background: rgba(104, 211, 145, 0.12);
  border: 1px solid rgba(104, 211, 145, 0.35);
  color: #68d391;
}

.test-result-banner.is-err {
  background: rgba(245, 101, 101, 0.12);
  border: 1px solid rgba(245, 101, 101, 0.35);
  color: #f56565;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.1);
}

.footer-right {
  display: flex;
  gap: 10px;
}

.spin-icon {
  animation: spinRotate 1s linear infinite;
}

@keyframes spinRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 针对 Markdown 代码块内的复制按钮及代码美化 */
:deep(pre) {
  position: relative;
  background: rgba(0, 0, 0, 0.45) !important;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px 16px;
  margin: 10px 0;
  overflow-x: auto;
}

:deep(pre code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}

:deep(.code-copy-btn) {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--soft);
  cursor: pointer;
  transition: all 0.15s ease;
}

:deep(.code-copy-btn:hover) {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

:deep(.code-copy-btn.is-copied) {
  background: rgba(104, 211, 145, 0.2);
  border-color: rgba(104, 211, 145, 0.4);
  color: #68d391;
}

@media (max-width: 900px) {
  .assistant-page {
    flex-direction: column;
  }
  .assistant-sidebar {
    width: 100%;
    height: auto;
    max-height: 240px;
  }
  .assistant-sidebar.is-collapsed {
    width: 100%;
    height: 48px;
    padding: 6px 12px;
  }
  .assistant-sidebar.is-collapsed .sidebar-toggle-btn {
    display: flex;
  }
  .sidebar-session-list {
    max-height: 150px;
  }
}

@media (max-width: 768px) {
  .assistant-page {
    height: auto;
    min-height: 100vh;
    padding-bottom: 80px;
  }
  .prompt-grid {
    grid-template-columns: 1fr;
  }
  .assistant-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }
  .model-select-dropdown {
    max-width: 180px;
  }
  .session-paper-banner {
    padding: 10px 14px;
  }
  .banner-paper-title {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .banner-authors {
    max-width: 180px;
  }
  .scroll-to-bottom-btn {
    right: 14px;
    bottom: 120px;
    padding: 5px 12px;
    font-size: 11px;
  }
  .message-content {
    padding: 13px 16px;
    font-size: 14.5px;
    line-height: 1.76;
  }
}
</style>
