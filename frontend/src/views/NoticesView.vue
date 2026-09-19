<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import WaveInput from '../components/WaveInput.vue'
import { authApi, mailboxApi, noticeApi } from '../api/client'
import { extractNoticesFromEmailsWithAi, isAiAssistantReady } from '../services/aiService'
import { shanghaiToday } from '../utils/schedule'
import { markNoticeAsRead, markAllNoticesAsRead } from '../utils/noticeUnread'

const router = useRouter()
const STORAGE_KEY = 'labhub_hide_home_notice_marquee'

const currentUser = ref(null)
const notices = ref([])
const loading = ref(true)
const searchQuery = ref('')
const currentScope = ref('all') // 'all', 'active', 'expired'
const selectedCategory = ref('all')
const isMarqueeHidden = ref(false)

// 模态弹窗状态
const showDetailModal = ref(false)
const selectedNotice = ref(null)

const showEditModal = ref(false)
const isEditing = ref(false)
const editingId = ref(null)
const editForm = ref({
  title: '',
  content: '',
  category: 'academic_affairs',
  importance: 'normal',
  has_validity: false,
  start_date: '',
  end_date: ''
})
const savingNotice = ref(false)

// AI 智能扫描弹窗状态
const showAiScanModal = ref(false)
const aiScanning = ref(false)
const aiScanProgress = ref('')
const aiExtractedNotices = ref([])
const aiSelectedIndices = ref(new Set())
const aiImporting = ref(false)
const aiImportReport = ref(null)

const categories = [
  { key: 'all', label: '全部' },
  { key: 'academic_affairs', label: '教务培养' },
  { key: 'holiday', label: '放假调休' },
  { key: 'facility', label: '物业后勤' },
  { key: 'administrative', label: '行政办公' },
  { key: 'safety', label: '园区安全' },
  { key: 'general', label: '综合通知' }
]

function checkMarqueeHidden() {
  try {
    isMarqueeHidden.value = localStorage.getItem(STORAGE_KEY) === 'true'
  } catch (e) {
    isMarqueeHidden.value = false
  }
}

function toggleMarquee() {
  const next = !isMarqueeHidden.value
  isMarqueeHidden.value = next
  try {
    if (next) {
      localStorage.setItem(STORAGE_KEY, 'true')
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch (e) {}
}

async function loadData() {
  loading.value = true
  try {
    const [me, list] = await Promise.all([
      authApi.getMe().catch(() => null),
      noticeApi.list()
    ])
    currentUser.value = me
    notices.value = Array.isArray(list) ? list : []
    markAllNoticesAsRead(notices.value.map(n => n.id))
  } catch (err) {
    console.error('加载通知列表失败:', err)
  } finally {
    loading.value = false
  }
}


function getNoticeAttachments(item) {
  if (!item) return []
  let list = []
  if (Array.isArray(item.attachments)) {
    list = [...item.attachments]
  } else if (typeof item.attachments === 'string' && item.attachments.trim() && item.attachments !== '[]') {
    try {
      const parsed = JSON.parse(item.attachments)
      if (Array.isArray(parsed)) list = [...parsed]
    } catch {}
  }
  return list
}

function isImageAtt(att) {
  if (!att) return false
  const ct = (att.content_type || '').toLowerCase()
  const fn = (att.filename || att.name || '').toLowerCase()
  return ct.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(fn)
}

function isDocAtt(att) {
  if (!att) return false
  const ct = (att.content_type || '').toLowerCase()
  const fn = (att.filename || att.name || '').toLowerCase()
  return ct.includes('pdf') || ct.includes('word') || ct.includes('msword') || ct.includes('officedocument') || /\.(pdf|docx?|xlsx?|pptx?)$/i.test(fn)
}

function getNoticeImages(item) {
  return getNoticeAttachments(item).filter(isImageAtt)
}

function getNoticeDocs(item) {
  return getNoticeAttachments(item).filter(isDocAtt)
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const detailAttachments = computed(() => {
  if (!selectedNotice.value) return []
  return getNoticeAttachments(selectedNotice.value)
})

const detailImages = computed(() => {
  return detailAttachments.value.filter(isImageAtt)
})

const detailDocs = computed(() => {
  return detailAttachments.value.filter(isDocAtt)
})

async function resolveAttachmentsForNotice(notice) {
  if (!notice) return
  const currentAtts = getNoticeAttachments(notice)
  if (currentAtts.length > 0) return
  if (!notice.source_email_uid) return

  try {
    const emailRes = await mailboxApi.getEmails({ limit: 100 })
    const emailList = Array.isArray(emailRes) ? emailRes : (emailRes?.items || [])
    const found = emailList.find(e => String(e.msg_uid || e.id || '') === String(notice.source_email_uid))
    if (found) {
      let list = []
      if (Array.isArray(found.attachments)) list = [...found.attachments]
      else if (typeof found.attachments === 'string' && found.attachments.trim() && found.attachments !== '[]') {
        try { list = JSON.parse(found.attachments) } catch {}
      }
      if (found.poster_url && !list.some(a => a && a.url === found.poster_url)) {
        list.unshift({ id: 'email-poster', filename: '通知图片.jpg', url: found.poster_url, content_type: 'image/jpeg' })
      }
      if (list.length > 0) {
        notice.attachments = JSON.stringify(list)
      }
    }
  } catch {}
}

const todayStr = computed(() => shanghaiToday())

function isNoticeActive(item) {
  if (!item.end_date) return true
  return item.end_date >= todayStr.value
}

const filteredNotices = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const today = todayStr.value

  return notices.value.filter(item => {
    // 时效筛选
    if (currentScope.value === 'active' && item.end_date && item.end_date < today) {
      return false
    }
    if (currentScope.value === 'expired' && (!item.end_date || item.end_date >= today)) {
      return false
    }

    // 分类筛选
    if (selectedCategory.value !== 'all' && item.category !== selectedCategory.value) {
      return false
    }

    // 关键词搜索
    if (query) {
      const matchTitle = (item.title || '').toLowerCase().includes(query)
      const matchContent = (item.content || '').toLowerCase().includes(query)
      const matchSender = (item.source_email_sender || '').toLowerCase().includes(query)
      const matchSubject = (item.source_email_subject || '').toLowerCase().includes(query)
      if (!matchTitle && !matchContent && !matchSender && !matchSubject) {
        return false
      }
    }

    return true
  })
})

const stats = computed(() => {
  const total = notices.value.length
  const today = todayStr.value
  let active = 0
  let urgent = 0
  for (const it of notices.value) {
    const isActive = !it.end_date || it.end_date >= today
    if (isActive) active++
    if (it.importance === 'urgent') urgent++
  }
  return { total, active, urgent }
})

function getCategoryLabel(cat) {
  const found = categories.find(c => c.key === cat)
  return found ? found.label : '事务通知'
}

function getImportanceInfo(imp) {
  if (imp === 'urgent') return { text: '紧急', class: 'badge-urgent' }
  if (imp === 'important') return { text: '重要', class: 'badge-important' }
  return null
}

function getValidityStatus(item) {
  const today = todayStr.value
  if (!item.end_date) {
    return { text: '长期有效', class: 'valid-permanent' }
  }
  if (item.end_date < today) {
    return { text: `已截止 (${item.end_date})`, class: 'valid-expired' }
  }
  if (item.end_date === today) {
    return { text: '今日截止', class: 'valid-today' }
  }
  return { text: `时效至 ${item.end_date}`, class: 'valid-active' }
}

function canManageNotice(item) {
  if (!currentUser.value) return false
  if (currentUser.value.role === 'admin' || currentUser.value.identity === 'teacher') return true
  return Number(item.created_by_id) === Number(currentUser.value.id)
}

function openDetail(item) {
  selectedNotice.value = item
  showDetailModal.value = true
  markNoticeAsRead(item.id)
  resolveAttachmentsForNotice(item)
}

function closeDetail() {
  showDetailModal.value = false
  selectedNotice.value = null
}

function openCreateModal() {
  isEditing.value = false
  editingId.value = null
  editForm.value = {
    title: '',
    content: '',
    category: 'academic_affairs',
    importance: 'normal',
    has_validity: false,
    start_date: todayStr.value,
    end_date: ''
  }
  showEditModal.value = true
}

function openEditModal(item, e) {
  if (e) e.stopPropagation()
  isEditing.value = true
  editingId.value = item.id
  editForm.value = {
    title: item.title,
    content: item.content,
    category: item.category || 'general',
    importance: item.importance || 'normal',
    has_validity: Boolean(item.end_date),
    start_date: item.start_date || todayStr.value,
    end_date: item.end_date || ''
  }
  showEditModal.value = true
}

async function submitSaveNotice() {
  if (!editForm.value.title.trim()) {
    alert('请输入通知简短标题')
    return
  }
  if (!editForm.value.content.trim()) {
    alert('请输入通知详细内容')
    return
  }

  if (editForm.value.has_validity && editForm.value.end_date && editForm.value.start_date) {
    if (editForm.value.end_date < editForm.value.start_date) {
      alert('截止日期不能早于生效/开始日期')
      return
    }
  }

  savingNotice.value = true
  try {
    const payload = {
      title: editForm.value.title.trim(),
      content: editForm.value.content.trim(),
      category: editForm.value.category,
      importance: editForm.value.importance,
      start_date: editForm.value.start_date || todayStr.value,
      end_date: editForm.value.has_validity ? editForm.value.end_date : ''
    }

    if (isEditing.value && editingId.value) {
      await noticeApi.update(editingId.value, payload)
    } else {
      await noticeApi.create(payload)
    }

    showEditModal.value = false
    await loadData()
  } catch (err) {
    alert(err.message || '保存通知失败，请检查填写内容。')
  } finally {
    savingNotice.value = false
  }
}

async function handleDeleteNotice(item, e) {
  if (e) e.stopPropagation()
  if (!window.confirm(`确定要删除通知「${item.title}」吗？`)) return

  try {
    await noticeApi.delete(item.id)
    if (selectedNotice.value?.id === item.id) {
      closeDetail()
    }
    await loadData()
  } catch (err) {
    alert(err.message || '删除通知失败')
  }
}

// -----------------------------
// AI 智能扫描最近一周邮件
// -----------------------------
async function openAiScan() {
  if (!isAiAssistantReady()) {
    alert('请先在个人中心配置并测试 AI 大模型助手。')
    return
  }
  showAiScanModal.value = true
  aiExtractedNotices.value = []
  aiSelectedIndices.value = new Set()
  aiImportReport.value = null
  await runAiEmailScan()
}

async function runAiEmailScan() {
  aiScanning.value = true
  aiScanProgress.value = '正在读取最近一周已同步邮件…'
  aiImportReport.value = null

  try {
    const emailRes = await mailboxApi.getEmails({ limit: 100 })
    const emailList = Array.isArray(emailRes) ? emailRes : (emailRes?.items || [])

    if (emailList.length === 0) {
      aiScanProgress.value = '暂未找到已同步的邮件。建议先前往学术邮箱点击“同步最近7天邮件”。'
      aiScanning.value = false
      return
    }

    aiScanProgress.value = `获取到 ${emailList.length} 封候选邮件，AI 正在分析甄别教务与公共事务通知…`

    const extracted = await extractNoticesFromEmailsWithAi(emailList, {
      onProgress: (p) => {
        aiScanProgress.value = `正在深度分析邮件 (批次 ${p.currentBatch}/${p.totalBatches}，已分析 ${p.processedEmails}/${p.totalEmails} 封)…`
      }
    })

    if (extracted.length === 0) {
      aiScanProgress.value = '最近一周邮件中未检测到教务或公共事务通知（报告与研讨会已自动归入学术日程）。'
      aiScanning.value = false
      return
    }

    // 查重比对：对比现有 notices 的 source_email_uid 与标准化标题
    const existingUids = new Set(notices.value.map(n => String(n.source_email_uid).trim()).filter(Boolean))
    const existingTitles = new Set(notices.value.map(n => n.title.replace(/[\s·•（）()\[\]【】《》""''“”‘’，。、：:；;！!？?·•\-—_]/g, '').toLowerCase()))

    const checkedSet = new Set()
    aiExtractedNotices.value = extracted.map((item, idx) => {
      const uid = String(item.source_uid || '').trim()
      const normTitle = item.title.replace(/[\s·•（）()\[\]【】《》""''“”‘’，。、：:；;！!？?·•\-—_]/g, '').toLowerCase()
      const isUidDuplicate = uid && existingUids.has(uid)
      const isTitleDuplicate = normTitle.length >= 4 && existingTitles.has(normTitle)
      const isDuplicate = isUidDuplicate || isTitleDuplicate

      if (!isDuplicate) {
        checkedSet.add(idx)
      }

      return {
        ...item,
        isDuplicate,
        duplicateReason: isUidDuplicate ? '邮件UID已入库' : isTitleDuplicate ? '已有类似标题通知' : ''
      }
    })

    aiSelectedIndices.value = checkedSet
    aiScanProgress.value = `扫描完成，共识别出 ${extracted.length} 条教务与事务通知。`
  } catch (err) {
    console.error('AI 扫描失败:', err)
    aiScanProgress.value = `扫描中断: ${err.message || '网络请求超时'}`
  } finally {
    aiScanning.value = false
  }
}

function toggleSelectAiItem(idx) {
  if (aiSelectedIndices.value.has(idx)) {
    aiSelectedIndices.value.delete(idx)
  } else {
    aiSelectedIndices.value.add(idx)
  }
}

function selectAllAiItems() {
  const set = new Set()
  aiExtractedNotices.value.forEach((item, idx) => {
    if (!item.isDuplicate) set.add(idx)
  })
  aiSelectedIndices.value = set
}

function deselectAllAiItems() {
  aiSelectedIndices.value.clear()
}

async function confirmBatchImport() {
  const chosen = aiExtractedNotices.value.filter((_, idx) => aiSelectedIndices.value.has(idx))
  if (chosen.length === 0) {
    alert('请至少勾选一条要导入的通知')
    return
  }

  aiImporting.value = true
  try {
    const payloadNotices = chosen.map(item => ({
      title: item.title,
      content: item.content,
      category: item.category,
      importance: item.importance,
      start_date: item.start_date,
      end_date: item.end_date,
      attachments: item.attachments || '[]',
      source_email_uid: item.source_uid,
      source_email_subject: item.source_subject,
      source_email_sender: item.source_sender
    }))

    const result = await noticeApi.batchCreate(payloadNotices)
    aiImportReport.value = result
    await loadData()
  } catch (err) {
    alert(err.message || '导入失败，请稍后重试。')
  } finally {
    aiImporting.value = false
  }
}

onMounted(() => {
  checkMarqueeHidden()
  loadData()
})
</script>

<template>
  <div class="notices-view-container">
    <!-- 顶栏标题与操作区 -->
    <header class="notices-header">
      <div class="header-titles">
        <div class="header-badge">
          <AppIcon name="bell" :size="16" />
          <span>公共事务 · 通知中心</span>
        </div>
        <h1>重要教务与事务通知</h1>
        
      </div>

      <div class="header-actions">
        <button class="action-btn ai-btn" @click="openAiScan">
          <AppIcon name="sparkle" :size="16" />
          <span>AI 扫描一周邮件</span>
        </button>
        <button class="action-btn primary-btn" @click="openCreateModal">
          <AppIcon name="plus" :size="16" />
          <span>新建通知</span>
        </button>
      </div>
    </header>

    <!-- 统计卡片与横栏走马灯控制条 -->
    <div class="stats-banner">
      <div class="stat-item">
        <span class="stat-num">{{ stats.active }}</span>
        <span class="stat-label">有效通知</span>
      </div>
      <div class="stat-item">
        <span class="stat-num urgent-num">{{ stats.urgent }}</span>
        <span class="stat-label">紧急事项</span>
      </div>
      <div class="stat-item">
        <span class="stat-num">{{ stats.total }}</span>
        <span class="stat-label">全部归档</span>
      </div>
      <div class="marquee-toggle-item">
        <span class="marquee-status-text">
          工作台顶部走马灯：{{ isMarqueeHidden ? '已隐藏' : '运行中' }}
        </span>
        <button class="toggle-marquee-btn" @click="toggleMarquee">
          {{ isMarqueeHidden ? '重新开启走马灯' : '在工作台隐藏' }}
        </button>
      </div>
    </div>

    <!-- 筛选过滤与搜索工具栏 -->
    <div class="filter-toolbar">
      <!-- 时效状态切换 -->
      <div class="segmented-control" role="tablist">
        <button
          type="button"
          :class="{ active: currentScope === 'all' }"
          @click="currentScope = 'all'"
        >
          全部 ({{ notices.length }})
        </button>
        <button
          type="button"
          :class="{ active: currentScope === 'active' }"
          @click="currentScope = 'active'"
        >
          有效中 ({{ stats.active }})
        </button>
        <button
          type="button"
          :class="{ active: currentScope === 'expired' }"
          @click="currentScope = 'expired'"
        >
          已过期 ({{ stats.total - stats.active }})
        </button>
      </div>

      <!-- 分类胶囊按钮 -->
      <div class="category-pills">
        <button
          v-for="cat in categories"
          :key="cat.key"
          type="button"
          class="pill-btn"
          :class="{ active: selectedCategory === cat.key }"
          @click="selectedCategory = cat.key"
        >
          {{ cat.label }}
        </button>
      </div>

      <!-- 搜索框（采用与文献库/教材资料一致的 WaveInput 动效输入框） -->
      <div class="notices-wave-container">
        <WaveInput
          v-model="searchQuery"
          type="search"
          label="搜索通知标题、详细内容、发件人…"
          wrapper-class="notices-wave-box"
          clearable
          @clear="searchQuery = ''"
        />
      </div>
    </div>

    <!-- 通知卡片网格列表 -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>正在读取云端通知…</span>
    </div>

    <div v-else-if="filteredNotices.length === 0" class="empty-state">
      <AppIcon name="bell" :size="48" class="empty-icon" />
      <h3>暂无符合条件的通知</h3>
      <p>您可以点击右上角的“新建通知”手动添加，或点击“AI 扫描一周邮件”自动识别导入。</p>
      <div class="empty-actions">
        <button class="action-btn ai-btn" @click="openAiScan">
          <AppIcon name="sparkle" :size="16" />
          <span>AI 扫描一周邮件</span>
        </button>
        <button class="action-btn primary-btn" @click="openCreateModal">
          <AppIcon name="plus" :size="16" />
          <span>新建第一条通知</span>
        </button>
      </div>
    </div>

    <div v-else class="notice-grid">
      <div
        v-for="item in filteredNotices"
        :key="item.id"
        class="notice-card"
        :class="{ 'card-urgent': item.importance === 'urgent' }"
        @click="openDetail(item)"
      >
        <div class="card-topline">
          <div class="tags-cluster">
            <span class="category-badge">{{ getCategoryLabel(item.category) }}</span>
            <span v-if="getImportanceInfo(item.importance)" :class="['importance-badge', getImportanceInfo(item.importance).class]">
              {{ getImportanceInfo(item.importance).text }}
            </span>
            <span v-if="getNoticeImages(item).length > 0" class="attachment-pill image-pill" title="含通知图片">
              <AppIcon name="image" :size="11" />
              <span>图片 ({{ getNoticeImages(item).length }})</span>
            </span>
            <span v-else-if="getNoticeDocs(item).length > 0" class="attachment-pill doc-pill" title="含通知附件">
              <AppIcon name="paperclip" :size="11" />
              <span>附件 ({{ getNoticeDocs(item).length }})</span>
            </span>
          </div>
          <span :class="['validity-indicator', getValidityStatus(item).class]">
            {{ getValidityStatus(item).text }}
          </span>
        </div>

        <h3 class="card-title">{{ item.title }}</h3>

        <div class="card-content-preview">
          {{ item.content }}
        </div>

        <div class="card-meta-row">
          <div class="source-info">
            <span v-if="item.source_email_sender" class="sender-text" :title="item.source_email_sender">
              来源: {{ item.source_email_sender }}
            </span>
            <span v-else class="creator-text">
              发布: {{ item.created_by_name || '组员' }}
            </span>
            <span v-if="item.start_date" class="date-text">
              {{ item.start_date }}
            </span>
          </div>

          <div v-if="canManageNotice(item)" class="card-actions" @click.stop>
            <button class="icon-tool-btn" @click="openEditModal(item, $event)" title="编辑通知">
              <AppIcon name="edit" :size="15" />
            </button>
            <button class="icon-tool-btn delete-btn" @click="handleDeleteNotice(item, $event)" title="删除通知">
              <AppIcon name="trash" :size="15" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 弹窗 1：通知完整详情 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showDetailModal && selectedNotice" class="modal-backdrop" @click.self="closeDetail">
          <div class="modal-card detail-modal">
            <div class="modal-header">
              <div class="modal-tags">
                <span class="category-badge">{{ getCategoryLabel(selectedNotice.category) }}</span>
                <span v-if="getImportanceInfo(selectedNotice.importance)" :class="['importance-badge', getImportanceInfo(selectedNotice.importance).class]">
                  {{ getImportanceInfo(selectedNotice.importance).text }}
                </span>
                <span :class="['validity-indicator', getValidityStatus(selectedNotice).class]">
                  {{ getValidityStatus(selectedNotice).text }}
                </span>
              </div>
              <button class="modal-close-btn" @click="closeDetail" title="关闭">
                <AppIcon name="close" :size="18" />
              </button>
            </div>

            <h2 class="modal-title">{{ selectedNotice.title }}</h2>

            <div class="modal-info-bar">
              <div class="info-group">
                <span class="info-label">发布人:</span>
                <span class="info-val">{{ selectedNotice.created_by_name || '系统组员' }}</span>
              </div>
              <div v-if="selectedNotice.source_email_sender" class="info-group">
                <span class="info-label">来源邮件:</span>
                <span class="info-val">{{ selectedNotice.source_email_sender }}</span>
              </div>
              <div v-if="selectedNotice.start_date" class="info-group">
                <span class="info-label">发布日期:</span>
                <span class="info-val">{{ selectedNotice.start_date }}</span>
              </div>
              <div v-if="selectedNotice.end_date" class="info-group">
                <span class="info-label">截止日期:</span>
                <span class="info-val">{{ selectedNotice.end_date }}</span>
              </div>
            </div>

            <div class="modal-scroll-body">
              <div class="content-full-text">{{ selectedNotice.content }}</div>

              <!-- 关联的邮件图片画廊 -->
              <div v-if="detailImages.length" class="notice-detail-section">
                <div class="section-title">
                  <AppIcon name="image" :size="15" />
                  <span>通知附图 ({{ detailImages.length }})</span>
                  <small class="title-tip">点击可在新标签页查看原图</small>
                </div>
                <div class="notice-images-grid">
                  <a
                    v-for="(img, idx) in detailImages"
                    :key="idx"
                    :href="img.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="notice-image-card"
                    :title="img.filename || '点击查看大图'"
                  >
                    <img :src="img.url" :alt="img.filename || '通知附图'" loading="lazy" />
                    <span class="notice-image-name">{{ img.filename || '通知附图' }}</span>
                  </a>
                </div>
              </div>

              <!-- 关联的邮件文档附件 -->
              <div v-if="detailDocs.length" class="notice-detail-section">
                <div class="section-title">
                  <AppIcon name="paperclip" :size="15" />
                  <span>通知文档附件 ({{ detailDocs.length }})</span>
                </div>
                <div class="notice-docs-list">
                  <a
                    v-for="(doc, idx) in detailDocs"
                    :key="idx"
                    :href="doc.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="notice-doc-item"
                    :title="doc.filename"
                    download
                  >
                    <div class="doc-icon-badge">
                      <AppIcon :name="doc.filename && doc.filename.toLowerCase().endsWith('.pdf') ? 'file-text' : 'paperclip'" :size="16" />
                    </div>
                    <div class="doc-meta-text">
                      <span class="doc-name">{{ doc.filename || '附件文件' }}</span>
                      <span v-if="doc.size" class="doc-size">{{ formatFileSize(doc.size) }}</span>
                    </div>
                    <span class="doc-dl-btn">下载 / 预览</span>
                  </a>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <div v-if="canManageNotice(selectedNotice)" class="left-tools">
                <button class="btn-tool" @click="openEditModal(selectedNotice); closeDetail()">
                  <AppIcon name="edit" :size="14" />
                  <span>编辑</span>
                </button>
                <button class="btn-tool btn-tool-danger" @click="handleDeleteNotice(selectedNotice)">
                  <AppIcon name="trash" :size="14" />
                  <span>删除</span>
                </button>
              </div>
              <div v-else></div>
              <button class="btn-primary" @click="closeDetail">
                完成
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 弹窗 2：新建 / 编辑通知 Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showEditModal" class="modal-backdrop" @click.self="showEditModal = false">
          <div class="modal-card edit-modal">
            <div class="modal-header">
              <h3>{{ isEditing ? '编辑重要通知' : '新建重要通知' }}</h3>
              <button class="modal-close-btn" @click="showEditModal = false">
                <AppIcon name="close" :size="18" />
              </button>
            </div>

            <form class="edit-form" @submit.prevent="submitSaveNotice">
              <div class="form-item">
                <label class="form-label">
                  简短标题 / 走马灯描述 <span class="required-star">*</span>
                </label>
                <input
                  v-model="editForm.title"
                  type="text"
                  placeholder="例如：东区综合楼9月22日电梯年检维保暂停运行"
                  class="form-input"
                  required
                />
                <span class="form-hint">文字简练准确（15~35字），将循环滚动在工作台顶部横栏。</span>
              </div>

              <div class="form-row">
                <div class="form-item">
                  <label class="form-label">通知分类</label>
                  <select v-model="editForm.category" class="form-select">
                    <option value="academic_affairs">教务培养（奖学金/学分认定/答辩）</option>
                    <option value="holiday">放假调休（节假日安排/补课通知）</option>
                    <option value="facility">物业后勤（电梯/停水/停电/断网/空调）</option>
                    <option value="administrative">行政办公（资产/公文/盖章审批）</option>
                    <option value="safety">园区安全（消防/实验室排查/极端天气）</option>
                    <option value="general">综合通知</option>
                  </select>
                </div>

                <div class="form-item">
                  <label class="form-label">重要程度</label>
                  <select v-model="editForm.importance" class="form-select">
                    <option value="normal">普通事务</option>
                    <option value="important">重要事项（优先展示）</option>
                    <option value="urgent">紧急通知（高亮报警）</option>
                  </select>
                </div>
              </div>

              <div class="form-item">
                <div class="checkbox-row">
                  <input
                    id="has_validity_check"
                    v-model="editForm.has_validity"
                    type="checkbox"
                    class="form-checkbox"
                  />
                  <label for="has_validity_check" class="checkbox-label">
                    设定通知时效（到期后自动从工作台走马灯下架）
                  </label>
                </div>
                <span v-if="!editForm.has_validity" class="form-hint">
                  长期有效通知将在邮件通知/发布时间满 2 周后自动从工作台走马灯下架，并完整保留在通知中心。
                </span>
              </div>

              <div v-if="editForm.has_validity" class="form-row">
                <div class="form-item">
                  <label class="form-label">发布/生效日期</label>
                  <input
                    v-model="editForm.start_date"
                    type="date"
                    class="form-input"
                  />
                </div>
                <div class="form-item">
                  <label class="form-label">截止日期</label>
                  <input
                    v-model="editForm.end_date"
                    type="date"
                    class="form-input"
                    required
                  />
                </div>
              </div>

              <div class="form-item">
                <label class="form-label">
                  详细通知内容 <span class="required-star">*</span>
                </label>
                <textarea
                  v-model="editForm.content"
                  rows="7"
                  placeholder="请输入通知详细事项、办理流程、受影响区域、联系人等信息…"
                  class="form-textarea"
                  required
                ></textarea>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-subtle" @click="showEditModal = false">
                  取消
                </button>
                <button type="submit" class="btn-primary" :disabled="savingNotice">
                  {{ savingNotice ? '正在保存…' : '确认提交' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 弹窗 3：AI 智能扫描最近一周邮件 Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showAiScanModal" class="modal-backdrop" @click.self="showAiScanModal = false">
          <div class="modal-card ai-scan-modal">
            <div class="modal-header">
              <div class="modal-title-with-icon">
                <AppIcon name="sparkle" :size="20" />
                <h3>AI 扫描识别一周内教务与公共事务通知</h3>
              </div>
              <button class="modal-close-btn" @click="showAiScanModal = false">
                <AppIcon name="close" :size="18" />
              </button>
            </div>

            <div class="ai-scan-status-box">
              <div class="status-left">
                <div v-if="aiScanning" class="loading-spinner small"></div>
                <AppIcon v-else name="robot" :size="18" />
                <span class="status-msg">{{ aiScanProgress }}</span>
              </div>
              <button
                v-if="!aiScanning"
                class="btn-subtle mini"
                @click="runAiEmailScan"
              >
                <AppIcon name="refresh" :size="13" />
                <span>重新扫描</span>
              </button>
            </div>

            <!-- 批量导入成功报告 -->
            <div v-if="aiImportReport" class="import-report-box">
              <AppIcon name="check" :size="20" class="report-check-icon" />
              <div class="report-text">
                <strong>导入操作完成！</strong>
                <p>
                  成功新增 <b>{{ aiImportReport.inserted_count }}</b> 条通知，自动跳过 <b>{{ aiImportReport.skipped_count }}</b> 条已有重复通知。
                </p>
              </div>
              <button class="btn-primary mini" @click="showAiScanModal = false">
                完成
              </button>
            </div>

            <!-- 提取候选列表 -->
            <div v-else-if="aiExtractedNotices.length > 0" class="ai-results-body">
              <div class="results-toolbar">
                <span class="toolbar-hint">
                  已选择 {{ aiSelectedIndices.size }} / {{ aiExtractedNotices.length }} 条候选通知
                </span>
                <div class="toolbar-btns">
                  <button class="text-link-btn" @click="selectAllAiItems">全选新通知</button>
                  <span class="sep">|</span>
                  <button class="text-link-btn" @click="deselectAllAiItems">清空选择</button>
                </div>
              </div>

              <div class="ai-candidates-list">
                <div
                  v-for="(item, idx) in aiExtractedNotices"
                  :key="idx"
                  class="candidate-item"
                  :class="{ 'is-duplicate': item.isDuplicate, 'is-selected': aiSelectedIndices.has(idx) }"
                  @click="toggleSelectAiItem(idx)"
                >
                  <input
                    type="checkbox"
                    :checked="aiSelectedIndices.has(idx)"
                    :disabled="item.isDuplicate"
                    class="candidate-checkbox"
                    @click.stop="toggleSelectAiItem(idx)"
                  />
                  <div class="candidate-main">
                    <div class="candidate-tags">
                      <span class="category-badge">{{ getCategoryLabel(item.category) }}</span>
                      <span v-if="getImportanceInfo(item.importance)" :class="['importance-badge', getImportanceInfo(item.importance).class]">
                        {{ getImportanceInfo(item.importance).text }}
                      </span>
                      <span v-if="item.isDuplicate" class="duplicate-tag">
                        已存在于云端 (将跳过)
                      </span>
                      <span v-if="item.end_date" class="validity-tag">
                        截止: {{ item.end_date }}
                      </span>
                    </div>

                    <h4 class="candidate-title">{{ item.title }}</h4>
                    <p class="candidate-snippet">{{ item.content }}</p>

                    <div class="candidate-source">
                      <span v-if="item.source_sender">发件人: {{ item.source_sender }}</span>
                      <span v-if="item.source_subject">主题: {{ item.source_subject }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-subtle" @click="showAiScanModal = false">
                取消
              </button>
              <button
                v-if="!aiImportReport && aiExtractedNotices.length > 0"
                type="button"
                class="btn-primary"
                :disabled="aiImporting || aiSelectedIndices.size === 0"
                @click="confirmBatchImport"
              >
                {{ aiImporting ? '正在批量保存入库…' : `一键导入选中的 ${aiSelectedIndices.size} 条通知` }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.notices-view-container {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 32px 48px;
  width: 100%;
  box-sizing: border-box;
}

/* 顶栏 */
.notices-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.header-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--raised);
  border: 1px solid var(--line);
  padding: 4px 12px;
  border-radius: 999px;
  color: var(--accent);
  font-size: 12px;
  margin-bottom: 12px;
}

.header-titles h1 {
  font-size: 28px;
  font-weight: 500;
  color: var(--text);
  margin: 0 0 8px;
  letter-spacing: -0.02em;
}

.header-desc {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  max-width: 720px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.ai-btn {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
}

.ai-btn:hover {
  background: var(--raised);
  border-color: var(--accent);
  color: var(--accent);
  transform: translateY(-1px);
}

.primary-btn {
  background: var(--accent);
  color: var(--accent-ink) !important;
  border-color: var(--accent);
  font-weight: 600;
}

.primary-btn .app-icon {
  color: var(--accent-ink) !important;
}

.primary-btn:hover {
  background: var(--accent-strong);
  color: var(--accent-ink) !important;
  border-color: var(--accent-strong);
  transform: translateY(-1px);
}

.primary-btn:hover .app-icon {
  color: var(--accent-ink) !important;
}

/* 统计条 */
.stats-banner {
  display: flex;
  align-items: center;
  gap: 24px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px 24px;
  margin-bottom: 24px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: var(--shadow);
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 24px;
  border-right: 1px solid var(--line);
}

.stat-num {
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.stat-num.urgent-num {
  color: var(--danger);
}

.stat-label {
  font-size: 12px;
  color: var(--muted);
}

.marquee-toggle-item {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.marquee-status-text {
  font-size: 13px;
  color: var(--soft);
}

.toggle-marquee-btn {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--soft);
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-marquee-btn:hover {
  background: var(--raised);
  color: var(--text);
  border-color: var(--accent);
}

/* 工具栏 */
.filter-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.segmented-control {
  display: inline-flex;
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 3px;
  border-radius: 12px;
}

.segmented-control button {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.segmented-control button.active {
  background: var(--raised);
  color: var(--text);
  font-weight: 500;
}

.category-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pill-btn {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.pill-btn:hover {
  background: var(--raised);
  color: var(--text);
}

.pill-btn.active {
  background: var(--raised);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 500;
}

.search-box {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 6px 12px;
  border-radius: 12px;
  min-width: 260px;
  transition: border-color 0.18s, box-shadow 0.18s;
}

.search-box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}

.search-icon {
  color: var(--muted);
}

.search-input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 13px;
  width: 100%;
}

.search-input::placeholder {
  color: var(--muted);
}

.clear-search-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 2px;
}

/* 网格与卡片 */
.notice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 20px;
}

.notice-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  cursor: pointer;
  transition: all 0.22s ease;
  position: relative;
  box-shadow: var(--shadow);
}

.notice-card:hover {
  background: var(--surface);
  border-color: var(--accent);
  transform: translateY(-2px);
}

.notice-card.card-urgent {
  border-color: rgba(255, 194, 196, 0.35);
  background: linear-gradient(180deg, var(--danger-bg), var(--panel));
}

.card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.tags-cluster {
  display: flex;
  align-items: center;
  gap: 6px;
}

.category-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--raised);
  color: var(--accent);
  border: 1px solid var(--line);
}

.importance-badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 6px;
  font-weight: 500;
}

.badge-urgent {
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid rgba(255, 194, 196, 0.3);
}

.badge-important {
  background: var(--warning-bg);
  color: var(--warning);
  border: 1px solid rgba(243, 216, 162, 0.3);
}

.validity-indicator {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}

.valid-permanent {
  background: rgba(175, 226, 196, 0.14);
  color: var(--success);
  border: 1px solid rgba(175, 226, 196, 0.28);
}

.valid-active {
  background: var(--raised);
  color: var(--soft);
  border: 1px solid var(--line);
}

.valid-today {
  background: var(--warning-bg);
  color: var(--warning);
  border: 1px solid rgba(243, 216, 162, 0.35);
}

.valid-expired {
  background: var(--surface);
  color: var(--muted);
  border: 1px solid var(--line);
}

.card-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.45;
  margin: 0 0 10px;
}

.card-content-preview {
  font-size: 13px;
  color: var(--soft);
  line-height: 1.65;
  margin-bottom: 16px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.card-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--line);
  padding-top: 12px;
  font-size: 12px;
  color: var(--muted);
}

.source-info {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sender-text {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-tool-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.icon-tool-btn:hover {
  background: var(--raised);
  color: var(--text);
}

.icon-tool-btn.delete-btn:hover {
  background: var(--danger-bg);
  color: var(--danger);
}

/* 空状态与加载中 */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 20px;
  color: var(--soft);
  text-align: center;
}

.empty-icon {
  color: var(--muted);
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 18px;
  color: var(--text);
  margin: 0 0 8px;
}

.empty-state p {
  font-size: 14px;
  margin: 0 0 24px;
}

.empty-actions {
  display: flex;
  gap: 12px;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

.loading-spinner.small {
  width: 16px;
  height: 16px;
  border-width: 2px;
  margin-bottom: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Modals 通用 */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-card {
  background: var(--panel-solid, #0c0a1a);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--shadow);
  width: 100%;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  animation: modal-enter 0.2s ease-out;
  color: var(--text);
}

.detail-modal {
  max-width: 680px;
}

.edit-modal {
  max-width: 640px;
}

.ai-scan-modal {
  max-width: 760px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 14px;
  border-bottom: 1px solid var(--line);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 500;
  color: var(--text);
  margin: 0;
}

.modal-title-with-icon {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--accent);
}

.modal-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}

.modal-close-btn:hover {
  background: var(--raised);
  color: var(--text);
}

.modal-title {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text);
  padding: 18px 24px 8px;
  margin: 0;
}

.modal-info-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 24px 14px;
  color: var(--muted);
  font-size: 12px;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}

.info-group {
  display: flex;
  gap: 4px;
}

.info-label {
  color: var(--muted);
}

.info-val {
  color: var(--accent);
}

.modal-scroll-body {
  padding: 20px 24px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  transform: translateZ(0);
  flex: 1;
  min-height: 0;
}

.content-full-text {
  font-size: 14px;
  line-height: 1.85;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}

.left-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-tool {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--soft);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-tool:hover {
  background: var(--raised);
  color: var(--text);
  border-color: var(--accent);
}

.btn-tool-danger:hover {
  background: var(--danger-bg);
  border-color: rgba(255, 194, 196, 0.4);
  color: var(--danger);
}

.btn-subtle {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-subtle.mini {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-subtle:hover {
  background: var(--raised);
  border-color: var(--accent);
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-ink) !important;
  border: 1px solid var(--accent);
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary.mini {
  padding: 5px 14px;
  font-size: 12px;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-strong);
  color: var(--accent-ink) !important;
  border-color: var(--accent-strong);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 编辑表单 */
.edit-form {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-label {
  font-size: 13px;
  color: var(--soft);
  font-weight: 500;
}

.required-star {
  color: var(--danger);
}

.form-input,
.form-select,
.form-textarea {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  padding: 10px 14px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}

.form-hint {
  font-size: 11px;
  color: var(--muted);
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.form-checkbox {
  cursor: pointer;
}

.checkbox-label {
  font-size: 13px;
  color: var(--soft);
  cursor: pointer;
}

/* AI 扫描弹窗专用 */
.ai-scan-status-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}

.status-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text);
}

.import-report-box {
  margin: 24px;
  padding: 20px;
  background: rgba(175, 226, 196, 0.12);
  border: 1px solid rgba(175, 226, 196, 0.3);
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.report-check-icon {
  color: var(--success);
}

.report-text {
  flex: 1;
  font-size: 14px;
  color: var(--text);
}

.report-text strong {
  display: block;
  margin-bottom: 4px;
}

.report-text p {
  margin: 0;
  font-size: 13px;
  color: var(--soft);
}

.ai-results-body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
}

.results-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  font-size: 12px;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}

.toolbar-btns {
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-link-btn {
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: 12px;
}

.text-link-btn:hover {
  text-decoration: underline;
}

.sep {
  color: var(--line);
}

.ai-candidates-list {
  padding: 16px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 48vh;
}

.candidate-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.candidate-item:hover {
  background: var(--raised);
  border-color: var(--line);
}

.candidate-item.is-selected {
  border-color: var(--accent);
  background: var(--raised);
}

.candidate-item.is-duplicate {
  opacity: 0.6;
  background: var(--panel);
}

.candidate-checkbox {
  margin-top: 4px;
  cursor: pointer;
}

.candidate-main {
  flex: 1;
}

.candidate-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.duplicate-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--warning-bg);
  color: var(--warning);
}

.validity-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--raised);
  color: var(--soft);
}

.candidate-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  margin: 0 0 6px;
}

.candidate-snippet {
  font-size: 12px;
  color: var(--soft);
  line-height: 1.55;
  margin: 0 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.candidate-source {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: var(--muted);
}

@media (max-width: 768px) {
  .notices-view-container {
    padding: 16px 16px 36px;
  }
  .notice-grid {
    grid-template-columns: 1fr;
  }
  .form-row {
    flex-direction: column;
    gap: 12px;
  }
  .search-box {
    width: 100%;
    margin-left: 0;
  }
}

/* WaveInput 动效输入框自适应配置 */
.notices-wave-container {
  margin-left: auto;
  display: flex;
  align-items: center;
  min-width: 260px;
  max-width: 360px;
  width: 100%;
}

:deep(.notices-wave-box) {
  margin: 0 !important;
  width: 100%;
}

:deep(.notices-wave-box .form-control) {
  margin: 0 !important;
}

:deep(.notices-wave-box input) {
  padding: 8px 0 !important;
  font-size: 13.5px !important;
  border-bottom: 2px var(--line) solid !important;
  color: var(--text, #fff) !important;
}

:deep(.notices-wave-box input:focus),
:deep(.notices-wave-box.is-focused input),
:deep(.notices-wave-box.has-value input) {
  border-bottom-color: var(--accent) !important;
}

:deep(.notices-wave-box label span) {
  font-size: 13px !important;
  color: var(--muted, rgba(255, 255, 255, 0.55)) !important;
}

:deep(.notices-wave-box input:focus + label span),
:deep(.notices-wave-box.is-focused label span),
:deep(.notices-wave-box.has-value label span) {
  color: var(--accent) !important;
  transform: translateY(-22px) scale(0.85) !important;
}

/* 附件微标与详情弹窗附件展示 */
.attachment-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

.attachment-pill.image-pill {
  background: rgba(56, 189, 248, 0.14);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.28);
}

.attachment-pill.doc-pill {
  background: rgba(168, 85, 247, 0.14);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.28);
}

.notice-detail-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
}

.title-tip {
  font-size: 11.5px;
  color: var(--muted);
  font-weight: 400;
  margin-left: 4px;
}

.notice-images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.notice-image-card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  text-decoration: none;
  transition: transform 0.18s ease, border-color 0.18s ease;
}

.notice-image-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}

.notice-image-card img {
  width: 100%;
  height: 130px;
  object-fit: cover;
  background: rgba(0, 0, 0, 0.2);
}

.notice-image-name {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notice-docs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notice-doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  text-decoration: none;
  color: var(--text);
  transition: all 0.18s ease;
}

.notice-doc-item:hover {
  border-color: var(--accent);
  background: var(--raised);
}

.doc-icon-badge {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--raised, rgba(255, 255, 255, 0.12));
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.doc-meta-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.doc-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-size {
  font-size: 11.5px;
  color: var(--muted);
}

.doc-dl-btn {
  font-size: 12px;
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--raised, rgba(255, 255, 255, 0.1));
  white-space: nowrap;
}

</style>

