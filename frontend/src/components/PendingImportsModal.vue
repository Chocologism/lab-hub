<script setup>
import { computed, ref, watch } from 'vue'
import BaseDialog from './BaseDialog.vue'
import AppIcon from './AppIcon.vue'
import { scheduleImportApi } from '../api/client'
import { extractFieldsWithAi, extractFieldsByRule, resolveContentForParsing } from '../utils/pasteClassifier'
import { isAiAssistantReady, loadAiConfig, isModelVisionCapable } from '../services/aiService'
import { notify, confirmAction } from '../composables/feedback'
import { shanghaiToday } from '../utils/schedule'

const props = defineProps({
  open: Boolean,
  currentUser: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close', 'resolved'])

const list = ref([])
const loading = ref(false)
const activeAiId = ref(null)
const selectedItem = ref(null)
const resolvingCard = ref({})
const resolvingType = ref('talk')
const submitting = ref(false)

// 审核界面提前选择解析来源状态 (Reviewer Selective Sources)
const reviewIncludeText = ref(true)
const reviewSelectedImageUrls = ref([])
const reviewSelectedFileIds = ref([])
const reviewingAi = ref(false)
const isReviewReadingPdf = ref(false)

function isPdfFile(file) {
  return file?.content_type === 'application/pdf' ||
    /\.pdf$/i.test(file?.filename || '') ||
    /\.pdf$/i.test(file?.name || '') ||
    /\.pdf$/i.test(file?.url || '')
}

const isAllReviewImagesSelected = computed(() => {
  const allImgs = selectedItem.value?.image_urls || []
  return allImgs.length > 0 && reviewSelectedImageUrls.value.length === allImgs.length
})

const isSomeReviewImagesSelected = computed(() => {
  const allImgs = selectedItem.value?.image_urls || []
  return reviewSelectedImageUrls.value.length > 0 && reviewSelectedImageUrls.value.length < allImgs.length
})

const isAllReviewFilesSelected = computed(() => {
  const allFiles = selectedItem.value?.file_attachments || []
  return allFiles.length > 0 && reviewSelectedFileIds.value.length === allFiles.length
})

const isSomeReviewFilesSelected = computed(() => {
  const allFiles = selectedItem.value?.file_attachments || []
  return reviewSelectedFileIds.value.length > 0 && reviewSelectedFileIds.value.length < allFiles.length
})

function toggleAllReviewImages(e) {
  const allImgs = selectedItem.value?.image_urls || []
  if (e.target.checked) {
    reviewSelectedImageUrls.value = [...allImgs]
  } else {
    reviewSelectedImageUrls.value = []
  }
}

function toggleAllReviewFiles(e) {
  const allFiles = selectedItem.value?.file_attachments || []
  if (e.target.checked) {
    reviewSelectedFileIds.value = allFiles.map(f => f.id)
  } else {
    reviewSelectedFileIds.value = []
  }
}

const hasAnyReviewSourceSelected = computed(() => {
  const hasText = reviewIncludeText.value && Boolean(selectedItem.value?.raw_text?.trim())
  const hasImg = reviewSelectedImageUrls.value.length > 0
  const hasFile = reviewSelectedFileIds.value.length > 0
  return hasText || hasImg || hasFile
})

const reviewSourceSummary = computed(() => {
  if (!selectedItem.value) return ''
  const parts = []
  if (reviewIncludeText.value && selectedItem.value.raw_text?.trim()) {
    parts.push(`文本 (${selectedItem.value.raw_text.trim().length}字)`)
  }
  if (reviewSelectedImageUrls.value.length > 0) {
    parts.push(`${reviewSelectedImageUrls.value.length}张海报`)
  }
  if (reviewSelectedFileIds.value.length > 0) {
    const allFiles = selectedItem.value.file_attachments || []
    const pdfCount = allFiles.filter(f => reviewSelectedFileIds.value.includes(f.id) && isPdfFile(f)).length
    if (pdfCount > 0) {
      parts.push(`${reviewSelectedFileIds.value.length}个附件(含${pdfCount}个PDF)`)
    } else {
      parts.push(`${reviewSelectedFileIds.value.length}个附件`)
    }
  }
  return parts.length > 0 ? parts.join(' + ') : '未勾选任何来源'
})

watch(() => props.open, (val) => {
  if (val) {
    fetchList()
  } else {
    selectedItem.value = null
  }
})

async function fetchList() {
  loading.value = true
  try {
    const res = await scheduleImportApi.listPending()
    list.value = res.list || []
  } catch (err) {
    notify(err.message || '获取待处理列表失败', 'error')
  } finally {
    loading.value = false
  }
}

async function handleAiResolve(item) {
  if (!isAiAssistantReady()) {
    notify('您当前未配置有效的大模型 API 密钥，请在个人中心配置后方可进行 AI 协同识别', 'error')
    return
  }

  selectedItem.value = item
  resolvingType.value = item.inferred_type || 'talk'
  reviewIncludeText.value = Boolean(item.raw_text?.trim())
  reviewSelectedImageUrls.value = [...(item.image_urls || [])]
  reviewSelectedFileIds.value = (item.file_attachments || []).map(f => f.id)

  activeAiId.value = item.id
  reviewingAi.value = true
  try {
    const activeFiles = (item.file_attachments || []).filter(f => reviewSelectedFileIds.value.includes(f.id))
    const activeImages = (item.image_urls || []).filter(img => reviewSelectedImageUrls.value.includes(img))

    const resolved = await resolveContentForParsing({
      rawText: item.raw_text,
      includeText: reviewIncludeText.value,
      selectedImageUrls: activeImages,
      selectedFiles: activeFiles
    })

    const aiConfig = loadAiConfig()
    const isVision = isModelVisionCapable(aiConfig)
    const isPlaceholderText = !resolved.combinedText?.trim() || /^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(resolved.combinedText.trim())
    if (resolved.targetImages.length > 0 && isPlaceholderText && !isVision) {
      notify(`当前配置的模型（${aiConfig.model || '纯文本模型'}）不支持图像海报视觉识别。请在「AI 科研助手」中切换为多模态视觉模型（如 通义千问 Qwen2.5-VL / GPT-4o 等），或补充文字描述。`, 'error')
      return
    }

    const extracted = await extractFieldsWithAi(resolved.combinedText, resolvingType.value, {
      config: aiConfig,
      imageUrls: resolved.targetImages,
      files: resolved.targetFiles
    })

    resolvingCard.value = { ...extracted }
    notify('AI 深度识别成功！已自动填充卡片字段，请核对后确认发布。')
  } catch (err) {
    notify(err.message || 'AI 识别失败', 'error')
  } finally {
    activeAiId.value = null
    reviewingAi.value = false
  }
}

function handleManualEdit(item) {
  selectedItem.value = item
  resolvingType.value = item.inferred_type || 'talk'
  reviewIncludeText.value = Boolean(item.raw_text?.trim() && !/^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(item.raw_text.trim()))
  reviewSelectedImageUrls.value = [...(item.image_urls || [])]
  reviewSelectedFileIds.value = (item.file_attachments || []).map(f => f.id)

  if (item.parsed_data && Object.keys(item.parsed_data).length > 0) {
    const cleaned = { ...item.parsed_data }
    if (/^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(cleaned.title || '')) {
      cleaned.title = item.image_urls?.length ? (item.inferred_type === 'conference' ? '学术会议（海报）' : item.inferred_type === 'notice' ? '综合事务通知（附图）' : '学术报告（海报）') : (item.inferred_type === 'conference' ? '学术会议' : item.inferred_type === 'notice' ? '综合事务通知' : '学术报告')
    }
    if (/未提供海报图片内容|仅提及随附学术会议海报/i.test(cleaned.notes || '')) {
      cleaned.notes = item.image_urls?.length ? '详见随附会议海报' : ''
    }
    resolvingCard.value = cleaned
  } else {
    resolvingCard.value = extractFieldsByRule(item.raw_text, item.inferred_type, {
      imageUrls: item.image_urls || [],
      files: item.file_attachments || []
    })
  }
}

async function handleSwitchType(newType) {
  if (resolvingType.value === newType) return
  resolvingType.value = newType
  // 切换类型时，自动根据所选来源重新运行规则快速填充对应表单
  await handleReviewRuleExtract()
}

async function handleReviewRuleExtract() {
  if (!selectedItem.value) return
  const activeFiles = (selectedItem.value.file_attachments || []).filter(f => reviewSelectedFileIds.value.includes(f.id))
  const activeImages = (selectedItem.value.image_urls || []).filter(img => reviewSelectedImageUrls.value.includes(img))

  if (!reviewIncludeText.value && activeImages.length === 0 && activeFiles.length === 0) {
    notify('请至少勾选一项解析来源', 'error')
    return
  }

  isReviewReadingPdf.value = true
  try {
    const resolved = await resolveContentForParsing({
      rawText: selectedItem.value.raw_text,
      includeText: reviewIncludeText.value,
      selectedImageUrls: activeImages,
      selectedFiles: activeFiles
    })

    const extracted = extractFieldsByRule(resolved.combinedText, resolvingType.value, {
      imageUrls: resolved.targetImages,
      files: resolved.targetFiles
    })

    resolvingCard.value = {
      ...resolvingCard.value,
      ...extracted
    }
    const extraPdfHint = resolved.pdfExtractedCount > 0 ? `（含 ${resolved.pdfExtractedCount} 个 PDF 正文）` : ''
    notify(`已按所选来源【${reviewSourceSummary.value}】完成规则解析${extraPdfHint}`)
  } catch (err) {
    notify(err.message || '规则提取失败', 'error')
  } finally {
    isReviewReadingPdf.value = false
  }
}

async function handleReviewAiExtract() {
  if (!selectedItem.value) return
  if (!isAiAssistantReady()) {
    notify('当前未配置大模型 API 密钥，请先在个人中心配置', 'error')
    return
  }

  const activeFiles = (selectedItem.value.file_attachments || []).filter(f => reviewSelectedFileIds.value.includes(f.id))
  const activeImages = (selectedItem.value.image_urls || []).filter(img => reviewSelectedImageUrls.value.includes(img))

  if (!reviewIncludeText.value && activeImages.length === 0 && activeFiles.length === 0) {
    notify('请至少勾选一项解析来源', 'error')
    return
  }

  reviewingAi.value = true
  isReviewReadingPdf.value = true
  try {
    const resolved = await resolveContentForParsing({
      rawText: selectedItem.value.raw_text,
      includeText: reviewIncludeText.value,
      selectedImageUrls: activeImages,
      selectedFiles: activeFiles
    })
    isReviewReadingPdf.value = false

    const aiConfig = loadAiConfig()
    const isVision = isModelVisionCapable(aiConfig)
    const isPlaceholderText = !resolved.combinedText?.trim() || /^[【\[]?(?:随附海报图片|随附海报|随附图片|海报图片|仅随附海报)[】\]]?$/i.test(resolved.combinedText.trim())
    if (resolved.targetImages.length > 0 && isPlaceholderText && !isVision) {
      notify(`当前配置的模型（${aiConfig.model || '纯文本模型'}）不支持图像海报视觉识别。请在「AI 科研助手」中切换为多模态视觉模型（如 通义千问 Qwen2.5-VL / GPT-4o 等），或补充文字描述。`, 'error')
      return
    }

    const extracted = await extractFieldsWithAi(resolved.combinedText, resolvingType.value, {
      config: aiConfig,
      imageUrls: resolved.targetImages,
      files: resolved.targetFiles
    })

    resolvingCard.value = {
      ...resolvingCard.value,
      ...extracted
    }
    notify(`AI 深度识别完成！已根据【${reviewSourceSummary.value}】提取结构化信息`)
  } catch (err) {
    notify(err.message || 'AI 识别失败', 'error')
  } finally {
    reviewingAi.value = false
    isReviewReadingPdf.value = false
  }
}

async function handleConfirmResolve() {
  if (!selectedItem.value) return
  submitting.value = true
  try {
    const activeFiles = (selectedItem.value.file_attachments || []).filter(f => reviewSelectedFileIds.value.includes(f.id))
    const activeImages = (selectedItem.value.image_urls || []).filter(img => reviewSelectedImageUrls.value.includes(img))

    const dataToSave = {
      ...resolvingCard.value,
      poster_url: resolvingCard.value.poster_url || activeImages[0] || '',
      attachments: resolvingCard.value.attachments || activeFiles
    }

    const res = await scheduleImportApi.resolvePending(selectedItem.value.id, {
      target_type: resolvingType.value,
      data: dataToSave
    })
    notify(res.message || '已成功审核并正式发布！')
    emit('resolved', { target_type: resolvingType.value, id: selectedItem.value.id })
    selectedItem.value = null
    await fetchList()
  } catch (err) {
    notify(err.message || '发布入库失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function handleDeleteItem(item) {
  if (!(await confirmAction('确定要删除此条待处理导入草稿吗？', { title: '删除确认', danger: true }))) {
    return
  }
  try {
    await scheduleImportApi.deletePending(item.id)
    notify('已成功移除该条草稿')
    if (selectedItem.value?.id === item.id) {
      selectedItem.value = null
    }
    await fetchList()
  } catch (err) {
    notify(err.message || '删除失败', 'error')
  }
}

function getTypeName(type) {
  if (type === 'conference') return '学术会议'
  if (type === 'notice') return '公文通知'
  return '学术报告'
}
</script>

<template>
  <BaseDialog
    :open="open"
    :wide="true"
    title="待处理导入与协同解析队列"
    :busy="loading || submitting || !!activeAiId"
    @close="emit('close')"
  >
    <div class="pending-modal-container">
      <!-- 列表与审核区域分栏 -->
      <div v-if="!selectedItem" class="list-view">
        <div class="list-toolbar">
          <span class="muted">
            组内成员提交的无 AI 初始草稿将汇聚于此，管理员或任意配置了 AI 的组员可一键协助 AI 深度解析并审核入库。
          </span>
          <button class="button small ghost" :disabled="loading" @click="fetchList">
            <AppIcon name="refresh" :size="14" />刷新列表
          </button>
        </div>

        <div v-if="loading" class="empty-state">
          <AppIcon name="refresh" class="spin-icon" :size="20" />
          <span>正在加载待处理队列...</span>
        </div>

        <div v-else-if="list.length === 0" class="empty-state">
          <AppIcon name="check" :size="32" />
          <p>当前待处理队列为空，所有导入均已完成处理！</p>
        </div>

        <div v-else class="pending-cards-grid">
          <div
            v-for="item in list"
            :key="item.id"
            class="pending-card"
          >
            <div class="pending-card-header">
              <div class="header-left">
                <span :class="['badge', item.inferred_type === 'conference' ? 'amber' : item.inferred_type === 'notice' ? 'purple' : 'cyan']">
                  {{ getTypeName(item.inferred_type) }}
                </span>
                <span class="submitter-text">
                  由 <strong>{{ item.created_by_name || '组员' }}</strong> 提交于 {{ item.created_at ? item.created_at.slice(0, 16) : '' }}
                </span>
              </div>
              <button
                type="button"
                class="button small ghost danger-hover-btn"
                title="废弃此条目"
                @click="handleDeleteItem(item)"
              >
                <AppIcon name="trash" :size="14" />
              </button>
            </div>

            <!-- 原始文本预览 -->
            <div class="raw-text-preview">
              {{ item.raw_text }}
            </div>

            <!-- 附带图片与附件提示 -->
            <div v-if="(item.image_urls && item.image_urls.length) || (item.file_attachments && item.file_attachments.length)" class="attached-meta">
              <span v-if="item.image_urls && item.image_urls.length" class="meta-tag">
                <AppIcon name="image" :size="12" />{{ item.image_urls.length }} 张海报
              </span>
              <span v-if="item.file_attachments && item.file_attachments.length" class="meta-tag">
                <AppIcon name="article" :size="12" />{{ item.file_attachments.length }} 个附件
              </span>
            </div>

            <!-- 底部操作按钮 -->
            <div class="card-footer-actions">
              <button
                type="button"
                class="button small secondary"
                @click="handleManualEdit(item)"
              >
                <AppIcon name="edit" :size="14" />人工核对并入库
              </button>
              <button
                type="button"
                class="button small primary purple-ai-btn"
                :disabled="activeAiId === item.id"
                @click="handleAiResolve(item)"
              >
                <AppIcon v-if="activeAiId !== item.id" name="robot" :size="14" />
                <AppIcon v-else name="refresh" class="spin-icon" :size="14" />
                {{ activeAiId === item.id ? 'AI 正在解析...' : 'AI 深度识别并填充' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 选中条目进行审核编辑与发布的视图 -->
      <div v-else class="review-view">
        <div class="review-top-bar">
          <button type="button" class="button small ghost" @click="selectedItem = null">
            <AppIcon name="left" :size="14" />返回待处理列表
          </button>
          <div class="review-type-selector">
            <span class="type-label">目标类型：</span>
            <div class="type-btn-group">
              <button
                type="button"
                :class="['type-pill', { active: resolvingType === 'talk' }]"
                @click="handleSwitchType('talk')"
              >
                <AppIcon name="microphone" :size="13" />学术报告
              </button>
              <button
                type="button"
                :class="['type-pill', { active: resolvingType === 'conference' }]"
                @click="handleSwitchType('conference')"
              >
                <AppIcon name="calendar" :size="13" />学术会议
              </button>
              <button
                type="button"
                :class="['type-pill', { active: resolvingType === 'notice' }]"
                @click="handleSwitchType('notice')"
              >
                <AppIcon name="bell" :size="13" />公文通知
              </button>
            </div>
          </div>
        </div>

        <div class="review-editor-grid">
          <!-- 左侧：解析来源提前选择与原始输入 -->
          <div class="reference-column">
            <div class="section-heading">
              <h4>
                <AppIcon name="filter" :size="15" />
                解析内容与来源提前选择
              </h4>
              <span class="badge-mini cyan">{{ reviewSourceSummary }}</span>
            </div>

            <!-- 来源 1：文本内容 -->
            <div class="review-source-block" :class="{ 'is-active': reviewIncludeText }">
              <div class="block-header">
                <label class="block-check-label">
                  <input type="checkbox" v-model="reviewIncludeText" />
                  <strong>原始文本内容</strong>
                  <span class="count-tag">({{ selectedItem.raw_text?.trim()?.length || 0 }} 字)</span>
                </label>
              </div>
              <div v-if="selectedItem.raw_text?.trim()" class="ref-raw-box scrollable">
                {{ selectedItem.raw_text }}
              </div>
              <div v-else class="empty-hint">暂无文本内容</div>
            </div>

            <!-- 来源 2：随附图片与海报 -->
            <div v-if="selectedItem.image_urls?.length" class="review-source-block">
              <div class="block-header">
                <label class="block-check-label">
                  <input
                    type="checkbox"
                    :checked="isAllReviewImagesSelected"
                    :indeterminate.prop="isSomeReviewImagesSelected && !isAllReviewImagesSelected"
                    @change="toggleAllReviewImages"
                  />
                  <strong>图片与海报</strong>
                  <span class="count-tag">({{ reviewSelectedImageUrls.length }}/{{ selectedItem.image_urls.length }})</span>
                </label>
              </div>
              <div class="ref-images-grid">
                <label
                  v-for="(img, idx) in selectedItem.image_urls"
                  :key="idx"
                  class="ref-img-pick"
                  :class="{ 'is-selected': reviewSelectedImageUrls.includes(img) }"
                  :title="reviewSelectedImageUrls.includes(img) ? '已选中参与解析' : '未选中'"
                >
                  <input type="checkbox" :value="img" v-model="reviewSelectedImageUrls" />
                  <img :src="img" alt="海报" />
                  <span class="img-order">#{{ idx + 1 }}</span>
                </label>
              </div>
            </div>

            <!-- 来源 3：随附文件（含 PDF 正文自动读取） -->
            <div v-if="selectedItem.file_attachments?.length" class="review-source-block">
              <div class="block-header">
                <label class="block-check-label">
                  <input
                    type="checkbox"
                    :checked="isAllReviewFilesSelected"
                    :indeterminate.prop="isSomeReviewFilesSelected && !isAllReviewFilesSelected"
                    @change="toggleAllReviewFiles"
                  />
                  <strong>随附文件</strong>
                  <span class="count-tag">({{ reviewSelectedFileIds.length }}/{{ selectedItem.file_attachments.length }})</span>
                </label>
              </div>
              <div class="ref-files-list">
                <label
                  v-for="(f, idx) in selectedItem.file_attachments"
                  :key="f.id || idx"
                  class="ref-file-pick"
                  :class="{ 'is-selected': reviewSelectedFileIds.includes(f.id) }"
                >
                  <input type="checkbox" :value="f.id" v-model="reviewSelectedFileIds" />
                  <AppIcon :name="isPdfFile(f) ? 'article' : 'attachment'" :size="13" />
                  <span class="filename" :title="f.filename">{{ f.filename }}</span>
                  <span v-if="isPdfFile(f)" class="badge-mini purple" title="自动提取 PDF 正文合并解析">自动读PDF</span>
                </label>
              </div>
            </div>

            <!-- 针对所选来源的重新识别按钮组 -->
            <div class="re-extract-buttons">
              <button
                type="button"
                class="button small secondary"
                :disabled="!hasAnyReviewSourceSelected || reviewingAi || isReviewReadingPdf"
                @click="handleReviewRuleExtract"
              >
                <AppIcon v-if="!isReviewReadingPdf" name="sparkle" :size="14" />
                <AppIcon v-else name="refresh" class="spin-icon" :size="14" />
                {{ isReviewReadingPdf ? '读取PDF中...' : '按所选重新规则识别' }}
              </button>
              <button
                type="button"
                class="button small primary purple-ai-btn"
                :disabled="!hasAnyReviewSourceSelected || reviewingAi || isReviewReadingPdf"
                @click="handleReviewAiExtract"
              >
                <AppIcon v-if="!reviewingAi && !isReviewReadingPdf" name="robot" :size="14" />
                <AppIcon v-else name="refresh" class="spin-icon" :size="14" />
                {{ isReviewReadingPdf ? '读取PDF中...' : (reviewingAi ? 'AI 识别中...' : '按所选 AI 深度解析') }}
              </button>
            </div>
          </div>

          <!-- 右侧：结构化卡片字段编辑 -->
          <div class="editor-column">
            <h4>审核卡片字段</h4>
            <!-- 报告表单 -->
            <div v-if="resolvingType === 'talk'" class="form-layout">
              <label>报告题目<input v-model="resolvingCard.title" type="text" class="input-text" /></label>
              <div class="row-2">
                <label>主讲人<input v-model="resolvingCard.speaker" type="text" class="input-text" /></label>
                <label>地点<input v-model="resolvingCard.location" type="text" class="input-text" /></label>
              </div>
              <div class="row-2">
                <label>日期<input v-model="resolvingCard.date" type="date" class="input-text" /></label>
                <label>时间<input v-model="resolvingCard.time" type="text" class="input-text" /></label>
              </div>
              <label>海报链接<input v-model="resolvingCard.poster_url" type="text" class="input-text" /></label>
              <label>摘要说明<textarea v-model="resolvingCard.notes" rows="4" class="input-textarea"></textarea></label>
            </div>

            <!-- 会议表单 -->
            <div v-if="resolvingType === 'conference'" class="form-layout">
              <label>会议名称<input v-model="resolvingCard.title" type="text" class="input-text" /></label>
              <div class="row-2">
                <label>城市<input v-model="resolvingCard.city" type="text" class="input-text" /></label>
                <label>类型
                  <select v-model="resolvingCard.sub_type" class="input-select">
                    <option value="研讨会">研讨会</option>
                    <option value="年会">年会</option>
                    <option value="暑期学校">暑期学校</option>
                    <option value="学术论坛">学术论坛</option>
                    <option value="专题研讨">专题研讨</option>
                  </select>
                </label>
              </div>
              <div class="row-2">
                <label>开始日期<input v-model="resolvingCard.date" type="date" class="input-text" /></label>
                <label>结束日期<input v-model="resolvingCard.end_date" type="date" class="input-text" /></label>
              </div>
              <label>具体地点<input v-model="resolvingCard.location" type="text" class="input-text" /></label>
              <label>主办单位<input v-model="resolvingCard.organizer" type="text" class="input-text" /></label>
              <div class="row-2">
                <label>摘要截止<input v-model="resolvingCard.abstract_deadline" type="date" class="input-text" /></label>
                <label>注册截止<input v-model="resolvingCard.registration_deadline" type="date" class="input-text" /></label>
              </div>
              <label>官网网址<input v-model="resolvingCard.website_url" type="text" class="input-text" /></label>
              <label>会议说明<textarea v-model="resolvingCard.notes" rows="3" class="input-textarea"></textarea></label>
            </div>

            <!-- 通知表单 -->
            <div v-if="resolvingType === 'notice'" class="form-layout">
              <label>通知标题<input v-model="resolvingCard.title" type="text" class="input-text" /></label>
              <div class="row-2">
                <label>分类
                  <select v-model="resolvingCard.category" class="input-select">
                    <option value="academic_affairs">教务培养 / 奖学金</option>
                    <option value="holiday">节假日 / 放假调休</option>
                    <option value="facility">水电网络 / 后勤维保</option>
                    <option value="safety">安全保卫 / 应急演练</option>
                    <option value="administrative">行政事务 / 综合公文</option>
                    <option value="general">综合通告</option>
                  </select>
                </label>
                <label>重要程度
                  <select v-model="resolvingCard.importance" class="input-select">
                    <option value="urgent">紧急</option>
                    <option value="important">重要</option>
                    <option value="normal">普通</option>
                  </select>
                </label>
              </div>
              <div class="row-2">
                <label>开始日期<input v-model="resolvingCard.start_date" type="date" class="input-text" /></label>
                <label>截止日期<input v-model="resolvingCard.end_date" type="date" class="input-text" /></label>
              </div>
              <label>详细内容<textarea v-model="resolvingCard.content" rows="5" class="input-textarea"></textarea></label>
            </div>
          </div>
        </div>

        <div class="review-bottom-actions">
          <button type="button" class="button ghost" @click="selectedItem = null">取消</button>
          <button
            type="button"
            class="button primary"
            :disabled="submitting"
            @click="handleConfirmResolve"
          >
            <AppIcon name="check" :size="16" />
            {{ submitting ? '正在入库发布...' : '审核入库并正式发布' }}
          </button>
        </div>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.pending-modal-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 80vh;
  overflow-y: auto;
  padding: 0.25rem 0.5rem;
}

.list-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  gap: 1rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem 1rem;
  color: var(--text-secondary, #94a3b8);
  font-size: 0.95rem;
}

.pending-cards-grid {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.pending-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
}

.pending-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.submitter-text {
  color: var(--text-secondary, #94a3b8);
}

.raw-text-preview {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--text-primary, #f8fafc);
  background: rgba(0, 0, 0, 0.2);
  padding: 0.75rem;
  border-radius: 6px;
  white-space: pre-wrap;
  max-height: 140px;
  overflow-y: auto;
}

.attached-meta {
  display: flex;
  gap: 0.5rem;
}

.meta-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--accent, #0ea5e9);
  background: rgba(14, 165, 233, 0.1);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.card-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.purple-ai-btn {
  background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
  color: #fff !important;
}

.danger-hover-btn:hover {
  color: #ef4444 !important;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 审核编辑模式 */
.review-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
  flex-wrap: wrap;
  gap: 0.5rem;
}

.review-type-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.type-label {
  font-size: 0.85rem;
  color: var(--text-secondary, #94a3b8);
}

.type-btn-group {
  display: flex;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 9999px;
  padding: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  gap: 0.25rem;
}

.type-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem;
  font-size: 0.82rem;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: #e2e8f0;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.type-pill:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.type-pill.active {
  background: var(--accent, #38bdf8);
  color: var(--accent-ink, #041316) !important;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.type-pill.active svg {
  color: var(--accent-ink, #041316) !important;
  stroke: currentColor;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.section-heading h4 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-primary, #f1f5f9);
}

.review-source-block {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
  margin-bottom: 0.5rem;
  transition: all 0.2s ease;
}

.review-source-block.is-active {
  border-color: rgba(14, 165, 233, 0.3);
}

.block-header {
  display: flex;
  align-items: center;
}

.block-check-label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  cursor: pointer;
  color: var(--text-primary, #e2e8f0);
}

.count-tag {
  font-size: 0.72rem;
  color: var(--text-secondary, #94a3b8);
  font-weight: normal;
}

.empty-hint {
  font-size: 0.75rem;
  color: var(--text-secondary, #64748b);
  padding: 0.25rem 0.5rem;
}

.ref-images-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-left: 1.2rem;
}

.ref-img-pick {
  position: relative;
  display: inline-flex;
  cursor: pointer;
  border-radius: 4px;
  overflow: hidden;
  border: 2px solid transparent;
}

.ref-img-pick.is-selected {
  border-color: var(--accent, #0ea5e9);
}

.ref-img-pick input[type="checkbox"] {
  position: absolute;
  top: 2px;
  left: 2px;
  z-index: 2;
  cursor: pointer;
}

.ref-img-pick img {
  width: 50px;
  height: 50px;
  object-fit: cover;
  display: block;
}

.img-order {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 0.65rem;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 0 0.2rem;
  border-radius: 2px;
}

.ref-files-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-left: 1.2rem;
}

.ref-file-pick {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
}

.ref-file-pick.is-selected {
  background: rgba(14, 165, 233, 0.08);
}

.ref-file-pick .filename {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.re-extract-buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
  flex-wrap: wrap;
}

.badge-mini {
  font-size: 0.68rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-weight: 500;
}

.badge-mini.cyan {
  background: rgba(6, 182, 212, 0.15);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.3);
}

.badge-mini.purple {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.review-editor-grid {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 1.25rem;
  margin-top: 0.75rem;
}

.reference-column h4,
.editor-column h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: var(--text-secondary, #94a3b8);
}

.ref-raw-box {
  background: rgba(0, 0, 0, 0.25);
  padding: 0.85rem;
  border-radius: 6px;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 380px;
  overflow-y: auto;
}

.ref-images {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.ref-img-card {
  width: 80px;
  height: 80px;
  border-radius: 6px;
  overflow: hidden;
}

.ref-img-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.form-layout {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.form-layout label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--text-secondary, #94a3b8);
}

.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}

.input-text,
.input-select,
.input-textarea {
  padding: 0.5rem 0.65rem;
  background: var(--bg-input, rgba(15, 23, 42, 0.5));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  color: var(--text-primary, #f8fafc);
  font-size: 0.85rem;
  box-sizing: border-box;
}

.review-bottom-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
}

@media (max-width: 768px) {
  .review-editor-grid {
    grid-template-columns: 1fr;
  }
}
</style>
