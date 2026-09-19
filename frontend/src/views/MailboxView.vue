<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { mailboxApi, authApi, talkApi } from '../api/client'
import BaseDialog from '../components/BaseDialog.vue'
import LoadingState from '../components/LoadingState.vue'
import AppIcon from '../components/AppIcon.vue'
import WaveInput from '../components/WaveInput.vue'
import ThinHoundCheckbox from '../components/ThinHoundCheckbox.vue'
import AttachmentLink from '../components/AttachmentLink.vue'
import FileField from '../components/FileField.vue'
import { notify, confirmAction } from '../composables/feedback'
import { isTalkEmail, isConferenceEmail, detectScheduleType, parseTalkMetadataLocally, parseConferenceMetadataLocally, pickChinesePartIfDual, applyInstitutionLocationPrefix } from '../utils/talkEmail'
import { isAiAssistantReady, extractScheduleFromEmailWithAi, extractConferenceFromEmailWithAi, loadAiConfig, isModelVisionCapable } from '../services/aiService'

const currentUser = ref(null)

const config = ref({
  has_config: false,
  email_address: '',
  protocol: 'imap',
  server_host: '',
  server_port: 993,
  use_ssl: true,
  username: '',
  has_password: false,
  updated_at: ''
})

const emails = ref([])
const loading = ref(true)
const syncing = ref(false)
const clearingEmails = ref(false)
const deletingEmailId = ref(null)
const syncProgress = ref({
  active: false,
  percent: 0,
  message: '',
  detail: '',
  completed: false,
  error: false
})
let abortSync = null
let finishTimer = null
const error = ref('')
const query = ref('')
const selectedEmail = ref(null)
const emailDetail = ref(null)
const loadingDetail = ref(false)
const showBodyHtml = ref(true)

// 箱分类：收件箱 (inbox) | 已发通知 (sent)
const currentFolder = ref('inbox')
const sentEmails = ref([])
const loadingSent = ref(false)

// 管理员专属 SMTP 发信配置状态
const isAdmin = computed(() => currentUser.value?.role === 'admin')
const configTab = ref('incoming') // 'incoming' | 'outgoing'

const smtpConfig = ref({
  has_config: false,
  host: '',
  port: 465,
  use_ssl: true,
  username: '',
  from_email: '',
  from_name: '',
  has_password: false,
  use_imap_password: false,
  has_imap_password: false,
  imap_email: '',
  updated_at: ''
})

const smtpForm = ref({
  host: 'mail.cstnet.cn',
  port: 465,
  use_ssl: true,
  username: '',
  password: '',
  use_imap_password: true,
  from_email: '',
  from_name: ''
})
const editingSmtpPassword = ref(false)
const testingSmtpConn = ref(false)
const smtpTestResult = ref(null)
const savingSmtp = ref(false)

// 接收配置弹窗状态
const showConfigModal = ref(false)
const configForm = ref({
  email_address: '',
  protocol: 'imap',
  server_host: '',
  server_port: 993,
  use_ssl: true,
  username: '',
  password: ''
})
const editingIncomingPassword = ref(false)
const testingConn = ref(false)
const testResult = ref(null)
const savingConfig = ref(false)
const deletingConfig = ref(false)

// 预设配置
const presets = [
  {
    name: '中科院科技网',
    domain: '@cstnet.cn',
    imapHost: 'mail.cstnet.cn',
    popHost: 'mail.cstnet.cn',
    imapPort: 993,
    popPort: 995,
  },
  {
    name: '163 网易',
    domain: '@163.com',
    imapHost: 'imap.163.com',
    popHost: 'pop.163.com',
    imapPort: 993,
    popPort: 995,
  },
  {
    name: 'QQ 邮箱',
    domain: '@qq.com',
    imapHost: 'imap.qq.com',
    popHost: 'pop.qq.com',
    imapPort: 993,
    popPort: 995,
  },
  {
    name: '自定义',
    domain: '',
    imapHost: '',
    popHost: '',
    imapPort: 993,
    popPort: 995,
  }
]
const activePreset = ref('自定义')

// SMTP 发信预设
const smtpPresets = [
  {
    name: '中科院科技网',
    domain: '@cstnet.cn',
    host: 'mail.cstnet.cn',
    port: 465,
    use_ssl: true
  },
  {
    name: '163 网易',
    domain: '@163.com',
    host: 'smtp.163.com',
    port: 465,
    use_ssl: true
  },
  {
    name: 'QQ 邮箱',
    domain: '@qq.com',
    host: 'smtp.qq.com',
    port: 465,
    use_ssl: true
  },
  {
    name: '自定义',
    domain: '',
    host: '',
    port: 465,
    use_ssl: true
  }
]
const activeSmtpPreset = ref('自定义')

function applySmtpPreset(p) {
  activeSmtpPreset.value = p.name
  if (p.name === '自定义') return
  smtpForm.value.host = p.host
  smtpForm.value.port = p.port
  smtpForm.value.use_ssl = p.use_ssl
  if (p.domain && !smtpForm.value.from_email.includes('@')) {
    smtpForm.value.from_email = (smtpForm.value.from_email || '') + p.domain
  }
  if (!smtpForm.value.username) {
    smtpForm.value.username = smtpForm.value.from_email
  }
}

function applyPreset(p) {
  activePreset.value = p.name
  if (p.name === '自定义') return
  const isPop = configForm.value.protocol === 'pop3'
  configForm.value.server_host = isPop ? p.popHost : p.imapHost
  configForm.value.server_port = isPop ? p.popPort : p.imapPort
  configForm.value.use_ssl = true
  if (p.domain && !configForm.value.email_address.includes('@')) {
    configForm.value.email_address = (configForm.value.email_address || '') + p.domain
  }
  if (!configForm.value.username) {
    configForm.value.username = configForm.value.email_address
  }
}

function onProtocolChange(newProto) {
  configForm.value.protocol = newProto
  const preset = presets.find(p => p.name === activePreset.value)
  if (preset && preset.name !== '自定义') {
    configForm.value.server_host = newProto === 'pop3' ? preset.popHost : preset.imapHost
    configForm.value.server_port = newProto === 'pop3' ? preset.popPort : preset.imapPort
  } else {
    configForm.value.server_port = newProto === 'pop3' ? 995 : 993
  }
}

function onEmailBlur() {
  if (configForm.value.email_address) {
    let email = configForm.value.email_address.trim()
    if (!configForm.value.username) {
      configForm.value.username = email
    }
    // 自动探测域名匹配预设
    const lower = email.toLowerCase()
    for (const p of presets) {
      if (p.domain && lower.endsWith(p.domain)) {
        applyPreset(p)
        break
      }
    }
  }
}

async function loadConfig() {
  try {
    const res = await mailboxApi.getConfig()
    config.value = res
  } catch (e) {
    console.error(e)
  }
}

async function syncMailboxWithProgress() {
  if (syncing.value) return
  if (!config.value.has_config) return

  clearTimeout(finishTimer)
  syncing.value = true
  error.value = ''
  syncProgress.value = {
    active: true,
    percent: 8,
    message: '正在建立连接…',
    detail: `${config.value.server_host}:${config.value.server_port}`,
    completed: false,
    error: false
  }

  if (abortSync) {
    try { abortSync() } catch {}
  }

  abortSync = mailboxApi.syncStream(
    (data) => {
      syncProgress.value.percent = Math.min(99, Math.max(syncProgress.value.percent, data.percent || 10))
      syncProgress.value.message = data.message || '正在同步邮件…'
      if (data.detail) {
        syncProgress.value.detail = data.detail
      }
    },
    async (doneData) => {
      syncProgress.value.percent = 100
      syncProgress.value.completed = true
      syncProgress.value.message = doneData?.message || '同步完成！'
      syncProgress.value.detail = ''
      syncing.value = false
      notify(doneData?.message || '同步完成')
      
      await loadEmails(false)

      clearTimeout(finishTimer)
      finishTimer = setTimeout(() => {
        syncProgress.value.active = false
      }, 2000)
    },
    async (err) => {
      console.warn('Mailbox stream sync error:', err)
      syncProgress.value.error = true
      syncProgress.value.message = err.message || '同步连接异常，请重试'
      syncProgress.value.detail = ''
      syncing.value = false
      notify(syncProgress.value.message, 'error')
      
      await loadEmails(false)

      clearTimeout(finishTimer)
      finishTimer = setTimeout(() => {
        syncProgress.value.active = false
      }, 3500)
    }
  )
}

function isWithin7Days(dateStr, fallbackStr) {
  const RETENTION_MS = 8.5 * 24 * 60 * 60 * 1000
  if (dateStr) {
    const cleanStr = dateStr.replace(/\s*\([^)]*\)\s*$/, '').trim()
    let ts = Date.parse(cleanStr)
    if (!isNaN(ts)) return (Date.now() - ts) <= RETENTION_MS
    ts = Date.parse(dateStr)
    if (!isNaN(ts)) return (Date.now() - ts) <= RETENTION_MS
  }
  if (fallbackStr) {
    const ts = Date.parse(fallbackStr)
    if (!isNaN(ts)) return (Date.now() - ts) <= RETENTION_MS
  }
  return true
}

function deduplicateEmailList(list) {
  if (!Array.isArray(list)) return []
  const result = []
  const seenUids = new Set()
  const seenMeta = new Set()

  for (const item of list) {
    if (!isWithin7Days(item.date_str, item.created_at || item.fetched_at)) continue

    const cleanUid = (item.msg_uid || item.message_id || '').replace(/[<>]/g, '').trim()
    const cleanSubj = (item.subject || '').replace(/\s+/g, '').toLowerCase()
    const dateKey = (item.date_str || '').trim()

    if (cleanUid && seenUids.has(cleanUid)) continue

    const metaKey = cleanSubj && dateKey ? `${cleanSubj}__${dateKey}` : ''
    if (metaKey && seenMeta.has(metaKey)) continue

    if (cleanUid) seenUids.add(cleanUid)
    if (metaKey) seenMeta.add(metaKey)
    result.push(item)
  }
  return result
}

async function loadEmails(forceRefresh = false) {
  if (!config.value.has_config) {
    loading.value = false
    return
  }
  if (forceRefresh) {
    return syncMailboxWithProgress()
  }
  loading.value = true
  error.value = ''
  try {
    const res = await mailboxApi.getEmails({ q: query.value, refresh: false })
    emails.value = deduplicateEmailList(res)
  } catch (e) {
    let msg = e.message || '获取邮件失败，请检查邮箱配置或网络连通性。'
    if (msg.includes('timeout')) {
      msg = '获取邮件超时，请点击「同步邮件」或检查网络。'
    }
    if (emails.value.length > 0) {
      notify(msg, 'error')
    } else {
      error.value = msg
    }
  } finally {
    loading.value = false
  }
}

async function loadSmtpConfig() {
  if (!isAdmin.value) return
  try {
    const res = await mailboxApi.getSmtpConfig()
    smtpConfig.value = res
    editingSmtpPassword.value = false
    if (res.has_config) {
      smtpForm.value = {
        host: res.host || 'mail.cstnet.cn',
        port: res.port || 465,
        use_ssl: res.use_ssl !== false,
        username: res.username || '',
        password: '',
        use_imap_password: res.use_imap_password ?? Boolean(res.has_imap_password),
        from_email: res.from_email || res.username || '',
        from_name: res.from_name || currentUser.value?.real_name || currentUser.value?.name || ''
      }
      const matched = smtpPresets.find(p => p.domain && res.username?.toLowerCase().endsWith(p.domain))
      activeSmtpPreset.value = matched ? matched.name : '自定义'
    } else {
      const defaultEmail = currentUser.value?.email || config.value.email_address || ''
      smtpForm.value = {
        host: 'mail.cstnet.cn',
        port: 465,
        use_ssl: true,
        username: defaultEmail,
        password: '',
        use_imap_password: Boolean(config.value.has_config || res.has_imap_password),
        from_email: defaultEmail,
        from_name: currentUser.value?.real_name || currentUser.value?.name || ''
      }
      if (!defaultEmail) {
        activeSmtpPreset.value = '自定义'
      } else {
        const matched = smtpPresets.find(p => p.domain && defaultEmail.toLowerCase().endsWith(p.domain))
        activeSmtpPreset.value = matched ? matched.name : '自定义'
      }
    }
  } catch (e) {
    console.warn('加载 SMTP 配置失败:', e)
  }
}

async function handleTestSmtpConnection() {
  smtpTestResult.value = null
  testingSmtpConn.value = true
  try {
    const res = await mailboxApi.testSmtp({
      host: smtpForm.value.host,
      port: Number(smtpForm.value.port),
      use_ssl: Boolean(smtpForm.value.use_ssl),
      username: smtpForm.value.username,
      password: smtpForm.value.password || '',
      use_imap_password: Boolean(smtpForm.value.use_imap_password),
      from_email: smtpForm.value.from_email
    })
    smtpTestResult.value = res
  } catch (e) {
    smtpTestResult.value = { success: false, message: e.message || 'SMTP 测试连接失败，请检查填写参数与授权码' }
  } finally {
    testingSmtpConn.value = false
  }
}

async function handleSaveSmtpConfig() {
  if (!smtpForm.value.host || !smtpForm.value.username || !smtpForm.value.from_email) {
    notify('请完整填写 SMTP 服务器地址、用户名与发件人邮箱', 'error')
    return
  }
  if (!smtpForm.value.use_imap_password && !smtpConfig.value.has_password && !smtpForm.value.password) {
    notify('首次设置独立发件服务必须提供客户端专用授权码', 'error')
    return
  }
  savingSmtp.value = true
  try {
    const res = await mailboxApi.saveSmtpConfig({
      host: smtpForm.value.host,
      port: Number(smtpForm.value.port),
      use_ssl: Boolean(smtpForm.value.use_ssl),
      username: smtpForm.value.username,
      password: smtpForm.value.password || undefined,
      use_imap_password: Boolean(smtpForm.value.use_imap_password),
      from_email: smtpForm.value.from_email,
      from_name: smtpForm.value.from_name
    })
    smtpConfig.value = res
    editingSmtpPassword.value = false
    smtpForm.value.password = ''
    notify('SMTP 发信配置已成功保存！')
    showConfigModal.value = false
  } catch (e) {
    notify(e.message || '保存 SMTP 配置失败', 'error')
  } finally {
    savingSmtp.value = false
  }
}

async function loadSentEmails() {
  loadingSent.value = true
  try {
    const list = await mailboxApi.getSentEmails()
    sentEmails.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.warn('获取已发送邮件失败:', e)
    notify(e.message || '获取已发送通知失败', 'error')
  } finally {
    loadingSent.value = false
  }
}

function switchFolder(folder) {
  if (folder === 'sent' && !isAdmin.value) return
  currentFolder.value = folder
  if (folder === 'sent') {
    loadSentEmails()
  } else {
    loadEmails(false)
  }
}

async function openConfig() {
  testResult.value = null
  smtpTestResult.value = null
  editingIncomingPassword.value = false
  editingSmtpPassword.value = false
  configTab.value = 'incoming'
  if (isAdmin.value) {
    await loadSmtpConfig()
  }
  if (config.value.has_config) {
    configForm.value = {
      email_address: config.value.email_address || '',
      protocol: config.value.protocol || 'imap',
      server_host: config.value.server_host || 'mail.cstnet.cn',
      server_port: config.value.server_port || 993,
      use_ssl: config.value.use_ssl !== false,
      username: config.value.username || '',
      password: ''
    }
    const currentAddr = (config.value.email_address || '').toLowerCase()
    const matched = presets.find(p => p.domain && currentAddr.endsWith(p.domain))
    activePreset.value = matched ? matched.name : '自定义'
  } else {
    const defaultEmail = currentUser.value?.email || ''
    configForm.value = {
      email_address: defaultEmail,
      protocol: 'imap',
      server_host: 'mail.cstnet.cn',
      server_port: 993,
      use_ssl: true,
      username: defaultEmail,
      password: ''
    }
    if (!defaultEmail) {
      activePreset.value = '自定义'
    } else {
      const matched = presets.find(p => p.domain && defaultEmail.toLowerCase().endsWith(p.domain))
      activePreset.value = matched ? matched.name : '自定义'
    }
  }
  showConfigModal.value = true
}

async function handleTestConnection() {
  testResult.value = null
  testingConn.value = true
  try {
    const res = await mailboxApi.testConfig({
      email_address: configForm.value.email_address,
      protocol: configForm.value.protocol,
      server_host: configForm.value.server_host,
      server_port: Number(configForm.value.server_port),
      use_ssl: Boolean(configForm.value.use_ssl),
      username: configForm.value.username,
      password: configForm.value.password || ''
    })
    testResult.value = res
  } catch (e) {
    testResult.value = { success: false, message: e.message || '连接测试异常，请检查填写参数' }
  } finally {
    testingConn.value = false
  }
}

async function handleSaveConfig() {
  if (!configForm.value.email_address || !configForm.value.server_host || !configForm.value.username) {
    notify('请完整填写邮箱地址、服务器与用户名', 'error')
    return
  }
  if (!config.value.has_config && !configForm.value.password) {
    notify('首次设置邮箱必须提供客户端专用授权码', 'error')
    return
  }

  savingConfig.value = true
  try {
    const res = await mailboxApi.saveConfig({
      email_address: configForm.value.email_address,
      protocol: configForm.value.protocol,
      server_host: configForm.value.server_host,
      server_port: Number(configForm.value.server_port),
      use_ssl: Boolean(configForm.value.use_ssl),
      username: configForm.value.username,
      password: configForm.value.password || undefined
    })
    config.value = res
    editingIncomingPassword.value = false
    configForm.value.password = ''
    showConfigModal.value = false
    notify('邮箱配置已成功保存！')
    await loadEmails(true)
  } catch (e) {
    notify(e.message || '保存配置失败', 'error')
  } finally {
    savingConfig.value = false
  }
}

async function handleDeleteConfig() {
  const ok = await confirmAction('确定要解绑当前邮箱吗？解绑后将清除本地邮件缓存。', {
    title: '解绑邮箱',
    confirmLabel: '确认解绑',
    danger: true
  })
  if (!ok) return
  deletingConfig.value = true
  try {
    await mailboxApi.deleteConfig()
    config.value = { has_config: false }
    emails.value = []
    selectedEmail.value = null
    showConfigModal.value = false
    notify('邮箱配置已成功解除绑定')
  } catch (e) {
    notify(e.message || '解绑失败', 'error')
  } finally {
    deletingConfig.value = false
  }
}

async function handleClearAllEmails() {
  if (!emails.value.length || clearingEmails.value) return
  const ok = await confirmAction(
    '确定要清空本地所有已同步的邮件吗？清空后将立即释放服务器存储空间。您随时可点击「同步邮件」重新拉取。',
    { title: '清空邮件', confirmLabel: '确认清空', danger: true }
  )
  if (!ok) return

  clearingEmails.value = true
  try {
    const res = await mailboxApi.clearEmails()
    emails.value = []
    selectedEmail.value = null
    emailDetail.value = null
    notify(res?.message || '已成功清空本地邮件缓存')
  } catch (e) {
    notify(e.message || '清空邮件失败', 'error')
  } finally {
    clearingEmails.value = false
  }
}

async function handleDeleteSingleEmail(item) {
  if (!item || !item.id || deletingEmailId.value) return
  const title = item.subject ? `“${item.subject.slice(0, 30)}”` : '该邮件'
  const ok = await confirmAction(
    `确定要从本地缓存中删除${title}吗？`,
    { title: '删除邮件', confirmLabel: '删除', danger: true }
  )
  if (!ok) return

  deletingEmailId.value = item.id
  try {
    await mailboxApi.deleteEmail(item.id)
    emails.value = emails.value.filter(e => e.id !== item.id)
    if (selectedEmail.value?.id === item.id) {
      selectedEmail.value = null
      emailDetail.value = null
    }
    notify('邮件已成功删除')
  } catch (e) {
    notify(e.message || '删除邮件失败', 'error')
  } finally {
    deletingEmailId.value = null
  }
}

async function openEmailDetail(email, isSent = false) {
  selectedEmail.value = { ...email, isSent }
  loadingDetail.value = true
  emailDetail.value = null
  if (isSent) {
    emailDetail.value = {
      ...email,
      isSent: true,
      body_text: email.body_text || '',
      date_str: email.created_at || ''
    }
    loadingDetail.value = false
    return
  }
  try {
    const detail = await mailboxApi.getEmailDetail(email.id)
    emailDetail.value = detail
  } catch (e) {
    notify(e.message || '读取邮件详情失败', 'error')
  } finally {
    loadingDetail.value = false
  }
}

function copyEmailContent() {
  const text = emailDetail.value?.body_text || emailDetail.value?.snippet || ''
  if (!text) return
  navigator.clipboard.writeText(text)
    .then(() => notify('邮件纯文本内容已复制到剪贴板'))
    .catch(() => notify('复制失败，请手动选取', 'error'))
}

function getInitial(name) {
  if (!name) return 'M'
  const trimmed = name.trim()
  return trimmed.charAt(0).toUpperCase()
}

function parseDateToTimestamp(str) {
  if (!str) return 0
  const t = Date.parse(str)
  return isNaN(t) ? 0 : t
}

function formatEmailDate(str) {
  if (!str) return ''
  const t = parseDateToTimestamp(str)
  if (!t) return str.length > 16 ? str.slice(0, 16) : str
  const d = new Date(t)
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) {
    return timeStr
  }
  const isThisYear = d.getFullYear() === now.getFullYear()
  if (isThisYear) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timeStr}`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 确保最新邮件始终排在最上方
const sortedEmails = computed(() => {
  return [...emails.value].sort((a, b) => {
    const ta = parseDateToTimestamp(a.date_str)
    const tb = parseDateToTimestamp(b.date_str)
    if (tb !== ta) return tb - ta
    return (b.id || 0) - (a.id || 0)
  })
})

// 推送到日程弹窗状态（支持学术报告与学术会议双轨模式）
const scheduleType = ref('talk') // 'talk' | 'conference'
const showScheduleModal = ref(false)
const pushingSchedule = ref(false)
const savingSchedule = ref(false)
const detectedTalks = ref([])
const currentTalkIndex = ref(0)
const scheduleForm = ref({
  title: '',
  date: '',
  time: '10:00',
  speaker: '',
  location: '',
  notes: '',
  poster_url: ''
})

const confForm = ref({
  title: '',
  sub_type: '研讨会',
  date: '',
  end_date: '',
  time: '全天',
  city: '',
  location: '',
  speaker: '',
  organizer: '',
  source: '',
  abstract_deadline: '',
  early_bird_deadline: '',
  registration_deadline: '',
  website_url: '',
  registration_url: '',
  handbook_url: '',
  poster_url: '',
  notes: ''
})

const scheduleWarnings = ref([])
const isAiAssistantReadyState = ref(false)
const currentScheduleEmail = ref(null)
const aiRecognizing = ref(false)
let currentScheduleParseToken = 0

const selectedTalksCount = computed(() => detectedTalks.value.filter(t => t.selected).length)

function extractAttachmentsList(email) {
  if (!email) return []
  let list = []
  if (Array.isArray(email.attachments) && email.attachments.length > 0) {
    list = [...email.attachments]
  } else if (typeof email.attachments === 'string' && email.attachments.trim() && email.attachments !== '[]') {
    try {
      const parsed = JSON.parse(email.attachments)
      if (Array.isArray(parsed) && parsed.length > 0) list = [...parsed]
    } catch (_) {}
  }
  if (email.poster_url && !list.some(a => a && a.url === email.poster_url)) {
    list.unshift({ id: 'email-poster', filename: '邮件海报/通知图片.jpg', url: email.poster_url, size: 0, content_type: 'image/jpeg' })
  }
  return list
}

function isImageAttachment(att) {
  if (!att) return false
  const ct = (att.content_type || '').toLowerCase()
  const fn = (att.filename || '').toLowerCase()
  return ct.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(fn)
}

function isDocAttachment(att) {
  if (!att) return false
  const ct = (att.content_type || '').toLowerCase()
  const fn = (att.filename || '').toLowerCase()
  return ct.includes('pdf') || ct.includes('word') || ct.includes('msword') || ct.includes('officedocument') || /\.(pdf|docx?)$/i.test(fn)
}

function hasEmailImages(item) {
  if (!item) return false
  const list = extractAttachmentsList(item)
  return list.some(isImageAttachment) || Boolean(item.poster_url)
}

function getEmailImagesCount(item) {
  if (!item) return 0
  const list = extractAttachmentsList(item)
  const count = list.filter(isImageAttachment).length
  return count > 0 ? count : (item.poster_url ? 1 : 0)
}

function hasEmailDocs(item) {
  if (!item) return false
  const list = extractAttachmentsList(item)
  return list.some(isDocAttachment)
}

function getEmailDocsCount(item) {
  if (!item) return 0
  const list = extractAttachmentsList(item)
  return list.filter(isDocAttachment).length
}

const currentDetailEmail = computed(() => {
  return (emailDetail.value && selectedEmail.value && emailDetail.value.id === selectedEmail.value.id)
    ? { ...selectedEmail.value, ...emailDetail.value }
    : (emailDetail.value || selectedEmail.value)
})

const emailAllAttachments = computed(() => {
  return extractAttachmentsList(currentDetailEmail.value)
})

const emailImageAttachments = computed(() => {
  const list = emailAllAttachments.value.filter(isImageAttachment)
  if (list.length === 0 && currentDetailEmail.value?.poster_url) {
    return [{ id: 'detail-poster-fallback', filename: '邮件海报/通知图片.jpg', url: currentDetailEmail.value.poster_url, size: 0, content_type: 'image/jpeg' }]
  }
  return list
})

const emailDocAttachments = computed(() => {
  return emailAllAttachments.value.filter(isDocAttachment)
})

const emailPosterUrl = computed(() => {
  const list = emailImageAttachments.value
  return list.length > 0 ? list[0].url : (currentDetailEmail.value?.poster_url || '')
})

const scheduleCandidateImages = computed(() => {
  const list = extractAttachmentsList(currentScheduleEmail.value).filter(isImageAttachment)
  if (list.length === 0 && currentScheduleEmail.value?.poster_url) {
    return [{ id: 'cand-poster-fallback', filename: '邮件海报/通知图片.jpg', url: currentScheduleEmail.value.poster_url, size: 0, content_type: 'image/jpeg' }]
  }
  return list
})

const scheduleCandidateDocs = computed(() => {
  return extractAttachmentsList(currentScheduleEmail.value).filter(isDocAttachment)
})

const emailPosterCandidate = computed(() => {
  const list = scheduleCandidateImages.value
  return list.length > 0 ? list[0].url : (currentScheduleEmail.value?.poster_url || '')
})

const attachEmailPoster = ref(false)
const uploadPosterBusy = ref(false)
const uploadHandbookBusy = ref(false)

function switchScheduleType(type) {
  scheduleType.value = type
}

function selectCandidatePoster(imgUrl) {
  scheduleForm.value.poster_url = imgUrl
  attachEmailPoster.value = Boolean(imgUrl)
  if (detectedTalks.value.length > 0 && detectedTalks.value[currentTalkIndex.value]) {
    detectedTalks.value[currentTalkIndex.value].poster_url = imgUrl
  }
}

function onToggleAttachEmailPoster(checked) {
  attachEmailPoster.value = Boolean(checked)
  const posterToUse = checked ? emailPosterCandidate.value : ''
  scheduleForm.value.poster_url = posterToUse
  if (detectedTalks.value.length > 0) {
    detectedTalks.value.forEach(t => {
      t.poster_url = posterToUse
    })
  }
}

function clearSchedulePoster() {
  scheduleForm.value.poster_url = ''
  attachEmailPoster.value = false
  if (detectedTalks.value.length > 0 && detectedTalks.value[currentTalkIndex.value]) {
    detectedTalks.value[currentTalkIndex.value].poster_url = ''
  }
}

function selectCandidateConfPoster(imgUrl) {
  confForm.value.poster_url = imgUrl
}

function clearScheduleConfPoster() {
  confForm.value.poster_url = ''
}

function selectCandidateHandbook(docUrl) {
  confForm.value.handbook_url = docUrl
}

function clearScheduleHandbook() {
  confForm.value.handbook_url = ''
}

watch(() => scheduleForm.value.poster_url, (val) => {
  if (val) {
    attachEmailPoster.value = true
  } else {
    attachEmailPoster.value = false
  }
})

watch(
  scheduleForm,
  (val) => {
    if (detectedTalks.value.length > 1 && detectedTalks.value[currentTalkIndex.value]) {
      const current = detectedTalks.value[currentTalkIndex.value]
      current.title = val.title
      current.date = val.date
      current.time = val.time
      current.speaker = val.speaker
      current.location = val.location
      current.notes = val.notes
      current.poster_url = val.poster_url
    }
  },
  { deep: true }
)

function switchTalkTab(idx) {
  if (idx === currentTalkIndex.value || idx < 0 || idx >= detectedTalks.value.length) return
  if (detectedTalks.value[currentTalkIndex.value]) {
    detectedTalks.value[currentTalkIndex.value] = {
      ...detectedTalks.value[currentTalkIndex.value],
      ...scheduleForm.value
    }
  }
  currentTalkIndex.value = idx
  scheduleForm.value = { ...detectedTalks.value[idx] }
}

function toggleAllTalks() {
  const allSelected = detectedTalks.value.every(t => t.selected)
  detectedTalks.value.forEach(t => {
    t.selected = !allSelected
  })
}

async function openPushScheduleModal(email, preferredPosterUrl = '', initialType = null, preferredHandbookUrl = '') {
  if (!email) return
  const fullEmail = (emailDetail.value && emailDetail.value.id === email.id)
    ? { ...email, ...emailDetail.value }
    : email
  currentScheduleEmail.value = fullEmail
  isAiAssistantReadyState.value = isAiAssistantReady()

  // 判定日程类型：若外部显式指定（如推送到学术会议），则使用指定的类型；否则自动判断邮件类型
  if (initialType === 'conference' || initialType === 'talk') {
    scheduleType.value = initialType
  } else {
    scheduleType.value = detectScheduleType(fullEmail) || 'talk'
  }

  const textContent = `${fullEmail.subject || ''}\n${fullEmail.body_text || fullEmail.snippet || ''}`

  // 初始化学术会议表单
  const candidateDocs = extractAttachmentsList(fullEmail).filter(isDocAttachment)
  const candidateImages = extractAttachmentsList(fullEmail).filter(isImageAttachment)
  const defaultHandbook = preferredHandbookUrl || (candidateDocs.length > 0 ? candidateDocs[0].url : '')
  const defaultConfPoster = preferredPosterUrl || (candidateImages.length > 0 ? candidateImages[0].url : '')
  const localConfMeta = parseConferenceMetadataLocally(textContent, fullEmail.subject || '')

  confForm.value = {
    title: localConfMeta.title || fullEmail.subject || '学术会议',
    sub_type: localConfMeta.sub_type || '研讨会',
    date: localConfMeta.date || new Date().toISOString().slice(0, 10),
    end_date: localConfMeta.end_date || localConfMeta.date || new Date().toISOString().slice(0, 10),
    time: '全天',
    city: localConfMeta.city || '',
    location: localConfMeta.location || '',
    speaker: localConfMeta.organizer || '',
    organizer: localConfMeta.organizer || '',
    source: fullEmail.subject || '',
    abstract_deadline: localConfMeta.abstract_deadline || '',
    early_bird_deadline: localConfMeta.early_bird_deadline || '',
    registration_deadline: localConfMeta.registration_deadline || '',
    website_url: localConfMeta.website_url || '',
    registration_url: localConfMeta.registration_url || '',
    handbook_url: defaultHandbook,
    poster_url: defaultConfPoster,
    notes: localConfMeta.notes || fullEmail.body_text || fullEmail.snippet || ''
  }

  // 若用户通过点击特定图片“作为海报推送到日程”，则使用该图片；
  // 否则避免自动强行判断海报，保持为空，交由用户在候选图片中自由勾选或自行上传
  const emailPoster = preferredPosterUrl || ''
  attachEmailPoster.value = Boolean(emailPoster)

  const localMeta = parseTalkMetadataLocally(textContent, fullEmail.subject || '')

  if (localMeta.talks && localMeta.talks.length > 1) {
    detectedTalks.value = localMeta.talks.map((t, idx) => ({
      ...t,
      selected: true,
      notes: t.notes || fullEmail.body_text || fullEmail.snippet || '',
      poster_url: emailPoster,
      id: idx
    }))
    currentTalkIndex.value = 0
    scheduleForm.value = { ...detectedTalks.value[0] }
  } else {
    detectedTalks.value = []
    currentTalkIndex.value = 0
    scheduleForm.value = {
      title: localMeta.title || '学术报告',
      date: localMeta.date || new Date().toISOString().slice(0, 10),
      time: localMeta.time || '10:00',
      speaker: localMeta.speaker || '',
      location: localMeta.location || '',
      notes: fullEmail.body_text || fullEmail.snippet || '',
      poster_url: emailPoster
    }
  }

  scheduleWarnings.value = []
  showScheduleModal.value = true
  pushingSchedule.value = true
  const thisParseToken = ++currentScheduleParseToken

  try {
    const formData = new FormData()
    formData.append('text', textContent)
    const parsed = await talkApi.parse(formData)
    if (thisParseToken !== currentScheduleParseToken || aiRecognizing.value) return
    if (parsed) {
      if (parsed.talks && parsed.talks.length > 1) {
        const prevSelections = detectedTalks.value.map(t => t.selected)
        detectedTalks.value = parsed.talks.map((t, idx) => ({
          ...t,
          title: pickChinesePartIfDual(t.title),
          speaker: pickChinesePartIfDual(t.speaker),
          location: applyInstitutionLocationPrefix(t.location, textContent),
          selected: prevSelections[idx] !== undefined ? prevSelections[idx] : true,
          notes: t.notes || fullEmail.body_text || fullEmail.snippet || '',
          poster_url: t.poster_url || emailPoster,
          id: idx
        }))
        if (currentTalkIndex.value >= detectedTalks.value.length) {
          currentTalkIndex.value = 0
        }
        scheduleForm.value = { ...detectedTalks.value[currentTalkIndex.value] }
      } else if (detectedTalks.value.length <= 1) {
        if (parsed.title) scheduleForm.value.title = pickChinesePartIfDual(parsed.title)
        if (parsed.date) scheduleForm.value.date = parsed.date
        if (parsed.time) scheduleForm.value.time = parsed.time
        if (parsed.speaker) scheduleForm.value.speaker = pickChinesePartIfDual(parsed.speaker)
        if (parsed.location) scheduleForm.value.location = applyInstitutionLocationPrefix(parsed.location, textContent)
        if (parsed.notes) scheduleForm.value.notes = parsed.notes
        if (parsed.poster_url) {
          scheduleForm.value.poster_url = parsed.poster_url
        } else if (emailPoster && attachEmailPoster.value) {
          scheduleForm.value.poster_url = emailPoster
        }
      }
      if (parsed.warnings?.length) scheduleWarnings.value = parsed.warnings
    }
  } catch (e) {
    console.warn('智能解析报告失败，保留手动填写与本地提取结果', e)
  } finally {
    if (thisParseToken === currentScheduleParseToken) {
      pushingSchedule.value = false
    }
  }
}

async function handleAiRecognizeSchedule() {
  if (!currentScheduleEmail.value || aiRecognizing.value) return
  currentScheduleParseToken++ // 抑制并发的传统解析覆盖
  aiRecognizing.value = true
  try {
    if (scheduleType.value === 'conference') {
      const posterForAi = confForm.value.poster_url || emailPosterCandidate.value || ''
      const candidateDocs = scheduleCandidateDocs.value
      const pdfDoc = candidateDocs.find(d => d.content_type?.includes('pdf') || /\.pdf$/i.test(d.filename || ''))
      const pdfForAi = confForm.value.handbook_url || pdfDoc?.url || ''

      const extracted = await extractConferenceFromEmailWithAi(currentScheduleEmail.value, {
        posterImageUrl: posterForAi,
        pdfAttachmentUrl: pdfForAi
      })

      if (extracted) {
        if (extracted.title) confForm.value.title = extracted.title
        if (extracted.sub_type) confForm.value.sub_type = extracted.sub_type
        if (extracted.date) confForm.value.date = extracted.date
        if (extracted.end_date) confForm.value.end_date = extracted.end_date
        if (extracted.city) confForm.value.city = extracted.city
        if (extracted.location) confForm.value.location = extracted.location
        if (extracted.organizer) {
          confForm.value.organizer = extracted.organizer
          confForm.value.speaker = extracted.organizer
        }
        if (extracted.abstract_deadline) confForm.value.abstract_deadline = extracted.abstract_deadline
        if (extracted.early_bird_deadline) confForm.value.early_bird_deadline = extracted.early_bird_deadline
        if (extracted.registration_deadline) confForm.value.registration_deadline = extracted.registration_deadline
        if (extracted.website_url) confForm.value.website_url = extracted.website_url
        if (extracted.registration_url) confForm.value.registration_url = extracted.registration_url
        if (extracted.notes) confForm.value.notes = extracted.notes
        if (extracted.poster_url) {
          confForm.value.poster_url = extracted.poster_url
        } else if (posterForAi && !confForm.value.poster_url) {
          confForm.value.poster_url = posterForAi
        }
        if (pdfForAi && !confForm.value.handbook_url) {
          confForm.value.handbook_url = pdfForAi
        }

        let tip = 'AI 智能识别完成，已自动填充会议各栏目内容！'
        if (extracted.usedVision && extracted.usedPdf) {
          tip = 'AI 多模态智能识别完成，已结合海报与 PDF 通知文件提取完整会议信息！'
        } else if (extracted.usedVision) {
          tip = 'AI 多模态智能识别完成，已结合海报图片解析会议内容！'
        } else if (extracted.usedPdf) {
          tip = 'AI 智能识别完成，已深入解析 PDF 会议通知文件！'
        }
        notify(tip)
      }
      return
    }

    const posterForAi = scheduleForm.value.poster_url || emailPosterCandidate.value || ''
    const extracted = await extractScheduleFromEmailWithAi(currentScheduleEmail.value, {
      posterImageUrl: posterForAi
    })
    if (extracted) {
      if (extracted.title) scheduleForm.value.title = extracted.title
      if (extracted.date) scheduleForm.value.date = extracted.date
      if (extracted.time) scheduleForm.value.time = extracted.time
      if (extracted.speaker) scheduleForm.value.speaker = extracted.speaker
      if (extracted.location) scheduleForm.value.location = extracted.location
      if (extracted.notes) scheduleForm.value.notes = extracted.notes
      if (extracted.poster_url) {
        scheduleForm.value.poster_url = extracted.poster_url
      } else if (posterForAi && !scheduleForm.value.poster_url && attachEmailPoster.value) {
        scheduleForm.value.poster_url = posterForAi
      }

      if (detectedTalks.value.length > 0 && detectedTalks.value[currentTalkIndex.value]) {
        const cur = detectedTalks.value[currentTalkIndex.value]
        cur.title = scheduleForm.value.title
        cur.date = scheduleForm.value.date
        cur.time = scheduleForm.value.time
        cur.speaker = scheduleForm.value.speaker
        cur.location = scheduleForm.value.location
        cur.notes = scheduleForm.value.notes
        cur.poster_url = scheduleForm.value.poster_url
      }
      if (extracted.usedVision) {
        notify('AI 多模态智能识别完成，已结合海报提取报告内容并填充说明！')
      } else if (posterForAi && !isCurrentAiVisionCapable.value) {
        notify(`AI 智能填报完成。提示：当前模型 (${currentAiModelName.value}) 未开启海报识图；若需自动从海报提取内容，可在 AI 助手设置中开启视觉支持 (Vision)。`, 'info')
      } else {
        notify('AI 智能识别完成，已忠实填充日程各字段！')
      }
    }
  } catch (err) {
    console.error('AI 识别日程失败:', err)
    notify(err.message || 'AI 智能识别失败，请检查模型连接', 'error')
  } finally {
    aiRecognizing.value = false
  }
}

async function handleSaveTalkToSchedule() {
  if (scheduleType.value === 'conference') {
    if (!confForm.value.title?.trim() || !confForm.value.date) {
      notify('请完整填写会议名称与开始日期', 'error')
      return
    }
    if (!confForm.value.end_date) {
      confForm.value.end_date = confForm.value.date
    }
    if (confForm.value.end_date < confForm.value.date) {
      notify('结束日期不能早于开始日期', 'error')
      return
    }
    if (!confForm.value.organizer && confForm.value.speaker) {
      confForm.value.organizer = confForm.value.speaker
    }
    if (!confForm.value.speaker && confForm.value.organizer) {
      confForm.value.speaker = confForm.value.organizer
    }

    savingSchedule.value = true
    try {
      const payload = {
        ...confForm.value,
        title: confForm.value.title.trim(),
        event_type: 'conference',
        time: confForm.value.time || '全天'
      }
      const res = await talkApi.create(payload)
      showScheduleModal.value = false
      if (res?.replaced) {
        notify(`已更新学术会议“${confForm.value.title}”！可在学术日程与首页查看。`)
      } else if (res?.merged) {
        notify(`检测到完全相同的学术会议，无需重复添加。可在学术日程与首页查看。`)
      } else {
        notify(`已成功将学术会议“${confForm.value.title}”推送到学术日程！可在学术日程与首页查看。`)
      }
    } catch (e) {
      notify(e.message || '推送到学术会议失败', 'error')
    } finally {
      savingSchedule.value = false
    }
    return
  }

  if (detectedTalks.value.length > 1) {
    if (detectedTalks.value[currentTalkIndex.value]) {
      detectedTalks.value[currentTalkIndex.value] = {
        ...detectedTalks.value[currentTalkIndex.value],
        ...scheduleForm.value
      }
    }
    const toSave = detectedTalks.value.filter(t => t.selected)
    if (toSave.length === 0) {
      notify('请至少勾选一场要推送到日程的报告', 'error')
      return
    }
    for (let i = 0; i < toSave.length; i++) {
      const t = toSave[i]
      if (!t.title || !t.date || !t.time) {
        notify(`第 ${i + 1} 场报告缺少标题、日期或时间，请补充完整`, 'error')
        const foundIdx = detectedTalks.value.findIndex(item => item === t)
        if (foundIdx !== -1) switchTalkTab(foundIdx)
        return
      }
    }

    savingSchedule.value = true
    try {
      let savedCount = 0
      let replacedCount = 0
      let unchangedCount = 0
      for (const t of toSave) {
        const res = await talkApi.create({
          title: t.title.trim(),
          date: t.date,
          time: t.time,
          speaker: (t.speaker || '').trim(),
          location: (t.location || '').trim(),
          notes: (t.notes || '').trim(),
          poster_url: t.poster_url || ''
        })
        if (res?.replaced) {
          replacedCount++
        } else if (res?.merged) {
          unchangedCount++
        }
        savedCount++
      }
      showScheduleModal.value = false
      if (replacedCount > 0) {
        notify(`已成功推送 ${savedCount} 场报告（其中 ${replacedCount} 场检测到重复日程，已用最新推送更新替换）！可在工作台与组会日程查看。`)
      } else if (unchangedCount > 0) {
        notify(`已成功推送 ${savedCount} 场报告（其中 ${unchangedCount} 场已有完全相同记录无变更）！可在工作台与组会日程查看。`)
      } else {
        notify(`已成功将 ${savedCount} 场报告推送到科研日程表！可在工作台与组会日程查看。`)
      }
    } catch (e) {
      notify(e.message || '推送到日程失败', 'error')
    } finally {
      savingSchedule.value = false
    }
    return
  }

  if (!scheduleForm.value.title || !scheduleForm.value.date || !scheduleForm.value.time) {
    notify('请完整填写报告标题、日期与时间', 'error')
    return
  }
  savingSchedule.value = true
  try {
    const res = await talkApi.create({
      title: scheduleForm.value.title.trim(),
      date: scheduleForm.value.date,
      time: scheduleForm.value.time,
      speaker: (scheduleForm.value.speaker || '').trim(),
      location: (scheduleForm.value.location || '').trim(),
      notes: (scheduleForm.value.notes || '').trim(),
      poster_url: scheduleForm.value.poster_url || ''
    })
    showScheduleModal.value = false
    if (res?.replaced) {
      notify('检测到重复日程，已用最新推送内容更新替换！可在工作台与组会日程查看。')
    } else if (res?.merged) {
      notify('检测到相同日程，已有完全相同记录无变更。')
    } else {
      notify('报告已成功推送到科研日程表！可在工作台与组会日程查看。')
    }
  } catch (e) {
    notify(e.message || '推送到日程失败', 'error')
  } finally {
    savingSchedule.value = false
  }
}

const currentAiConfig = ref(loadAiConfig())
const currentAiModelName = computed(() => {
  const cfg = currentAiConfig.value
  if (!cfg) return 'AI 模型'
  const activeObj = (cfg.models || []).find(m => m.id === cfg.model)
  return activeObj?.name || cfg.model || 'AI 模型'
})
const isCurrentAiVisionCapable = computed(() => {
  return isModelVisionCapable(currentAiConfig.value)
})

function refreshAiState() {
  isAiAssistantReadyState.value = isAiAssistantReady()
  currentAiConfig.value = loadAiConfig()
}

onMounted(async () => {
  refreshAiState()
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', refreshAiState)
    window.addEventListener('focus', refreshAiState)
    window.addEventListener('labhub-ai-config-changed', refreshAiState)
  }
  try {
    currentUser.value = await authApi.getMe()
  } catch {}
  await loadConfig()
  await loadEmails(false)
  if (isAdmin.value) {
    loadSmtpConfig()
    loadSentEmails()
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('storage', refreshAiState)
    window.removeEventListener('focus', refreshAiState)
    window.removeEventListener('labhub-ai-config-changed', refreshAiState)
  }
})
</script>

<template>
  <div class="mailbox-page">
    <header class="page-heading">
      <div>
        <div class="eyebrow">ACADEMIC MAILBOX</div>
        <h1>邮箱</h1>
        <p>配置个人机构或通用学术邮箱，接收研讨通知与学术交流邮件（系统自动保留最近 7 天的最新邮件）。</p>
      </div>

      <div class="header-actions">
        <div v-if="config.has_config" class="mailbox-info-badge">
          <span class="status-dot"></span>
          <span class="user-email-text">{{ config.email_address }}</span>
          <span class="proto-tag">{{ config.protocol?.toUpperCase() }}</span>
        </div>

        <button v-if="config.has_config" class="button secondary" :disabled="syncing || loading" @click="loadEmails(true)">
          <AppIcon name="undo" :class="{ 'spin-icon': syncing }" :size="16" />
          <span>{{ syncing ? (syncProgress.percent > 0 ? `同步中 ${syncProgress.percent}%` : '正在同步…') : '同步邮件' }}</span>
        </button>

        <button class="button" :class="config.has_config ? 'ghost' : 'primary'" @click="openConfig">
          <AppIcon name="clock" :size="16" />
          <span>{{ config.has_config ? '邮箱设置' : '配置邮箱' }}</span>
        </button>
      </div>
    </header>

    <!-- 邮箱分类标签：收件箱 / 已发通知（发件箱） -->
    <div class="mailbox-tabs-nav">
      <button
        type="button"
        class="mailbox-tab-btn"
        :class="{ active: currentFolder === 'inbox' }"
        @click="switchFolder('inbox')"
      >
        <AppIcon name="envelope" :size="16" />
        <span>收件箱</span>
        <span v-if="emails.length" class="tab-count-pill">{{ emails.length }}</span>
      </button>
      <button
        v-if="isAdmin"
        type="button"
        class="mailbox-tab-btn"
        :class="{ active: currentFolder === 'sent' }"
        @click="switchFolder('sent')"
      >
        <AppIcon name="paper" :size="16" />
        <span>已发通知（发件箱）</span>
        <span v-if="sentEmails.length" class="tab-count-pill">{{ sentEmails.length }}</span>
      </button>
    </div>

    <!-- 收件箱视图 -->
    <template v-if="currentFolder === 'inbox'">
      <!-- 同步进度指示卡片 -->
      <transition name="fade">
        <div
          v-if="syncProgress.active"
          class="sync-progress-card glass-card"
          :class="{ 'is-completed': syncProgress.completed, 'is-error': syncProgress.error }"
        >
          <div class="sync-progress-top">
            <div class="sync-progress-label">
              <AppIcon
                v-if="!syncProgress.completed && !syncProgress.error"
                name="undo"
                class="spin-icon sync-icon"
                :size="16"
              />
              <AppIcon
                v-else-if="syncProgress.completed"
                name="check"
                class="sync-icon success-icon"
                :size="16"
              />
              <AppIcon
                v-else
                name="close"
                class="sync-icon error-icon"
                :size="16"
              />
              <span class="sync-title">{{ syncProgress.message }}</span>
            </div>
            <span class="sync-percent mono">{{ syncProgress.percent }}%</span>
          </div>

          <div class="sync-bar-track">
            <div
              class="sync-bar-fill"
              :style="{ width: `${syncProgress.percent}%` }"
            ></div>
          </div>

          <div v-if="syncProgress.detail" class="sync-progress-detail mono muted">
            {{ syncProgress.detail }}
          </div>
        </div>
      </transition>

      <!-- 检索与过滤条 -->
      <div v-if="config.has_config" class="mailbox-search-bar">
        <form class="search-form" @submit.prevent="loadEmails(false)">
          <div class="search-input-wrap">
            <AppIcon name="search" :size="17" class="search-icon" />
            <WaveInput
              id="mail-search"
              v-model="query"
              type="search"
              label="搜索发件人、主题或邮件摘要关键词…"
              wrapper-class="search-wave-box"
              clearable
              @clear="loadEmails(false)"
              @keydown.enter.prevent="loadEmails(false)"
            />
          </div>
          <button class="button secondary" type="submit">搜索</button>
        </form>
      </div>

      <!-- 1. 未配置邮箱引导状态 -->
      <section v-if="!config.has_config && !loading" id="tour-mailbox-main" class="empty-state glass-card mailbox-welcome">
        <div class="welcome-icon-box">
          <AppIcon name="envelope" :size="48" />
        </div>
        <h2>开启个人学术邮箱</h2>
        <p id="tour-mailbox-features" class="welcome-desc">
          随时随地在科研协作工作台中查收学术报告、组会通知、期刊审稿与学术邮件。<br />
          已深度适配 <strong>中科院科技网 (@cstnet.cn)</strong>、网易 163/126、QQ 邮箱及各类高校与科研机构 IMAP / POP3 服务。
        </p>
        <div class="preset-badges-show">
          <span class="badge cyan">中科院科技网 (@cstnet.cn)</span>
          <span class="badge">网易企业/个人邮</span>
          <span class="badge">QQ 邮箱</span>
          <span class="badge">高校 / 机构邮箱</span>
          <span class="badge">自定义 IMAP / POP3</span>
        </div>
        <button class="button primary welcome-cta" @click="openConfig">
          <AppIcon name="plus" :size="16" />
          立即设置邮箱
        </button>
      </section>

      <!-- 2. 加载与错误提示 -->
      <LoadingState v-else-if="loading" message="正在读取邮件数据…" />
      <div v-else-if="error" class="error-banner">
        <span>{{ error }}</span>
        <div class="banner-actions">
          <button class="button small secondary" @click="loadEmails(true)">重试同步</button>
          <button class="button small ghost" @click="openConfig">检查配置</button>
        </div>
      </div>

      <!-- 3. 已配置邮箱但无邮件 -->
      <div v-else-if="!emails.length" class="empty-state glass-card">
        <AppIcon name="envelope" :size="36" />
        <h3>暂未拉取到邮件</h3>
        <p>收件箱为空，或者尚未从邮箱服务器同步最新数据。点击上方【同步邮件】拉取邮件。</p>
        <button class="button secondary" :disabled="syncing" @click="loadEmails(true)">
          <AppIcon name="undo" :class="{ 'spin-icon': syncing }" :size="16" />
          {{ syncing ? '正在连接同步…' : '立即拉取邮件' }}
        </button>
      </div>

      <!-- 4. 邮件列表 -->
      <section v-else id="tour-mailbox-main" class="emails-container">
        <div class="emails-meta-summary">
          <span class="muted">共 {{ emails.length }} 封邮件（最近 7 天） · 点击卡片展开查看正文与详情</span>
          <button
            type="button"
            class="clear-emails-btn"
            :disabled="clearingEmails"
            title="清空本地所有已同步的邮件，释放服务器存储空间"
            @click="handleClearAllEmails"
          >
            <AppIcon name="trash" :size="13" />
            <span>{{ clearingEmails ? '正在清空…' : '清空邮件' }}</span>
          </button>
        </div>

        <div class="email-list">
          <article
            v-for="item in sortedEmails"
            :key="item.id"
            class="email-card glass-card"
            :class="{ active: selectedEmail?.id === item.id && !selectedEmail?.isSent }"
            @click="openEmailDetail(item, false)"
          >
            <div class="email-avatar" :title="item.sender_name || item.sender_email">
              {{ getInitial(item.sender_name || item.sender_email) }}
            </div>

            <div class="email-card-body">
              <div class="email-card-header">
                <span class="sender-name">{{ item.sender_name || item.sender_email }}</span>
                <div class="header-right-meta">
                  <button
                    v-if="isConferenceEmail(item)"
                    type="button"
                    class="button small secondary schedule-push-btn conf-push-btn"
                    title="识别到学术会议通知，点击推送到学术会议录入"
                    @click.stop="openPushScheduleModal(item, '', 'conference')"
                  >
                    <AppIcon name="calendar" :size="13" />
                    <span>推送到学术会议</span>
                  </button>
                  <button
                    v-else-if="isTalkEmail(item)"
                    type="button"
                    class="button small secondary schedule-push-btn"
                    title="识别到学术报告通知，点击直接推送到日程"
                    @click.stop="openPushScheduleModal(item, '', 'talk')"
                  >
                    <AppIcon name="calendar" :size="13" />
                    <span>推送到日程</span>
                  </button>
                  <button
                    type="button"
                    class="email-delete-btn"
                    :disabled="deletingEmailId === item.id"
                    title="从本地缓存删除该邮件"
                    @click.stop="handleDeleteSingleEmail(item)"
                  >
                    <AppIcon name="trash" :size="13" />
                  </button>
                  <span class="email-date" :title="item.date_str">{{ formatEmailDate(item.date_str) }}</span>
                </div>
              </div>

              <h3 class="email-subject">
                {{ item.subject || '（无主题）' }}
              </h3>

              <p class="email-snippet">{{ item.snippet || '（无正文预览）' }}</p>

              <div class="email-card-footer">
                <span class="sender-email-chip mono">{{ item.sender_email }}</span>
                <span v-if="hasEmailDocs(item)" class="badge cyan small-badge">
                  包含通知文档 {{ getEmailDocsCount(item) > 1 ? `(${getEmailDocsCount(item)})` : '' }}
                </span>
                <span v-if="hasEmailImages(item)" class="badge cyan small-badge">
                  包含图片 {{ getEmailImagesCount(item) > 1 ? `(${getEmailImagesCount(item)})` : '' }}
                </span>
                <span v-else-if="item.has_attachments && !hasEmailDocs(item)" class="badge amber small-badge">
                  包含附件
                </span>
                <span class="read-hint">查看详情 →</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>

    <!-- 已发通知视图 (发件箱) -->
    <section v-else-if="currentFolder === 'sent' && isAdmin" class="sent-emails-view">
      <LoadingState v-if="loadingSent" message="正在加载已发送通知…" />
      
      <div v-else-if="!sentEmails.length" class="empty-state glass-card">
        <AppIcon name="paper" :size="36" />
        <h3>暂无已发送通知</h3>
        <p>您在「组会日程」中发送的组会通知将自动在此归档并随时查阅（仅您本人可见）。</p>
      </div>

      <div v-else class="emails-container">
        <div class="emails-meta-summary">
          <span class="muted">共 {{ sentEmails.length }} 条发信记录 · 点击卡片展开查看邮件正文与收件人详情</span>
        </div>

        <div class="email-list">
          <article
            v-for="item in sentEmails"
            :key="item.id"
            class="email-card glass-card sent-card"
            :class="{ active: selectedEmail?.id === item.id && selectedEmail?.isSent }"
            @click="openEmailDetail(item, true)"
          >
            <div class="email-avatar sent-avatar" title="发出的邮件通知">
              发
            </div>

            <div class="email-card-body">
              <div class="email-card-header">
                <div class="sender-name">
                  <span>发件人：{{ item.sender_name }}</span>
                  <span class="mono muted">&lt;{{ item.sender_email }}&gt;</span>
                </div>
                <div class="header-right-meta">
                  <span class="sent-status-badge" :class="item.status === 'sent' ? 'success' : 'failed'">
                    {{ item.status === 'sent' ? '已发送' : '发送失败' }}
                  </span>
                  <span class="email-date">{{ formatEmailDate(item.created_at) }}</span>
                </div>
              </div>

              <h3 class="email-subject">
                {{ item.subject || '（无主题）' }}
              </h3>

              <div class="sent-recipients-preview">
                <span class="muted">收件人 ({{ item.recipients?.length || 0 }} 人)：</span>
                <span class="recipient-preview-text mono">
                  {{ (item.recipients || []).slice(0, 3).join(', ') }}{{ (item.recipients?.length > 3) ? ` 等共 ${item.recipients.length} 人` : '' }}
                </span>
              </div>

              <p class="email-snippet">{{ item.snippet || '（无正文预览）' }}</p>

              <div class="email-card-footer">
                <span class="sent-time-text muted">发送时间：{{ item.created_at }}</span>
                <span class="read-hint">查看详情 →</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 邮件详情抽屉 (Reader Drawer) -->
    <BaseDialog
      :open="!!selectedEmail"
      :drawer="true"
      :wide="true"
      :title="selectedEmail?.subject || '邮件详情'"
      @close="selectedEmail = null"
    >
      <template v-if="selectedEmail">
        <div class="mail-reader-meta">
          <div class="reader-header-row">
            <div class="reader-sender">
              <span class="meta-label">发件人：</span>
              <strong>{{ selectedEmail.sender_name }}</strong>
              <span class="mono muted">&lt;{{ selectedEmail.sender_email }}&gt;</span>
            </div>
            <span class="email-date-badge">{{ selectedEmail.date_str }}</span>
          </div>

          <div v-if="selectedEmail.isSent && selectedEmail.recipients?.length" class="reader-recipient sent-recipients-box">
            <span class="meta-label">收件人（共 {{ selectedEmail.recipients.length }} 人）：</span>
            <div class="recipient-chips-list">
              <span v-for="rcpt in selectedEmail.recipients" :key="rcpt" class="recipient-chip mono">
                {{ rcpt }}
              </span>
            </div>
          </div>
          <div v-else-if="selectedEmail.recipient" class="reader-recipient">
            <span class="meta-label">收件人：</span>
            <span class="mono">{{ selectedEmail.recipient }}</span>
          </div>
        </div>

        <div class="reader-actions-toolbar">
          <div class="view-toggles">
            <button
              v-if="emailDetail?.body_html"
              class="button small"
              :class="showBodyHtml ? 'primary' : 'ghost'"
              @click="showBodyHtml = true"
            >
              网页排版
            </button>
            <button
              class="button small"
              :class="!showBodyHtml ? 'primary' : 'ghost'"
              @click="showBodyHtml = false"
            >
              纯文本
            </button>
          </div>

          <div class="reader-toolbar-right">
            <button
              v-if="!selectedEmail.isSent && isConferenceEmail(selectedEmail)"
              type="button"
              class="button small secondary schedule-push-btn conf-push-btn"
              title="识别到学术会议通知，点击推送到学术会议录入"
              @click="openPushScheduleModal(selectedEmail, '', 'conference')"
            >
              <AppIcon name="calendar" :size="14" />
              <span>推送到学术会议</span>
            </button>
            <button
              v-else-if="!selectedEmail.isSent && isTalkEmail(selectedEmail)"
              type="button"
              class="button small secondary schedule-push-btn"
              title="识别到学术报告通知，点击直接推送到日程"
              @click="openPushScheduleModal(selectedEmail, '', 'talk')"
            >
              <AppIcon name="calendar" :size="14" />
              <span>推送到日程</span>
            </button>
            <button type="button" class="button small ghost" @click="copyEmailContent">
              <AppIcon name="edit" :size="14" />
              <span>复制正文</span>
            </button>
            <button
              v-if="!selectedEmail.isSent"
              type="button"
              class="button small ghost reader-delete-btn"
              :disabled="deletingEmailId === selectedEmail.id"
              title="从本地缓存删除此邮件"
              @click="handleDeleteSingleEmail(selectedEmail)"
            >
              <AppIcon name="trash" :size="14" />
              <span>删除邮件</span>
            </button>
          </div>
        </div>

        <!-- 邮件图片附件区 -->
        <div v-if="emailImageAttachments.length" class="email-attachments-banner glass-card">
          <div class="attachments-banner-header">
            <div class="attachments-title-row">
              <AppIcon name="paper" :size="16" />
              <strong>邮件图片附件</strong>
              <span class="badge cyan small-badge">共 {{ emailImageAttachments.length }} 张图片</span>
            </div>
            <span class="attachments-hint muted">可点选合适图片作为海报推送到日程</span>
          </div>
          <div class="email-attachments-grid">
            <div
              v-for="(att, idx) in emailImageAttachments"
              :key="att.id || att.url || idx"
              class="attachment-image-card glass-card"
            >
              <div class="attachment-image-thumb-wrap">
                <img :src="att.url" :alt="att.filename || '邮件图片'" class="attachment-image-thumb" loading="lazy" />
              </div>
              <div class="attachment-image-meta">
                <span class="attachment-filename" :title="att.filename || '图片附件'">
                  {{ att.filename || `图片 ${idx + 1}` }}
                </span>
                <span v-if="att.size" class="attachment-filesize muted">
                  {{ (att.size / 1024).toFixed(1) }} KB
                </span>
              </div>
              <div class="attachment-image-actions">
                <a
                  :href="att.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="button ghost tiny"
                  title="在新标签页中查看完整大图"
                >
                  <AppIcon name="link" :size="12" />
                  <span>查看原图 ↗</span>
                </a>
                <button
                  v-if="!selectedEmail.isSent && isConferenceEmail(selectedEmail)"
                  type="button"
                  class="button secondary tiny"
                  title="将此图片作为会议通知文件推送到学术会议"
                  @click="openPushScheduleModal(selectedEmail, att.url, 'conference')"
                >
                  <AppIcon name="calendar" :size="12" />
                  <span>作为通知文件推送到会议</span>
                </button>
                <button
                  v-else-if="!selectedEmail.isSent && isTalkEmail(selectedEmail)"
                  type="button"
                  class="button secondary tiny"
                  title="将此图片作为海报推送到学术日程"
                  @click="openPushScheduleModal(selectedEmail, att.url, 'talk')"
                >
                  <AppIcon name="calendar" :size="12" />
                  <span>作为海报推送到日程</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 邮件文档附件区 (PDF / Word) -->
        <div v-if="emailDocAttachments.length" class="email-doc-attachments-banner glass-card">
          <div class="attachments-banner-header">
            <div class="attachments-title-row">
              <AppIcon name="paper" :size="16" />
              <strong>通知文档 / 附件文件</strong>
              <span class="badge cyan small-badge">共 {{ emailDocAttachments.length }} 个文件</span>
            </div>
            <span class="attachments-hint muted">包含 PDF 或 Word 通知文件，可在线预览或推送到会议手册</span>
          </div>
          <div class="email-doc-attachments-list">
            <div
              v-for="(doc, idx) in emailDocAttachments"
              :key="doc.id || doc.url || idx"
              class="email-doc-item glass-card"
            >
              <div class="doc-icon-wrap">
                <AppIcon :name="doc.filename?.toLowerCase().endsWith('.pdf') ? 'paper' : 'edit'" :size="20" />
              </div>
              <div class="doc-text-meta">
                <span class="doc-filename" :title="doc.filename || '通知文件'">
                  {{ doc.filename || `通知文件 ${idx + 1}` }}
                </span>
                <span v-if="doc.size" class="doc-filesize muted">
                  {{ (doc.size / 1024).toFixed(1) }} KB
                </span>
              </div>
              <div class="email-doc-actions">
                <a
                  :href="doc.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="button ghost tiny"
                  title="在新标签页中查看或下载原文件"
                >
                  <AppIcon name="link" :size="12" />
                  <span>查看/下载 ↗</span>
                </a>
                <button
                  v-if="!selectedEmail.isSent && isConferenceEmail(selectedEmail)"
                  type="button"
                  class="button secondary tiny"
                  title="将此文件作为会议手册推送到学术会议"
                  @click="openPushScheduleModal(selectedEmail, '', 'conference', doc.url)"
                >
                  <AppIcon name="calendar" :size="12" />
                  <span>设为手册推送到会议</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <LoadingState v-if="loadingDetail" message="正在解析邮件正文…" />
        
        <div v-else class="mail-reader-content glass-card">
          <!-- 富文本展示 -->
          <div
            v-if="showBodyHtml && emailDetail?.body_html"
            class="email-html-sandbox"
            v-html="emailDetail.body_html"
          />
          <!-- 纯文本展示 -->
          <pre v-else class="email-plain-text">{{ emailDetail?.body_text || selectedEmail.snippet }}</pre>
        </div>
      </template>
    </BaseDialog>

    <!-- 邮箱与发件配置弹窗 (Config Dialog) -->
    <BaseDialog
      :open="showConfigModal"
      :title="isAdmin ? '配置个人学术邮箱与发信服务' : '配置个人学术邮箱'"
      :busy="savingConfig || testingConn || deletingConfig || savingSmtp || testingSmtpConn"
      @close="showConfigModal = false"
    >
      <!-- 管理员专享 Tab 切换 -->
      <div v-if="isAdmin" class="segmented config-tab-segmented">
        <button
          type="button"
          :class="{ active: configTab === 'incoming' }"
          @click="configTab = 'incoming'"
        >
          接收服务 (IMAP / POP3)
        </button>
        <button
          type="button"
          :class="{ active: configTab === 'outgoing' }"
          @click="configTab = 'outgoing'"
        >
          发送服务 (SMTP - 管理员专属)
        </button>
      </div>

      <!-- 1. 接收配置表单 (IMAP/POP3) -->
      <form v-if="configTab === 'incoming'" class="mail-config-form" @submit.prevent="handleSaveConfig">
        <!-- 常用服务预设 -->
        <div class="form-group">
          <label class="form-label">快速预设模板</label>
          <div class="presets-row">
            <button
              v-for="p in presets"
              :key="p.name"
              type="button"
              class="preset-btn"
              :class="{ active: activePreset === p.name }"
              @click="applyPreset(p)"
            >
              {{ p.name }}
            </button>
          </div>
        </div>

        <!-- 协议选择 -->
        <div class="form-group">
          <label class="form-label">接收协议</label>
          <div class="segmented proto-segmented">
            <button
              type="button"
              :class="{ active: configForm.protocol === 'imap' }"
              @click="onProtocolChange('imap')"
            >
              IMAP（推荐，支持实时同步与邮件状态）
            </button>
            <button
              type="button"
              :class="{ active: configForm.protocol === 'pop3' }"
              @click="onProtocolChange('pop3')"
            >
              POP3
            </button>
          </div>
        </div>

        <!-- 邮箱地址与用户名 -->
        <div class="form-row">
          <label>
            邮箱地址
            <input
              v-model="configForm.email_address"
              type="text"
              placeholder="如：researcher@univ.edu.cn"
              required
              @blur="onEmailBlur"
            />
            <small class="muted field-hint">
              请输入完整的学术机构或个人邮箱地址
            </small>
          </label>
          <label>
            登录用户名
            <input
              v-model="configForm.username"
              type="text"
              placeholder="通常为完整邮箱地址"
              required
            />
            <small class="muted field-hint">
              科技网及多数机构邮箱登录名通常为完整邮箱地址
            </small>
          </label>
        </div>

        <!-- 客户端专用授权码 -->
        <div class="form-group">
          <label class="form-label">客户端专用授权码</label>

          <!-- 已保存状态：不可查看明文，仅提供修改按钮 -->
          <div v-if="config.has_password && !editingIncomingPassword" class="saved-secret-box">
            <div class="saved-secret-info">
              <span class="status-dot green"></span>
              <span class="saved-secret-text">已安全保存客户端授权码（不可查看）</span>
            </div>
            <button
              type="button"
              class="button small secondary"
              @click="editingIncomingPassword = true"
            >
              修改授权码
            </button>
          </div>

          <!-- 输入或修改状态 -->
          <div v-else class="secret-edit-wrap">
            <input
              v-model="configForm.password"
              type="password"
              autocomplete="new-password"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="请输入客户端专用授权码"
              :required="!config.has_password"
            />
            <button
              v-if="config.has_password"
              type="button"
              class="button small ghost"
              @click="editingIncomingPassword = false; configForm.password = ''"
            >
              取消
            </button>
          </div>

          <small class="muted field-hint">
            中科院科技网及各类学术与个人邮箱均使用客户端专用授权码进行认证。授权码一旦输入即安全加密存储，不支持查看，仅支持重新输入修改。
          </small>
        </div>

        <!-- 服务器与端口 -->
        <div class="form-row">
          <label>
            {{ configForm.protocol.toUpperCase() }} 服务器地址
            <input
              v-model="configForm.server_host"
              type="text"
              placeholder="如：mail.cstnet.cn"
              required
            />
            <small class="muted field-hint">
              常用机构 IMAP 服务器地址（如 <strong>mail.cstnet.cn</strong> 或 <strong>imap.univ.edu.cn</strong>）
            </small>
          </label>
          <label>
            端口号
            <input
              v-model.number="configForm.server_port"
              type="number"
              placeholder="993"
              required
            />
            <small class="muted field-hint">
              默认端口：IMAP <strong>993</strong> / POP3 <strong>995</strong>
            </small>
          </label>
        </div>

        <!-- SSL 安全传输开关 -->
        <div class="ssl-checkbox-wrap">
          <label class="checkbox-label">
            <input v-model="configForm.use_ssl" type="checkbox" />
            <span>启用 SSL / TLS 安全加密连接（推荐默认开启）</span>
          </label>
        </div>

        <!-- 连接测试反馈信息 -->
        <div v-if="testResult" class="test-feedback-box" :class="testResult.success ? 'success' : 'error'">
          <AppIcon :name="testResult.success ? 'check' : 'warning'" :size="16" />
          <span>{{ testResult.message }}</span>
        </div>

        <!-- 弹窗底部操作栏 -->
        <div class="form-actions config-actions">
          <button
            v-if="config.has_config"
            type="button"
            class="button danger ghost unbind-btn"
            :disabled="deletingConfig || savingConfig || testingConn"
            @click="handleDeleteConfig"
          >
            {{ deletingConfig ? '正在解除…' : '解除绑定' }}
          </button>

          <button
            type="button"
            class="button secondary"
            :disabled="testingConn || savingConfig"
            @click="handleTestConnection"
          >
            <AppIcon name="clock" :size="15" />
            <span>{{ testingConn ? '正在测试连接…' : '测试连接' }}</span>
          </button>

          <button
            type="submit"
            class="button primary"
            :disabled="savingConfig || testingConn"
          >
            {{ savingConfig ? '正在保存…' : '保存配置' }}
          </button>
        </div>
      </form>

      <!-- 2. 发件配置表单 (SMTP 管理员专属) -->
      <form v-else-if="configTab === 'outgoing' && isAdmin" class="mail-config-form" @submit.prevent="handleSaveSmtpConfig">
        <!-- 常用服务预设 -->
        <div class="form-group">
          <label class="form-label">快速预设模板</label>
          <div class="presets-row">
            <button
              v-for="p in smtpPresets"
              :key="p.name"
              type="button"
              class="preset-btn"
              :class="{ active: activeSmtpPreset === p.name }"
              @click="applySmtpPreset(p)"
            >
              {{ p.name }}
            </button>
          </div>
        </div>

        <!-- 服务器与端口 -->
        <div class="form-row">
          <label>
            SMTP 服务器地址
            <input
              v-model="smtpForm.host"
              type="text"
              placeholder="如：mail.cstnet.cn 或 smtp.163.com"
              required
            />
            <small class="muted field-hint">
              常用机构默认 SMTP 地址（如 <strong>mail.cstnet.cn</strong> 或 <strong>smtp.163.com</strong>）
            </small>
          </label>
          <label>
            端口号
            <input
              v-model.number="smtpForm.port"
              type="number"
              placeholder="465"
              required
            />
            <small class="muted field-hint">
              默认端口：SSL/TLS <strong>465</strong>，STARTTLS <strong>587</strong>
            </small>
          </label>
        </div>

        <!-- SSL 开关 -->
        <div class="ssl-checkbox-wrap">
          <label class="checkbox-label">
            <input v-model="smtpForm.use_ssl" type="checkbox" />
            <span>启用 SSL / TLS 安全加密（465 端口默认推荐开启）</span>
          </label>
        </div>

        <!-- SMTP 登录用户名 -->
        <div class="form-group">
          <label>
            SMTP 登录用户名
            <input
              v-model="smtpForm.username"
              type="text"
              placeholder="如：admin@univ.edu.cn"
              required
            />
            <small class="muted field-hint">
              通常为发件人邮箱完整账号
            </small>
          </label>
        </div>

        <!-- 发信客户端授权码 -->
        <div class="form-group">
          <!-- 选项：复用接收服务 (IMAP) 客户端专用授权码 -->
          <div v-if="config.has_config || smtpConfig.has_imap_password" class="use-imap-option">
            <label class="checkbox-label imap-sync-checkbox">
              <input v-model="smtpForm.use_imap_password" type="checkbox" />
              <span>使用与接收服务 (IMAP) 相同的客户端授权码（推荐）</span>
            </label>
            <div v-if="smtpForm.use_imap_password" class="imap-sync-tip">
              <AppIcon name="check" :size="15" />
              <span>已绑定接收服务 ({{ config.email_address || smtpConfig.imap_email }}) 的客户端授权码，发件与连通测试将直接复用该授权码，无需重复输入。</span>
            </div>
          </div>

          <!-- 独立客户端授权码配置 (当未勾选复用 IMAP 时展示) -->
          <div v-if="!smtpForm.use_imap_password" class="custom-secret-section">
            <label class="form-label">发信客户端专用授权码</label>

            <!-- 已保存状态：不可查看明文，仅提供修改按钮 -->
            <div v-if="smtpConfig.has_password && !editingSmtpPassword" class="saved-secret-box">
              <div class="saved-secret-info">
                <span class="status-dot green"></span>
                <span class="saved-secret-text">已安全保存客户端发信授权码（不可查看）</span>
              </div>
              <button
                type="button"
                class="button small secondary"
                @click="editingSmtpPassword = true"
              >
                修改授权码
              </button>
            </div>

            <!-- 输入或修改状态 -->
            <div v-else class="secret-edit-wrap">
              <input
                v-model="smtpForm.password"
                type="password"
                autocomplete="new-password"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                placeholder="请输入发信专用客户端授权码"
                :required="!smtpConfig.has_password && !smtpForm.use_imap_password"
              />
              <button
                v-if="smtpConfig.has_password"
                type="button"
                class="button small ghost"
                @click="editingSmtpPassword = false; smtpForm.password = ''"
              >
                取消
              </button>
            </div>

            <small class="muted field-hint">
              请填写邮箱客户端专用授权码（非网页端登录密码）。客户端授权码一旦输入即安全加密存储，不支持明文查看，仅支持重新输入修改。
            </small>
          </div>
        </div>

        <!-- 发件人信息 -->
        <div class="form-row">
          <label>
            发件人邮箱地址 (From Email)
            <input
              v-model="smtpForm.from_email"
              type="email"
              placeholder="如：admin@univ.edu.cn"
              required
            />
            <small class="muted field-hint">
              通知邮件实际发出的发件人地址
            </small>
          </label>
          <label>
            发件人显示姓名 (From Name)
            <input
              v-model="smtpForm.from_name"
              type="text"
              placeholder="如：科研秘书 / 管理员"
            />
            <small class="muted field-hint">
              通知邮件发送人显示名称（默认管理员真实姓名）
            </small>
          </label>
        </div>

        <!-- 连接测试反馈 -->
        <div v-if="smtpTestResult" class="test-feedback-box" :class="smtpTestResult.success ? 'success' : 'error'">
          <AppIcon :name="smtpTestResult.success ? 'check' : 'warning'" :size="16" />
          <span>{{ smtpTestResult.message }}</span>
        </div>

        <!-- 底部操作按钮 -->
        <div class="form-actions config-actions">
          <button
            type="button"
            class="button secondary"
            :disabled="testingSmtpConn || savingSmtp"
            @click="handleTestSmtpConnection"
          >
            <AppIcon name="clock" :size="15" />
            <span>{{ testingSmtpConn ? '正在测试发信连接…' : '测试发信连接' }}</span>
          </button>

          <button
            type="submit"
            class="button primary"
            :disabled="savingSmtp || testingSmtpConn"
          >
            {{ savingSmtp ? '正在保存…' : '保存 SMTP 配置' }}
          </button>
        </div>
      </form>
    </BaseDialog>

    <!-- 报告/会议推送到日程确认弹窗 -->
    <BaseDialog
      :open="showScheduleModal"
      :title="scheduleType === 'conference' ? '推送到学术会议' : '推送到科研日程'"
      :busy="savingSchedule"
      @close="showScheduleModal = false"
    >
      <form class="form-grid" @submit.prevent="handleSaveTalkToSchedule">
        <!-- 模式切换：学术报告 vs 学术会议 -->
        <div class="schedule-type-segmented">
          <button
            type="button"
            class="schedule-type-btn"
            :class="{ active: scheduleType === 'talk' }"
            @click="switchScheduleType('talk')"
          >
            <AppIcon name="calendar" :size="14" />
            <span>学术报告</span>
          </button>
          <button
            type="button"
            class="schedule-type-btn"
            :class="{ active: scheduleType === 'conference' }"
            @click="switchScheduleType('conference')"
          >
            <AppIcon name="paper" :size="14" />
            <span>学术会议</span>
          </button>
        </div>

        <div v-if="isAiAssistantReadyState" class="ai-schedule-recognize-bar">
          <div class="ai-recognize-lead">
            <AppIcon name="robot" :size="16" class="ai-bot-icon" />
            <div class="ai-recognize-meta">
              <span class="ai-lead-text">已就绪（{{ currentAiModelName }}）</span>
              <span v-if="isCurrentAiVisionCapable" class="ai-pill ai-vision-pill" :title="scheduleType === 'conference' ? '当前模型支持多模态视觉，将自动结合海报/通知文档与正文解析会议全部栏目' : '当前模型支持多模态视觉，将自动结合海报图片解析报告内容'">
                <AppIcon name="image" :size="11" />
                <span>已开启多模态识图</span>
              </span>
              <span v-else class="ai-pill ai-text-pill" title="当前模型仅支持纯文本，无法读取海报图片内容。如需自动提取海报或文档内容，请前往 AI 助手开启视觉支持">
                <span>纯文本模式</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            class="ai-recognize-action-btn"
            :disabled="aiRecognizing || savingSchedule"
            @click="handleAiRecognizeSchedule"
          >
            <AppIcon :name="aiRecognizing ? 'undo' : 'sparkle'" :class="{ 'spin-icon': aiRecognizing }" :size="14" />
            <span>{{ aiRecognizing ? '正在智能识别…' : (scheduleType === 'conference' ? 'AI 识别会议全部栏目' : 'AI 智能识别填报') }}</span>
          </button>
        </div>

        <div v-if="pushingSchedule" class="parsing-hint">
          <AppIcon name="undo" class="spin-icon" :size="15" />
          <span>{{ scheduleType === 'conference' ? '正在智能提取会议名称、类型、日期、城市、关键时间节点与资料…' : '正在智能提取报告标题、主讲人、时间与地点…' }}</span>
        </div>

        <div v-if="scheduleWarnings.length" class="parse-warnings">
          <p v-for="w in scheduleWarnings" :key="w">{{ w }}</p>
        </div>

        <!-- 学术会议表单视图 -->
        <template v-if="scheduleType === 'conference'">
          <label>
            会议名称
            <input
              v-model="confForm.title"
              type="text"
              placeholder="如：第二届空间天文与高能天体物理前沿研讨会"
              required
            />
          </label>

          <div class="form-row">
            <label>
              会议类型
              <select v-model="confForm.sub_type">
                <option value="研讨会">研讨会</option>
                <option value="年会">年会</option>
                <option value="暑期学校">暑期学校</option>
                <option value="学术论坛">学术论坛</option>
                <option value="专题研讨">专题研讨</option>
                <option value="其他">其他</option>
              </select>
            </label>
            <label>
              举办城市
              <input
                v-model="confForm.city"
                type="text"
                placeholder="如：南京 / 北京 / 线上"
              />
            </label>
          </div>

          <div class="form-row">
            <label>
              开始日期
              <input
                v-model="confForm.date"
                type="date"
                required
              />
            </label>
            <label>
              结束日期
              <input
                v-model="confForm.end_date"
                type="date"
              />
            </label>
          </div>

          <div class="form-row">
            <label>
              主办单位 / 发起方
              <input
                v-model="confForm.speaker"
                type="text"
                placeholder="如：中国天文学会 / 研究所"
              />
            </label>
            <label>
              详细地点 / 线上会议号
              <input
                v-model="confForm.location"
                type="text"
                placeholder="如：第一学术报告厅 / 腾讯会议号"
              />
            </label>
          </div>

          <!-- 会议关键时间节点卡片 -->
          <div class="form-section-card">
            <div class="form-section-title">关键时间节点（选填）</div>
            <div class="form-row form-row-3">
              <label>
                摘要投递截止
                <input v-model="confForm.abstract_deadline" type="date" />
              </label>
              <label>
                早鸟优惠截止
                <input v-model="confForm.early_bird_deadline" type="date" />
              </label>
              <label>
                注册报名截止
                <input v-model="confForm.registration_deadline" type="date" />
              </label>
            </div>
          </div>

          <!-- 会议相关链接 -->
          <div class="form-section-card">
            <div class="form-section-title">相关链接（选填）</div>
            <div class="form-row">
              <label>
                官方网站
                <input v-model="confForm.website_url" type="url" placeholder="https://..." />
              </label>
              <label>
                在线报名网址
                <input v-model="confForm.registration_url" type="url" placeholder="https://..." />
              </label>
            </div>
          </div>

          <!-- 会议手册 / 议程文件 -->
          <div class="schedule-poster-section">
            <div class="schedule-poster-header">
              <span class="poster-label-text">
                <strong>会议手册 / 议程文件（可选）</strong>
                <small v-if="scheduleCandidateDocs.length" class="muted">（邮件检测到文档附件，可直接点选）</small>
              </span>
            </div>

            <div v-if="scheduleCandidateDocs.length" class="poster-candidates-selector">
              <div class="candidates-title muted">
                <span>从邮件文档中点选会议手册：</span>
              </div>
              <div class="poster-candidate-chips">
                <button
                  type="button"
                  class="poster-chip no-poster-chip"
                  :class="{ active: !confForm.handbook_url }"
                  @click="clearScheduleHandbook"
                >
                  <span>不使用手册</span>
                </button>
                <button
                  v-for="(doc, idx) in scheduleCandidateDocs"
                  :key="doc.id || doc.url || idx"
                  type="button"
                  class="poster-chip doc-candidate-chip"
                  :class="{ active: confForm.handbook_url === doc.url }"
                  :title="doc.filename || `文档 ${idx + 1}`"
                  @click="selectCandidateHandbook(doc.url)"
                >
                  <AppIcon :name="doc.filename?.toLowerCase().endsWith('.pdf') ? 'paper' : 'edit'" :size="13" />
                  <span class="chip-name">{{ doc.filename || `文档 ${idx + 1}` }}</span>
                </button>
              </div>
            </div>

            <div v-if="confForm.handbook_url" class="poster-active-preview">
              <a :href="confForm.handbook_url" target="_blank" rel="noopener noreferrer" class="button ghost small">
                <AppIcon name="link" :size="13" />
                <span>查看已选手册文件 ↗</span>
              </a>
              <button
                type="button"
                class="button ghost small remove-poster-btn"
                title="移除此手册文件"
                @click="clearScheduleHandbook"
              >
                <AppIcon name="trash" :size="13" />
                <span>移除手册</span>
              </button>
            </div>

            <FileField
              v-model="confForm.handbook_url"
              label="会议手册 / 议程文件"
              @busy="uploadHandbookBusy = $event"
            />
          </div>

          <!-- 会议通知文件（图片/扫描件） -->
          <div class="schedule-poster-section">
            <div class="schedule-poster-header">
              <span class="poster-label-text">
                <strong>会议通知文件（可选）</strong>
                <small v-if="scheduleCandidateImages.length" class="muted">（邮件检测到通知文件/图片，可直接点选）</small>
              </span>
            </div>

            <div v-if="scheduleCandidateImages.length" class="poster-candidates-selector">
              <div class="candidates-title muted">
                <span>从邮件图片中点选会议通知文件：</span>
              </div>
              <div class="poster-candidate-chips">
                <button
                  type="button"
                  class="poster-chip no-poster-chip"
                  :class="{ active: !confForm.poster_url }"
                  @click="clearScheduleConfPoster"
                >
                  <span>不使用通知文件</span>
                </button>
                <button
                  v-for="(img, idx) in scheduleCandidateImages"
                  :key="img.id || img.url || idx"
                  type="button"
                  class="poster-chip"
                  :class="{ active: confForm.poster_url === img.url }"
                  :title="img.filename || `通知文件 ${idx + 1}`"
                  @click="selectCandidateConfPoster(img.url)"
                >
                  <img :src="img.url" class="chip-thumb" alt="" />
                  <span class="chip-name">{{ img.filename || `通知文件 ${idx + 1}` }}</span>
                </button>
              </div>
            </div>

            <div v-if="confForm.poster_url" class="poster-active-preview">
              <AttachmentLink :url="confForm.poster_url" label="查看通知文件原图" poster />
              <button
                type="button"
                class="button ghost small remove-poster-btn"
                title="移除此通知文件"
                @click="clearScheduleConfPoster"
              >
                <AppIcon name="trash" :size="13" />
                <span>移除通知文件</span>
              </button>
            </div>

            <FileField
              v-model="confForm.poster_url"
              label="会议通知文件（图片/扫描件）"
              poster
              @busy="uploadPosterBusy = $event"
            />
          </div>

          <label>
            会议说明与备注
            <textarea
              v-model="confForm.notes"
              rows="5"
              placeholder="会议说明、征稿主题或邮件正文摘要"
            ></textarea>
          </label>
        </template>

        <!-- 学术报告表单视图 -->
        <template v-else>
          <!-- 识别到多场报告时的选择器组件 -->
          <div v-if="detectedTalks.length > 1" class="multi-talk-container">
            <div class="multi-talk-header">
              <div class="multi-talk-badge">
                <AppIcon name="calendar" :size="15" />
                <span>检测到本邮件包含 <strong>{{ detectedTalks.length }}</strong> 场学术报告</span>
              </div>
              <button type="button" class="select-all-btn" @click="toggleAllTalks">
                {{ detectedTalks.every(t => t.selected) ? '取消全选' : '全选报告' }}
              </button>
            </div>

            <div class="multi-talk-tabs">
              <div
                v-for="(talk, idx) in detectedTalks"
                :key="idx"
                class="multi-talk-tab"
                :class="{ active: currentTalkIndex === idx, deselected: !talk.selected }"
                @click="switchTalkTab(idx)"
              >
                <div class="talk-checkbox-wrap" @click.stop>
                  <ThinHoundCheckbox
                    v-model="talk.selected"
                    :size="20"
                    :title="talk.selected ? '已勾选推送到日程' : '未勾选'"
                  />
                </div>
                <div class="multi-talk-tab-body">
                  <div class="multi-talk-tab-top">
                    <span class="tab-index-badge">报告 {{ idx + 1 }}</span>
                    <span class="tab-time-badge" v-if="talk.time">{{ talk.time }}</span>
                  </div>
                  <div class="tab-talk-title" :title="talk.title || '（未命名报告）'">
                    {{ talk.title || '（未命名报告）' }}
                  </div>
                  <div class="tab-talk-speaker" v-if="talk.speaker">
                    {{ talk.speaker }}
                  </div>
                </div>
              </div>
            </div>
            <div class="multi-talk-edit-hint">
              <span>正在编辑<strong>【报告 {{ currentTalkIndex + 1 }}】</strong>，可修改下方各字段。点击上方卡片可切换报告。</span>
            </div>
          </div>

          <label>
            报告标题
            <input
              v-model="scheduleForm.title"
              type="text"
              placeholder="如：特邀学术报告：宇宙加速膨胀测量"
              required
            />
          </label>

          <div class="form-row">
            <label>
              报告日期
              <input
                v-model="scheduleForm.date"
                type="date"
                required
              />
            </label>
            <label>
              开始时间（北京时间）
              <input
                v-model="scheduleForm.time"
                type="time"
                required
              />
            </label>
          </div>

          <div class="form-row">
            <label>
              报告人 / 主讲人
              <input
                v-model="scheduleForm.speaker"
                type="text"
                placeholder="如：李教授 / 专家学者"
              />
            </label>
            <label>
              地点 / 会议号
              <input
                v-model="scheduleForm.location"
                type="text"
                placeholder="如：第一学术会议室 / 腾讯会议号"
              />
            </label>
          </div>

          <label>
            说明 / 邮件正文摘要
            <textarea
              v-model="scheduleForm.notes"
              rows="5"
              placeholder="报告摘要或备注内容"
            ></textarea>
          </label>

          <!-- 报告海报配置 -->
          <div class="schedule-poster-section">
            <div class="schedule-poster-header">
              <label class="poster-toggle-label">
                <ThinHoundCheckbox
                  v-if="emailPosterCandidate"
                  :model-value="attachEmailPoster"
                  :size="18"
                  @update:model-value="onToggleAttachEmailPoster"
                />
                <span class="poster-label-text">
                  <strong>报告海报（可选）</strong>
                  <small v-if="emailPosterCandidate" class="muted">（邮件检测到图片附件，可勾选或从下方点选）</small>
                </span>
              </label>
            </div>

            <!-- 邮件图片候选点选列表 -->
            <div v-if="scheduleCandidateImages.length" class="poster-candidates-selector">
              <div class="candidates-title muted">
                <span>从邮件图片中点选海报：</span>
              </div>
              <div class="poster-candidate-chips">
                <button
                  type="button"
                  class="poster-chip no-poster-chip"
                  :class="{ active: !scheduleForm.poster_url }"
                  @click="clearSchedulePoster"
                >
                  <span>不使用海报</span>
                </button>
                <button
                  v-for="(img, idx) in scheduleCandidateImages"
                  :key="img.id || img.url || idx"
                  type="button"
                  class="poster-chip"
                  :class="{ active: scheduleForm.poster_url === img.url }"
                  :title="img.filename || `图片 ${idx + 1}`"
                  @click="selectCandidatePoster(img.url)"
                >
                  <img :src="img.url" class="chip-thumb" alt="" />
                  <span class="chip-name">{{ img.filename || `图片 ${idx + 1}` }}</span>
                </button>
              </div>
            </div>

            <div v-if="scheduleForm.poster_url" class="poster-active-preview">
              <AttachmentLink :url="scheduleForm.poster_url" label="查看海报原图" poster />
              <button
                type="button"
                class="button ghost small remove-poster-btn"
                title="移除此海报附件"
                @click="clearSchedulePoster"
              >
                <AppIcon name="trash" :size="13" />
                <span>移除海报</span>
              </button>
            </div>

            <FileField
              v-model="scheduleForm.poster_url"
              label="海报 / 宣传图"
              poster
              @busy="uploadPosterBusy = $event"
            />
          </div>
        </template>

        <div class="form-actions">
          <button
            type="button"
            class="button ghost"
            :disabled="savingSchedule"
            @click="showScheduleModal = false"
          >
            取消
          </button>
          <button
            type="submit"
            class="button primary"
            :disabled="savingSchedule || pushingSchedule || uploadPosterBusy || uploadHandbookBusy || (scheduleType === 'talk' && detectedTalks.length > 1 && selectedTalksCount === 0)"
          >
            <AppIcon name="calendar" :size="16" />
            <span>
              {{ (uploadPosterBusy || uploadHandbookBusy) ? '正在上传文件…' : savingSchedule ? '正在保存…' : (
                scheduleType === 'conference'
                  ? '确认推送到学术会议'
                  : (detectedTalks.length > 1
                      ? (selectedTalksCount > 0 ? `同时推送到日程 (共 ${selectedTalksCount} 场)` : '请勾选要推送的报告')
                      : '确认加入日程')
              ) }}
            </span>
          </button>
        </div>
      </form>
    </BaseDialog>
  </div>
</template>

<style scoped>
.mailbox-page {
  display: grid;
  gap: 22px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.mailbox-info-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 9999px;
  font-size: 13px;
  margin-right: 8px;
}

.sync-progress-card {
  padding: 14px 18px;
  display: grid;
  gap: 10px;
  background: rgba(22, 32, 46, 0.75);
  backdrop-filter: blur(12px);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  transition: all 0.3s ease;
}

.sync-progress-card.is-completed {
  border-color: rgba(104, 211, 145, 0.4);
  background: rgba(16, 36, 30, 0.8);
}

.sync-progress-card.is-error {
  border-color: rgba(245, 101, 101, 0.4);
  background: rgba(44, 20, 24, 0.8);
}

.sync-progress-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sync-progress-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--text);
  font-weight: 500;
}

.sync-icon.success-icon {
  color: #68d391;
}

.sync-icon.error-icon {
  color: #f56565;
}

.sync-percent {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

.sync-bar-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  overflow: hidden;
  position: relative;
}

.sync-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #68d391);
  border-radius: 9999px;
  transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 50%, transparent);
}

.sync-progress-card.is-completed .sync-bar-fill {
  background: #68d391;
  box-shadow: 0 0 10px rgba(104, 211, 145, 0.6);
}

.sync-progress-card.is-error .sync-bar-fill {
  background: #f56565;
  box-shadow: 0 0 10px rgba(245, 101, 101, 0.6);
}

.sync-progress-detail {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.user-email-text {
  font-weight: 500;
  color: var(--text);
}

.proto-tag {
  font-size: 11px;
  color: var(--accent);
  background: rgba(184, 155, 248, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.mailbox-search-bar {
  display: flex;
}

.search-form {
  display: flex;
  gap: 12px;
  width: 100%;
}

.search-input-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  pointer-events: none;
  z-index: 2;
}

.search-input-wrap :deep(.search-wave-box) {
  margin: 0 !important;
  width: 100%;
}

.search-input-wrap :deep(.search-wave-box input) {
  padding-left: 28px !important;
  padding-right: 32px !important;
}

.search-input-wrap :deep(.search-wave-box label) {
  left: 28px !important;
}

.mailbox-welcome {
  text-align: center;
  padding: 48px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.welcome-icon-box {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: rgba(184, 155, 248, 0.14);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.welcome-desc {
  max-width: 600px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.75;
}

.preset-badges-show {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin: 10px 0;
}

.welcome-cta {
  margin-top: 8px;
}

.emails-container {
  display: grid;
  gap: 12px;
}

.emails-meta-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.clear-emails-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text-muted);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-emails-btn:hover:not(:disabled) {
  color: #ff6b6b;
  border-color: rgba(255, 107, 107, 0.35);
  background: rgba(255, 107, 107, 0.08);
}

.clear-emails-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.email-delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.18s ease;
}

.email-delete-btn:hover:not(:disabled) {
  opacity: 1;
  color: #ff6b6b;
  border-color: rgba(255, 107, 107, 0.3);
  background: rgba(255, 107, 107, 0.12);
}

.email-delete-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.email-list {
  display: grid;
  gap: 12px;
}

.email-card {
  display: flex;
  gap: 16px;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.email-card:hover {
  transform: translateY(-2px);
  border-color: rgba(184, 155, 248, 0.4);
  background: rgba(184, 155, 248, 0.08);
}

.email-card.active {
  border-color: var(--accent);
}

.email-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(184, 155, 248, 0.16);
  color: var(--accent);
  font-weight: 600;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.email-card-body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px;
}

.email-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.header-right-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.schedule-push-btn {
  padding: 3px 10px;
  font-size: 12px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-color: rgba(245, 158, 11, 0.4);
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  font-weight: 500;
}

.schedule-push-btn:hover {
  background: rgba(245, 158, 11, 0.18) !important;
  border-color: #f59e0b !important;
  color: #f59e0b !important;
}

.reader-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reader-delete-btn {
  color: var(--text-muted);
}

.reader-delete-btn:hover:not(:disabled) {
  color: #ff6b6b !important;
  border-color: rgba(255, 107, 107, 0.35) !important;
  background: rgba(255, 107, 107, 0.08) !important;
}

.parse-warnings {
  padding: 10px 14px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.08);
  border-radius: 8px;
  color: #f59e0b;
  font-size: 13px;
  display: grid;
  gap: 4px;
}

.ai-schedule-recognize-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(129, 140, 248, 0.06) 100%);
  border: 1px solid rgba(56, 189, 248, 0.22);
  border-radius: 10px;
  margin-bottom: 8px;
}

.ai-recognize-lead {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-secondary, #94a3b8);
}

.ai-recognize-lead .ai-bot-icon {
  color: var(--accent, #38bdf8);
  flex-shrink: 0;
}

.ai-recognize-meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-lead-text {
  font-size: 12.5px;
  color: var(--text-secondary, #94a3b8);
}

.ai-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  line-height: 1.4;
}

.ai-vision-pill {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.ai-text-pill {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.ai-recognize-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.ai-recognize-action-btn:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.6);
  transform: translateY(-1px);
}

.ai-recognize-action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .ai-schedule-recognize-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .ai-recognize-action-btn {
    justify-content: center;
  }
}

.parsing-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--accent);
  padding: 8px 12px;
  background: rgba(184, 155, 248, 0.12);
  border-radius: 8px;
  margin-bottom: 8px;
}

.multi-talk-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-card, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 6px;
}

.multi-talk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.multi-talk-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

.select-all-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: opacity 0.2s;
}

.select-all-btn:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.multi-talk-tabs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.multi-talk-tab {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.multi-talk-tab:hover {
  border-color: var(--accent);
  background: rgba(184, 155, 248, 0.08);
}

.multi-talk-tab.active {
  border-color: var(--accent);
  background: rgba(184, 155, 248, 0.14);
  box-shadow: 0 0 0 1px var(--accent);
}

.multi-talk-tab.deselected {
  opacity: 0.55;
}

.talk-checkbox-wrap {
  display: flex;
  align-items: center;
  margin-top: 2px;
  flex-shrink: 0;
}

.multi-talk-tab-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.multi-talk-tab-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.tab-index-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  line-height: 1.3;
}

.tab-time-badge {
  font-size: 11px;
  color: var(--muted);
  font-family: monospace;
}

.tab-talk-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-talk-speaker {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multi-talk-edit-hint {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
  margin-top: 2px;
}

.multi-talk-edit-hint strong {
  color: var(--accent);
}

.sender-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.email-date {
  font-size: 12px;
  color: var(--muted);
  flex-shrink: 0;
}

.email-subject {
  font-size: 16px;
  font-weight: 500;
  color: var(--text);
  margin: 2px 0;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.email-snippet {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.email-card-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.sender-email-chip {
  font-size: 11px;
  color: var(--soft);
  background: var(--surface);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--line);
}

.small-badge {
  font-size: 11px;
  padding: 2px 6px;
}

.read-hint {
  font-size: 12px;
  color: var(--accent);
  margin-left: auto;
  opacity: 0.8;
}

/* 邮件阅读抽屉 */
.mail-reader-meta {
  background: var(--surface);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--line);
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}

.reader-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.meta-label {
  color: var(--muted);
  font-size: 13px;
}

.email-date-badge {
  font-size: 12px;
  color: var(--muted);
}

.reader-actions-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.view-toggles {
  display: inline-flex;
  gap: 6px;
}

.mail-reader-content {
  padding: 24px;
  min-height: 300px;
  max-height: 60vh;
  overflow-y: auto;
}

.email-html-sandbox {
  color: var(--text);
  line-height: 1.75;
  font-size: 14px;
  word-break: break-word;
}

.email-html-sandbox a {
  color: var(--accent);
  text-decoration: underline;
}

.email-plain-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.75;
  color: var(--text);
}

/* 邮箱配置表单 */
.mail-config-form {
  display: grid;
  gap: 18px;
}

.form-group {
  display: grid;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.presets-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-btn {
  background: var(--raised);
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.preset-btn:hover {
  color: var(--text);
  border-color: var(--accent);
}

.preset-btn.active {
  background: rgba(184, 155, 248, 0.18);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 500;
}

.proto-segmented {
  width: 100%;
}

.proto-segmented button {
  flex: 1;
  text-align: center;
}

.saved-secret-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
}

.saved-secret-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}

.saved-secret-text {
  font-weight: 500;
}

.secret-edit-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.secret-edit-wrap input {
  flex: 1;
}

.use-imap-option {
  background: rgba(184, 155, 248, 0.1);
  border: 1px solid rgba(184, 155, 248, 0.25);
  border-radius: 10px;
  padding: 12px 14px;
  display: grid;
  gap: 8px;
}

.imap-sync-checkbox {
  font-weight: 600;
  color: var(--text);
}

.imap-sync-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--accent);
  padding-left: 24px;
  line-height: 1.45;
}

.custom-secret-section {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.status-dot.green {
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
}

.field-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
}

.ssl-checkbox-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.test-feedback-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
}

.test-feedback-box.success {
  background: rgba(76, 144, 107, 0.15);
  border: 1px solid rgba(175, 226, 196, 0.3);
  color: var(--success);
}

.test-feedback-box.error {
  background: var(--danger-bg);
  border: 1px solid rgba(255, 194, 196, 0.25);
  color: var(--danger);
}

.config-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.unbind-btn {
  margin-right: auto;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 邮箱分类标签导航 (Tabs) */
.mailbox-tabs-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
  margin-bottom: 4px;
}

.mailbox-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mailbox-tab-btn:hover {
  color: var(--text);
  border-color: rgba(184, 155, 248, 0.4);
  background: rgba(184, 155, 248, 0.08);
}

.mailbox-tab-btn.active {
  background: rgba(184, 155, 248, 0.16);
  border-color: var(--accent);
  color: var(--accent);
}

.tab-count-pill {
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 11px;
  background: rgba(184, 155, 248, 0.2);
  color: var(--accent);
  font-weight: 600;
}

/* 管理员设置 Tab 分段 */
.config-tab-segmented {
  width: 100%;
  margin-bottom: 18px;
}

.config-tab-segmented button {
  flex: 1;
  text-align: center;
  padding: 8px 12px;
  font-size: 13.5px;
}

/* 已发通知卡片定制 */
.sent-card {
  border-left: 3px solid rgba(184, 155, 248, 0.5);
}

.sent-avatar {
  background: rgba(184, 155, 248, 0.2);
  color: var(--accent);
  font-size: 16px;
}

.sent-status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 500;
}

.sent-status-badge.success {
  background: rgba(76, 144, 107, 0.18);
  color: var(--success);
  border: 1px solid rgba(175, 226, 196, 0.3);
}

.sent-status-badge.failed {
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid rgba(255, 194, 196, 0.25);
}

.sent-recipients-preview {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipient-preview-text {
  color: var(--text);
  opacity: 0.9;
}

.sent-time-text {
  font-size: 12px;
}

.sent-recipients-box {
  display: grid;
  gap: 6px;
}

.recipient-chips-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.recipient-chip {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(184, 155, 248, 0.14);
  border: 1px solid rgba(184, 155, 248, 0.25);
  color: var(--accent);
}

@media (max-width: 768px) {
  .mailbox-page {
    gap: 16px;
  }
  .page-heading {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }
  .header-actions {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .header-actions .button {
    flex: 1 1 auto;
    justify-content: center;
  }
  .mailbox-info-badge {
    width: 100%;
    margin-right: 0;
    justify-content: space-between;
    box-sizing: border-box;
  }
  .user-email-text {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .search-form {
    flex-direction: column;
    gap: 8px;
  }
  .search-form .button {
    width: 100%;
    justify-content: center;
  }
  .email-card {
    padding: 14px;
    gap: 12px;
    max-width: 100%;
    overflow: hidden;
  }
  .email-card-body {
    min-width: 0;
    overflow: hidden;
  }
  .email-avatar {
    width: 36px;
    height: 36px;
    font-size: 14px;
    border-radius: 10px;
    flex-shrink: 0;
  }
  .email-card-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    width: 100%;
  }
  .sender-name {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }
  .header-right-meta {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .schedule-push-btn {
    padding: 2px 8px;
    font-size: 11px;
    height: 24px;
    flex-shrink: 0;
  }
  .email-date {
    margin-left: auto;
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .email-subject {
    font-size: 15px;
    line-height: 1.4;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .email-snippet {
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }
  .sender-email-chip {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .form-row {
    grid-template-columns: 1fr;
  }
  .reader-actions-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .reader-toolbar-right {
    justify-content: flex-end;
  }
  .mail-reader-content {
    padding: 14px;
    max-height: calc(85dvh - 180px);
  }
  .config-actions {
    flex-direction: column-reverse;
    align-items: stretch;
    gap: 10px;
  }
  .config-actions .button {
    width: 100%;
    justify-content: center;
  }
  .unbind-btn {
    margin-right: 0;
  }
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-color-scheme="classic-cyan"] .sync-progress-card,
[data-theme-style="vanta-fog"] .sync-progress-card {
  border: 1px solid rgba(174, 222, 211, 0.25) !important;
}

[data-color-scheme="classic-cyan"] .sync-bar-fill,
[data-theme-style="vanta-fog"] .sync-bar-fill {
  box-shadow: 0 0 10px rgba(174, 222, 211, 0.5) !important;
}

[data-theme-style="vanta-fog"] .proto-tag {
  background: rgba(174, 222, 211, 0.15) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .account-avatar-placeholder {
  background: rgba(174, 222, 211, 0.12) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .email-card:hover {
  border-color: rgba(174, 222, 211, 0.4) !important;
  background: rgba(218, 238, 235, 0.08) !important;
}

[data-theme-style="vanta-fog"] .sender-avatar {
  background: rgba(174, 222, 211, 0.15) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .account-select-notice {
  background: rgba(174, 222, 211, 0.08) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .preset-btn.active {
  background: rgba(174, 222, 211, 0.18) !important;
  border-color: var(--accent, #c5e6df) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .use-imap-option {
  background: rgba(174, 222, 211, 0.08) !important;
  border: 1px solid rgba(174, 222, 211, 0.25) !important;
}

[data-theme-style="vanta-fog"] .mailbox-tab-btn:hover {
  border-color: rgba(174, 222, 211, 0.4) !important;
  background: rgba(218, 238, 235, 0.05) !important;
}

[data-theme-style="vanta-fog"] .mailbox-tab-btn.active {
  background: rgba(174, 222, 211, 0.15) !important;
  border-color: var(--accent, #c5e6df) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .tab-count {
  background: rgba(174, 222, 211, 0.2) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .sent-card {
  border-left: 3px solid rgba(174, 222, 211, 0.5) !important;
}

[data-theme-style="vanta-fog"] .sent-avatar {
  background: rgba(174, 222, 211, 0.2) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .recipient-chip {
  background: rgba(174, 222, 211, 0.12) !important;
  border: 1px solid rgba(174, 222, 211, 0.25) !important;
  color: var(--accent, #c5e6df) !important;
}

/* 邮件图片附件区 (详情抽屉) */
.email-attachments-banner,
.email-poster-banner {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.25);
  background: rgba(56, 189, 248, 0.04);
  margin-bottom: 16px;
  display: grid;
  gap: 12px;
}

.attachments-banner-header,
.poster-banner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.attachments-title-row,
.poster-title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}

.attachments-hint {
  font-size: 12px;
}

.email-attachments-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
}

.attachment-image-card {
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.attachment-image-thumb-wrap {
  width: 100%;
  height: 110px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}

.attachment-image-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}

.attachment-image-thumb:hover {
  transform: scale(1.04);
}

.attachment-image-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
}

.attachment-filename {
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attachment-filesize {
  flex-shrink: 0;
}

.attachment-image-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}

.attachment-image-actions .button {
  width: 100%;
  justify-content: center;
  text-align: center;
  text-decoration: none;
}

.poster-preview-card {
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface);
  padding: 8px 12px;
  border: 1px solid var(--line);
}

/* 推送到日程弹窗海报区 */
.schedule-poster-section {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}

.schedule-poster-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.poster-toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.poster-label-text {
  font-size: 13px;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* 候选海报点选列表 */
.poster-candidates-selector {
  display: grid;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
  border: 1px dashed var(--line);
}

.candidates-title {
  font-size: 12px;
}

.poster-candidate-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.poster-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 6px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.poster-chip:hover {
  border-color: var(--accent);
  background: rgba(56, 189, 248, 0.08);
}

.poster-chip.active {
  border-color: var(--accent);
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent);
  font-weight: 600;
}

.poster-chip.no-poster-chip {
  padding: 6px 12px;
}

.chip-thumb {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  object-fit: cover;
}

.chip-name {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster-active-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--surface);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--line);
}

.remove-poster-btn {
  color: var(--muted);
  flex-shrink: 0;
}

.remove-poster-btn:hover {
  color: #ef4444;
}

/* 学术会议专属推送按钮 */
.conf-push-btn {
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.08);
}

.conf-push-btn:hover {
  background: rgba(56, 189, 248, 0.18) !important;
  border-color: #38bdf8 !important;
  color: #38bdf8 !important;
}

/* 弹窗类型分段控制器 */
.schedule-type-segmented {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 3px;
  gap: 4px;
  margin-bottom: 6px;
}

.schedule-type-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.schedule-type-btn:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
}

.schedule-type-btn.active {
  background: var(--accent);
  color: var(--accent-ink, #070314) !important;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.schedule-type-btn.active :deep(.app-icon),
.schedule-type-btn.active .app-icon {
  color: var(--accent-ink, #070314) !important;
}

/* 会议关键时间节点与资料分组卡片 */
.form-section-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: var(--surface, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border);
  border-radius: 10px;
}

.form-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.form-row-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 768px) {
  .form-row-3 {
    grid-template-columns: 1fr;
  }
}

/* 抽屉通知文档列表与候选芯片 */
.email-doc-attachments-banner {
  padding: 14px 16px;
  margin-bottom: 16px;
  border-radius: 12px;
}

.email-doc-attachments-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.email-doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.doc-icon-wrap {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  flex-shrink: 0;
}

.doc-text-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.doc-filename {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-filesize {
  font-size: 11px;
}

.email-doc-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.doc-candidate-chip {
  padding: 5px 10px;
}
</style>
