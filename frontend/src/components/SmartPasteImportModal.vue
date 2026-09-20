<script setup>
import { computed, ref, watch } from 'vue'
import BaseDialog from './BaseDialog.vue'
import AppIcon from './AppIcon.vue'
import WaveInput from './WaveInput.vue'
import { classifyPastedText, extractFieldsByRule, extractFieldsWithAi, resolveContentForParsing } from '../utils/pasteClassifier'
import { isAiAssistantReady, loadAiConfig, isModelVisionCapable } from '../services/aiService'
import { fileApi, talkApi, noticeApi, scheduleImportApi } from '../api/client'
import { notify, confirmAction } from '../composables/feedback'
import { shanghaiToday } from '../utils/schedule'

const props = defineProps({
  open: Boolean,
  currentUser: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close', 'saved', 'saved-to-pending'])

const rawText = ref('')
const selectedType = ref('talk') // 'talk' | 'conference' | 'notice'
const isManualType = ref(false)

const uploadedImages = ref([]) // array of image URLs
const uploadedFiles = ref([]) // array of { id, filename, url, size, content_type }
const isUploading = ref(false)
const aiExtracting = ref(false)
const saving = ref(false)
const showNoAiDialog = ref(false)
const hasExtracted = ref(false)

// 提前选择解析来源状态 (Selective Source Selection)
const includeText = ref(true)
const selectedImageUrls = ref([])
const selectedFileIds = ref([])
const isReadingPdf = ref(false)

// 卡片表单数据
const cardForm = ref({
  // talk
  title: '',
  date: shanghaiToday(),
  time: '10:00',
  speaker: '',
  location: '',
  notes: '',
  poster_url: '',
  // conference
  sub_type: '研讨会',
  end_date: shanghaiToday(),
  city: '',
  organizer: '',
  abstract_deadline: '',
  early_bird_deadline: '',
  registration_deadline: '',
  website_url: '',
  registration_url: '',
  handbook_url: '',
  // notice
  category: 'general',
  importance: 'normal',
  start_date: shanghaiToday(),
  content: '',
  attachments: []
})

function isPdfFile(file) {
  return file?.content_type === 'application/pdf' ||
    /\.pdf$/i.test(file?.filename || '') ||
    /\.pdf$/i.test(file?.name || '') ||
    /\.pdf$/i.test(file?.url || '')
}

const isAllImagesSelected = computed(() => {
  return uploadedImages.value.length > 0 && selectedImageUrls.value.length === uploadedImages.value.length
})

const isSomeImagesSelected = computed(() => {
  return selectedImageUrls.value.length > 0 && selectedImageUrls.value.length < uploadedImages.value.length
})

const isAllFilesSelected = computed(() => {
  return uploadedFiles.value.length > 0 && selectedFileIds.value.length === uploadedFiles.value.length
})

const isSomeFilesSelected = computed(() => {
  return selectedFileIds.value.length > 0 && selectedFileIds.value.length < uploadedFiles.value.length
})

function toggleAllImages(e) {
  if (e.target.checked) {
    selectedImageUrls.value = [...uploadedImages.value]
  } else {
    selectedImageUrls.value = []
  }
}

function toggleAllFiles(e) {
  if (e.target.checked) {
    selectedFileIds.value = uploadedFiles.value.map(f => f.id)
  } else {
    selectedFileIds.value = []
  }
}

const hasAnySourceSelected = computed(() => {
  const hasText = includeText.value && Boolean(rawText.value.trim())
  const hasImg = selectedImageUrls.value.length > 0
  const hasFile = selectedFileIds.value.length > 0
  return hasText || hasImg || hasFile
})

const sourceSummaryText = computed(() => {
  const parts = []
  if (includeText.value && rawText.value.trim()) {
    parts.push(`文本 (${rawText.value.trim().length}字)`)
  }
  if (selectedImageUrls.value.length > 0) {
    parts.push(`${selectedImageUrls.value.length}张海报`)
  }
  if (selectedFileIds.value.length > 0) {
    const pdfCount = uploadedFiles.value.filter(f => selectedFileIds.value.includes(f.id) && isPdfFile(f)).length
    if (pdfCount > 0) {
      parts.push(`${selectedFileIds.value.length}个文件(含${pdfCount}个PDF)`)
    } else {
      parts.push(`${selectedFileIds.value.length}个文件`)
    }
  }
  return parts.length > 0 ? parts.join(' + ') : '未选择任何来源'
})

watch(() => props.open, (val) => {
  if (val) {
    resetState()
  }
})

function resetState() {
  rawText.value = ''
  selectedType.value = 'talk'
  isManualType.value = false
  uploadedImages.value = []
  uploadedFiles.value = []
  includeText.value = true
  selectedImageUrls.value = []
  selectedFileIds.value = []
  isReadingPdf.value = false
  isUploading.value = false
  aiExtracting.value = false
  saving.value = false
  showNoAiDialog.value = false
  hasExtracted.value = false
  cardForm.value = {
    title: '',
    date: shanghaiToday(),
    time: '10:00',
    speaker: '',
    location: '',
    notes: '',
    poster_url: '',
    sub_type: '研讨会',
    end_date: shanghaiToday(),
    city: '',
    organizer: '',
    abstract_deadline: '',
    early_bird_deadline: '',
    registration_deadline: '',
    website_url: '',
    registration_url: '',
    handbook_url: '',
    category: 'general',
    importance: 'normal',
    start_date: shanghaiToday(),
    content: '',
    attachments: []
  }
}

function handleTextInput() {
  if (rawText.value.trim().length > 0) {
    includeText.value = true
  }
  if (!isManualType.value && rawText.value.trim().length >= 8) {
    const detected = classifyPastedText(rawText.value)
    if (detected && detected !== selectedType.value) {
      selectedType.value = detected
    }
  }
}

function selectTypeTab(type) {
  selectedType.value = type
  isManualType.value = true
}

async function handleFileUpload(event) {
  const files = Array.from(event.target.files || [])
  if (files.length === 0) return

  isUploading.value = true
  try {
    for (const file of files) {
      const isImg = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
      const res = await fileApi.upload(file)
      if (isImg) {
        uploadedImages.value.push(res.url)
        selectedImageUrls.value.push(res.url)
        if (!cardForm.value.poster_url) {
          cardForm.value.poster_url = res.url
        }
      } else {
        const fItem = {
          id: res.id || `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          filename: res.filename || file.name,
          url: res.url,
          size: file.size,
          content_type: file.type || 'application/octet-stream'
        }
        uploadedFiles.value.push(fItem)
        selectedFileIds.value.push(fItem.id)
      }
    }
    notify(`已成功上传 ${files.length} 个文件/海报`)
  } catch (err) {
    notify(err.message || '文件上传失败', 'error')
  } finally {
    isUploading.value = false
    event.target.value = ''
  }
}

function removeImage(idx) {
  const removed = uploadedImages.value.splice(idx, 1)[0]
  selectedImageUrls.value = selectedImageUrls.value.filter(u => u !== removed)
  if (cardForm.value.poster_url === removed) {
    cardForm.value.poster_url = selectedImageUrls.value[0] || uploadedImages.value[0] || ''
  }
}

function removeFile(idx) {
  const removed = uploadedFiles.value.splice(idx, 1)[0]
  if (removed?.id) {
    selectedFileIds.value = selectedFileIds.value.filter(id => id !== removed.id)
  }
}

async function executeRuleExtraction({ silent = false } = {}) {
  const activeFiles = uploadedFiles.value.filter(f => selectedFileIds.value.includes(f.id))
  const activeImages = uploadedImages.value.filter(img => selectedImageUrls.value.includes(img))

  if (!includeText.value && activeImages.length === 0 && activeFiles.length === 0) {
    if (!silent) notify('请至少勾选一项要解析的来源（文字内容、图片或随附文件）', 'error')
    return null
  }

  if (includeText.value && !rawText.value.trim() && activeImages.length === 0 && activeFiles.length === 0) {
    if (!silent) notify('请先粘贴文字内容或上传随附图片/文件', 'error')
    return null
  }

  isReadingPdf.value = true
  try {
    const resolved = await resolveContentForParsing({
      rawText: rawText.value,
      includeText: includeText.value,
      selectedImageUrls: activeImages,
      selectedFiles: activeFiles
    })

    const extracted = extractFieldsByRule(resolved.combinedText, selectedType.value, {
      imageUrls: resolved.targetImages,
      files: resolved.targetFiles
    })
    cardForm.value = {
      ...cardForm.value,
      ...extracted
    }
    hasExtracted.value = true
    return resolved
  } catch (err) {
    if (!silent) notify(err.message || '规则识别失败', 'error')
    return null
  } finally {
    isReadingPdf.value = false
  }
}

async function handleSmartExtract() {
  const activeFiles = uploadedFiles.value.filter(f => selectedFileIds.value.includes(f.id))
  const activeImages = uploadedImages.value.filter(img => selectedImageUrls.value.includes(img))

  if (!includeText.value && activeImages.length === 0 && activeFiles.length === 0) {
    notify('请至少勾选一项要解析的来源（文字内容、图片或随附文件）', 'error')
    return
  }

  if (includeText.value && !rawText.value.trim() && activeImages.length === 0 && activeFiles.length === 0) {
    notify('请先粘贴文字内容或上传随附图片/文件', 'error')
    return
  }

  // 1. 始终先执行基础规则快速识别填充，确保卡片具备结构化底稿
  const resolved = await executeRuleExtraction({ silent: false })
  if (!resolved) return

  // 2. 检查用户是否配置了 AI 助手
  const isReady = isAiAssistantReady()
  if (!isReady) {
    // 未配置 AI 的用户：友好弹出入库方式引导窗口（选择是待 AI 协同解析先入库，还是直接自动识别入库发布）
    const extraPdfHint = resolved.pdfExtractedCount > 0 ? `（已自动读取 ${resolved.pdfExtractedCount} 个 PDF 正文）` : ''
    notify(`已完成基础规则识别填充${extraPdfHint}，请选择后续入库方式`)
    showNoAiDialog.value = true
    return
  }

  // 3. 已配置 AI 的用户：自动执行 AI 深度增强解析
  const aiConfig = loadAiConfig()
  const isVision = isModelVisionCapable(aiConfig)
  const isPlaceholderText = !resolved.combinedText?.trim() || /^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(resolved.combinedText.trim())
  if (resolved.targetImages.length > 0 && isPlaceholderText && !isVision) {
    notify(`您当前配置的模型（${aiConfig.model || '纯文本模型'}）不支持图像视觉识别。对于仅提供海报的条目，请在设置中切换为多模态视觉模型（如 通义千问 Qwen2.5-VL / GPT-4o 等），或补充文字描述。`, 'warning')
    return
  }

  aiExtracting.value = true
  try {
    const extracted = await extractFieldsWithAi(resolved.combinedText, selectedType.value, {
      config: aiConfig,
      imageUrls: resolved.targetImages,
      files: resolved.targetFiles
    })
    cardForm.value = {
      ...cardForm.value,
      ...extracted
    }
    notify(`AI 智能深度识别完成！已根据【${sourceSummaryText.value}】提取并润色卡片信息`)
  } catch (err) {
    notify(`AI 识别轻微异常（${err.message || '已保留规则识别结果'}），已填充基础字段`, 'warning')
  } finally {
    aiExtracting.value = false
  }
}

// 分支 A：未配置 AI 时，提交非 AI 结果进入待提交队列
async function submitToPendingQueue() {
  const activeFiles = uploadedFiles.value.filter(f => selectedFileIds.value.includes(f.id))
  const activeImages = uploadedImages.value.filter(img => selectedImageUrls.value.includes(img))
  const effectiveText = includeText.value ? rawText.value : ''

  if (!effectiveText.trim() && activeImages.length === 0 && activeFiles.length === 0) {
    notify('请先提供文本内容或上传海报图片/文件', 'error')
    return
  }
  saving.value = true
  try {
    if (!hasExtracted.value) {
      await executeRuleExtraction({ silent: true })
    }
    if (/^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(cardForm.value.title || '')) {
      cardForm.value.title = activeImages.length > 0 ? (selectedType.value === 'conference' ? '学术会议（海报）' : selectedType.value === 'notice' ? '综合事务通知（附图）' : '学术报告（海报）') : (selectedType.value === 'conference' ? '学术会议' : selectedType.value === 'notice' ? '综合事务通知' : '学术报告')
    }
    await scheduleImportApi.createPending({
      raw_text: effectiveText,
      inferred_type: selectedType.value,
      parsed_data: cardForm.value,
      image_urls: activeImages,
      file_attachments: activeFiles
    })
    notify('已成功提交至待处理队列！该内容暂不发布至日程或通知中，将等待管理员或其他具备 AI 的组员协助识别并自动入库。')
    showNoAiDialog.value = false
    emit('saved-to-pending')
    emit('close')
  } catch (err) {
    notify(err.message || '提交至待处理队列失败', 'error')
  } finally {
    saving.value = false
  }
}

// 分支 B：直接提交非 AI 识别结果入库发布
async function submitDirectly() {
  const activeFiles = uploadedFiles.value.filter(f => selectedFileIds.value.includes(f.id))
  const activeImages = uploadedImages.value.filter(img => selectedImageUrls.value.includes(img))
  const effectiveText = includeText.value ? rawText.value : ''

  if (!effectiveText.trim() && !cardForm.value.title && activeImages.length === 0 && activeFiles.length === 0) {
    notify('请先提供文本内容、海报图片或卡片标题', 'error')
    return
  }
  if (!hasExtracted.value) {
    await executeRuleExtraction({ silent: true })
  }
  if (/^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(cardForm.value.title || '')) {
    cardForm.value.title = activeImages.length > 0 ? (selectedType.value === 'conference' ? '学术会议（海报）' : selectedType.value === 'notice' ? '综合事务通知（附图）' : '学术报告（海报）') : (selectedType.value === 'conference' ? '学术会议' : selectedType.value === 'notice' ? '综合事务通知' : '学术报告')
  }

  saving.value = true
  try {
    if (selectedType.value === 'notice') {
      const payload = {
        title: cardForm.value.title || (activeImages.length > 0 ? '综合事务通知（附图）' : '综合事务通知'),
        content: cardForm.value.content || effectiveText || (activeImages.length > 0 ? '详见随附图片' : ''),
        category: cardForm.value.category || 'general',
        importance: cardForm.value.importance || 'normal',
        start_date: cardForm.value.start_date || shanghaiToday(),
        end_date: cardForm.value.end_date || '',
        attachments: JSON.stringify(cardForm.value.attachments || activeFiles || [])
      }
      await noticeApi.create(payload)
      notify('通知已成功发布！')
    } else {
      const isConf = selectedType.value === 'conference'
      const payload = {
        ...cardForm.value,
        event_type: isConf ? 'conference' : 'talk',
        title: cardForm.value.title || (isConf ? (activeImages.length > 0 ? '学术会议（海报）' : '学术会议') : (activeImages.length > 0 ? '学术报告（海报）' : '学术报告')),
        date: cardForm.value.date || shanghaiToday(),
        time: isConf ? (cardForm.value.time || '全天') : (cardForm.value.time || '10:00'),
        end_date: isConf ? (cardForm.value.end_date || cardForm.value.date || shanghaiToday()) : '',
        poster_url: cardForm.value.poster_url || activeImages[0] || '',
        notes: cardForm.value.notes || effectiveText || (activeImages.length > 0 ? '详见随附海报' : '')
      }
      await talkApi.create(payload)
      notify(isConf ? '学术会议已成功发布到日程！' : '学术报告已成功发布到日程！')
    }
    showNoAiDialog.value = false
    emit('saved')
    emit('close')
  } catch (err) {
    notify(err.message || '发布失败', 'error')
  } finally {
    saving.value = false
  }
}

function handleClose() {
  if (saving.value || isUploading.value || aiExtracting.value) return
  emit('close')
}
</script>

<template>
  <BaseDialog
    :open="open"
    :wide="true"
    title="文本智能导入"
    :busy="saving || isUploading || aiExtracting"
    @close="handleClose"
  >
    <div class="smart-paste-container">
      <!-- 顶部说明与模式选择 -->
      <div class="type-selection-bar">
        <div class="type-tabs" role="tablist" aria-label="录入类型切换">
          <button
            type="button"
            role="tab"
            :class="['type-tab', { active: selectedType === 'talk' }]"
            @click="selectTypeTab('talk')"
          >
            <AppIcon name="microphone" :size="16" />学术报告
          </button>
          <button
            type="button"
            role="tab"
            :class="['type-tab', { active: selectedType === 'conference' }]"
            @click="selectTypeTab('conference')"
          >
            <AppIcon name="calendar" :size="16" />学术会议
          </button>
          <button
            type="button"
            role="tab"
            :class="['type-tab', { active: selectedType === 'notice' }]"
            @click="selectTypeTab('notice')"
          >
            <AppIcon name="bell" :size="16" />公文与通知
          </button>
        </div>
        <div class="detected-hint">
          <span class="badge cyan">
            {{ isManualType ? '手动选择：' : '智能识别：' }}
            {{ selectedType === 'talk' ? '学术报告' : selectedType === 'conference' ? '学术会议' : '重要通知' }}
          </span>
        </div>
      </div>

      <!-- 粘贴输入与附件上传区 -->
      <div class="input-panel">
        <div class="textarea-wrapper">
          <label class="sr-only" for="smart-paste-textarea">粘贴原始文本</label>
          <textarea
            id="smart-paste-textarea"
            v-model="rawText"
            class="paste-textarea"
            rows="6"
            placeholder="请在此粘贴学术报告、学术会议通知、教务/后勤通告等任意文本内容（支持标题、主讲人、时间地点、截稿日期、正文说明等，系统将自动识别类型并提取字段）..."
            @input="handleTextInput"
          ></textarea>
        </div>

        <!-- 图片与附件多选上传区 -->
        <div class="attachments-upload-zone">
          <div class="upload-header">
            <span class="label-text">随附海报图片与文件附件（可选）：</span>
            <label class="upload-btn button small secondary">
              <AppIcon name="plus" :size="14" />添加海报图片或附件
              <input
                type="file"
                multiple
                class="hidden-file-input"
                @change="handleFileUpload"
              />
            </label>
          </div>

          <!-- 上传中指示器 -->
          <div v-if="isUploading" class="uploading-indicator">
            <AppIcon name="refresh" class="spin-icon" :size="16" />正在上传解析附件...
          </div>

          <!-- 已上传图片海报列表 -->
          <div v-if="uploadedImages.length > 0" class="image-previews">
            <div
              v-for="(imgUrl, idx) in uploadedImages"
              :key="idx"
              class="image-thumb-card"
              :class="{ 'is-primary-poster': cardForm.poster_url === imgUrl }"
            >
              <img :src="imgUrl" alt="海报缩略图" />
              <div class="thumb-overlay">
                <button
                  type="button"
                  class="thumb-delete-btn"
                  title="移除此图片"
                  @click="removeImage(idx)"
                >
                  <AppIcon name="close" :size="14" />
                </button>
                <button
                  type="button"
                  class="thumb-set-btn"
                  title="设为主海报"
                  @click="cardForm.poster_url = imgUrl"
                >
                  {{ cardForm.poster_url === imgUrl ? '主海报' : '设为海报' }}
                </button>
              </div>
            </div>
          </div>

          <!-- 已上传文件列表 -->
          <div v-if="uploadedFiles.length > 0" class="file-previews">
            <div
              v-for="(f, idx) in uploadedFiles"
              :key="f.id || idx"
              class="file-item-pill"
            >
              <AppIcon name="article" :size="14" />
              <span class="file-name" :title="f.filename">{{ f.filename }}</span>
              <button
                type="button"
                class="file-remove-btn"
                title="删除附件"
                @click="removeFile(idx)"
              >
                <AppIcon name="close" :size="12" />
              </button>
            </div>
          </div>
        </div>

        <!-- 提前选择要解析的内容与来源 (Selective Source Selection) -->
        <div class="source-selection-panel">
          <div class="source-panel-header">
            <div class="source-header-left">
              <AppIcon name="filter" :size="15" />
              <span class="source-panel-title">提前选择要解析的内容与来源：</span>
            </div>
            <span class="source-summary-badge badge cyan">
              {{ sourceSummaryText }}
            </span>
          </div>

          <div class="source-items-grid">
            <!-- 来源 1：文本内容 -->
            <label class="source-card source-card-text" :class="{ 'is-selected': includeText }">
              <input type="checkbox" v-model="includeText" />
              <div class="source-card-info">
                <div class="source-card-header-row">
                  <AppIcon name="edit" :size="14" />
                  <span class="source-item-title">原始文本内容</span>
                </div>
                <span class="source-item-meta">
                  {{ rawText.trim() ? `已输入 ${rawText.trim().length} 字` : '暂未输入文本' }}
                </span>
              </div>
            </label>

            <!-- 来源 2：随附图片与海报 -->
            <div v-if="uploadedImages.length > 0" class="source-card source-card-group">
              <div class="group-title-row">
                <label class="group-select-all-label">
                  <input
                    type="checkbox"
                    :checked="isAllImagesSelected"
                    :indeterminate.prop="isSomeImagesSelected && !isAllImagesSelected"
                    @change="toggleAllImages"
                  />
                  <span>图片与海报 ({{ selectedImageUrls.length }}/{{ uploadedImages.length }})</span>
                </label>
              </div>
              <div class="group-img-items">
                <label
                  v-for="(imgUrl, idx) in uploadedImages"
                  :key="idx"
                  class="img-pick-item"
                  :class="{ 'is-active': selectedImageUrls.includes(imgUrl) }"
                  :title="selectedImageUrls.includes(imgUrl) ? '已选中参与解析' : '未选中'"
                >
                  <input
                    type="checkbox"
                    :value="imgUrl"
                    v-model="selectedImageUrls"
                  />
                  <img :src="imgUrl" alt="海报" />
                  <span class="img-order-tag">#{{ idx + 1 }}</span>
                </label>
              </div>
            </div>

            <!-- 来源 3：随附文件（含 PDF 正文读取） -->
            <div v-if="uploadedFiles.length > 0" class="source-card source-card-group">
              <div class="group-title-row">
                <label class="group-select-all-label">
                  <input
                    type="checkbox"
                    :checked="isAllFilesSelected"
                    :indeterminate.prop="isSomeFilesSelected && !isAllFilesSelected"
                    @change="toggleAllFiles"
                  />
                  <span>文件附件 ({{ selectedFileIds.length }}/{{ uploadedFiles.length }})</span>
                </label>
              </div>
              <div class="group-file-items">
                <label
                  v-for="(f, idx) in uploadedFiles"
                  :key="f.id || idx"
                  class="file-pick-item"
                  :class="{ 'is-active': selectedFileIds.includes(f.id) }"
                >
                  <input
                    type="checkbox"
                    :value="f.id"
                    v-model="selectedFileIds"
                  />
                  <AppIcon :name="isPdfFile(f) ? 'article' : 'attachment'" :size="13" />
                  <span class="filename-span" :title="f.filename">{{ f.filename }}</span>
                  <span v-if="isPdfFile(f)" class="badge-mini purple" title="提取文档正文合并至解析">自动读PDF</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 统一智能识别动作栏（单一入口，无 AI 则引导选择入库模式） -->
        <div class="recognition-action-bar">
          <button
            type="button"
            class="button primary unified-smart-btn"
            :disabled="!hasAnySourceSelected || aiExtracting || isReadingPdf || saving"
            @click="handleSmartExtract"
          >
            <AppIcon v-if="!aiExtracting && !isReadingPdf" name="sparkle" :size="16" />
            <AppIcon v-else name="refresh" class="spin-icon" :size="16" />
            {{
              isReadingPdf
                ? '正在读取文档正文...'
                : aiExtracting
                  ? 'AI 正在深度解析提取...'
                  : '智能识别并填入卡片'
            }}
          </button>
        </div>
      </div>

      <!-- 卡片编辑表单预览区 -->
      <div class="card-preview-section">
        <div class="preview-header">
          <h3>
            <AppIcon name="edit" :size="16" />
            卡片内容预览与微调（{{ selectedType === 'talk' ? '学术报告' : selectedType === 'conference' ? '学术会议' : '重要通知' }}）
          </h3>
          <span v-if="hasExtracted" class="badge success">已提取填充</span>
        </div>

        <!-- 报告卡片表单 -->
        <div v-if="selectedType === 'talk'" class="form-grid talk-form">
          <div class="form-group full-width">
            <label>报告题目</label>
            <input v-model="cardForm.title" type="text" class="input-text" placeholder="例如：超新星遗迹中的粒子加速" />
          </div>
          <div class="form-group">
            <label>主讲人 / 报告嘉宾</label>
            <input v-model="cardForm.speaker" type="text" class="input-text" placeholder="例如：张三 教授（南京大学）" />
          </div>
          <div class="form-group">
            <label>地点 / 会议号</label>
            <input v-model="cardForm.location" type="text" class="input-text" placeholder="例如：南大 天文楼302会议室 / 腾讯会议 123-456" />
          </div>
          <div class="form-group">
            <label>报告日期</label>
            <input v-model="cardForm.date" type="date" class="input-text" />
          </div>
          <div class="form-group">
            <label>开始时间</label>
            <input v-model="cardForm.time" type="text" class="input-text" placeholder="10:00" />
          </div>
          <div class="form-group full-width">
            <label>海报图片链接</label>
            <input v-model="cardForm.poster_url" type="text" class="input-text" placeholder="上传图片后自动填充，亦可直接粘贴图片 URL" />
          </div>
          <div class="form-group full-width">
            <label>报告摘要 / 说明</label>
            <textarea v-model="cardForm.notes" rows="4" class="input-textarea" placeholder="报告摘要与背景说明..."></textarea>
          </div>
        </div>

        <!-- 会议卡片表单 -->
        <div v-if="selectedType === 'conference'" class="form-grid conf-form">
          <div class="form-group full-width">
            <label>会议名称</label>
            <input v-model="cardForm.title" type="text" class="input-text" placeholder="例如：2026年中国天体物理学年会" />
          </div>
          <div class="form-group">
            <label>会议类型</label>
            <select v-model="cardForm.sub_type" class="input-select">
              <option value="研讨会">研讨会</option>
              <option value="年会">年会</option>
              <option value="暑期学校">暑期学校</option>
              <option value="学术论坛">学术论坛</option>
              <option value="专题研讨">专题研讨</option>
            </select>
          </div>
          <div class="form-group">
            <label>举办城市</label>
            <input v-model="cardForm.city" type="text" class="input-text" placeholder="例如：南京" />
          </div>
          <div class="form-group">
            <label>开始日期</label>
            <input v-model="cardForm.date" type="date" class="input-text" />
          </div>
          <div class="form-group">
            <label>结束日期</label>
            <input v-model="cardForm.end_date" type="date" class="input-text" />
          </div>
          <div class="form-group full-width">
            <label>举办地点 / 会场酒店</label>
            <input v-model="cardForm.location" type="text" class="input-text" placeholder="例如：南京国际会议大酒店" />
          </div>
          <div class="form-group full-width">
            <label>主办单位</label>
            <input v-model="cardForm.organizer" type="text" class="input-text" placeholder="例如：中国天文学会、南京大学" />
          </div>
          <div class="form-group">
            <label>摘要提交截止</label>
            <input v-model="cardForm.abstract_deadline" type="date" class="input-text" />
          </div>
          <div class="form-group">
            <label>注册/报名截止</label>
            <input v-model="cardForm.registration_deadline" type="date" class="input-text" />
          </div>
          <div class="form-group">
            <label>会议官网</label>
            <input v-model="cardForm.website_url" type="text" class="input-text" placeholder="https://..." />
          </div>
          <div class="form-group">
            <label>报名注册链接</label>
            <input v-model="cardForm.registration_url" type="text" class="input-text" placeholder="https://..." />
          </div>
          <div class="form-group full-width">
            <label>会议简要说明 / 议程</label>
            <textarea v-model="cardForm.notes" rows="4" class="input-textarea" placeholder="会议日程、征文要求与相关说明..."></textarea>
          </div>
        </div>

        <!-- 通知卡片表单 -->
        <div v-if="selectedType === 'notice'" class="form-grid notice-form">
          <div class="form-group full-width">
            <label>通知标题（适合展示与滚动）</label>
            <input v-model="cardForm.title" type="text" class="input-text" placeholder="例如：关于开展2026年秋季学期研究生国家奖学金评选工作的通知" />
          </div>
          <div class="form-group">
            <label>通知分类</label>
            <select v-model="cardForm.category" class="input-select">
              <option value="academic_affairs">教务培养 / 奖学金</option>
              <option value="holiday">节假日 / 放假调休</option>
              <option value="facility">水电网络 / 后勤维保</option>
              <option value="safety">安全保卫 / 应急演练</option>
              <option value="administrative">行政事务 / 综合公文</option>
              <option value="general">综合通告</option>
            </select>
          </div>
          <div class="form-group">
            <label>重要程度</label>
            <select v-model="cardForm.importance" class="input-select">
              <option value="urgent">紧急（置顶/高亮提示）</option>
              <option value="important">重要事项</option>
              <option value="normal">普通通知</option>
            </select>
          </div>
          <div class="form-group">
            <label>开始生效日期</label>
            <input v-model="cardForm.start_date" type="date" class="input-text" />
          </div>
          <div class="form-group">
            <label>截止日期 / 办结时效（可空）</label>
            <input v-model="cardForm.end_date" type="date" class="input-text" />
          </div>
          <div class="form-group full-width">
            <label>通知详细内容</label>
            <textarea v-model="cardForm.content" rows="5" class="input-textarea" placeholder="详细通知正文、办理流程、受影响区域或具体要求..."></textarea>
          </div>
        </div>
      </div>

      <!-- 底部提交操作栏 -->
      <div class="dialog-actions-bar">
        <button
          type="button"
          class="button ghost"
          :disabled="saving"
          @click="handleClose"
        >
          取消
        </button>
        <div class="right-actions">
          <button
            type="button"
            class="button secondary"
            :disabled="saving || !hasAnySourceSelected"
            @click="submitToPendingQueue"
          >
            <AppIcon name="clock" :size="16" />存入待处理队列（待 AI 协同解析）
          </button>
          <button
            type="button"
            class="button primary"
            :disabled="saving || (!hasAnySourceSelected && !cardForm.title)"
            @click="submitDirectly"
          >
            <AppIcon name="check" :size="16" />{{ saving ? '正在发布...' : '直接审核入库发布' }}
          </button>
        </div>
      </div>
    </div>
  </BaseDialog>

  <!-- 无 AI 配置提示与降级选择弹窗 -->
  <BaseDialog
    :open="showNoAiDialog"
    title="选择入库方式（未配置个人 AI 助手）"
    @close="showNoAiDialog = false"
  >
    <div class="no-ai-prompt-box">
      <div class="prompt-icon-banner">
        <AppIcon name="sparkle" :size="36" />
      </div>
      <h3>已完成规则自动识别提取</h3>
      <p class="prompt-desc">
        系统已根据您提供的文本与随附内容，完成基础规则识别并自动填入了卡片草稿。<br />
        检测到您的账户或当前浏览器尚未配置个人大模型 AI 助手，请选择您希望的后续入库方式：
      </p>

      <div class="choice-cards">
        <div class="choice-card recommended" @click="submitToPendingQueue">
          <div class="card-badge">推荐协同</div>
          <div class="choice-title">
            <AppIcon name="clock" :size="18" />待 AI 协同解析（存入待处理队列）
          </div>
          <div class="choice-desc">
            该条目将存入公共待处理池，暂不立即公开发布。稍后由管理员或其他具备 AI 的组员调用大模型进行深度解析与润色，校对无误后一键自动发布入库。
          </div>
          <button type="button" class="button small primary" :disabled="saving">
            存入待处理队列
          </button>
        </div>

        <div class="choice-card" @click="submitDirectly">
          <div class="choice-title">
            <AppIcon name="check" :size="18" />直接自动识别入库发布
          </div>
          <div class="choice-desc">
            直接采用当前规则自动识别提取的卡片数据，立即正式发布到日程或通知栏目中。
          </div>
          <button type="button" class="button small secondary" :disabled="saving">
            直接入库发布
          </button>
        </div>
      </div>

      <div class="modal-footer-cancel">
        <button type="button" class="button ghost" @click="showNoAiDialog = false">
          在当前页面继续预览与微调卡片
        </button>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.smart-paste-container {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-height: 80vh;
  overflow-y: auto;
  padding: 0.25rem 0.5rem;
}

.type-selection-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
}

.type-tabs {
  display: flex;
  gap: 0.35rem;
  background: rgba(0, 0, 0, 0.35);
  padding: 0.25rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.type-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 1rem;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: #e2e8f0;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.type-tab:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.type-tab.active {
  background: var(--accent, #38bdf8);
  color: var(--accent-ink, #041316) !important;
  font-weight: 700;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.type-tab.active svg {
  color: var(--accent-ink, #041316) !important;
  stroke: currentColor;
}

.input-panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.paste-textarea {
  width: 100%;
  padding: 0.85rem;
  background: var(--bg-input, rgba(15, 23, 42, 0.5));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  color: var(--text-primary, #f8fafc);
  font-size: 0.9rem;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s ease;
}

.paste-textarea:focus {
  outline: none;
  border-color: var(--accent, #0ea5e9);
}

.attachments-upload-zone {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--bg-surface-subtle, rgba(255, 255, 255, 0.03));
  border: 1px dashed var(--border-subtle, rgba(255, 255, 255, 0.15));
  border-radius: 8px;
}

.upload-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label-text {
  font-size: 0.85rem;
  color: var(--text-secondary, #94a3b8);
}

.upload-btn {
  position: relative;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.hidden-file-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.uploading-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--accent, #0ea5e9);
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.image-previews {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.image-thumb-card {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
}

.image-thumb-card.is-primary-poster {
  border-color: var(--accent, #0ea5e9);
}

.image-thumb-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.2rem;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.image-thumb-card:hover .thumb-overlay {
  opacity: 1;
}

.thumb-delete-btn {
  align-self: flex-end;
  background: transparent;
  border: none;
  color: #ef4444;
  cursor: pointer;
}

.thumb-set-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  font-size: 0.65rem;
  padding: 0.15rem;
  border-radius: 3px;
  cursor: pointer;
}

.file-previews {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.file-item-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--text-primary, #f8fafc);
}

.file-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-remove-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary, #94a3b8);
  cursor: pointer;
}

.recognition-action-bar {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0.25rem 0;
}

.unified-smart-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.4rem;
  font-size: 0.92rem;
  font-weight: 600;
  border-radius: 8px;
  background: var(--accent, #0ea5e9);
  color: var(--accent-ink, #041316) !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  transition: all 0.2s ease;
}

.unified-smart-btn svg {
  color: var(--accent-ink, #041316) !important;
}

.unified-smart-btn:hover:not(:disabled) {
  opacity: 0.94;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.card-preview-section {
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.preview-header h3 {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-primary, #f8fafc);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.form-group label {
  font-size: 0.8rem;
  color: var(--text-secondary, #94a3b8);
}

.input-text,
.input-select,
.input-textarea {
  padding: 0.55rem 0.75rem;
  background: var(--bg-input, rgba(15, 23, 42, 0.5));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  color: var(--text-primary, #f8fafc);
  font-size: 0.85rem;
  box-sizing: border-box;
  font-family: inherit;
}

.input-text:focus,
.input-select:focus,
.input-textarea:focus {
  outline: none;
  border-color: var(--accent, #0ea5e9);
}

.dialog-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
  flex-wrap: wrap;
  gap: 0.75rem;
}

.right-actions {
  display: flex;
  gap: 0.5rem;
}

/* 无 AI 提示弹窗样式 */
.no-ai-prompt-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0.5rem 0.25rem;
  gap: 0.75rem;
}

.prompt-icon-banner {
  color: var(--accent, #0ea5e9);
}

.no-ai-prompt-box h3 {
  margin: 0;
  font-size: 1.1rem;
}

.prompt-desc {
  font-size: 0.85rem;
  color: var(--text-secondary, #94a3b8);
  max-width: 480px;
  line-height: 1.5;
  margin: 0;
}

.choice-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
  width: 100%;
  margin-top: 0.5rem;
}

.choice-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1rem;
  border-radius: 8px;
  background: var(--bg-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.choice-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--accent, #0ea5e9);
}

.choice-card.recommended {
  border-color: rgba(14, 165, 233, 0.5);
  background: rgba(14, 165, 233, 0.05);
}

.card-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.7rem;
  background: var(--accent, #0ea5e9);
  color: #fff;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
  font-weight: 500;
}

.choice-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary, #f8fafc);
  margin-bottom: 0.4rem;
}

.choice-desc {
  font-size: 0.8rem;
  color: var(--text-secondary, #94a3b8);
  line-height: 1.45;
  margin-bottom: 0.85rem;
}

.source-selection-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--bg-surface-subtle, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  margin-top: 0.25rem;
}

.source-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.source-header-left {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary, #f8fafc);
}

.source-summary-badge {
  font-size: 0.75rem;
}

.source-items-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.source-card {
  display: flex;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
  transition: all 0.2s ease;
}

.source-card.is-selected {
  border-color: rgba(14, 165, 233, 0.4);
  background: rgba(14, 165, 233, 0.04);
}

.source-card-text {
  align-items: center;
  gap: 0.65rem;
  cursor: pointer;
}

.source-card-text input[type="checkbox"] {
  cursor: pointer;
}

.source-card-info {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.source-card-header-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-primary, #f1f5f9);
}

.source-item-meta {
  font-size: 0.75rem;
  color: var(--text-secondary, #94a3b8);
}

.source-card-group {
  flex-direction: column;
  gap: 0.5rem;
}

.group-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.group-select-all-label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-primary, #e2e8f0);
  cursor: pointer;
}

.group-img-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-left: 1.25rem;
}

.img-pick-item {
  position: relative;
  display: flex;
  align-items: center;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.img-pick-item.is-active {
  border-color: var(--accent, #0ea5e9);
}

.img-pick-item input[type="checkbox"] {
  position: absolute;
  top: 3px;
  left: 3px;
  z-index: 2;
  cursor: pointer;
}

.img-pick-item img {
  width: 52px;
  height: 52px;
  object-fit: cover;
  display: block;
}

.img-order-tag {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 0.65rem;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 0 0.25rem;
  border-radius: 3px;
}

.group-file-items {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-left: 1.25rem;
}

.file-pick-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
}

.file-pick-item.is-active {
  background: rgba(14, 165, 233, 0.08);
}

.filename-span {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-mini {
  font-size: 0.68rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-weight: 500;
}

.badge-mini.purple {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.badge-mini.cyan {
  background: rgba(6, 182, 212, 0.15);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.3);
}

.modal-footer-cancel {
  margin-top: 0.5rem;
}

@media (max-width: 640px) {
  .choice-cards {
    grid-template-columns: 1fr;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
