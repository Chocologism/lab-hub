<template>
  <main class="page-shell arxiv-page">
    <section class="page-heading">
      <div>
        <p class="eyebrow">今日阅读</p>
        <h1>文献推荐流</h1>
      </div>
      <SilentLizardButton @click="showInput = !showInput" />
    </section>
    <SpotlightCard id="tour-arxiv-recommend-panel" class="recommend-panel" spotlight-color="rgba(125, 211, 252, .16)">
      <div class="panel-heading">
        <div>
          <h2>快速归档</h2>
        </div>
        <TallSwanToggle v-model="showInput" />
      </div>
      <Transition name="expand-spring">
        <div v-if="showInput" class="expandable-panel">
          <form class="recommend-form" @submit.prevent="handlePreview">
            <WaveInput
              v-model="inputUrlOrId"
              label="arXiv 编号 / DOI / 期刊链接"
              wrapper-class="arxiv-wave-input"
              @keydown.enter.prevent="handlePreview"
            />
            <SpottyHorseButton
              :loading="previewing"
              :disabled="!inputUrlOrId.trim()"
            />
          </form>
          <JournalPaperForm @prepared="previewData = $event; previewError = ''" />
          <p v-if="previewError" class="inline-error">{{ previewError }}</p>
        </div>
      </Transition>
      <div v-if="previewData" class="preview-card"><div><span class="data-label">{{ paperLabel(previewData) }}</span><h3 v-html="renderLatex(previewData.title)"></h3><p>{{ previewData.authors.slice(0, 3).join(', ') }}{{ previewData.authors.length > 3 ? ' 等' : '' }}</p></div><textarea v-model="recommendComment" rows="2" placeholder="推荐理由或研读重点，支持 Markdown 与 LaTeX 公式（可选）"></textarea><div v-if="recommendComment && recommendComment.trim()" class="recommend-preview"><span class="preview-tag">实时预览：</span><div class="preview-content markdown-content" v-html="renderMarkdown(recommendComment)"></div></div><RecommendationAudience v-model="audience" /><div class="inline-actions"><button type="button" class="button button-quiet" @click="previewData = null">取消</button><SmartMothButton :disabled="submitting || (audience.visibility === 'direct' && !audience.recipient_ids.length)" :loading="submitting" :label="submitting ? '发布中…' : (audience.visibility === 'direct' ? '发送定向推荐' : '发布到公共推荐流')" @click="handleSubmitRecommend" /></div></div>
    </SpotlightCard>
    <section id="tour-arxiv-toolbar" class="feed-toolbar"><div class="segmented" aria-label="文献筛选"><button v-for="option in scopes" :key="option.id" :class="{ active: scope === option.id }" @click="changeScope(option.id)">{{ option.label }}</button></div><span class="count-label">{{ feed.length }} 篇</span></section>
    <LoadingState v-if="loading" message="正在更新文献流" />
    <section v-else-if="loadError" class="empty-state"><AppIcon name="warning" :size="28" /><h2>暂时无法读取文献流</h2><p>{{ loadError }}</p><button class="button button-quiet" @click="loadFeed">重试</button></section>
    <section v-else-if="!feed.length" class="empty-state"><AppIcon name="file-text" :size="28" /><h2>这里还没有文献</h2><p>从上方录入一篇值得组内讨论的论文。</p></section>
    <section v-else class="paper-list">
      <article
        v-for="(paper, pIdx) in feed"
        :key="paper.id"
        :id="pIdx === 0 ? 'tour-arxiv-first-paper' : undefined"
        class="paper-row"
        :class="{ featured: paper.recommender?.identity === 'teacher' || paper.is_pinned, 'seminar-today': paper.is_seminar_today }"
      >
        <div class="paper-meta">
          <div class="paper-meta-info">
            <span :class="['badge', paper.visibility === 'direct' ? 'amber' : 'cyan']">{{ paper.visibility === 'direct' ? '定向推荐' : '公开推荐' }}</span>
            <span v-if="paper.is_seminar_today" class="priority-label seminar-priority">今日组会</span>
            <span v-else-if="paper.recommender?.identity === 'teacher' || paper.is_teacher_pinned" class="priority-label">导师重点</span>
            <span v-else-if="paper.is_pinned" class="priority-label">置顶推荐</span>
            <span class="meta-date">{{ paper.published_date }}</span>
            <span class="meta-category" :title="paper.journal || paper.primary_category || 'arXiv'">{{ paper.journal || paper.primary_category || 'arXiv' }}</span>
          </div>

          <div class="paper-meta-actions">
            <a class="pdf-link button small secondary" :href="paperRead(paper)" target="_blank" rel="noreferrer">
              <span>{{ paperReadLabel(paper) }}</span>
            </a>

            <!-- 与AI讨论按键：仅在用户配置好大模型并测试连通后显示 -->
            <button
              v-if="isAiReady && paper.arxiv_id"
              type="button"
              class="discuss-ai-btn button small secondary"
              title="跳转至 AI 助手并基于全文展开深度讨论"
              @click="handleDiscussWithAi(paper)"
            >
              <AppIcon name="chats" :size="12" />
              <span>与AI讨论</span>
            </button>

            <!-- AI 翻译与多语言翻转控制 -->
            <template v-if="isAiReady">
              <button
                v-if="!getPaperTranslation(paper)"
                type="button"
                class="translate-action-btn button small secondary"
                :disabled="translatingIds.has(getPaperKey(paper))"
                :title="translatingIds.has(getPaperKey(paper)) ? '正在使用大模型翻译中...' : '使用大模型将标题与摘要翻译为学术中文'"
                @click="handleTranslatePaper(paper)"
              >
                <AppIcon v-if="translatingIds.has(getPaperKey(paper))" name="undo" class="spin-icon" :size="12" />
                <AppIcon v-else name="translate" :size="12" />
                <span>{{ translatingIds.has(getPaperKey(paper)) ? '翻译中…' : '翻译' }}</span>
              </button>

              <button
                v-else
                type="button"
                class="translate-flip-btn button small"
                :class="isChineseView(paper) ? 'is-zh' : 'is-en secondary'"
                :title="isChineseView(paper) ? '点击翻转查看英文原文卡片' : '点击翻转查看中文翻译卡片'"
                @click="togglePaperLang(paper)"
              >
                <AppIcon name="translate" :size="12" />
                <span>{{ isChineseView(paper) ? '译文 (中)' : '原文 (EN)' }}</span>
              </button>
            </template>
          </div>
        </div>
        <div class="paper-main" :class="{ 'card-in-chinese': isChineseView(paper) }">
          <Transition name="paper-flip" mode="out-in">
            <div :key="isChineseView(paper) ? 'zh-title' : 'en-title'" class="paper-title-wrap">
              <a :href="paperSource(paper)" target="_blank" rel="noopener">
                <h2 v-html="renderLatex(isChineseView(paper) ? getPaperTranslation(paper).title : paper.title)"></h2>
              </a>
              <div v-if="isChineseView(paper)" class="translation-status-pill">
                <AppIcon name="translate" :size="11" />
                <span>中文学术译本</span>
              </div>
            </div>
          </Transition>
          <PaperAuthors :authors="paper.authors" v-model:expanded="expandedAuthors[paper.id]" />
          <p class="audience-line">{{ paper.recommender?.name || '课题组成员' }} → {{ paper.visibility === 'direct' ? (paper.recipients || []).map(u => u.name).join('、') : '全组成员' }}</p>
          <div v-if="paper.recommend_comment" class="recommendation" :class="{ 'has-seminar': Boolean(paper.seminar_id) }">
            <div class="recommend-header">
              <span class="recommender-name">{{ paper.recommender?.name || '推荐人' }}：</span>
              <span v-if="paper.seminar_id" class="seminar-tag-action" role="button" tabindex="0" title="点击查看对应组会日程时间线" @click.stop="goToSeminar(paper.seminar_id)">
                <span>查看组会</span>
                <AppIcon name="arrow-up-right" :size="11" />
              </span>
              <button v-if="scope === 'sent' && currentUser?.id === (paper.recommender?.id || paper.recommended_by_id)" type="button" class="inline-edit-btn" title="编辑推荐理由" @click="editVisibility(paper)">
                <AppIcon name="edit" :size="12" />
                <span>编辑</span>
              </button>
            </div>
            <div 
              class="recommend-body markdown-content"
              :class="{ 'clickable-recommend': Boolean(paper.seminar_id) }"
              :title="paper.seminar_id ? '点击查看对应组会日程时间线' : undefined"
              @click="handleRecommendBodyClick(paper, $event)"
              v-html="renderMarkdown(paper.recommend_comment)"
            ></div>
          </div>
          <p v-else-if="scope === 'sent' && currentUser?.id === (paper.recommender?.id || paper.recommended_by_id)" class="recommendation-placeholder">
            <button type="button" class="text-action add-comment-btn" @click="editVisibility(paper)">+ 添加推荐理由</button>
          </p>
          <Transition name="paper-flip" mode="out-in">
            <p
              :key="isChineseView(paper) ? 'zh-abs' : 'en-abs'"
              :class="{ clamped: !expandedAbstracts[paper.id] }"
              class="abstract"
              v-html="renderLatex(isChineseView(paper) ? getPaperTranslation(paper).abstract : paper.abstract)"
            ></p>
          </Transition>
          <button class="text-action" @click="toggleAbstract(paper.id)">{{ expandedAbstracts[paper.id] ? '收起摘要' : '展开摘要' }}</button>
        </div>
        <div class="paper-side-rail">
          <div class="paper-actions">
            <FavoriteButton kind="paper" :target="paper.arxiv_id" />
            <PopularPumaLikeButton :liked="paper.is_liked_by_me" :count="paper.like_count || 0" @toggle="handleToggleLike(paper)" />
            <button v-if="scope === 'sent' && currentUser?.id === (paper.recommender?.id || paper.recommended_by_id)" class="button small secondary visibility-edit" @click="editVisibility(paper)">编辑推荐</button>
            <MightyWarthogBookmark :checked="paper.is_read_by_me" @toggle="handleToggleRead(paper)" />
            <SmartEmuDelete v-if="canDelete(paper)" size="small" title="删除推荐" text="删除" @click="handleDelete(paper)" />
          </div>
          <PaperChatBox :paper="paper" :current-user="currentUser" :expanded="Boolean(expandedAbstracts[paper.id] || expandedAuthors[paper.id])" @comment-added="onCommentAdded(paper, $event)" @comment-deleted="onCommentDeleted(paper, $event)" />
        </div>
      </article>
    </section>
    <BaseDialog :open="!!editingPaper" title="编辑文献推荐" :busy="savingVisibility" @close="editingPaper = null"><form v-if="editingPaper" class="form-grid edit-recommend-form" @submit.prevent="saveVisibility"><p class="academic" v-html="renderLatex(editingPaper.title)"></p><label class="comment-field"><span class="field-label">推荐理由 / 研读重点（支持 Markdown 与 LaTeX，可选）</span><textarea v-model="editComment" rows="4" class="comment-textarea" placeholder="输入研读重点或推荐理由，支持 Markdown（如 **加粗**、- 列表）与 LaTeX 公式（如 $H_0$, $\sigma_8$）…"></textarea></label><div v-if="editComment && editComment.trim()" class="recommend-preview"><span class="preview-tag">实时预览：</span><div class="preview-content markdown-content" v-html="renderMarkdown(editComment)"></div></div><div class="audience-section"><span class="field-label">可见范围</span><RecommendationAudience :key="editingPaper.id" v-model="editAudience" /></div><p class="muted visibility-help">保存后将立即按新范围与新推荐理由展示。若论文还有其他公开推荐或组会收录，公共文献库中的论文仍会保留。</p><p v-if="visibilityError" class="inline-error" role="alert">{{ visibilityError }}</p><div class="form-actions"><button class="button secondary" type="button" :disabled="savingVisibility" @click="editingPaper = null">取消</button><button class="button primary" type="submit" :disabled="savingVisibility || (editAudience.visibility === 'direct' && !editAudience.recipient_ids.length)">{{ savingVisibility ? '保存中…' : '保存修改' }}</button></div></form></BaseDialog>
  </main>
</template>

<script setup>
import JournalPaperForm from '../components/JournalPaperForm.vue'
import PaperChatBox from '../components/PaperChatBox.vue'
import PaperAuthors from '../components/PaperAuthors.vue'
import { renderLatex } from '../utils/latex'
import { renderMarkdown } from '../utils/markdown'
import { paperLabel, paperSource, paperRead, paperReadLabel } from '../utils/papers'
import FavoriteButton from '../components/FavoriteButton.vue'
import SmartMothButton from '../components/SmartMothButton.vue'
import SilentLizardButton from '../components/SilentLizardButton.vue'
import SpottyHorseButton from '../components/SpottyHorseButton.vue'
import WaveInput from '../components/WaveInput.vue'
import TallSwanToggle from '../components/TallSwanToggle.vue'
import SmartEmuDelete from '../components/SmartEmuDelete.vue'
import MightyWarthogBookmark from '../components/MightyWarthogBookmark.vue'
import PopularPumaLikeButton from '../components/PopularPumaLikeButton.vue'
import { onMounted, onBeforeUnmount, onActivated, ref } from 'vue'
import { useRouter } from 'vue-router'
import { arxivApi, authApi } from '../api/client'
import BaseDialog from '../components/BaseDialog.vue'
import RecommendationAudience from '../components/RecommendationAudience.vue'
import AppIcon from '../components/AppIcon.vue'
import LoadingState from '../components/LoadingState.vue'
import SpotlightCard from '../components/bits/SpotlightCard.vue'
import { confirmAction, notify } from '../composables/feedback'
import {
  isAiAssistantReady,
  loadPaperTranslations,
  savePaperTranslation,
  translatePaperWithAi
} from '../services/aiService'

const confirm = ({ title, message, confirmText, tone }) => confirmAction(message, { title, confirmLabel: confirmText, danger: tone === 'danger' })
const scopes = [{ id: 'all', label: '全部可见' }, { id: 'public', label: '公共推荐' }, { id: 'received', label: '推荐给我的' }, { id: 'sent', label: '我发出的' }, { id: 'teacher', label: '导师推荐' }, { id: 'unread', label: '未读' }]
const editingPaper = ref(null), editAudience = ref({ visibility: 'public', recipient_ids: [] }), editComment = ref(''), savingVisibility = ref(false), visibilityError = ref('')
const audience = ref({ visibility: 'public', recipient_ids: [] })
const scope = ref('all'), feed = ref([]), loading = ref(false), loadError = ref(''), showInput = ref(false)
const inputUrlOrId = ref(''), previewing = ref(false), previewError = ref(''), previewData = ref(null), recommendComment = ref(''), submitting = ref(false), expandedAbstracts = ref({}), expandedAuthors = ref({}), currentUser = ref(null)

// AI 翻译与多语言卡片翻转状态
const isAiReady = ref(false)
const paperTranslations = ref(loadPaperTranslations())
const paperLangState = ref({})
const translatingIds = ref(new Set())

function checkAiReady() {
  isAiReady.value = isAiAssistantReady()
}

function getPaperKey(paper) {
  if (!paper) return ''
  return String(paper.arxiv_id || paper.doi || paper.id)
}

function getPaperTranslation(paper) {
  const key = getPaperKey(paper)
  return paperTranslations.value[key] || null
}

function isChineseView(paper) {
  const key = getPaperKey(paper)
  if (paperLangState.value[key] !== undefined) {
    return paperLangState.value[key] === 'zh'
  }
  return Boolean(paperTranslations.value[key])
}

function togglePaperLang(paper) {
  const key = getPaperKey(paper)
  const current = isChineseView(paper)
  paperLangState.value[key] = current ? 'en' : 'zh'
}

async function handleTranslatePaper(paper) {
  const key = getPaperKey(paper)
  if (translatingIds.value.has(key)) return
  translatingIds.value.add(key)
  try {
    const result = await translatePaperWithAi({
      title: paper.title,
      abstract: paper.abstract
    })
    savePaperTranslation(key, result)
    paperTranslations.value[key] = result
    paperLangState.value[key] = 'zh'
    notify('文献已成功翻译为学术中文！', 'success')
  } catch (err) {
    notify(`翻译失败: ${err.message || '大模型请求异常'}`, 'error')
  } finally {
    translatingIds.value.delete(key)
  }
}

function handleDiscussWithAi(paper) {
  if (!paper || !paper.arxiv_id) return
  const rawId = paper.arxiv_id
  const payload = {
    arxivId: rawId,
    title: paper.title || '',
    authors: Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || ''),
    abstract: paper.abstract || ''
  }
  try {
    sessionStorage.setItem('labhub_pending_discuss_paper', JSON.stringify(payload))
  } catch (_) {}
  router.push({
    path: '/assistant',
    query: { discussArxiv: rawId }
  })
}

onMounted(() => {
  checkAiReady()
  loadFeed()
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', checkAiReady)
    window.addEventListener('focus', checkAiReady)
    window.addEventListener('labhub-ai-config-changed', checkAiReady)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('storage', checkAiReady)
    window.removeEventListener('focus', checkAiReady)
    window.removeEventListener('labhub-ai-config-changed', checkAiReady)
  }
})

onActivated(() => {
  checkAiReady()
})
let feedRequest = 0
const loadFeed = async () => {
  const request = ++feedRequest, requestedScope = scope.value
  loading.value = true; loadError.value = ''
  try {
    const [user, data] = await Promise.all([authApi.getMe(), arxivApi.getFeed(requestedScope)])
    if (request !== feedRequest) return
    currentUser.value = user
    localStorage.setItem('labhub_user', JSON.stringify(user))
    // An old backend silently ignores newer scopes. Never label its full feed as "sent".
    if (requestedScope === 'sent' && data.some(paper => (paper.recommender?.id || paper.recommended_by_id) !== user.id)) {
      feed.value = []
      throw new Error('后端未正确处理“我发出的”筛选，请重启后端服务至当前版本后重试。')
    }
    feed.value = data
  } catch (error) {
    if (request === feedRequest) { feed.value = []; loadError.value = error.message || '请检查连接后重试。' }
  } finally { if (request === feedRequest) loading.value = false }
}
const changeScope = (next) => { scope.value = next; loadFeed() }
const handlePreview = async () => { previewing.value = true; previewError.value = ''; previewData.value = null; try { previewData.value = await arxivApi.preview(inputUrlOrId.value.trim()) } catch (error) { previewError.value = error.message } finally { previewing.value = false } }
const handleSubmitRecommend = async () => { if (!previewData.value) return; submitting.value = true; try { await arxivApi.recommend({ ...previewData.value, ...audience.value, recommend_comment: recommendComment.value, is_pinned: false }); inputUrlOrId.value = ''; previewData.value = null; recommendComment.value = ''; showInput.value = false; scope.value = audience.value.visibility === 'direct' ? 'sent' : 'public'; audience.value = { visibility: 'public', recipient_ids: [] }; await loadFeed(); notify('文献已发布到推荐流', 'success') } catch (error) { notify(error.message, 'error') } finally { submitting.value = false } }
const readPending = new Set()
const handleToggleRead = async (paper) => {
  if (!paper || readPending.has(paper.id)) return
  readPending.add(paper.id)
  const prevRead = Boolean(paper.is_read_by_me)
  paper.is_read_by_me = !prevRead
  try {
    const result = await arxivApi.toggleRead(paper.id)
    paper.is_read_by_me = result.is_read
  } catch (error) {
    paper.is_read_by_me = prevRead
    notify(error.message || '标记已读失败', 'error')
  } finally {
    readPending.delete(paper.id)
  }
}

const likePending = new Set()
const handleToggleLike = async (paper) => {
  if (!paper || likePending.has(paper.id)) return
  likePending.add(paper.id)
  const prevLiked = Boolean(paper.is_liked_by_me)
  const prevCount = Number(paper.like_count) || 0
  const nextLiked = !prevLiked
  const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1)
  paper.is_liked_by_me = nextLiked
  paper.like_count = nextCount
  try {
    const result = await arxivApi.toggleLike(paper.id)
    paper.is_liked_by_me = result.is_liked
    paper.like_count = result.like_count
  } catch (error) {
    paper.is_liked_by_me = prevLiked
    paper.like_count = prevCount
    notify(error.message || '点赞操作失败', 'error')
  } finally {
    likePending.delete(paper.id)
  }
}
const handleDelete = async (paper) => { if (!await confirm({ title: '移除文献', message: `从推荐流移除「${paper.title}」？`, confirmText: '移除', tone: 'danger' })) return; try { await arxivApi.deletePaper(paper.id); feed.value = feed.value.filter((item) => item.id !== paper.id); notify('文献已移除', 'success') } catch (error) { notify(error.message, 'error') } }
function editVisibility(paper) {
  editingPaper.value = paper
  editAudience.value = { visibility: paper.visibility, recipient_ids: (paper.recipients || []).map(u => u.id) }
  editComment.value = paper.recommend_comment || ''
  visibilityError.value = ''
}
async function saveVisibility() {
  if (!editingPaper.value || (editAudience.value.visibility === 'direct' && !editAudience.value.recipient_ids.length)) return
  savingVisibility.value = true; visibilityError.value = ''
  try {
    const updated = await arxivApi.updateVisibility(editingPaper.value.id, {
      ...editAudience.value,
      recommend_comment: editComment.value
    })
    feed.value = feed.value.map(p => p.id === updated.id ? updated : p)
    editingPaper.value = null
    notify('推荐内容已更新', 'success')
  } catch (error) { visibilityError.value = error.message }
  finally { savingVisibility.value = false }
}
const toggleAbstract = (id) => { expandedAbstracts.value[id] = !expandedAbstracts.value[id] }
const canDelete = (paper) => currentUser.value && (currentUser.value.role === 'admin' || currentUser.value.id === paper.recommender.id)

function onCommentAdded(paper, comment) {
  if (!comment || !comment.id) return
  if (!Array.isArray(paper.comments)) {
    paper.comments = []
  }
  if (!paper.comments.some(c => c.id === comment.id)) {
    paper.comments.push(comment)
  }
}

function onCommentDeleted(paper, commentId) {
  if (Array.isArray(paper.comments)) {
    paper.comments = paper.comments.filter(c => c.id !== commentId)
  }
}

const router = useRouter()

function goToSeminar(seminarId) {
  if (!seminarId) return
  router.push({
    path: '/seminars',
    query: {
      view: 'timeline',
      target_seminar: String(seminarId),
      no_reset: '1'
    }
  })
}

function handleRecommendBodyClick(paper, event) {
  if (!paper?.seminar_id) return
  if (event?.target?.closest('a, button, input, textarea, select, .inline-edit-btn')) return
  goToSeminar(paper.seminar_id)
}
</script>

<style scoped>
.visibility-help { font-size:12px; line-height:1.8; }.visibility-edit { height: 30px; border-radius: 9999px; font-size: 11.5px; padding: 0 10px; flex-shrink: 0; white-space: nowrap; }.count-label { white-space:nowrap; flex-shrink:0; }.audience-line { margin-top:10px; color:var(--accent); font-size:12px; }.feed-toolbar .segmented { flex-wrap:wrap; }.feed-toolbar { align-items:flex-start; }.paper-meta .badge { width:max-content; }

.page-shell { max-width: 1080px; margin: auto; padding: 42px 28px 100px; }.page-heading, .panel-heading, .feed-toolbar, .inline-actions, .paper-row, .paper-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.eyebrow, .data-label, .count-label, .paper-meta { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }.page-heading h1 { margin: 5px 0 8px; font-size: clamp(28px, 4vw, 42px); letter-spacing: -.04em; }.page-heading p:not(.eyebrow), .panel-heading p, .empty-state p { margin: 0; color: var(--muted); font-size: 14px; }.recommend-panel { display: block; margin-top: 28px; padding: 22px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
.panel-heading h2 { margin: 0; font-size: 16px; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; }
.expandable-panel { overflow: hidden; }
.recommend-form { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; margin-top: 18px; }
.recommend-form :deep(.form-control) {
  margin: 10px 0 6px !important;
}

.expand-spring-enter-active {
  transition: all 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: top center;
}
.expand-spring-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: top center;
}
.expand-spring-enter-from {
  opacity: 0;
  transform: translateY(-22px) scale(0.96);
  max-height: 0;
}
.expand-spring-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
  max-height: 400px;
}
.expand-spring-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
  max-height: 400px;
}
.expand-spring-leave-to {
  opacity: 0;
  transform: translateY(-16px) scale(0.96);
  max-height: 0;
}
.preview-card { display: grid; gap: 14px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
.preview-card h3, .paper-main h2 { margin: 7px 0; font-family: var(--font); font-size: 18px; line-height: 1.4; }
.preview-card p, .authors { margin: 0; color: var(--muted); font-size: 12px; }
.inline-error { margin: 12px 0 0; color: var(--danger); font-size: 13px; }
.feed-toolbar { margin: 28px 0 13px; }
.segmented { display: inline-flex; padding: 3px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); }
.segmented button { padding: 7px 11px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 12px; }
.segmented button.active { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.paper-list { display: grid; gap: 10px; }
.paper-row {
  position: relative;
  display: flex;
  align-items: stretch;
  padding: 21px;
  padding-right: 347px;
  min-height: 220px;
  box-sizing: border-box;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--panel);
  transition: border-color .2s ease, box-shadow .2s ease;
  animation: paperRowIn 0.28s ease-out;
}
@keyframes paperRowIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.paper-row:hover {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
}
.paper-row.featured { border-left: 3px solid var(--accent); }
.paper-row.seminar-today {
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 3.5%, var(--panel));
}
.paper-meta {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 120px;
  flex: 0 0 120px;
  gap: 12px;
}

.paper-meta-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.paper-meta-info .meta-date,
.paper-meta-info .meta-category {
  font-size: 11px;
  color: var(--muted);
  word-break: break-word;
  line-height: 1.4;
}

.paper-meta-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  width: 100%;
}

.paper-meta-actions .pdf-link,
.paper-meta .discuss-ai-btn,
.paper-meta .translate-action-btn,
.paper-meta .translate-flip-btn,
.discuss-ai-btn,
.translate-action-btn,
.translate-flip-btn {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  height: 28px;
  padding: 0 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  box-sizing: border-box;
  position: static;
  margin: 0;
}

.discuss-ai-btn {
  background: color-mix(in srgb, var(--accent) 9%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
  color: var(--accent);
  font-weight: 500;
}

.discuss-ai-btn:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: var(--accent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 25%, transparent);
}

.translate-action-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.translate-flip-btn.is-zh {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border: 1px solid var(--accent);
  color: var(--accent);
  font-weight: 600;
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 25%, transparent);
}

.translation-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent);
  padding: 1px 8px;
  border-radius: 999px;
  margin-top: 4px;
  margin-bottom: 8px;
  width: fit-content;
}

.paper-flip-enter-active {
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
  transform-origin: center center;
}

.paper-flip-leave-active {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease;
  transform-origin: center center;
}

.paper-flip-enter-from {
  opacity: 0;
  transform: rotateX(-65deg) scale(0.97);
}

.paper-flip-leave-to {
  opacity: 0;
  transform: rotateX(65deg) scale(0.97);
}

.spin-icon {
  animation: spinRotate 1s linear infinite;
}

@keyframes spinRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.priority-label { color: var(--accent); }
.priority-label.seminar-priority {
  color: var(--accent);
  font-weight: 700;
  letter-spacing: 0.02em;
}
.paper-main { min-width: 0; flex: 1; }
.paper-main a { color: var(--text); text-decoration: none; }
.recommendation {
  margin: 12px 0;
  padding: 8px 12px;
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 4%, transparent);
  border-radius: 0 8px 8px 0;
  color: var(--soft);
  font-size: 13px;
  line-height: 1.6;
}
.recommend-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.recommender-name {
  font-weight: 600;
  color: var(--text);
  font-size: 13px;
}
.seminar-tag-action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 4px;
  padding: 1px 7px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
  border-radius: 9999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  vertical-align: middle;
  transition: all 0.15s ease;
  user-select: none;
}
.seminar-tag-action:hover {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  border-color: var(--accent);
}
.recommend-body {
  font-size: 13px;
  color: var(--soft);
}
.clickable-recommend {
  cursor: pointer;
}
.clickable-recommend:hover {
  color: var(--text);
}
.inline-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 4px;
  padding: 1px 7px;
  border: 1px solid var(--line);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--panel) 80%, transparent);
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  vertical-align: middle;
  transition: all 0.15s ease;
}
.inline-edit-btn:hover {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border-color: var(--accent);
}
.recommendation-placeholder {
  margin: 8px 0;
}
.recommendation-placeholder .add-comment-btn {
  font-size: 12px;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.recommendation-placeholder .add-comment-btn:hover {
  color: var(--accent);
}
.edit-recommend-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.comment-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.comment-field .field-label, .audience-section .field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}
.comment-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  box-sizing: border-box;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s ease;
}
.comment-textarea:focus {
  border-color: var(--accent);
}
.recommend-preview {
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 8%, var(--bg));
  border-left: 3px solid var(--accent);
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.5;
}
.recommend-preview .preview-tag {
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
  margin-right: 4px;
}
.audience-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.abstract { margin: 12px 0 0; color: var(--muted); font-size: 13px; line-height: 1.65; }
.clamped { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.text-action { margin-top: 7px; padding: 0; border: 0; background: transparent; color: var(--accent); font-size: 12px; cursor: pointer; }
.empty-state { display: grid; justify-items: center; gap: 10px; padding: 70px 24px; border: 1px dashed var(--line); border-radius: 14px; color: var(--muted); text-align: center; }
.empty-state h2 { margin: 0; color: var(--text); font-size: 17px; }
.paper-side-rail {
  position: absolute;
  top: 21px;
  bottom: 21px;
  right: 21px;
  width: 310px;
  height: calc(100% - 42px);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 8px;
  overflow: hidden;
  box-sizing: border-box;
}
.paper-side-rail .paper-actions {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

@media (max-width: 768px) {
  .page-shell { padding: 20px 14px 96px; }
  .page-heading { align-items: flex-start; gap: 12px; }
  .page-heading h1 { font-size: 26px; }
  .page-heading p:not(.eyebrow) { font-size: 13px; }
  .recommend-panel { margin-top: 18px; padding: 16px; border-radius: 12px; }
  .recommend-form { grid-template-columns: 1fr; gap: 10px; }
  
  .feed-toolbar {
    margin: 18px 0 10px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .feed-toolbar .segmented {
    display: flex;
    width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap;
    padding: 3px;
    gap: 4px;
  }
  .feed-toolbar .segmented::-webkit-scrollbar {
    display: none;
  }
  .feed-toolbar .segmented button {
    flex-shrink: 0;
    white-space: nowrap;
    font-size: 12px;
    padding: 6px 12px;
  }
  .feed-toolbar .count-label {
    align-self: flex-end;
    font-size: 11px;
  }

  .paper-row {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px !important;
    min-height: auto;
    border-radius: 12px;
  }
  .paper-meta {
    display: flex;
    flex-direction: column;
    width: 100%;
    flex: none;
    gap: 8px;
  }
  .paper-meta-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .paper-meta-actions {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin-top: 2px;
  }
  .paper-meta-actions .pdf-link,
  .paper-meta-actions .discuss-ai-btn,
  .paper-meta-actions .translate-action-btn,
  .paper-meta-actions .translate-flip-btn {
    width: auto;
    padding: 0 10px;
    height: 28px;
    border-radius: 8px;
    margin: 0;
  }
  .paper-main h2 {
    font-size: 16px;
    line-height: 1.45;
  }
  .paper-side-rail {
    position: static;
    width: 100%;
    height: auto;
    flex: none;
    margin-top: 8px;
    gap: 10px;
    overflow: visible;
  }
  .paper-actions {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    width: 100%;
    padding-top: 10px;
    border-top: 1px dashed color-mix(in srgb, var(--line) 70%, transparent);
  }
  .paper-actions::-webkit-scrollbar {
    display: none;
  }
}
</style>
