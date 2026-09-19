<script setup>
import { paperLabel, paperSource, paperRead, paperReadLabel } from '../utils/papers'
import { renderLatex, hasLatex } from '../utils/latex'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'
import { Draggable } from 'gsap/Draggable'
import { seminarApi, arxivApi, talkApi, authApi, mailboxApi } from '../api/client'
import { buildSeminarNoticeBody, parseExternalEmails, formatSeminarDateTime } from '../utils/smtpNotice'
import ScheduleOverview from '../components/ScheduleOverview.vue'
import ConferenceList from '../components/ConferenceList.vue'
import TalkManager from '../components/TalkManager.vue'
import FileField from '../components/FileField.vue'
import WaveInput from '../components/WaveInput.vue'
import AttachmentLink from '../components/AttachmentLink.vue'
import BaseDialog from '../components/BaseDialog.vue'
import ScheduleImportDialog from '../components/ScheduleImportDialog.vue'
import SeminarReminders from '../components/SeminarReminders.vue'
import AppIcon from '../components/AppIcon.vue'
import LoadingState from '../components/LoadingState.vue'
import { confirmAction, notify } from '../composables/feedback'
import { addDays, dateString, filterSeminars, findConflicts, monday, moveDraft, nextSeminar, parseDate, previewSeminars, railDates, reconcileChanges, seminarIcs, shanghaiToday, sortSeminars, statusLabel } from '../utils/schedule'

gsap.registerPlugin(Flip, Draggable)

const route = useRoute()
const router = useRouter()
const members = ref([]), currentUser = ref(null), showImport = ref(false), abstractItem = ref(null), abstractText = ref(''), abstractTopic = ref(''), abstractError = ref('')
const topicItem = ref(null), topicText = ref(''), topicError = ref(''), savingTopic = ref(false)
const showSettings = ref(false), reminderSettings = ref({ abstract_reminder_days: 7, arxiv_reminder_days: 7 }), savingSettings = ref(false)

const canManageSeminars = computed(() => {
  if (!currentUser.value) return false
  return currentUser.value.role === 'admin' || currentUser.value.role === 'teacher' || Boolean(currentUser.value.can_manage_seminars)
})

// 管理员：人员关联检测与批量匹配
const showAssociationModal = ref(false)
const associationStats = ref(null)
const loadingStats = ref(false)
const matchingPresenters = ref(false)

async function openAssociationModal() {
  showAssociationModal.value = true
  await refreshAssociationStats()
}

async function refreshAssociationStats() {
  loadingStats.value = true
  try {
    const data = await seminarApi.getAssociationStats()
    associationStats.value = data
  } catch (e) {
    notify(e.message || '获取人员关联统计失败', 'error')
  } finally {
    loadingStats.value = false
  }
}

async function handleBatchMatch() {
  matchingPresenters.value = true
  try {
    const res = await seminarApi.batchMatchPresenters()
    notify(res.message || `已关联 ${res.matched_users} 位成员（主讲 ${res.matched_presenter_slots} 次，arXiv 分享 ${res.matched_presentation_slots} 次）`)
    await refreshAssociationStats()
    await load()
    scheduleChanged()
  } catch (e) {
    notify(e.message || '批量匹配失败', 'error')
  } finally {
    matchingPresenters.value = false
  }
}

// 批量设置会议号
const showBatchLocationModal = ref(false)
const batchLocationForm = ref({ location: '', scope: 'upcoming' })
const savingBatchLocation = ref(false)

function openBatchLocationModal() {
  batchLocationForm.value = { location: '', scope: 'upcoming' }
  showBatchLocationModal.value = true
}

async function handleSaveBatchLocation() {
  if (!batchLocationForm.value.location.trim()) {
    notify('请输入会议号或地点', 'error')
    return
  }
  savingBatchLocation.value = true
  try {
    const res = await seminarApi.batchLocation(batchLocationForm.value.location.trim(), batchLocationForm.value.scope)
    notify(res.message || '固定会议号已成功应用')
    showBatchLocationModal.value = false
    await load()
    scheduleChanged()
  } catch (e) {
    notify(e.message || '应用会议号失败', 'error')
  } finally {
    savingBatchLocation.value = false
  }
}

// 管理员：组会邮件通知发送 (SMTP)
const showSeminarNoticeModal = ref(false)
const sendingSeminarNotice = ref(false)
const selectedNoticeSeminarId = ref(null)
const noticeSubject = ref('')
const noticeBody = ref('')
const selectedMemberEmails = ref([])
const externalEmailsRaw = ref('')

const registeredMembersWithEmail = computed(() => {
  return members.value.filter(m => {
    if (!m.email || !m.email.includes('@')) return false
    const emailLower = m.email.trim().toLowerCase()
    const nameTrim = (m.real_name || m.name || '').trim()
    if (m.role === 'admin' && nameTrim === '系统管理员') return false
    return true
  })
})

const parsedExternalEmails = computed(() => {
  return parseExternalEmails(externalEmailsRaw.value)
})

const allNoticeRecipients = computed(() => {
  const set = new Set([...selectedMemberEmails.value, ...parsedExternalEmails.value])
  return Array.from(set)
})

const selectableSeminars = computed(() => {
  return seminars.value.filter(s => s.status === 'upcoming')
})

function populateNoticeTemplate(targetSeminar) {
  if (!targetSeminar) return
  const sharers = (targetSeminar.presentations || [])
    .map(p => p.presenter_name)
    .filter(Boolean)
    .join('、')
  const adminName = currentUser.value?.real_name || currentUser.value?.name || '管理员'
  const dateFormatted = formatSeminarDateTime(targetSeminar.date, targetSeminar.time)

  noticeSubject.value = dateFormatted ? `【组会通知】${dateFormatted}` : '【组会通知】'
  noticeBody.value = buildSeminarNoticeBody({
    dateStr: targetSeminar.date,
    timeStr: targetSeminar.time,
    location: targetSeminar.location,
    presenterName: targetSeminar.presenter_name,
    presentationsText: sharers,
    topic: targetSeminar.topic,
    adminName: adminName
  })
}

function openSeminarNoticeModal() {
  const target = next.value || seminars.value.find(s => s.status === 'upcoming') || seminars.value[0] || null
  selectedNoticeSeminarId.value = target?.id || null
  populateNoticeTemplate(target)
  // 默认勾选全部有邮箱的已注册组员
  selectedMemberEmails.value = registeredMembersWithEmail.value.map(m => m.email.toLowerCase())
  externalEmailsRaw.value = ''
  showSeminarNoticeModal.value = true
}

function handleNoticeSeminarChange() {
  const target = seminars.value.find(s => s.id === selectedNoticeSeminarId.value)
  if (target) {
    populateNoticeTemplate(target)
  }
}

function toggleAllMembers() {
  if (selectedMemberEmails.value.length === registeredMembersWithEmail.value.length) {
    selectedMemberEmails.value = []
  } else {
    selectedMemberEmails.value = registeredMembersWithEmail.value.map(m => m.email.toLowerCase())
  }
}

async function handleSendSeminarNotice() {
  if (!allNoticeRecipients.value.length) {
    notify('请至少勾选一位组员或输入有效的外部接收邮箱', 'error')
    return
  }
  if (!noticeSubject.value.trim()) {
    notify('请输入邮件主题', 'error')
    return
  }
  if (!noticeBody.value.trim()) {
    notify('请输入邮件正文', 'error')
    return
  }

  const confirmed = await confirmAction(
    `确定要向 ${allNoticeRecipients.value.length} 位收件人发送本次组会通知吗？\n\n主题：${noticeSubject.value.trim()}`,
    {
      title: '确认发送组会通知邮件',
      confirmLabel: '立即发送',
      danger: false
    }
  )
  if (!confirmed) return

  sendingSeminarNotice.value = true
  try {
    const res = await mailboxApi.sendSeminarNotice({
      subject: noticeSubject.value.trim(),
      body: noticeBody.value.trim(),
      body_text: noticeBody.value.trim(),
      recipients: allNoticeRecipients.value,
      external_emails: allNoticeRecipients.value,
      seminar_id: selectedNoticeSeminarId.value || null
    })
    notify(res.message || '组会通知邮件已成功发出！可在【邮箱】查看发件归档。')
    showSeminarNoticeModal.value = false
  } catch (e) {
    notify(e.message || '发送组会通知失败，请先在邮箱设置中检查 SMTP 发信配置', 'error')
  } finally {
    sendingSeminarNotice.value = false
  }
}

// 推迟组会并顺延此后组会
const showPostponeModal = ref(false)
const postponeTarget = ref(null)
const postponeDays = ref(7)
const savingPostpone = ref(false)

const affectedPostponeSeminars = computed(() => {
  if (!postponeTarget.value) return []
  const targetDate = postponeTarget.value.date
  const days = Number(postponeDays.value) || 0
  return seminars.value
    .filter(s => s.status === 'upcoming' && s.date >= targetDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => {
      const origDate = s.date
      let newDate = origDate
      try {
        newDate = addDays(origDate, days)
      } catch {}
      return { ...s, origDate, newDate }
    })
})

function openPostponeModal(seminar) {
  postponeTarget.value = seminar
  postponeDays.value = 7
  showPostponeModal.value = true
}

async function handleConfirmPostpone() {
  if (!postponeTarget.value) return
  savingPostpone.value = true
  try {
    const res = await seminarApi.postponeCascade(postponeTarget.value.id, Number(postponeDays.value))
    notify(res.message || `已顺延 ${res.affected_count} 场组会`)
    showPostponeModal.value = false
    await load()
    if (selected.value) {
      selected.value = seminars.value.find(s => s.id === selected.value.id) || null
    }
    scheduleChanged()
  } catch (e) {
    notify(e.message || '顺延组会失败', 'error')
  } finally {
    savingPostpone.value = false
  }
}

// 时间线拖拽互换排期
async function handleSwapSeminars({ itemA, itemB }) {
  try {
    const res = await seminarApi.swapSeminars(itemA.id, itemB.id)
    notify(res.message || `已交换「${itemA.presenter_name || itemA.topic}」与「${itemB.presenter_name || itemB.topic}」的组会排期`)
    await load()
    scheduleChanged()
  } catch (e) {
    notify(e.message || '交换排期失败', 'error')
  }
}

// 分享人：独立编辑 arXiv 编号与 Slides
const editingPresentation = ref(null)
const editingPresentationSeminar = ref(null)
const presentationForm = ref({ arxiv_id: '', slides_url: '' })
const savingPresentation = ref(false)
const presentationError = ref('')
const checkingDuplicateArxiv = ref(false)
const duplicateArxivWarning = ref('')

async function checkSharerDuplicateArxiv() {
  const aid = (presentationForm.value.arxiv_id || '').trim()
  if (!aid) {
    duplicateArxivWarning.value = ''
    return
  }
  try {
    checkingDuplicateArxiv.value = true
    const res = await seminarApi.checkArxivPresented(aid, editingPresentationSeminar.value?.id)
    if (res?.presented) {
      duplicateArxivWarning.value = '该文章在曾经的组会中以arxiv分享的形式讲过'
    } else {
      duplicateArxivWarning.value = ''
    }
  } catch {
    duplicateArxivWarning.value = ''
  } finally {
    checkingDuplicateArxiv.value = false
  }
}

function canEditPresentation(presentation) {
  if (!currentUser.value) return false
  if (canManageSeminars.value) return true
  if (presentation.presenter_id && presentation.presenter_id === currentUser.value.id) return true
  const userName = (currentUser.value.real_name || currentUser.value.name || '').trim().toLowerCase()
  if (presentation.presenter_name && presentation.presenter_name.trim().toLowerCase() === userName) return true
  return false
}

function canEditAbstract(item) {
  if (!currentUser.value || item.status === 'cancelled') return false
  if (canManageSeminars.value) return true
  if (item.presenter_id && item.presenter_id === currentUser.value.id) return true
  const userName = (currentUser.value.real_name || currentUser.value.name || '').trim().toLowerCase()
  if (item.presenter_name && item.presenter_name.trim().toLowerCase() === userName) return true
  return false
}

function openPresentationEdit(seminar, presentation) {
  editingPresentationSeminar.value = seminar
  editingPresentation.value = presentation
  presentationForm.value = {
    arxiv_id: presentation.arxiv_id || '',
    slides_url: presentation.slides_url || '',
  }
  presentationError.value = ''
  duplicateArxivWarning.value = ''
  if (presentation.arxiv_id) {
    checkSharerDuplicateArxiv()
  }
}

async function savePresentationShare() {
  if (uploadCount.value > 0) return
  const aid = (presentationForm.value.arxiv_id || '').trim()
  if (aid) {
    try {
      const checkRes = await seminarApi.checkArxivPresented(aid, editingPresentationSeminar.value?.id)
      if (checkRes?.presented) {
        const proceed = await confirmAction('该文章在曾经的组会中以arxiv分享的形式讲过，是否继续保存？', {
          title: 'arXiv 分享查重提醒',
          confirmLabel: '继续保存',
          cancelLabel: '取消'
        })
        if (!proceed) return
      }
    } catch {}
  }
  savingPresentation.value = true
  presentationError.value = ''
  try {
    await seminarApi.submitPresentationShare(editingPresentationSeminar.value.id, {
      presentation_id: editingPresentation.value.id,
      presenter_name: editingPresentation.value.presenter_name,
      arxiv_id: aid,
      slides_url: (presentationForm.value.slides_url || '').trim(),
    })
    notify('分享内容已更新')
    editingPresentation.value = null
    await load()
    if (selected.value) {
      selected.value = seminars.value.find(s => s.id === selected.value.id) || null
    }
    scheduleChanged()
  } catch (err) {
    presentationError.value = err.message || '更新失败'
  } finally {
    savingPresentation.value = false
  }
}

function selectSharer(p) { const u = members.value.find(u => u.id === p.presenter_id); if (u) p.presenter_name = u.real_name || u.name }
function selectPresenter() { const u = members.value.find(u => u.id === form.value.presenter_id); if (u) form.value.presenter_name = u.real_name || u.name }
function canEditTopic(item) {
  return canEditAbstract(item)
}

function openTopic(item) {
  topicItem.value = item
  topicText.value = item.topic || ''
  topicError.value = ''
}

async function saveTopic() {
  if (!topicItem.value || !topicText.value.trim()) return
  savingTopic.value = true
  topicError.value = ''
  try {
    const targetId = topicItem.value.id
    await seminarApi.topic(targetId, topicText.value.trim())
    topicItem.value = null
    await load()
    if (selected.value && selected.value.id === targetId) {
      selected.value = seminars.value.find(s => s.id === targetId) || null
    }
    scheduleChanged()
    notify('汇报标题已更新')
  } catch (e) {
    topicError.value = e.message || '更新标题失败'
  } finally {
    savingTopic.value = false
  }
}

function openAbstract(item) {
  abstractItem.value = item
  abstractTopic.value = item.topic || ''
  abstractText.value = item.abstract || ''
  abstractError.value = ''
}

async function saveAbstract() {
  if (!abstractItem.value) return
  saving.value = true
  abstractError.value = ''
  try {
    const targetId = abstractItem.value.id
    await seminarApi.abstract(targetId, abstractText.value, abstractTopic.value.trim())
    abstractItem.value = null
    await load()
    if (selected.value && selected.value.id === targetId) {
      selected.value = seminars.value.find(s => s.id === targetId) || null
    }
    window.dispatchEvent(new Event('seminar-updated'))
    notify('主讲摘要与标题已保存')
  } catch (e) {
    abstractError.value = e.message
  } finally {
    saving.value = false
  }
}
async function openSettings() {
  try {
    const data = await seminarApi.getSettings()
    reminderSettings.value = {
      abstract_reminder_days: Number(data.abstract_reminder_days) || 7,
      arxiv_reminder_days: Number(data.arxiv_reminder_days) || 7
    }
    showSettings.value = true
  } catch (e) {
    notify(e.message, 'error')
  }
}
async function saveSettings() {
  savingSettings.value = true
  try {
    await seminarApi.updateSettings({
      abstract_reminder_days: Number(reminderSettings.value.abstract_reminder_days),
      arxiv_reminder_days: Number(reminderSettings.value.arxiv_reminder_days)
    })
    showSettings.value = false
    notify('提醒设置已更新')
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    savingSettings.value = false
  }
}
onMounted(() => window.addEventListener('seminar-updated', load))
onBeforeUnmount(() => window.removeEventListener('seminar-updated', load))

const root = ref(null), rail = ref(null), seminars = ref([]), papers = ref([])
const loading = ref(true), loadError = ref(''), saving = ref(false)
const statusFilter = ref('all'), presenterFilter = ref(''), focusDate = ref(parseDate(route.query.date) ? route.query.date : shanghaiToday())
const drafts = ref({}), adjustmentMode = ref(false), selected = ref(null)
const showEdit = ref(false), editId = ref(null), showChanges = ref(false), conflicts = ref([])
function getInitialTab() {
  const q = route.query
  if (q.tab === 'conferences' || q.tab === 'conference' || q.view === 'conferences') return 'conferences'
  if (q.tab === 'week' || q.view === 'week') return 'week'
  return 'timeline'
}

const viewMode = ref(getInitialTab()), talks = ref([]), talkManager = ref(null), uploadCount = ref(0)
const targetSeminarId = ref(route.query.target_seminar ? Number(route.query.target_seminar) : null)
const disableAutoReset = ref(route.query.no_reset === '1' || route.query.no_reset === 'true')
let motionContext, dragInstances = []

const tabOrder = ['timeline', 'week', 'conferences']

function switchView(mode) {
  viewMode.value = mode
  const query = { ...route.query }
  if (mode === 'timeline') {
    delete query.tab
    delete query.view
  } else {
    query.tab = mode
    delete query.view
  }
  router.replace({ query }).catch(() => {})
}

function handleTabKeydown(event, currentTab) {
  let targetTab = null
  const idx = tabOrder.indexOf(currentTab)
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    targetTab = tabOrder[(idx + 1) % tabOrder.length]
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    targetTab = tabOrder[(idx - 1 + tabOrder.length) % tabOrder.length]
  } else if (event.key === 'Home') {
    event.preventDefault()
    targetTab = tabOrder[0]
  } else if (event.key === 'End') {
    event.preventDefault()
    targetTab = tabOrder[tabOrder.length - 1]
  }
  if (targetTab) {
    switchView(targetTab)
    nextTick(() => {
      const btn = document.getElementById(`tab-${targetTab}`)
      btn?.focus()
    })
  }
}

const academicConferences = computed(() => {
  return (talks.value || []).filter(t => t.event_type === 'conference' || (t.end_date && t.end_date !== t.date))
})

watch(
  () => route.query,
  (newQuery) => {
    if (newQuery?.tab === 'conferences' || newQuery?.tab === 'conference' || newQuery?.view === 'conferences') {
      viewMode.value = 'conferences'
    } else if (newQuery?.tab === 'week' || newQuery?.view === 'week') {
      viewMode.value = 'week'
    } else {
      viewMode.value = 'timeline'
    }
    if (newQuery?.target_seminar) {
      targetSeminarId.value = Number(newQuery.target_seminar)
    } else {
      targetSeminarId.value = null
    }
    disableAutoReset.value = newQuery?.no_reset === '1' || newQuery?.no_reset === 'true'
    if (newQuery?.date && parseDate(newQuery.date)) {
      focusDate.value = newQuery.date
    }
  },
  { immediate: true }
)

watch(
  [() => talks.value, () => route.query.conferenceId || route.query.conference],
  ([talkList, confId]) => {
    if (!confId || !talkList || !talkList.length) return
    const idNum = Number(confId)
    const targetConf = talkList.find(t => t.id === idNum)
    if (targetConf && talkManager.value) {
      talkManager.value.select(targetConf)
    }
  },
  { immediate: true }
)

function emptyForm() { return { date: addDays(shanghaiToday(), 7), time: '14:30', location: '', presenter_name: '', presenter_id: null, topic: '', slides_url: '', notes: '', presentations: [] } }
const form = ref(emptyForm())
const presenters = computed(() => [...new Set(seminars.value.map(item => item.presenter_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')))
const filtered = computed(() => filterSeminars(seminars.value, statusFilter.value, presenterFilter.value))
const staged = computed(() => previewSeminars(filtered.value, drafts.value))
const dates = computed(() => railDates(focusDate.value))
const byDate = computed(() => Object.fromEntries(dates.value.map(date => [date, sortSeminars(staged.value.filter(item => item.date === date))])))
const next = computed(() => nextSeminar(seminars.value))
const draftList = computed(() => Object.values(drafts.value).sort((a, b) => a.date.localeCompare(b.date)))
const selectedItem = computed(() => {
  const base = selected.value ? staged.value.find(item => item.id === selected.value.id) || selected.value : null
  if (!base) return null
  let pid = base.presenter_id
  if (!pid && base.presenter_name && members.value.length) {
    const cleanName = base.presenter_name.trim().toLowerCase()
    const found = members.value.find(m => {
      const names = [m.real_name, m.name, m.nickname].filter(Boolean).map(n => n.trim().toLowerCase())
      return names.includes(cleanName)
    })
    if (found) {
      pid = found.id
    }
  }
  const resolvedPresentations = (base.presentations || []).map(p => {
    let sharerId = p.presenter_id
    if (!sharerId && p.presenter_name && members.value.length) {
      const cName = p.presenter_name.trim().toLowerCase()
      const f = members.value.find(m => {
        const names = [m.real_name, m.name, m.nickname].filter(Boolean).map(n => n.trim().toLowerCase())
        return names.includes(cName)
      })
      if (f) sharerId = f.id
    }
    return { ...p, presenter_id: sharerId }
  })
  return {
    ...base,
    presenter_id: pid,
    presentations: resolvedPresentations
  }
})
const isDrafted = item => Boolean(drafts.value[item.id])
const dayFormatter = new Intl.DateTimeFormat('zh-CN', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' })

function isPresenter(item) {
  if (!item || !currentUser.value) return false
  if (item.presenter_id && item.presenter_id === currentUser.value.id) return true
  const userName = (currentUser.value.real_name || currentUser.value.name || '').trim().toLowerCase()
  return Boolean(userName && item.presenter_name && item.presenter_name.trim().toLowerCase() === userName)
}

function canEditSeminar(item) {
  return Boolean(canManageSeminars.value || isPresenter(item))
}

function scheduleChanged() { window.dispatchEvent(new Event('seminar-updated')) }
async function load() {
  loading.value = true; loadError.value = ''
  try {
    const [schedule, reports, people, me] = await Promise.all([
      seminarApi.getSeminars(),
      talkApi.list(),
      authApi.getMembers(),
      authApi.getMe()
    ])
    members.value = people; currentUser.value = me
    talks.value = Array.isArray(reports) ? reports : []
    seminars.value = sortSeminars(Array.isArray(schedule) ? schedule : [])
    if (!focusDate.value) {
      focusDate.value = shanghaiToday()
    }
  } catch (error) {
    loadError.value = error.message || '无法读取组会排期。'
  } finally { loading.value = false }

  // 后台静默预加载弹窗可选文献（不阻塞组会日程主视图首屏渲染）
  loadPaperOptions()
}

async function loadPaperOptions() {
  if (papers.value.length > 0) return
  try {
    const feed = await arxivApi.getFeed('public')
    papers.value = Array.isArray(feed) ? feed : []
  } catch {}
}

function shiftRail(days) { focusDate.value = addDays(focusDate.value, days) }
function today() { focusDate.value = shanghaiToday() }
function stage(item, date) {
  if (!canManageSeminars.value || !adjustmentMode.value || item.status !== 'upcoming') return
  drafts.value = moveDraft(drafts.value, item, date)
}
function resetOne(change) { drafts.value = Object.fromEntries(Object.entries(drafts.value).filter(([id]) => +id !== change.id)) }
function cancelChanges() { drafts.value = {}; adjustmentMode.value = false; conflicts.value = []; notify('草稿改期已取消。') }
async function toggleAdjustment() {
  if (!canManageSeminars.value) return
  if (adjustmentMode.value) {
    if (draftList.value.length && !(await confirmAction('还有未保存的改期。退出后这些改动将被放弃。', { title: '放弃改期草稿', confirmLabel: '放弃改动', danger: true }))) return
    if (draftList.value.length) drafts.value = {}
    adjustmentMode.value = false
  } else adjustmentMode.value = true
}
function openCreate() { if (!canManageSeminars.value) return; if (ensureNoDraft()) return; editId.value = null; form.value = emptyForm(); showEdit.value = true }
function openEdit(item) {
  if (!canEditSeminar(item)) return
  if (ensureNoDraft()) return
  selected.value = null
  editId.value = item.id

  let matchedPresenterId = item.presenter_id
  if (!matchedPresenterId && item.presenter_name && members.value.length) {
    const cleanName = item.presenter_name.trim().toLowerCase()
    const found = members.value.find(m => {
      const names = [m.real_name, m.name, m.nickname].filter(Boolean).map(n => n.trim().toLowerCase())
      return names.includes(cleanName)
    })
    if (found) {
      matchedPresenterId = found.id
    }
  }

  form.value = {
    date: item.date,
    time: item.time,
    location: item.location,
    presenter_name: item.presenter_name || '',
    presenter_id: matchedPresenterId,
    topic: item.topic,
    slides_url: item.slides_url || '',
    notes: item.notes || '',
    presentations: (item.presentations || []).map(p => {
      let sharerId = p.presenter_id
      if (!sharerId && p.presenter_name && members.value.length) {
        const cName = p.presenter_name.trim().toLowerCase()
        const f = members.value.find(m => {
          const names = [m.real_name, m.name, m.nickname].filter(Boolean).map(n => n.trim().toLowerCase())
          return names.includes(cName)
        })
        if (f) sharerId = f.id
      }
      return { ...p, presenter_id: sharerId }
    })
  }
  showEdit.value = true
}
function ensureNoDraft() { if (!draftList.value.length) return false; notify('请先保存或放弃改期草稿，再修改日程。', 'error'); return true }
async function saveSeminar() {
  if (uploadCount.value) return
  const isEditing = Boolean(editId.value)
  const currentItem = isEditing ? (seminars.value.find(s => s.id === editId.value) || selected.value) : null
  if (!isEditing && !canManageSeminars.value) {
    notify('只有管理员或被授权成员可以创建组会日程', 'error')
    return
  }
  if (isEditing && !canEditSeminar(currentItem)) {
    notify('没有权限修改此组会日程', 'error')
    return
  }
  const hasPresenter = Boolean(form.value.presenter_name?.trim())
  const validPresentations = (form.value.presentations || [])
    .filter(p => p.presenter_name?.trim())
    .map(p => ({
      presenter_id: p.presenter_id || null,
      presenter_name: p.presenter_name.trim(),
      arxiv_id: (p.arxiv_id || '').trim(),
      slides_url: p.slides_url || ''
    }))
  const hasSharers = validPresentations.length > 0

  if (!hasPresenter && !hasSharers) {
    notify('请至少填写一位主讲人或 arXiv 分享人', 'error')
    return
  }

  // 查重：检查是否有 arXiv 已经在此前的组会中分享过
  for (const pres of validPresentations) {
    if (pres.arxiv_id) {
      try {
        const check = await seminarApi.checkArxivPresented(pres.arxiv_id, editId.value)
        if (check?.presented) {
          const proceed = await confirmAction('该文章在曾经的组会中以arxiv分享的形式讲过，是否继续保存？', {
            title: 'arXiv 分享查重提醒',
            confirmLabel: '继续保存',
            cancelLabel: '取消'
          })
          if (!proceed) return
          break
        }
      } catch {}
    }
  }

  saving.value = true
  try {
    const payload = {
      date: form.value.date,
      time: form.value.time,
      location: form.value.location?.trim() || '待定',
      presenter_name: hasPresenter ? form.value.presenter_name.trim() : '',
      presenter_id: hasPresenter ? form.value.presenter_id : null,
      topic: form.value.topic?.trim() || (hasPresenter ? '工作汇报（待定）' : 'arXiv 文献分享'),
      slides_url: form.value.slides_url || '',
      notes: form.value.notes || '',
      presentations: validPresentations
    }
    if (editId.value) await seminarApi.updateSeminar(editId.value, payload)
    else await seminarApi.createSeminar(payload)
    showEdit.value = false; selected.value = null; scheduleChanged(); await load(); notify(editId.value ? '日程已更新。' : '新组会已加入时间轨道。')
  } catch (error) { notify(error.message, 'error') } finally { saving.value = false }
}
async function complete(item) {
  if (!canManageSeminars.value) return
  if (ensureNoDraft()) return
  if (!(await confirmAction(`将“${item.topic}”标记为已完成？`, { title: '完成组会', confirmLabel: '标记完成' }))) return
  try { await seminarApi.updateSeminar(item.id, { status: 'completed' }); selected.value = null; await load(); notify('已归档为完成组会。') } catch (error) { notify(error.message, 'error') }
}
async function remove(item) {
  if (!canManageSeminars.value) return
  if (ensureNoDraft()) return
  if (!(await confirmAction(`删除“${item.topic}”？此操作不可恢复。`, { title: '删除组会', confirmLabel: '删除', danger: true }))) return
  try { await seminarApi.deleteSeminar(item.id); selected.value = null; await load(); notify('组会记录已删除。') } catch (error) { notify(error.message, 'error') }
}
function downloadIcs(item) {
  if (isDrafted(item)) return notify('该日程仍在改期草稿中，请先保存后再导出日历。', 'error')
  try { const blob = new Blob([seminarIcs(item)], { type: 'text/calendar;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `seminar-${item.date}-${item.id}.ics`; link.click(); URL.revokeObjectURL(url); notify('日历文件已生成。') } catch (error) { notify(error.message, 'error') }
}
async function persistChanges() {
  if (!canManageSeminars.value || !draftList.value.length) return
  const labels = draftList.value.map(change => { const item = seminars.value.find(s => s.id === change.id); return `• ${item?.presenter_name || '组会'}：${change.expected_date} → ${change.date}` }).join('\n')
  if (!(await confirmAction(`将保存以下 ${draftList.value.length} 项改期：\n${labels}`, { title: '确认保存排期', confirmLabel: '保存全部' }))) return
  saving.value = true; conflicts.value = []
  const changes = draftList.value
  try { await seminarApi.reschedule(changes); drafts.value = {}; adjustmentMode.value = false; await load(); notify('全部改期已保存。') }
  catch (error) {
    const current = await safeReload()
    const state = current ? reconcileChanges(changes, current) : 'unknown'
    if (state === 'saved') { drafts.value = {}; adjustmentMode.value = false; notify('连接中断，但服务器已保存全部改期。'); return }
    if (state === 'unchanged') { notify('服务器尚未保存改期，可再次提交。', 'error'); return }
    conflicts.value = error.detail?.conflicts || (current ? findConflicts(changes, current) : [])
    showChanges.value = true; notify(error.message || '保存发生冲突，请核对改动。', 'error')
  } finally { saving.value = false }
}
async function safeReload() { try { const current = await seminarApi.getSeminars(); seminars.value = sortSeminars(current); return current } catch { return null } }
function initDraggable() {
  dragInstances.forEach(instance => instance.kill()); dragInstances = []
  if (!adjustmentMode.value || !rail.value || window.innerWidth <= 650 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const lanes = [...rail.value.querySelectorAll('.day-lane')]
  const cards = [...rail.value.querySelectorAll('.seminar-card[data-movable="true"]')]

  // 1. 彻底清除卡片上所有残留的行内样式与 transform，确保初始状态由 CSS Grid 100% 决定
  cards.forEach(card => gsap.set(card, { clearProps: 'all' }))

  cards.forEach(card => {
    let currentOverLane = null
    const [instance] = Draggable.create(card, {
      type: 'x,y',
      // 不传 bounds: rail.value。rail.value 是 overflow-x 的滚动容器（内容宽 3220px，视口宽约 1000px）。
      // 若设为 bounds，GSAP 在初始化 Draggable.create 时会自动调用 applyBounds()，用可视视口宽度校验越界，
      // 导致靠右侧日期的卡片（如周五卡片）被强制向左 Clamp 偏移约 118px，横跨在两个日期分割线之间！
      autoScroll: 1,
      edgeResistance: 0.8,
      zIndexBoost: true,
      minimumMovement: 5,
      cursor: 'grab',
      activeCursor: 'grabbing',
      onDragStart() {
        this.target.classList.add('dragging')
      },
      onDrag() {
        const cardRect = this.target.getBoundingClientRect()
        const cardCenter = cardRect.left + cardRect.width / 2
        let hovered = lanes.find(lane => {
          const r = lane.getBoundingClientRect()
          return cardCenter >= r.left && cardCenter <= r.right
        })
        if (hovered !== currentOverLane) {
          lanes.forEach(l => l.classList.remove('drop-active'))
          if (hovered) hovered.classList.add('drop-active')
          currentOverLane = hovered
        }
      },
      onDragEnd() {
        lanes.forEach(l => l.classList.remove('drop-active'))
        this.target.classList.remove('dragging')

        const railRect = rail.value.getBoundingClientRect()
        const cardRect = this.target.getBoundingClientRect()
        const cardCenter = cardRect.left + cardRect.width / 2
        const cardMiddleY = cardRect.top + cardRect.height / 2

        const isWithinRail = cardMiddleY >= railRect.top - 20 && cardMiddleY <= railRect.bottom + 40

        let targetLane = currentOverLane
        if (!targetLane && isWithinRail) {
          targetLane = lanes.find(lane => {
            const r = lane.getBoundingClientRect()
            return cardCenter >= r.left && cardCenter <= r.right
          })
        }

        const sourceId = +this.target.dataset.seminarId
        const source = staged.value.find(item => item.id === sourceId)
        const targetDate = targetLane?.dataset.dropDate

        if (source && targetDate && targetDate !== source.date && isWithinRail) {
          const targetContent = targetLane.querySelector('.lane-content')
          if (targetContent) {
            const targetContentRect = targetContent.getBoundingClientRect()
            const shiftX = targetContentRect.left - cardRect.left
            const shiftY = targetContentRect.top - cardRect.top
            gsap.to(this.target, {
              x: this.x + shiftX,
              y: this.y + shiftY,
              duration: 0.2,
              ease: 'power2.out',
              onComplete: () => {
                gsap.set(this.target, { clearProps: 'all' })
                stage(source, targetDate)
              }
            })
            return
          }
          gsap.set(this.target, { clearProps: 'all' })
          stage(source, targetDate)
        } else {
          gsap.to(this.target, {
            x: 0,
            y: 0,
            duration: 0.22,
            ease: 'power2.out',
            clearProps: 'all'
          })
        }
      },
    })
    if (instance) dragInstances.push(instance)
  })
}
function handleScheduleInterestUpdated(detail) {
  if (!detail) return
  const { type, id, is_interested, interest_count } = detail
  if (type === 'seminar') {
    const sem = seminars.value.find(s => s.id === id)
    if (sem) {
      sem.is_interested = is_interested
      sem.interest_count = interest_count
    }
  } else if (type === 'talk' || type === 'conference') {
    const t = talks.value.find(item => item.id === id)
    if (t) {
      t.is_interested = is_interested
      t.interest_count = interest_count
    }
  }
}

async function handleConferenceInterestToggle(conf) {
  if (!conf) return
  const itemType = 'conference'
  const wasInterested = Boolean(conf.is_interested)
  const prevCount = Number(conf.interest_count || 0)
  conf.is_interested = !wasInterested
  conf.interest_count = Math.max(0, prevCount + (conf.is_interested ? 1 : -1))

  try {
    const res = await seminarApi.toggleInterest(itemType, conf.id)
    if (res && (res.success || res.data)) {
      const data = res.data || res
      conf.is_interested = Boolean(data.is_interested)
      conf.interest_count = Number(data.interest_count || 0)
    }
    handleScheduleInterestUpdated({ type: itemType, id: conf.id, is_interested: conf.is_interested, interest_count: conf.interest_count })
    window.dispatchEvent(new CustomEvent('schedule-interest-updated', {
      detail: { type: itemType, id: conf.id, is_interested: conf.is_interested, interest_count: conf.interest_count }
    }))
  } catch (err) {
    conf.is_interested = wasInterested
    conf.interest_count = prevCount
    notify(err.message || '操作失败', 'error')
  }
}

async function toggleDrawerInterest(item) {
  if (!item) return
  const type = item.type || 'seminar'
  const wasInterested = Boolean(item.is_interested)
  const prevCount = Number(item.interest_count || 0)
  item.is_interested = !wasInterested
  item.interest_count = Math.max(0, prevCount + (item.is_interested ? 1 : -1))

  try {
    const res = await seminarApi.toggleInterest(type, item.id)
    if (res?.success) {
      item.is_interested = Boolean(res.is_interested)
      item.interest_count = Number(res.interest_count || 0)
    }
    handleScheduleInterestUpdated({ type, id: item.id, is_interested: item.is_interested, interest_count: item.interest_count })
    window.dispatchEvent(new CustomEvent('schedule-interest-updated', {
      detail: { type, id: item.id, is_interested: item.is_interested, interest_count: item.interest_count }
    }))
  } catch (err) {
    item.is_interested = wasInterested
    item.interest_count = prevCount
    notify(err.message || '操作失败', 'error')
  }
}

function onGlobalInterestUpdated(e) {
  if (e?.detail) handleScheduleInterestUpdated(e.detail)
}

watch([adjustmentMode, staged, dates], () => nextTick(initDraggable), { deep: true, flush: 'post' })
onMounted(async () => {
  motionContext = gsap.context(() => {}, root.value)
  window.addEventListener('schedule-interest-updated', onGlobalInterestUpdated)
  await load()
  if (route.query.seminar) selected.value = seminars.value.find(item => item.id === Number(route.query.seminar)) || null
})
onBeforeUnmount(() => {
  window.removeEventListener('schedule-interest-updated', onGlobalInterestUpdated)
  motionContext?.revert()
  dragInstances.forEach(instance => instance.kill())
})
onBeforeRouteLeave(async () => !draftList.value.length || await confirmAction('离开后未保存的改期会丢失。', { title: '离开排期页面', confirmLabel: '放弃并离开', danger: true }))
</script>

<template>
  <div ref="root" class="seminar-page">
    <header class="page-heading">
      <div class="heading-title-group">
        <div class="eyebrow">学术日程</div>
        <h1>学术排期与研讨日程</h1>
      </div>
      <div id="tour-seminars-header-actions" class="header-actions">
        <SeminarReminders />
        <button v-if="currentUser?.role === 'admin'" class="button secondary" @click="openAssociationModal">
          <AppIcon name="user" />人员关联检测
        </button>
        <button v-if="currentUser?.role === 'admin'" class="button secondary" @click="openSeminarNoticeModal">
          <AppIcon name="envelope" />发送组会通知
        </button>
        <button v-if="currentUser?.role === 'admin'" class="button secondary" @click="openSettings">
          <AppIcon name="clock" />提醒设置
        </button>
        <button v-if="canManageSeminars" class="button secondary" @click="openBatchLocationModal">
          <AppIcon name="location" />统一会议号
        </button>
        <button v-if="canManageSeminars" class="button secondary" @click="showImport = true">
          导入组会排期
        </button>
        <button v-if="canManageSeminars" class="button secondary" @click="talkManager.open()">
          <AppIcon name="envelope" />导入报告邮件
        </button>
        <button v-if="canManageSeminars" class="button secondary" @click="talkManager.open({ event_type: 'conference' })">
          <AppIcon name="calendar" />录入学术会议
        </button>
        <button v-if="canManageSeminars" :class="['button', adjustmentMode ? 'secondary' : 'ghost']" @click="toggleAdjustment">
          <AppIcon :name="adjustmentMode ? 'close' : 'drag'" />{{ adjustmentMode ? '结束调整' : '调整排期' }}
        </button>
        <button v-if="canManageSeminars" class="button primary" @click="openCreate">
          <AppIcon name="plus" />新建组会
        </button>
      </div>
    </header>

    <LoadingState v-if="loading" message="正在读取组会时间轨道" />
    <div v-else-if="loadError" class="error-banner"><span>{{ loadError }}</span><button class="button small secondary" @click="load">重试</button></div>
    <template v-else>
      <div v-if="!adjustmentMode" id="tour-seminars-view-switch" class="segmented view-switch" role="tablist" aria-label="学术日程展示方式">
        <button
          id="tab-timeline"
          role="tab"
          aria-controls="tabpanel-timeline"
          :aria-selected="viewMode === 'timeline'"
          :tabindex="viewMode === 'timeline' ? 0 : -1"
          :class="{ active: viewMode === 'timeline' }"
          @click="switchView('timeline')"
          @keydown="handleTabKeydown($event, 'timeline')"
        >
          组会时间线
        </button>
        <button
          id="tab-week"
          role="tab"
          aria-controls="tabpanel-week"
          :aria-selected="viewMode === 'week'"
          :tabindex="viewMode === 'week' ? 0 : -1"
          :class="{ active: viewMode === 'week' }"
          @click="switchView('week')"
          @keydown="handleTabKeydown($event, 'week')"
        >
          周日程
        </button>
        <button
          id="tab-conferences"
          role="tab"
          aria-controls="tabpanel-conferences"
          :aria-selected="viewMode === 'conferences'"
          :tabindex="viewMode === 'conferences' ? 0 : -1"
          :class="{ active: viewMode === 'conferences' }"
          @click="switchView('conferences')"
          @keydown="handleTabKeydown($event, 'conferences')"
        >
          学术会议
        </button>
      </div>
      <div class="tour-seminars-card-wrapper">
        <ScheduleOverview
          v-if="!adjustmentMode && (viewMode === 'timeline' || viewMode === 'week')"
          :mode="viewMode"
          :seminars="seminars"
          :talks="talks"
          :focus-date="focusDate"
          :can-manage="canManageSeminars"
          :target-seminar-id="targetSeminarId"
          :disable-auto-reset="disableAutoReset"
          @update:focus-date="focusDate = $event"
          @select-seminar="selected = $event"
          @select-talk="talkManager.select($event)"
          @swap-seminars="handleSwapSeminars"
          @update-interest="handleScheduleInterestUpdated"
        />
      </div>
      <ConferenceList
        v-if="!adjustmentMode && viewMode === 'conferences'"
        :conferences="academicConferences"
        :can-manage="canManageSeminars"
        @select-conference="talkManager.select($event)"
        @create-conference="talkManager.open({ event_type: 'conference' })"
        @toggle-interest="handleConferenceInterestToggle"
      />

      <section v-if="adjustmentMode" class="control-bar"><div class="segmented"><button :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'">全部 {{ seminars.length }}</button><button :class="{ active: statusFilter === 'upcoming' }" @click="statusFilter = 'upcoming'">待举行</button><button :class="{ active: statusFilter === 'completed' }" @click="statusFilter = 'completed'">已完成</button></div><div class="adjustment-guide"><span class="badge cyan"><AppIcon name="drag" :size="14" />调整排期中</span><span class="muted">按住卡片拖动到目标日期框，松开自动吸附。修改完成后点击底栏统一保存。</span></div><label class="presenter-select">主讲人<select v-model="presenterFilter"><option value="">全部成员</option><option v-for="presenter in presenters" :key="presenter" :value="presenter">{{ presenter }}</option></select></label></section>

      <section v-if="adjustmentMode" class="rail-shell" :class="{ adjusting: adjustmentMode }"><header class="rail-header"><div><span class="mono">{{ monday(focusDate) }} — {{ addDays(monday(focusDate), 13) }}</span><p v-if="adjustmentMode">拖动卡片到日期列，先在草稿中预览，再统一保存。</p><p v-else>点击日程查看详细议程、文献与归档材料。</p></div><div class="rail-navigation"><button class="icon-button" aria-label="上一周" @click="shiftRail(-7)"><AppIcon name="left" /></button><button class="button small ghost" @click="today">今天</button><button class="icon-button" aria-label="下一周" @click="shiftRail(7)"><AppIcon name="right" /></button><label class="sr-only" for="jump-date">跳转日期</label><input id="jump-date" class="jump-date" :value="focusDate" type="date" @change="focusDate = $event.target.value" /></div></header>
        <div ref="rail" class="date-rail" aria-label="组会日期时间轨道"><section v-for="date in dates" :key="date" class="day-lane" :class="{ today: date === shanghaiToday(), focused: date === focusDate }" :data-drop-date="date" tabindex="0" @keydown.enter.prevent="focusDate = date"><header><time :datetime="date">{{ dayFormatter.format(new Date(`${date}T12:00:00+08:00`)) }}</time><span v-if="date === shanghaiToday()">今天</span></header><div class="lane-content"><article v-for="item in byDate[date]" :key="item.id" class="seminar-card" :class="{ drafted: isDrafted(item) }" :data-seminar-id="item.id" :data-movable="adjustmentMode && item.status === 'upcoming'" @click="!adjustmentMode && (selected = item)"><div v-if="adjustmentMode && item.status === 'upcoming'" class="card-drag-cue"><AppIcon name="drag" :size="15" /><span>拖动改期</span></div><div class="card-meta"><span class="mono card-date-text">{{ item.date }} · {{ item.time }}</span><span :class="['badge', item.status === 'completed' ? 'success' : statusLabel(item) === '待补纪要' ? 'amber' : 'cyan']">{{ statusLabel(item) }}</span></div><div v-if="isDrafted(item)" class="draft-indicator"><span class="badge amber">新排期：{{ item.date }}</span><button class="undo-draft-button" type="button" title="恢复原日期" @click.stop="resetOne({ id: item.id })"><AppIcon name="undo" :size="12" />撤销</button></div><h3 class="academic" v-html="renderLatex(item.topic)"></h3><p>主讲：{{ item.presenter_name || '无' }}</p><p v-if="item.presentations?.length">arXiv：{{ item.presentations.map(p => p.presenter_name).join("、") }}</p><span v-if="item.paper" class="paper-ref mono">{{ paperLabel(item.paper) }}</span><label v-if="adjustmentMode && item.status === 'upcoming'" class="mobile-move">改到<input :value="item.date" type="date" @click.stop @change="stage(item, $event.target.value)" /></label></article><div v-if="!byDate[date].length" class="empty-lane"><span class="empty-lane-text">{{ adjustmentMode ? '可拖到这里' : '暂无组会' }}</span></div></div></section></div>
      </section>

      <aside v-if="draftList.length" class="draft-bar"><div><span class="badge cyan"><AppIcon name="drag" :size="14" />{{ draftList.length }} 项待保存</span><span class="muted">改期不会生效，直到你统一保存。</span></div><div><button class="button small ghost" @click="showChanges = true">查看改动</button><button class="button small secondary" @click="cancelChanges">放弃草稿</button><button class="button small primary" :disabled="saving" @click="persistChanges"><AppIcon name="save" />{{ saving ? '保存中' : '保存全部' }}</button></div></aside>
    </template>

    <BaseDialog :open="!!selectedItem" :drawer="true" :title="selectedItem?.topic || '组会详情'" @close="selected = null">
      <template v-if="selectedItem">
        <div class="detail-meta">
          <span class="badge cyan"><AppIcon name="calendar" :size="14" />{{ selectedItem.date }}</span>
          <span class="badge"><AppIcon name="clock" :size="14" />{{ selectedItem.time }}</span>
          <span :class="['badge', selectedItem.status === 'completed' ? 'success' : 'cyan']">{{ statusLabel(selectedItem) }}</span>
        </div>
        <div class="detail-block topic-detail-block">
          <div class="topic-header-row">
            <h3>汇报主题</h3>
            <button
              v-if="canEditTopic(selectedItem) && selectedItem.status !== 'cancelled'"
              class="button small secondary edit-topic-button"
              type="button"
              @click="openTopic(selectedItem)"
            >
              <AppIcon name="edit" :size="12" />编辑标题
            </button>
          </div>
          <h2 class="seminar-detail-topic academic" v-html="renderLatex(selectedItem.topic || '工作汇报（待定）')"></h2>
        </div>
        <div class="detail-block">
          <h3>主讲与地点</h3>
          <p class="presenter-info-row">
            <AppIcon name="user" :size="16" />
            <span>{{ selectedItem.presenter_name || '无主讲人（仅 arXiv 文献分享）' }}</span>
            <span v-if="selectedItem.presenter_id" class="badge cyan-subtle"><AppIcon name="check" :size="11" />已关联</span>
            <span v-else-if="selectedItem.presenter_name" class="badge gray-subtle">未关联账号</span>
          </p>
          <p><AppIcon name="location" :size="16" />{{ selectedItem.location }}</p>
        </div>
        <div v-if="selectedItem.paper" class="detail-block paper-block">
          <span class="badge cyan">关联文献</span>
          <h3 class="academic" v-html="renderLatex(selectedItem.paper.title)"></h3>
          <p class="mono">{{ paperLabel(selectedItem.paper) }} · {{ selectedItem.paper.primary_category || 'General' }}</p>
          <p v-html="renderLatex(selectedItem.paper.abstract)"></p>
          <a class="button small secondary" :href="paperRead(selectedItem.paper)" target="_blank" rel="noreferrer">阅读原文 <AppIcon name="external" /></a>
        </div>
        <div class="detail-block">
          <h3>arXiv 文献分享 · {{ selectedItem.presentations?.length || 0 }} 人</h3>
          <article v-for="(presentation, i) in selectedItem.presentations" :key="i" class="presentation-detail">
            <div class="presentation-header-row">
              <div class="presentation-user-info">
                <strong>{{ presentation.presenter_name }}</strong>
                <span v-if="presentation.presenter_id" class="badge cyan-subtle"><AppIcon name="check" :size="11" />已关联</span>
                <span v-else class="badge gray-subtle">未关联账号</span>
              </div>
              <button
                v-if="canEditPresentation(presentation) && selectedItem.status !== 'cancelled'"
                class="button small secondary edit-share-button"
                type="button"
                @click="openPresentationEdit(selectedItem, presentation)"
              >
                <AppIcon name="edit" :size="12" />编辑我的分享
              </button>
            </div>
            <div class="presentation-links">
              <a v-if="presentation.arxiv_id" :href="`https://arxiv.org/abs/${presentation.arxiv_id}`" target="_blank" rel="noreferrer" class="arxiv-link">arXiv:{{ presentation.arxiv_id }} ↗</a>
              <span v-else class="badge amber">待补充 arXiv 链接</span>
              <AttachmentLink v-if="presentation.slides_url" :url="presentation.slides_url" />
              <span v-else class="muted">未提供 Slides</span>
            </div>
          </article>
          <p v-if="!selectedItem.presentations?.length" class="muted">本次未安排文献分享</p>
        </div>
        <div class="detail-block">
          <h3>主讲摘要</h3>
          <p class="seminar-abstract" v-html="renderLatex(selectedItem.abstract || '待主讲人补充')"></p>
          <div class="presentation-header-row">
            <button v-if="canEditAbstract(selectedItem)" class="button secondary" @click="openAbstract(selectedItem)">{{ selectedItem.abstract ? '编辑摘要' : '填写摘要' }}</button>
            <span v-if="selectedItem.presenter_id" class="badge cyan-subtle"><AppIcon name="check" :size="11" />主讲人已关联系统账户</span>
            <p v-else-if="selectedItem.presenter_name" class="muted">尚未关联主讲人账号，无法提醒。</p>
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-block">
            <h3>课件</h3>
            <AttachmentLink v-if="selectedItem.slides_url" :url="selectedItem.slides_url" />
            <p v-else class="muted">暂未上传课件</p>
          </div>
          <div class="detail-block">
            <h3>纪要与预习</h3>
            <p v-if="selectedItem.notes" class="seminar-notes" v-html="renderLatex(selectedItem.notes)"></p>
            <p v-else class="muted">暂未记录</p>
          </div>
        </div>
        <div class="form-actions">
          <button class="button ghost add-calendar-btn" @click="downloadIcs(selectedItem)"><AppIcon name="calendar" />加入日历</button>
          <button v-if="canManageSeminars && selectedItem.status === 'upcoming'" class="button secondary" @click="openPostponeModal(selectedItem)"><AppIcon name="clock" />顺延此后组会</button>
          <button v-if="canEditSeminar(selectedItem)" class="button secondary" @click="openEdit(selectedItem)">编辑</button>
          <button v-if="canManageSeminars && selectedItem.status === 'upcoming'" class="button primary" @click="complete(selectedItem)"><AppIcon name="check" />标记完成</button>
          <button v-if="canManageSeminars" class="button danger delete-seminar-btn" aria-label="删除组会" title="删除组会" @click="remove(selectedItem)"><AppIcon name="close" /></button>
        </div>
      </template>
    </BaseDialog>

    <ScheduleImportDialog :open="showImport" :members="members" @close="showImport = false" @saved="scheduleChanged(); notify('排期已导入')" />
    <!-- 主讲人便捷修改标题弹窗 -->
    <BaseDialog :open="!!topicItem" title="修改汇报标题" :busy="savingTopic" @close="topicItem = null">
      <form class="form-grid" @submit.prevent="saveTopic">
        <p class="muted">
          为 <strong>{{ topicItem?.date }}</strong> 组会修改主讲汇报标题：
        </p>
        <label>
          汇报标题 / 主题 *
          <input
            v-model="topicText"
            type="text"
            required
            maxlength="300"
            placeholder="请输入汇报主题（支持 LaTeX 公式，如 $H_0$）"
          />
        </label>
        <div v-if="hasLatex(topicText)" class="abstract-preview-wrap">
          <div class="abstract-preview-label">LaTeX 实时渲染预览：</div>
          <div class="abstract-preview-content seminar-abstract" v-html="renderLatex(topicText)"></div>
        </div>
        <p v-if="topicError" class="error-banner">{{ topicError }}</p>
        <div class="form-actions">
          <button type="button" class="button secondary" :disabled="savingTopic" @click="topicItem = null">取消</button>
          <button class="button primary" :disabled="savingTopic || !topicText.trim()">保存标题</button>
        </div>
      </form>
    </BaseDialog>

    <!-- 主讲人填写/编辑摘要与标题弹窗 -->
    <BaseDialog :open="!!abstractItem" :title="abstractItem?.abstract ? '编辑主讲摘要与标题' : '填写主讲摘要与标题'" :busy="saving" @close="abstractItem = null">
      <form class="form-grid" @submit.prevent="saveAbstract">
        <label>
          汇报标题 / 主题 *
          <input
            v-model="abstractTopic"
            type="text"
            required
            maxlength="300"
            placeholder="请输入汇报主题（支持 LaTeX 公式）"
          />
        </label>
        <div v-if="hasLatex(abstractTopic)" class="abstract-preview-wrap">
          <div class="abstract-preview-label">标题 LaTeX 实时渲染预览：</div>
          <div class="abstract-preview-content seminar-abstract" v-html="renderLatex(abstractTopic)"></div>
        </div>
        <label>
          主讲摘要
          <textarea v-model="abstractText" rows="8" required maxlength="20000" placeholder="请输入主讲摘要（支持 LaTeX 公式）..." />
        </label>
        <div v-if="hasLatex(abstractText)" class="abstract-preview-wrap">
          <div class="abstract-preview-label">摘要 LaTeX 实时渲染预览：</div>
          <div class="abstract-preview-content seminar-abstract" v-html="renderLatex(abstractText)"></div>
        </div>
        <p v-if="abstractError" class="error-banner">{{ abstractError }}</p>
        <div class="form-actions">
          <button type="button" class="button secondary" :disabled="saving" @click="abstractItem = null">取消</button>
          <button class="button primary" :disabled="saving || !abstractText.trim() || !abstractTopic.trim()">保存内容</button>
        </div>
      </form>
    </BaseDialog>
    <BaseDialog :open="showEdit" :title="editId ? '编辑组会' : '新建组会'" :busy="saving || uploadCount > 0" @close="showEdit = false">
      <form class="form-grid" @submit.prevent="saveSeminar">
        <div class="form-row">
          <label>组会日期<input v-model="form.date" type="date" required /></label>
          <label>开始时间<input v-model="form.time" type="time" required /></label>
        </div>
        <WaveInput
          v-model="form.location"
          label="研讨地点 / 会议号"
          placeholder="留空默认为待定"
          clearable
        />
        <label>主讲人账号
          <select v-model="form.presenter_id" @change="selectPresenter">
            <option :value="null">未关联 / 外部主讲人</option>
            <option v-for="u in members" :key="u.id" :value="u.id">{{ u.real_name || u.name }} · {{ u.email }}</option>
          </select>
        </label>
        <WaveInput
          v-model="form.presenter_name"
          :readonly="!!form.presenter_id"
          label="主讲人姓名"
          placeholder="无主讲人可留空（仅安排 arXiv 分享）"
          clearable
        />
        <WaveInput
          v-model="form.topic"
          label="主讲工作汇报主题"
          placeholder="留空默认为工作汇报（待定）"
          clearable
        />
        <FileField v-model="form.slides_url" label="主讲 Slides（可选）" @busy="uploadCount += $event ? 1 : -1" />
        <section class="presentations-form">
          <div class="presentation-heading">
            <h3>arXiv 文献分享</h3>
            <button class="button small secondary" type="button" :disabled="form.presentations.length >= 20" @click="form.presentations.push({ presenter_id: null, presenter_name: '', arxiv_id: '', slides_url: '' })">
              <AppIcon name="plus" />添加分享人
            </button>
          </div>
          <article v-for="(presentation, i) in form.presentations" :key="i" class="presentation-form">
            <div class="presentation-heading">
              <strong>分享 {{ i + 1 }}</strong>
              <button class="button small ghost" type="button" :disabled="uploadCount > 0" @click="form.presentations.splice(i, 1)">移除</button>
            </div>
            <label>分享人账号
              <select v-model="presentation.presenter_id" @change="selectSharer(presentation)">
                <option :value="null">未关联账号（请在下方填写姓名）</option>
                <option v-for="member in members" :key="member.id" :value="member.id">{{ member.real_name || member.name }} · {{ member.email || member.name }}</option>
              </select>
            </label>
            <WaveInput
              v-model="presentation.presenter_name"
              label="分享人姓名"
              placeholder="分享人姓名"
              required
              clearable
            />
            <p class="muted">选择注册账号后，该成员将在组会临近时收到填写 arXiv 链接的待办提醒。</p>
            <WaveInput
              v-model="presentation.arxiv_id"
              label="arXiv 编号或链接"
              placeholder="例如 2302.13971 或 https://arxiv.org/abs/2302.13971"
              clearable
            />
            <FileField v-model="presentation.slides_url" label="分享 Slides（可选）" @busy="uploadCount += $event ? 1 : -1" />
          </article>
        </section>
        <label>预习提示 / 会议纪要
          <textarea v-model="form.notes" rows="3" placeholder="可选填会议纪要或预习提示" />
        </label>
        <div v-if="hasLatex(form.notes)" class="abstract-preview-wrap">
          <div class="abstract-preview-label">LaTeX 实时渲染预览：</div>
          <div class="abstract-preview-content seminar-abstract" v-html="renderLatex(form.notes)"></div>
        </div>
        <div class="form-actions">
          <button class="button secondary" type="button" :disabled="saving || uploadCount > 0" @click="showEdit = false">取消</button>
          <button class="button primary" :disabled="saving || uploadCount > 0" type="submit">{{ saving ? '保存中…' : '保存日程' }}</button>
        </div>
      </form>
    </BaseDialog>

    <BaseDialog :open="showSettings" title="组会提醒时间设置" :busy="savingSettings" @close="showSettings = false">
      <form class="form-grid" @submit.prevent="saveSettings">
        <p class="muted">设置系统在组会临近前多少天，向对应成员弹出站内待办提醒（默认 7 天）：</p>
        <div class="form-row">
          <label>主讲摘要提前提醒天数
            <input v-model.number="reminderSettings.abstract_reminder_days" type="number" min="1" max="60" required />
          </label>
          <label>arXiv 分享提前提醒天数
            <input v-model.number="reminderSettings.arxiv_reminder_days" type="number" min="1" max="60" required />
          </label>
        </div>
        <div class="form-actions">
          <button class="button secondary" type="button" :disabled="savingSettings" @click="showSettings = false">取消</button>
          <button class="button primary" type="submit" :disabled="savingSettings">保存设置</button>
        </div>
      </form>
    </BaseDialog>

    <TalkManager ref="talkManager" @changed="viewMode = 'week'; load()" />

    <BaseDialog :open="showChanges" :title="conflicts.length ? '改期冲突核对' : '改期草稿'" :wide="true" @close="showChanges = false"><p v-if="conflicts.length" class="error-banner">其他人已修改部分日程，冲突项不会被保存。请恢复或重新选择日期。</p><div class="change-list"><article v-for="change in draftList" :key="change.id"><div><strong>{{ seminars.find(item => item.id === change.id)?.topic || `组会 #${change.id}` }}</strong><p class="mono muted">{{ change.expected_date }} → <span class="accent">{{ change.date }}</span></p><p v-if="conflicts.find(item => item.id === change.id)" class="conflict-note">当前：{{ conflicts.find(item => item.id === change.id).current_date || '记录已删除' }}</p></div><button class="button small ghost" @click="resetOne(change)"><AppIcon name="undo" />恢复</button></article></div><div class="form-actions"><button class="button secondary" @click="showChanges = false">返回轨道</button><button v-if="!conflicts.length" class="button primary" @click="showChanges = false; persistChanges()">确认保存</button></div></BaseDialog>

    <!-- 管理员专属：人员关联检测与批量匹配弹窗 -->
    <BaseDialog :open="showAssociationModal" title="组会日程人员关联检测" :wide="true" @close="showAssociationModal = false">
      <div v-if="loadingStats && !associationStats" class="dialog-loading">
        <LoadingState message="正在分析日程人员与已注册用户关联状态..." />
      </div>
      <div v-else-if="associationStats" class="association-modal-body">
        <div class="stats-cards-grid">
          <div class="stats-card">
            <span class="stats-number">{{ associationStats.registered_users_count }}</span>
            <span class="stats-label">已注册用户</span>
          </div>
          <div class="stats-card">
            <span class="stats-number">{{ associationStats.total_schedules }}</span>
            <span class="stats-label">总组会场次</span>
          </div>
          <div class="stats-card">
            <span class="stats-number">{{ associationStats.associated_presenter_slots }} / {{ associationStats.total_presenter_slots }}</span>
            <span class="stats-label">主讲人已关联 / 总席位</span>
          </div>
          <div class="stats-card">
            <span class="stats-number">{{ associationStats.associated_presentation_slots }} / {{ associationStats.total_presentation_slots }}</span>
            <span class="stats-label">arXiv分享已关联 / 总席位</span>
          </div>
        </div>

        <div v-if="associationStats.matchable_slots > 0" class="matchable-alert-box">
          <div class="matchable-alert-text">
            <strong>检测到 {{ associationStats.matchable_slots }} 个可立即关联的排期席位！</strong>
            <p>系统中已存在同名已注册用户账号，点击按键即可一键完成绑定并开启到期提醒。</p>
          </div>
          <button class="button primary" :disabled="matchingPresenters" @click="handleBatchMatch">
            <AppIcon name="check" />{{ matchingPresenters ? '正在匹配…' : '一键匹配已注册用户' }}
          </button>
        </div>
        <div v-else class="matchable-good-box">
          <AppIcon name="check" :size="16" />
          <span>当前所有已注册的同名用户均已完成关联匹配。</span>
        </div>

        <div class="unregistered-section">
          <div class="unregistered-header">
            <h4>
              尚未注册本站的人员
              <span class="badge amber">{{ associationStats.unmatchable_names?.length || 0 }} 人 · {{ associationStats.unmatchable_slots }} 席位</span>
            </h4>
            <p class="muted">以下人员在排期中已安排汇报或文献分享，但姓名未匹配到注册账号。他们注册本站（或完善真实姓名）时系统将自动关联；管理员也可提醒他们注册。</p>
          </div>
          <div v-if="associationStats.unmatchable_names?.length" class="names-tags-cloud">
            <span v-for="name in associationStats.unmatchable_names" :key="name" class="name-tag">
              <AppIcon name="user" :size="12" />{{ name }}
            </span>
          </div>
          <p v-else class="all-registered-tip">排期中的所有成员均已完成账号关联！</p>
        </div>

        <div class="form-actions">
          <button class="button secondary" :disabled="loadingStats" @click="refreshAssociationStats">
            <AppIcon name="refresh" />刷新检测
          </button>
          <button class="button ghost" @click="showAssociationModal = false">关闭</button>
        </div>
      </div>
    </BaseDialog>

    <!-- 分享人轻量编辑 arXiv 编号与 Slides 弹窗 -->
    <BaseDialog
      :open="!!editingPresentation"
      :title="`编辑 arXiv 分享 · ${editingPresentation?.presenter_name || ''}`"
      :busy="savingPresentation || uploadCount > 0"
      @close="editingPresentation = null"
    >
      <form class="form-grid" @submit.prevent="savePresentationShare">
        <p class="muted">
          为 <strong>{{ editingPresentationSeminar?.topic || '组会' }}</strong>（{{ editingPresentationSeminar?.date }}）填写或更新你的文献分享与课件：
        </p>
        <WaveInput
          v-model="presentationForm.arxiv_id"
          label="arXiv 编号或链接"
          placeholder="例如 2302.13971 或 https://arxiv.org/abs/2302.13971"
          clearable
          @blur="checkSharerDuplicateArxiv"
          @change="checkSharerDuplicateArxiv"
        />
        <div v-if="duplicateArxivWarning" class="duplicate-warning-box">
          <span class="badge amber">已讲过</span>
          <span>{{ duplicateArxivWarning }}</span>
        </div>
        <FileField
          v-model="presentationForm.slides_url"
          label="分享 Slides（可选，支持 PDF）"
          @busy="uploadCount += $event ? 1 : -1"
        />
        <p v-if="presentationError" class="error-banner">{{ presentationError }}</p>
        <div class="form-actions">
          <button class="button secondary" type="button" :disabled="savingPresentation || uploadCount > 0" @click="editingPresentation = null">取消</button>
          <button class="button primary" type="submit" :disabled="savingPresentation || uploadCount > 0">
            {{ savingPresentation ? '保存中…' : '保存分享内容' }}
          </button>
        </div>
      </form>
    </BaseDialog>

    <!-- 管理员/负责人：批量设置固定会议号弹窗 -->
    <BaseDialog :open="showBatchLocationModal" title="批量设置组会会议号 / 地点" @close="showBatchLocationModal = false">
      <form class="form-grid" @submit.prevent="handleSaveBatchLocation">
        <p class="muted">为排期设置固定的腾讯会议号或研讨室地点，支持批量应用给所有日程：</p>
        <WaveInput
          v-model="batchLocationForm.location"
          label="会议号 / 研讨地点 *"
          required
          placeholder="如：腾讯会议 892-123-456 或 物理楼 302"
          clearable
        />
        <div class="scope-radio-group">
          <span class="field-label">应用范围</span>
          <label class="radio-item">
            <input type="radio" v-model="batchLocationForm.scope" value="upcoming" />
            <span>仅全部待举行日程（推荐，不改变历史归档）</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="batchLocationForm.scope" value="unset_only" />
            <span>仅未设置/地点待定的日程</span>
          </label>
          <label class="radio-item">
            <input type="radio" v-model="batchLocationForm.scope" value="all" />
            <span>全部组会日程（包括已结束的历史组会）</span>
          </label>
        </div>
        <div class="form-actions">
          <button class="button secondary" type="button" :disabled="savingBatchLocation" @click="showBatchLocationModal = false">取消</button>
          <button class="button primary" type="submit" :disabled="savingBatchLocation">
            {{ savingBatchLocation ? '正在应用…' : '确认应用' }}
          </button>
        </div>
      </form>
    </BaseDialog>

    <!-- 管理员/负责人：推迟并顺延此后组会弹窗 -->
    <BaseDialog :open="showPostponeModal" title="推迟并顺延此后组会" :wide="true" @close="showPostponeModal = false">
      <div v-if="postponeTarget" class="postpone-modal-body">
        <div class="postpone-target-info">
          <div class="eyebrow">选定待推迟组会</div>
          <h3>{{ postponeTarget.topic }}</h3>
          <p class="mono accent">{{ postponeTarget.date }} · {{ postponeTarget.time }} · 主讲：{{ postponeTarget.presenter_name || '无' }}</p>
        </div>

        <div class="postpone-controls">
          <span class="field-label">推迟周期</span>
          <div class="segmented">
            <button type="button" :class="{ active: postponeDays === 7 }" @click="postponeDays = 7">+1 周 (7天)</button>
            <button type="button" :class="{ active: postponeDays === 14 }" @click="postponeDays = 14">+2 周 (14天)</button>
            <button type="button" :class="{ active: postponeDays === 21 }" @click="postponeDays = 21">+3 周 (21天)</button>
            <button type="button" :class="{ active: ![7, 14, 21].includes(postponeDays) }" @click="postponeDays = 28">+4 周</button>
          </div>
          <label class="custom-days-input">
            <span>或自定义天数：</span>
            <input type="number" v-model.number="postponeDays" min="1" max="365" class="postpone-days-num" />
            <span>天</span>
          </label>
        </div>

        <div class="cascade-preview-box">
          <div class="preview-title-row">
            <h4>受影响日程预览（共 {{ affectedPostponeSeminars.length }} 场待举行组会依次顺延 {{ postponeDays }} 天）</h4>
          </div>
          <div class="preview-scroll-list">
            <div v-for="item in affectedPostponeSeminars" :key="item.id" class="preview-item-row">
              <div class="preview-dates">
                <span class="mono muted">{{ item.origDate }}</span>
                <span class="date-arrow">→</span>
                <span class="mono accent bold">{{ item.newDate }}</span>
              </div>
              <div class="preview-content">
                <span class="speaker-tag">{{ item.presenter_name || '文献分享' }}</span>
                <span class="topic-text">{{ item.topic }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button class="button secondary" type="button" :disabled="savingPostpone" @click="showPostponeModal = false">取消</button>
          <button class="button primary" type="button" :disabled="savingPostpone || !affectedPostponeSeminars.length" @click="handleConfirmPostpone">
            {{ savingPostpone ? '正在顺延…' : `确认顺延 (${affectedPostponeSeminars.length} 场)` }}
          </button>
        </div>
      </div>
    </BaseDialog>

    <!-- 管理员专属：发送组会通知邮件弹窗 (SMTP) -->
    <BaseDialog
      :open="showSeminarNoticeModal"
      title="发送组会通知邮件"
      :wide="true"
      :busy="sendingSeminarNotice"
      @close="showSeminarNoticeModal = false"
    >
      <form class="seminar-notice-form" @submit.prevent="handleSendSeminarNotice">
        <!-- 关联排期选择与概览 -->
        <div class="notice-section glass-card">
          <div class="notice-section-header">
            <h4><AppIcon name="calendar" :size="16" /> 选择关联组会场次</h4>
            <span class="muted text-xs">正文模板将自动提取所选组会的主讲人、时间、地点与汇报主题</span>
          </div>

          <div class="form-row notice-seminar-picker">
            <label>
              组会场次
              <select v-model="selectedNoticeSeminarId" @change="handleNoticeSeminarChange">
                <option v-for="s in (selectableSeminars.length ? selectableSeminars : seminars)" :key="s.id" :value="s.id">
                  {{ s.date }} {{ s.time || '' }} · {{ s.presenter_name || '无主讲人' }} ({{ s.topic || '工作汇报' }})
                </option>
              </select>
            </label>
          </div>
        </div>

        <!-- 收件人配置 -->
        <div class="notice-section glass-card">
          <div class="notice-section-header">
            <div class="header-with-actions">
              <h4><AppIcon name="user" :size="16" /> 收件人设置（共 {{ allNoticeRecipients.length }} 人）</h4>
              <div class="recipients-quick-actions">
                <button type="button" class="button small ghost" @click="toggleAllMembers">
                  {{ selectedMemberEmails.length === registeredMembersWithEmail.length ? '取消全选组员' : '全选组员' }}
                </button>
              </div>
            </div>
            <span class="muted text-xs">支持已注册组员多选，以及通过下方输入框输入未注册本系统的外部邮箱</span>
          </div>

          <!-- 已注册组员勾选流 -->
          <div class="member-recipients-container">
            <label class="section-sublabel">
              已注册组员 (已选 {{ selectedMemberEmails.length }} / {{ registeredMembersWithEmail.length }} 人)：
            </label>
            <div class="member-checkboxes-grid">
              <label
                v-for="m in registeredMembersWithEmail"
                :key="m.id"
                class="member-checkbox-card"
                :class="{ checked: selectedMemberEmails.includes(m.email.toLowerCase()) }"
              >
                <input
                  v-model="selectedMemberEmails"
                  type="checkbox"
                  :value="m.email.toLowerCase()"
                />
                <div class="member-card-info">
                  <span class="member-name">{{ m.real_name || m.name }}</span>
                  <span class="member-email mono">{{ m.email }}</span>
                </div>
              </label>
            </div>
          </div>

          <!-- 外部邮箱输入 -->
          <div class="external-recipients-container">
            <label class="section-sublabel">
              其他外部邮箱（支持逗号、分号或换行分隔多个地址）：
            </label>
            <textarea
              v-model="externalEmailsRaw"
              rows="2"
              class="external-email-input mono"
              placeholder="如：collaborator@univ.edu.cn, guest@lab.org"
            ></textarea>
            <div v-if="parsedExternalEmails.length" class="parsed-external-hint">
              <span class="badge cyan-subtle">
                已识别 {{ parsedExternalEmails.length }} 个外部邮箱：{{ parsedExternalEmails.join(', ') }}
              </span>
            </div>
          </div>
        </div>

        <!-- 邮件内容拟定 -->
        <div class="notice-section glass-card">
          <div class="notice-section-header">
            <h4><AppIcon name="edit" :size="16" /> 邮件正文（可自由编辑，发送前请仔细核对）</h4>
            <button
              type="button"
              class="button small ghost"
              title="根据当前所选组会重新生成模板正文"
              @click="handleNoticeSeminarChange"
            >
              <AppIcon name="undo" :size="13" /> 重新填充模板
            </button>
          </div>

          <div class="form-group notice-subject-group">
            <label>
              邮件主题
              <input
                v-model="noticeSubject"
                type="text"
                required
                placeholder="邮件主题"
              />
            </label>
          </div>

          <div class="form-group">
            <label>
              邮件正文
              <textarea
                v-model="noticeBody"
                rows="14"
                required
                class="notice-body-textarea"
                placeholder="请输入邮件正文..."
              ></textarea>
            </label>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="form-actions notice-modal-actions">
          <button
            type="button"
            class="button secondary"
            :disabled="sendingSeminarNotice"
            @click="showSeminarNoticeModal = false"
          >
            取消
          </button>
          <button
            type="submit"
            class="button primary"
            :disabled="sendingSeminarNotice || !allNoticeRecipients.length"
          >
            <AppIcon name="paper" :size="16" />
            <span>{{ sendingSeminarNotice ? '正在发信…' : `确认向 ${allNoticeRecipients.length} 位收件人发送` }}</span>
          </button>
        </div>
      </form>
    </BaseDialog>
  </div>
</template>

<style scoped>
.abstract-preview-wrap {
  margin-top: -6px;
  margin-bottom: 10px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px dashed var(--accent);
  border-radius: 8px;
}
.abstract-preview-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 6px;
  letter-spacing: 0.03em;
}
.abstract-preview-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text);
  margin-bottom: 0 !important;
}
.seminar-notes {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.75;
}
.view-switch { justify-self:start; }.presentations-form { display:grid; gap:14px; border-top:1px solid var(--line); padding-top:20px; }.presentation-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }.presentation-heading h3 { font-size:15px; }.presentations-form>.muted { font-size:12px; }.presentation-form { display:grid; gap:12px; padding:16px; border:1px solid var(--line); border-radius:10px; background:var(--surface); }.presentation-detail { display:grid; gap:8px; padding:14px 0; border-bottom:1px solid var(--line); font-size:13px; }.presentation-detail:last-child { border:0; }

.seminar-page { display:grid; gap:24px; }
.seminar-page .page-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; flex-wrap:wrap; }
.heading-title-group { flex-shrink:0; min-width:280px; }
.heading-title-group h1 { white-space:nowrap; }
.seminar-page .header-actions { flex:1; justify-content:flex-end; min-width:min(100%, 540px); }
.header-actions,.control-bar,.rail-header,.rail-navigation,.next-card-inner,.detail-meta,.detail-block>p,.draft-bar,.draft-bar>div:last-child { display:flex; align-items:center; gap:10px; }.header-actions { flex-wrap:wrap; }.next-card { border-color:var(--line)!important; padding:0!important; background:linear-gradient(135deg,var(--surface),var(--surface))!important; }.next-card-inner { justify-content:space-between; gap:24px; padding:26px; }.next-card h2 { font-size:21px; margin-bottom:8px; color:var(--text); }.next-card p { color:var(--muted); font-size:13px; }.control-bar { justify-content:space-between; flex-wrap:wrap; gap:12px; }.adjustment-guide { display:flex; align-items:center; gap:10px; font-size:12px; }.presenter-select { display:flex; align-items:center; gap:8px; white-space:nowrap; color:var(--muted); }.presenter-select select { width:170px; padding:8px 30px 8px 10px; font-size:12px; }.rail-shell { overflow:hidden; border:1px solid var(--line); border-radius:14px; background:var(--panel); }.rail-header { padding:18px 20px; border-bottom:1px solid var(--line); justify-content:space-between; gap:18px; }.rail-header>div:first-child { min-width:0; }.rail-header .mono { color:var(--text); font-size:13px; }.rail-header p { margin-top:3px; color:var(--muted); font-size:12px; }.jump-date { width:140px; padding:7px 9px; font-size:12px; }.date-rail { display:grid; grid-auto-flow:column; grid-auto-columns:230px; overflow-x:auto; min-height:410px; background:var(--surface); }.day-lane { width:230px; min-width:230px; max-width:230px; min-height:100%; border-right:1px solid var(--line); padding:14px 11px; box-sizing:border-box; position:relative; transition:background .15s,box-shadow .15s,border-color .15s; }.day-lane.drop-active { background:rgba(46,125,243,.08)!important; box-shadow:inset 0 0 0 2px var(--accent),0 0 20px rgba(46,125,243,.15)!important; border-right-color:var(--accent)!important; }.day-lane.drop-active .empty-lane { border-color:var(--accent)!important; color:var(--accent)!important; background:rgba(46,125,243,.08)!important; }.day-lane>header { display:flex; align-items:center; justify-content:space-between; padding:0 3px 10px; color:var(--muted); font-size:12px; }.day-lane.today>header time { color:var(--accent); font-weight:600; }.day-lane>header span { font-size:10px; color:var(--panel); background:var(--accent); padding:2px 6px; border-radius:9999px; font-weight:600; }.lane-content { width:100%; min-width:0; box-sizing:border-box; display:grid; align-content:start; gap:10px; min-height:330px; position:relative; }.empty-lane { width:100%; box-sizing:border-box; border:1px dashed var(--line); border-radius:9px; padding:16px 10px; color:var(--muted); font-size:12px; text-align:center; transition:border-color .15s,background .15s,color .15s; }.adjusting .day-lane { background:rgba(197,230,223,.04); }.adjusting .empty-lane { color:var(--accent); border-color:var(--accent); background:rgba(197,230,223,.1); }.seminar-card { width:100%; min-width:0; margin:0; position:relative; padding:14px; border:1px solid var(--line); background:var(--panel); border-radius:11px; cursor:pointer; box-sizing:border-box; box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:border-color .18s,background .18s,box-shadow .18s; will-change:transform; }.seminar-card:hover { border-color:var(--accent); background:var(--panel); box-shadow:0 6px 16px rgba(46,125,243,.12); }.seminar-card.drafted { border-color:var(--accent); box-shadow:inset 0 0 0 1px rgba(197,230,223,.3),0 6px 20px rgba(46,125,243,.18); }.adjusting .seminar-card[data-movable="true"] { cursor:grab; user-select:none; }.adjusting .seminar-card[data-movable="true"]:active { cursor:grabbing; }.seminar-card.dragging { cursor:grabbing!important; z-index:100!important; box-shadow:0 16px 36px rgba(15,23,42,.18),0 0 0 2px var(--accent)!important; border-color:var(--accent)!important; opacity:.96; }.card-drag-cue { display:flex; align-items:center; gap:5px; font-size:11px; color:var(--accent); margin-bottom:8px; font-weight:600; }.card-meta { display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:8px; }.card-date-text { font-size:11px; color:var(--accent); font-weight:600; }.draft-indicator { display:flex; align-items:center; justify-content:space-between; gap:6px; margin:8px 0 10px; padding:4px 8px; background:rgba(245,158,11,.1); border:1px solid rgba(245,158,11,.3); border-radius:6px; }.undo-draft-button { background:transparent; border:0; color:var(--warning); font-size:11px; cursor:pointer; display:flex; align-items:center; gap:3px; padding:2px 4px; font-weight:600; }.undo-draft-button:hover { text-decoration:underline; }.seminar-card h3 { font-size:14px; line-height:1.55; color:var(--text); font-weight:600; overflow-wrap:anywhere; word-break:break-word; }.seminar-card>p { margin-top:7px; color:var(--muted); font-size:12px; overflow-wrap:anywhere; word-break:break-word; }.paper-ref { display:block; margin-top:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); font-size:10px; }.mobile-move { display:none; margin-top:11px; font-size:11px; color:var(--muted); }.mobile-move input { padding:5px; margin-top:4px; font-size:11px; }.draft-bar { position:sticky; z-index:10; bottom:16px; justify-content:space-between; flex-wrap:wrap; border:1px solid var(--line); background:rgba(255,255,255,.94); backdrop-filter:blur(16px); padding:12px 14px; border-radius:12px; box-shadow:0 12px 32px rgba(15,23,42,.1); color:var(--text); }.draft-bar>div:first-child { display:flex; align-items:center; gap:10px; font-size:12px; }.draft-bar>div:last-child { flex-wrap:wrap; }.detail-meta { flex-wrap:wrap; margin-bottom:25px; }.detail-block { padding:17px 0; border-top:1px solid var(--line); }.detail-block h3 { font-size:12px; color:var(--muted); font-weight:500; margin-bottom:10px; }.detail-block>p { color:var(--soft); font-size:13px; margin-top:7px; }.paper-block h3 { color:var(--text); font-size:17px; margin-top:10px; }.paper-block>p { display:block; line-height:1.8; }.detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:25px; }.change-list { display:grid; gap:10px; }.change-list article { display:flex; justify-content:space-between; gap:16px; align-items:center; padding:14px; background:var(--surface); border:1px solid var(--line); border-radius:10px; }.change-list strong { font-size:13px; }.change-list p { margin-top:3px; font-size:12px; }.conflict-note { color:var(--danger)!important; }
@media(max-width:768px) {
  .header-actions { display: none !important; }
  .next-card-inner,.rail-header { align-items:flex-start; flex-direction:column; }
  .rail-header { gap:12px; }
  .rail-navigation { width:100%; justify-content:space-between; }
  .jump-date { flex:1; width:auto; }
  .date-rail { grid-auto-columns:min(82vw,260px); }
  .detail-grid { grid-template-columns:1fr; gap:0; }
  .mobile-move { display:block; }
  .adjusting .seminar-card[data-movable="true"] { cursor:default; }
  .draft-bar { bottom:calc(76px + env(safe-area-inset-bottom, 0px)); align-items:stretch; }
  .draft-bar>div:last-child { width:100%; justify-content:flex-end; }
  .draft-bar .button { flex:1; }
  .presenter-select { width:100%; justify-content:space-between; }
  .presenter-select select { width:70%; }
}

.topic-header-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.topic-header-row h3 { margin: 0; }
.edit-topic-button { font-size: 11px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; }
.seminar-detail-topic { font-size: 17px; font-weight: 600; line-height: 1.45; color: var(--text); margin: 0; word-break: break-word; }
.presentation-header-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.presentation-user-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.presenter-info-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.presentation-links { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.arxiv-link { color: var(--accent); font-weight: 600; font-size: 12px; text-decoration: none; }
.arxiv-link:hover { text-decoration: underline; }
.badge.cyan-subtle { font-size: 11px; color: var(--accent); background: rgba(46,125,243,0.1); border: 1px solid rgba(46,125,243,0.25); display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 6px; }
.badge.gray-subtle { font-size: 11px; color: var(--muted); background: rgba(150,150,150,0.1); border: 1px solid rgba(150,150,150,0.2); display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 6px; }
.edit-share-button { font-size: 11px; padding: 3px 8px; }
.association-modal-body { display: grid; gap: 18px; }
.stats-cards-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.stats-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.stats-number { font-size: 18px; font-weight: 700; color: var(--text); }
.stats-label { font-size: 12px; color: var(--muted); margin-top: 4px; }
.matchable-alert-box { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: rgba(46,125,243,0.08); border: 1px solid rgba(46,125,243,0.25); border-radius: 12px; padding: 14px 18px; }
.matchable-alert-text strong { font-size: 14px; color: var(--accent); }
.matchable-alert-text p { font-size: 12px; color: var(--soft); margin-top: 4px; }
.matchable-good-box { display: flex; align-items: center; gap: 8px; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 10px; padding: 12px 16px; color: var(--success); font-size: 13px; }
.unregistered-section { border-top: 1px solid var(--line); padding-top: 16px; }
.unregistered-header h4 { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: var(--text); }
.unregistered-header p { font-size: 12px; color: var(--muted); margin-top: 4px; margin-bottom: 12px; }
.names-tags-cloud { display: flex; flex-wrap: wrap; gap: 8px; max-height: 180px; overflow-y: auto; padding: 4px 0; }
.name-tag { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; font-size: 12px; color: var(--text); }
.all-registered-tip { color: var(--success); font-size: 13px; padding: 8px 0; }
.dialog-loading { padding: 30px 0; }
@media(max-width:768px) {
  .stats-cards-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .matchable-alert-box { flex-direction: column; align-items: stretch; }
}

.scope-radio-group { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }
.radio-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); cursor: pointer; }
.radio-item input { accent-color: var(--accent); width: 16px; height: 16px; }
.postpone-modal-body { display: grid; gap: 16px; }
.postpone-target-info { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.postpone-target-info h3 { font-size: 15px; margin: 6px 0; color: var(--text); }
.postpone-controls { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.custom-days-input { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--soft); margin-left: auto; }
.postpone-days-num { width: 70px; padding: 6px 8px; text-align: center; }
.cascade-preview-box { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); overflow: hidden; }
.preview-title-row { padding: 10px 14px; background: rgba(0,0,0,0.1); border-bottom: 1px solid var(--line); }
.preview-title-row h4 { font-size: 13px; color: var(--muted); }
.preview-scroll-list { max-height: 220px; overflow-y: auto; padding: 8px 14px; display: grid; gap: 8px; }
.preview-item-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
.preview-item-row:last-child { border-bottom: 0; }
.preview-dates { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.date-arrow { color: var(--accent); font-weight: bold; }
.preview-content { display: flex; align-items: center; gap: 8px; min-width: 0; }
.speaker-tag { background: var(--raised); color: var(--accent); padding: 2px 6px; border-radius: 4px; font-size: 11px; flex-shrink: 0; }
.topic-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.delete-seminar-btn { padding: 10px 14px; width: 44px; min-width: 44px; justify-content: center; }
.duplicate-warning-box {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--amber);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  padding: 8px 12px;
  border-radius: 8px;
  margin-top: -4px;
}

.detail-interest-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  background: color-mix(in srgb, var(--panel) 70%, transparent);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
  user-select: none;
  margin-left: auto;
}
.detail-interest-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--line));
  color: var(--soft);
  background: var(--raised);
  transform: scale(1.03);
}
.detail-interest-btn.is-interested {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent);
  font-weight: 600;
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 22%, transparent);
}
.detail-interest-btn:active {
  transform: scale(0.96);
}
.detail-interest-btn .interest-num {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  padding: 1px 5px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--line) 40%, transparent);
}
.detail-interest-btn.is-interested .interest-num {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  color: var(--accent);
}

@keyframes calendar-wobble {
  0% { transform: rotate(0deg); }
  25% { transform: rotate(-12deg); }
  50% { transform: rotate(12deg); }
  75% { transform: rotate(-6deg); }
  100% { transform: rotate(0deg); }
}
.add-calendar-btn:hover .app-icon {
  animation: calendar-wobble 0.85s ease-in-out infinite;
  transform-origin: center center;
}

/* 组会通知邮件弹窗样式 */
.seminar-notice-form {
  display: grid;
  gap: 16px;
}

.notice-section {
  padding: 16px;
  border-radius: 12px;
  display: grid;
  gap: 12px;
}

.notice-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}

.notice-section-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
}

.header-with-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.text-xs {
  font-size: 12px;
}

.section-sublabel {
  font-size: 12.5px;
  color: var(--soft);
  font-weight: 500;
  margin-bottom: 6px;
  display: block;
}

.member-checkboxes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
  max-height: 160px;
  overflow-y: auto;
  padding: 4px;
}

.member-checkbox-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.member-checkbox-card:hover {
  border-color: rgba(184, 155, 248, 0.4);
  background: rgba(184, 155, 248, 0.08);
}

.member-checkbox-card.checked {
  border-color: var(--accent);
  background: rgba(184, 155, 248, 0.15);
}

.member-checkbox-card input[type="checkbox"] {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.member-card-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.member-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-email {
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.external-email-input {
  width: 100%;
  font-size: 13px;
  line-height: 1.5;
}

.parsed-external-hint {
  margin-top: 6px;
}

.notice-body-textarea {
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.notice-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 4px;
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .member-checkbox-card:hover {
  border-color: rgba(174, 222, 211, 0.4) !important;
  background: rgba(218, 238, 235, 0.05) !important;
}

[data-theme-style="vanta-fog"] .member-checkbox-card.checked {
  background: rgba(174, 222, 211, 0.12) !important;
}
</style>
