<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { talkApi, seminarApi } from '../api/client'
import BaseDialog from './BaseDialog.vue'
import FileField from './FileField.vue'
import AttachmentLink from './AttachmentLink.vue'
import AppIcon from './AppIcon.vue'
import ThinHoundCheckbox from './ThinHoundCheckbox.vue'
import { confirmAction, notify } from '../composables/feedback'
import { renderLatex, hasLatex } from '../utils/latex'
import { shanghaiToday } from '../utils/schedule'

const emit = defineEmits(['changed'])
const show = ref(false)
const selected = ref(null)
const busy = ref(false)
const uploadCount = ref(0)
const parsed = ref(false)
const editId = ref(null)

const mailText = ref('')
const mailFile = ref(null)
const warnings = ref([])
const candidates = ref([])
const form = ref({})
const detectedTalks = ref([])
const currentTalkIndex = ref(0)

const selectedTalksCount = computed(() => detectedTalks.value.filter(t => t.selected).length)

watch(
  form,
  (val) => {
    if (!editId.value && detectedTalks.value.length > 1 && detectedTalks.value[currentTalkIndex.value]) {
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
      ...form.value
    }
  }
  currentTalkIndex.value = idx
  form.value = { ...detectedTalks.value[idx] }
}

function toggleAllTalks() {
  const allSelected = detectedTalks.value.every(t => t.selected)
  detectedTalks.value.forEach(t => {
    t.selected = !allSelected
  })
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('labhub_user') || '{}')
  } catch {
    return {}
  }
}

const currentUser = ref(getUser())

function refreshCurrentUser() {
  currentUser.value = getUser()
}

onMounted(() => {
  refreshCurrentUser()
  window.addEventListener('account-updated', refreshCurrentUser)
  window.addEventListener('admin-mode-changed', refreshCurrentUser)
})

onBeforeUnmount(() => {
  window.removeEventListener('account-updated', refreshCurrentUser)
  window.removeEventListener('admin-mode-changed', refreshCurrentUser)
})

const canAdjustTime = computed(() => {
  if (!selected.value) return false
  const user = currentUser.value
  return Boolean(user && user.id)
})

const canEdit = computed(() => {
  if (!selected.value) return false
  const user = currentUser.value
  if (!user || !user.id) return false
  if (user.admin_view_mode === 'user') return false
  return user.role === 'admin' || user.role === 'teacher' || Boolean(user.can_manage_talks)
})

const canDelete = computed(() => {
  if (!selected.value) return false
  const user = currentUser.value
  if (!user || !user.id) return false
  if (user.admin_view_mode === 'user') return false
  return user.role === 'admin' || user.role === 'teacher' || Boolean(user.can_manage_talks)
})

const adjustingTime = ref(false)
const quickTimeForm = ref({
  date: '',
  end_date: '',
  time: ''
})
const savingQuickTime = ref(false)

function openQuickAdjustTime() {
  if (!selected.value) return
  const isConf = selected.value.event_type === 'conference'
  quickTimeForm.value = {
    date: selected.value.date || '',
    end_date: selected.value.end_date || selected.value.date || '',
    time: selected.value.time || (isConf ? '全天' : '')
  }
  adjustingTime.value = true
}

async function saveQuickTime() {
  if (!selected.value || savingQuickTime.value) return
  if (!quickTimeForm.value.date) {
    notify('请选择日期', 'error')
    return
  }
  if (!quickTimeForm.value.time) {
    notify('请填写或选择时间', 'error')
    return
  }

  savingQuickTime.value = true
  try {
    const isConf = selected.value.event_type === 'conference'
    const typeLabel = isConf ? '学术会议' : '报告'
    const payload = {
      event_type: selected.value.event_type || 'talk',
      title: selected.value.title || '',
      date: quickTimeForm.value.date,
      end_date: isConf ? (quickTimeForm.value.end_date || quickTimeForm.value.date) : (selected.value.end_date || quickTimeForm.value.date),
      time: quickTimeForm.value.time,
      speaker: selected.value.speaker || '',
      location: selected.value.location || '',
      poster_url: selected.value.poster_url || '',
      notes: selected.value.notes || ''
    }
    const updated = await talkApi.update(selected.value.id, payload)
    if (updated) {
      selected.value.date = payload.date
      selected.value.end_date = payload.end_date
      selected.value.time = payload.time
    }
    adjustingTime.value = false
    emit('changed')
    notify(`${typeLabel}时间已更新`)
  } catch (error) {
    const detail = error.response?.data?.detail || error.message || '更新时间失败'
    notify(detail, 'error')
  } finally {
    savingQuickTime.value = false
  }
}

const empty = (eventType = 'talk') => ({
  event_type: eventType,
  date: '',
  end_date: '',
  time: eventType === 'conference' ? '全天' : '',
  title: '',
  speaker: '',
  location: '',
  poster_url: '',
  notes: '',
  city: '',
  organizer: '',
  sub_type: eventType === 'conference' ? '研讨会' : '',
  abstract_deadline: '',
  early_bird_deadline: '',
  registration_deadline: '',
  website_url: '',
  registration_url: '',
  handbook_url: '',
  source: ''
})

const isNotesExpanded = ref(false)

function open(options = {}) {
  const eventType = options?.event_type === 'conference' ? 'conference' : 'talk'
  form.value = empty(eventType)
  parsed.value = eventType === 'conference'
  mailText.value = ''
  mailFile.value = null
  warnings.value = []
  candidates.value = []
  detectedTalks.value = []
  currentTalkIndex.value = 0
  editId.value = null
  show.value = true
}

function setEventType(type) {
  form.value.event_type = type
  if (type === 'conference') {
    if (!form.value.time) form.value.time = '全天'
    if (!form.value.end_date && form.value.date) form.value.end_date = form.value.date
    if (!form.value.sub_type) form.value.sub_type = '研讨会'
  }
}

function select(talk) {
  selected.value = talk
  adjustingTime.value = false
  isNotesExpanded.value = false
}

const NOTES_TRUNCATE_LEN = 200

const isLongNotes = computed(() => {
  return (selected.value?.notes || '').length > NOTES_TRUNCATE_LEN
})

const displayedNotes = computed(() => {
  const notes = selected.value?.notes || ''
  if (!notes) return ''
  if (!isLongNotes.value || isNotesExpanded.value) {
    return notes
  }
  return notes.slice(0, NOTES_TRUNCATE_LEN) + '…'
})

function formatConferenceDateRange(conf) {
  if (!conf?.date) return ''
  const start = conf.date
  const end = conf.end_date || conf.date
  if (start === end) return `${start}`
  const [sy, sm, sd] = start.split('-')
  const [ey, em, ed] = end.split('-')
  if (sy === ey && sm === em) {
    return `${sy}年${sm}月${sd}日 - ${ed}日`
  }
  if (sy === ey) {
    return `${sy}年${sm}月${sd}日 - ${em}月${ed}日`
  }
  return `${sy}年${sm}月${sd}日 - ${ey}年${em}月${ed}日`
}

function getConferenceDeadlines(conf) {
  if (!conf) return []
  const todayStr = shanghaiToday()
  const [yToday, mToday, dToday] = todayStr.split('-').map(Number)

  const items = [
    { key: 'abstract', label: '摘要投递截止', date: conf.abstract_deadline },
    { key: 'early_bird', label: '早鸟优惠截止', date: conf.early_bird_deadline },
    { key: 'registration', label: '注册报名截止', date: conf.registration_deadline }
  ].filter(item => Boolean(item.date && item.date.trim()))

  return items.map(item => {
    const [y, m, d] = item.date.split('-').map(Number)
    const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(yToday, mToday - 1, dToday)) / (1000 * 60 * 60 * 24))
    let statusText = ''
    let isUrgent = false
    let isPassed = false

    if (diff < 0) {
      statusText = '已截止'
      isPassed = true
    } else if (diff === 0) {
      statusText = '今天截止'
      isUrgent = true
    } else if (diff === 1) {
      statusText = '明天截止'
      isUrgent = true
    } else if (diff <= 7) {
      statusText = `仅剩 ${diff} 天`
      isUrgent = true
    } else {
      statusText = `还剩 ${diff} 天`
    }

    return {
      ...item,
      diff,
      statusText,
      isUrgent,
      isPassed
    }
  })
}

function formatConferenceTime(ts) {
  if (!ts) return ''
  try {
    const s = String(ts).trim()
    const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'))
    if (isNaN(d.getTime())) return s
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day} ${h}:${min}`
  } catch {
    return ts
  }
}

const togglingInterest = ref(false)

async function toggleTalkInterest() {
  if (!selected.value || togglingInterest.value) return
  const talk = selected.value
  const itemType = talk.event_type === 'conference' ? 'conference' : 'talk'
  const prevInterested = !!talk.is_interested
  const prevCount = Number(talk.interest_count || 0)

  talk.is_interested = !prevInterested
  talk.interest_count = Math.max(0, prevCount + (prevInterested ? -1 : 1))

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('schedule-interest-updated', {
      detail: {
        type: itemType,
        id: talk.id,
        is_interested: talk.is_interested,
        interest_count: talk.interest_count
      }
    }))
  }

  togglingInterest.value = true
  try {
    const res = await seminarApi.toggleInterest(itemType, talk.id)
    if (res && (res.success || res.data)) {
      const data = res.data || res
      talk.is_interested = Boolean(data.is_interested)
      talk.interest_count = Number(data.interest_count || 0)
    }
  } catch {
    talk.is_interested = prevInterested
    talk.interest_count = prevCount
    notify('更新想听状态失败', 'error')
  } finally {
    togglingInterest.value = false
  }
}

function edit() {
  const isConf = selected.value.event_type === 'conference' || (selected.value.end_date && selected.value.end_date !== selected.value.date)
  form.value = {
    event_type: isConf ? 'conference' : 'talk',
    date: selected.value.date || '',
    end_date: selected.value.end_date || selected.value.date || '',
    time: selected.value.time || (isConf ? '全天' : ''),
    title: selected.value.title || '',
    speaker: selected.value.speaker || '',
    location: selected.value.location || '',
    poster_url: selected.value.poster_url || '',
    notes: selected.value.notes || '',
    city: selected.value.city || '',
    organizer: selected.value.organizer || '',
    sub_type: selected.value.sub_type || (isConf ? '研讨会' : ''),
    abstract_deadline: selected.value.abstract_deadline || '',
    early_bird_deadline: selected.value.early_bird_deadline || '',
    registration_deadline: selected.value.registration_deadline || '',
    website_url: selected.value.website_url || '',
    registration_url: selected.value.registration_url || '',
    handbook_url: selected.value.handbook_url || '',
    source: selected.value.source || ''
  }
  editId.value = selected.value.id
  selected.value = null
  adjustingTime.value = false
  detectedTalks.value = []
  currentTalkIndex.value = 0
  parsed.value = true
  warnings.value = []
  candidates.value = []
  show.value = true
}

async function parse() {
  if (!mailFile.value && !mailText.value.trim()) {
    notify('请上传邮件文件或粘贴正文', 'error')
    return
  }
  busy.value = true
  try {
    let result
    if (mailFile.value) {
      const data = new FormData()
      data.append('file', mailFile.value)
      result = await talkApi.parse(data)
    } else {
      result = await talkApi.parse({ text: mailText.value })
    }
    
    if (result.talks && result.talks.length > 1) {
      detectedTalks.value = result.talks.map((t, idx) => ({ ...t, selected: true, id: idx }))
      currentTalkIndex.value = 0
      form.value = { ...detectedTalks.value[0] }
    } else {
      detectedTalks.value = []
      currentTalkIndex.value = 0
      form.value = {
        date: result.date || '',
        time: result.time || '',
        title: result.title || '',
        speaker: result.speaker || '',
        location: result.location || '',
        poster_url: result.poster_url || '',
        notes: result.notes || ''
      }
    }
    warnings.value = Array.isArray(result.warnings) ? result.warnings : []
    candidates.value = Array.isArray(result.poster_candidates) ? result.poster_candidates : []
    parsed.value = true
  } catch (error) {
    const detail = error.response?.data?.detail || error.message || '解析邮件失败'
    notify(detail, 'error')
  } finally {
    busy.value = false
  }
}

async function save() {
  if (!editId.value && detectedTalks.value.length > 1) {
    if (detectedTalks.value[currentTalkIndex.value]) {
      detectedTalks.value[currentTalkIndex.value] = {
        ...detectedTalks.value[currentTalkIndex.value],
        ...form.value
      }
    }
    const toSave = detectedTalks.value.filter(t => t.selected)
    if (toSave.length === 0) {
      notify('请至少勾选一场要加入日程的报告', 'error')
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
    busy.value = true
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
      show.value = false
      emit('changed')
      if (replacedCount > 0) {
        notify(`已成功保存 ${savedCount} 场报告（其中 ${replacedCount} 场检测到重复，已用最新内容更新替换）！可在周日程表查看。`)
      } else if (unchangedCount > 0) {
        notify(`已成功保存 ${savedCount} 场报告（其中 ${unchangedCount} 场已有完全相同记录无变更）！可在周日程表查看。`)
      } else {
        notify(`已成功将 ${savedCount} 场报告加入周日程表！`)
      }
    } catch (error) {
      const detail = error.response?.data?.detail || error.message || '保存失败'
      notify(detail, 'error')
    } finally {
      busy.value = false
    }
    return
  }

  if (form.value.event_type === 'conference') {
    if (!form.value.title?.trim() || !form.value.date) {
      notify('会议名称与开始日期为必填项', 'error')
      return
    }
    if (!form.value.end_date) {
      form.value.end_date = form.value.date
    }
    if (form.value.end_date < form.value.date) {
      notify('结束日期不能早于开始日期', 'error')
      return
    }
    if (!form.value.time) {
      form.value.time = '全天'
    }
    if (!form.value.organizer && form.value.speaker) {
      form.value.organizer = form.value.speaker
    }
    if (!form.value.speaker && form.value.organizer) {
      form.value.speaker = form.value.organizer
    }
  } else {
    if (!form.value.title?.trim() || !form.value.date || !form.value.time) {
      notify('报告标题、日期与时间为必填项', 'error')
      return
    }
  }

  busy.value = true
  try {
    const isConf = form.value.event_type === 'conference'
    const typeLabel = isConf ? '学术会议' : '报告'
    if (editId.value) {
      await talkApi.update(editId.value, form.value)
      notify(`${typeLabel}已更新`)
    } else {
      const res = await talkApi.create(form.value)
      if (res?.replaced) {
        notify('检测到重复日程，已用最新内容更新替换！')
      } else if (res?.merged) {
        notify('检测到相同日程，已有完全相同记录无变更')
      } else {
        notify(`${typeLabel}已加入周日程表`)
      }
    }
    show.value = false
    emit('changed')
  } catch (error) {
    const detail = error.response?.data?.detail || error.message || '保存失败'
    notify(detail, 'error')
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!selected.value) return
  const isConf = selected.value.event_type === 'conference'
  const typeName = isConf ? '学术会议' : '报告'
  if (!await confirmAction(`删除${typeName}“${selected.value.title}”？`, {
    title: `删除${typeName}`,
    confirmLabel: '删除',
    danger: true
  })) return

  busy.value = true
  try {
    await talkApi.remove(selected.value.id)
    selected.value = null
    emit('changed')
    notify(`${typeName}已删除`)
  } catch (error) {
    const detail = error.response?.data?.detail || error.message || '删除失败'
    notify(detail, 'error')
  } finally {
    busy.value = false
  }
}

defineExpose({ open, select })
</script>

<template>
  <BaseDialog
    :open="show"
    :title="editId ? (form.event_type === 'conference' ? '编辑学术会议' : '编辑报告') : (form.event_type === 'conference' ? '录入学术会议' : '导入报告邮件')"
    :busy="busy || uploadCount > 0"
    @close="show = false"
  >
    <div v-if="!parsed" class="form-grid">
      <p class="muted">上传邮件文件，或粘贴正文。自动提取报告信息后，可核对并修改，再加入日程。</p>
      <label>
        邮件文件（.eml / .txt / .html，最大 15 MB）
        <input type="file" accept=".eml,.txt,.html,.htm" @change="mailFile = $event.target.files?.[0] || null" />
      </label>
      <label>
        或粘贴邮件正文
        <textarea v-model="mailText" :disabled="!!mailFile" rows="10" placeholder="报告题目：…&#10;报告时间：2026年9月8日 14:30&#10;报告人：…&#10;地点：…" />
      </label>
      <div class="form-actions">
        <button class="button ghost" :disabled="busy" @click="parsed = true">手动填写</button>
        <button class="button primary" :disabled="busy || (!mailText.trim() && !mailFile)" @click="parse">
          {{ busy ? '正在解析…' : '解析邮件' }}
        </button>
      </div>
    </div>
    <form v-else class="form-grid" @submit.prevent="save">
      <div v-if="warnings && warnings.length" class="parse-warnings">
        <p v-for="warning in warnings" :key="warning">{{ warning }}</p>
      </div>

      <!-- 日程类型切换（手动录入或未选多场邮件报告时可选） -->
      <div v-if="!editId && detectedTalks.length <= 1" class="event-type-segmented">
        <button
          type="button"
          :class="{ active: form.event_type !== 'conference' }"
          @click="setEventType('talk')"
        >
          <AppIcon name="user" :size="14" />
          <span>单场学术报告</span>
        </button>
        <button
          type="button"
          :class="{ active: form.event_type === 'conference' }"
          @click="setEventType('conference')"
        >
          <AppIcon name="calendar" :size="14" />
          <span>跨日学术会议</span>
        </button>
      </div>

      <!-- 多场报告选择器 -->
      <div v-if="!editId && detectedTalks.length > 1" class="multi-talk-container">
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
                :title="talk.selected ? '已勾选保存到日程' : '未勾选'"
              />
            </div>
            <div class="multi-talk-tab-body">
              <div class="multi-talk-tab-top">
                <span class="tab-index-badge">报告 {{ idx + 1 }}</span>
                <span class="tab-time-badge" v-if="talk.time">{{ talk.time }}</span>
              </div>
              <div class="tab-talk-title" :title="talk.title || '（未命名报告）'" v-html="renderLatex(talk.title || '（未命名报告）')"></div>
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
        {{ form.event_type === 'conference' ? '会议名称 / 主题' : '报告标题' }}
        <input v-model="form.title" required :placeholder="form.event_type === 'conference' ? '如：第十五届全国星系宇宙学学术研讨会' : '如：学术报告题目'" />
      </label>
      <div class="form-row" :class="{ 'form-row-3': form.event_type === 'conference' }">
        <label>
          {{ form.event_type === 'conference' ? '开始日期' : '报告日期' }}
          <input v-model="form.date" type="date" required />
        </label>
        <label v-if="form.event_type === 'conference'">
          结束日期
          <input v-model="form.end_date" type="date" :min="form.date" required />
        </label>
        <label>
          {{ form.event_type === 'conference' ? '时段 / 时间' : '开始时间（北京时间）' }}
          <input
            v-if="form.event_type === 'conference'"
            v-model="form.time"
            placeholder="全天 或 09:00 - 18:00"
          />
          <input v-else v-model="form.time" type="time" required />
        </label>
      </div>
      <div v-if="form.event_type === 'conference'" class="form-row">
        <label>
          会议类型
          <select v-model="form.sub_type">
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
          <input v-model="form.city" placeholder="如：合肥 / 北京 / 线上" />
        </label>
      </div>
      <div class="form-row" :class="{ 'form-row-2': form.event_type === 'conference' }">
        <label>
          {{ form.event_type === 'conference' ? '主办单位 / 发起方' : '报告人' }}
          <input v-model="form.speaker" :placeholder="form.event_type === 'conference' ? '如：中国科学技术大学 / 国家天文台' : '如：张三 教授 / 博士'" />
        </label>
        <label v-if="form.event_type === 'conference'">
          信息来源
          <input v-model="form.source" placeholder="如：天文系通知邮件 / 官网通知" />
        </label>
      </div>
      <label>
        {{ form.event_type === 'conference' ? '详细地点 / 线上会议平台' : '地点 / 会议号' }}
        <input v-model="form.location" :placeholder="form.event_type === 'conference' ? '如：丰大国际大酒店三楼宴会厅 或 腾讯会议 123-456-789' : '如：天文楼 502 或 腾讯会议 123-456-789'" />
      </label>

      <!-- 会议关键时间节点 -->
      <div v-if="form.event_type === 'conference'" class="form-section-card">
        <div class="form-section-title">关键时间节点（选填）</div>
        <div class="form-row form-row-3">
          <label>
            摘要投递截止
            <input v-model="form.abstract_deadline" type="date" />
          </label>
          <label>
            早鸟优惠截止
            <input v-model="form.early_bird_deadline" type="date" />
          </label>
          <label>
            注册报名截止
            <input v-model="form.registration_deadline" type="date" />
          </label>
        </div>
      </div>

      <!-- 会议相关链接与资料 -->
      <div v-if="form.event_type === 'conference'" class="form-section-card">
        <div class="form-section-title">相关链接与资料（选填）</div>
        <label>
          官方网站
          <input v-model="form.website_url" type="url" placeholder="https://..." />
        </label>
        <div class="form-row">
          <label>
            在线报名网址
            <input v-model="form.registration_url" type="url" placeholder="https://..." />
          </label>
          <label>
            会议手册 / 议程链接
            <input v-model="form.handbook_url" type="url" placeholder="https://... 或 PDF 链接" />
          </label>
        </div>
      </div>
      <label v-if="candidates && candidates.length > 1">
        邮件中的海报候选
        <select v-model="form.poster_url">
          <option value="">不使用邮件图片</option>
          <option v-for="(url, i) in candidates" :key="url" :value="url">附件 / 图片 {{ i + 1 }}</option>
        </select>
      </label>
      <FileField v-model="form.poster_url" :label="form.event_type === 'conference' ? '会议通知文件/宣传图' : '海报'" poster @busy="uploadCount += $event ? 1 : -1" />
      <AttachmentLink v-if="form.poster_url" :url="form.poster_url" :label="form.event_type === 'conference' ? '查看会议通知文件' : '查看海报'" poster />
      <label>
        {{ form.event_type === 'conference' ? '会议说明 / 议程摘要' : '报告说明 / 邮件正文' }}
        <textarea v-model="form.notes" rows="5" :placeholder="form.event_type === 'conference' ? '会议主题、分会场安排或相关说明' : '报告摘要或邮件原始说明'" />
      </label>
      <div v-if="hasLatex(form.notes)" class="talk-notes-preview">
        <div class="talk-notes-preview-label">LaTeX 实时渲染预览：</div>
        <div class="talk-notes-preview-content mail-notes" v-html="renderLatex(form.notes)"></div>
      </div>
      <div class="form-actions">
        <button v-if="!editId && !mailFile && !mailText.trim()" type="button" class="button ghost" :disabled="busy || uploadCount > 0" @click="parsed = false">
          返回解析
        </button>
        <button v-else-if="!editId" type="button" class="button ghost" :disabled="busy || uploadCount > 0" @click="parsed = false">
          返回邮件
        </button>
        <button type="submit" class="button primary" :disabled="busy || uploadCount > 0 || (!editId && detectedTalks.length > 1 && selectedTalksCount === 0)">
          {{ busy ? '正在保存…' : (editId ? '保存修改' : (detectedTalks.length > 1 ? (selectedTalksCount > 0 ? `同时保存到日程 (共 ${selectedTalksCount} 场)` : '请勾选报告') : (form.event_type === 'conference' ? '保存学术会议' : '确认保存日程'))) }}
        </button>
      </div>
    </form>
  </BaseDialog>

  <BaseDialog :open="!!selected" :title="selected?.title || (selected?.event_type === 'conference' ? '学术会议详情' : '报告详情')" drawer @close="selected = null; adjustingTime = false">
    <template v-if="selected">
      <!-- 学术会议详情抽屉 -->
      <div v-if="selected.event_type === 'conference'" class="talk-info conf-detail-wrapper">
        <!-- 1. 顶部类型与感兴趣 -->
        <div class="talk-header-row">
          <div class="conf-badge-group">
            <span class="badge blue">学术会议</span>
            <span v-if="selected.sub_type" class="badge sub-badge">{{ selected.sub_type }}</span>
            <span v-if="selected.city" class="conf-city-badge">{{ selected.city }}</span>
          </div>
          <button
            type="button"
            class="detail-interest-btn talk-interest-btn"
            :class="{ 'is-interested': selected.is_interested }"
            :title="selected.is_interested ? '已标记为想去/感兴趣，点击取消' : '点击标记感兴趣'"
            @click="toggleTalkInterest"
          >
            <AppIcon name="heart" :size="13" :weight="selected.is_interested ? 'fill' : 'regular'" />
            <span>{{ selected.is_interested ? '已感兴趣' : '感兴趣' }}</span>
            <span v-if="selected.interest_count > 0" class="interest-num">{{ selected.interest_count }}</span>
          </button>
        </div>

        <!-- 标题 -->
        <h3 class="conf-detail-title" v-html="renderLatex(selected.title)"></h3>

        <!-- 会议基本信息：时间、地点、主办方 -->
        <div class="conf-meta-block">
          <div class="talk-time-row">
            <div class="talk-time-display">
              <AppIcon name="clock" :size="15" class="time-clock-icon" />
              <span class="mono accent time-text">
                {{ formatConferenceDateRange(selected) }} · {{ selected.time || '全天' }}
              </span>
            </div>
            <button
              v-if="canAdjustTime && !adjustingTime"
              type="button"
              class="button small secondary quick-adjust-btn"
              title="快捷调整会议时间"
              @click="openQuickAdjustTime"
            >
              <AppIcon name="edit" :size="12" />
              <span>调整时间</span>
            </button>
          </div>

          <!-- 快捷调整时间面板 -->
          <div v-if="adjustingTime" class="quick-time-box">
            <div class="quick-time-header">
              <strong>快捷调整会议时间</strong>
              <span class="muted" style="font-size: 12px;">调整后学术日程将即时更新</span>
            </div>
            <div class="quick-time-fields">
              <label>
                开始日期
                <input v-model="quickTimeForm.date" type="date" required />
              </label>
              <label>
                结束日期
                <input v-model="quickTimeForm.end_date" type="date" :min="quickTimeForm.date" required />
              </label>
              <label>
                时段 / 时间
                <input v-model="quickTimeForm.time" placeholder="全天 或 09:00 - 18:00" />
              </label>
            </div>
            <div class="quick-time-actions">
              <button type="button" class="button small ghost" :disabled="savingQuickTime" @click="adjustingTime = false">取消</button>
              <button type="button" class="button small primary" :disabled="savingQuickTime" @click="saveQuickTime">
                {{ savingQuickTime ? '正在保存…' : '确认保存新时间' }}
              </button>
            </div>
          </div>

          <div class="conf-meta-item">
            <AppIcon name="location" :size="15" />
            <span>
              <strong>举办地点：</strong>
              <template v-if="selected.city && !selected.location?.includes(selected.city)">{{ selected.city }} · </template>
              {{ selected.location || '线上 / 地点待补充' }}
            </span>
          </div>

          <div class="conf-meta-item">
            <AppIcon name="user" :size="15" />
            <span>
              <strong>主办单位：</strong>
              {{ selected.organizer || selected.speaker || '待补充' }}
            </span>
          </div>
        </div>

        <!-- 2. 重要时间节点 -->
        <div class="conf-deadlines-section">
          <h4 class="conf-section-heading">
            <AppIcon name="calendar" :size="14" />
            <span>关键时间节点</span>
          </h4>
          <div v-if="getConferenceDeadlines(selected).length > 0" class="conf-deadlines-grid">
            <div
              v-for="d in getConferenceDeadlines(selected)"
              :key="d.key"
              class="conf-deadline-item"
              :class="{ 'is-urgent': d.isUrgent, 'is-passed': d.isPassed }"
            >
              <div class="conf-deadline-label">{{ d.label }}</div>
              <div class="conf-deadline-date mono">{{ d.date }}</div>
              <div class="conf-deadline-status" :class="{ 'urgent-text': d.isUrgent, 'passed-text': d.isPassed }">
                {{ d.statusText }}
              </div>
            </div>
          </div>
          <p v-else class="muted conf-empty-deadlines">暂未设置关键截止日期</p>
        </div>

        <!-- 3. 快捷操作（官网、报名、手册） -->
        <div v-if="selected.website_url || selected.registration_url || selected.handbook_url" class="conf-actions-section">
          <a
            v-if="selected.registration_url"
            :href="selected.registration_url"
            target="_blank"
            rel="noopener noreferrer"
            class="button primary small action-link-btn"
          >
            <AppIcon name="external" :size="13" />
            <span>前往在线报名</span>
          </a>
          <a
            v-if="selected.website_url"
            :href="selected.website_url"
            target="_blank"
            rel="noopener noreferrer"
            class="button secondary small action-link-btn"
          >
            <AppIcon name="globe" :size="13" />
            <span>访问官方网站</span>
          </a>
          <a
            v-if="selected.handbook_url"
            :href="selected.handbook_url"
            target="_blank"
            rel="noopener noreferrer"
            class="button secondary small action-link-btn"
          >
            <AppIcon name="download" :size="13" />
            <span>下载会议手册 / 议程</span>
          </a>
        </div>

        <!-- 4. 会议说明与海报 -->
        <div v-if="selected.notes" class="talk-abstract-wrap conf-notes-wrap">
          <h4 class="talk-abstract-heading">会议说明与议程</h4>
          <div class="mail-notes" v-html="renderLatex(displayedNotes)"></div>
          <button
            v-if="isLongNotes"
            type="button"
            class="conf-fold-btn"
            @click="isNotesExpanded = !isNotesExpanded"
          >
            {{ isNotesExpanded ? '收起说明' : `展开全部说明（共 ${selected.notes.length} 字）` }}
          </button>
        </div>

        <div v-if="selected.poster_url" class="conf-poster-wrap">
          <AttachmentLink :url="selected.poster_url" label="打开会议通知文件 / 宣传图" poster />
        </div>
        <p v-else class="muted" style="font-size: 12px; margin: 0;">暂未提供通知文件</p>

        <!-- 5. 来源与更新时间 -->
        <div class="conf-meta-footer">
          <span>信息来源：{{ selected.source || '站内录入' }}</span>
          <span v-if="selected.updated_at || selected.created_at">
            最后更新：{{ formatConferenceTime(selected.updated_at || selected.created_at) }}
          </span>
        </div>

        <!-- 6. “感兴趣”功能提示说明 -->
        <div class="conf-interest-notice">
          <AppIcon name="warning" :size="13" />
          <span>注：点击“感兴趣”仅用于个人日程关注与组内标记，不代表已向会议主办方正式报名提交。</span>
        </div>
      </div>

      <!-- 单场学术报告详情抽屉 -->
      <div v-else class="talk-info">
        <div class="talk-header-row">
          <span class="badge amber">报告</span>
          <button
            type="button"
            class="detail-interest-btn talk-interest-btn"
            :class="{ 'is-interested': selected.is_interested }"
            :title="selected.is_interested ? '已标记为想听，点击取消' : '点击标记想听'"
            @click="toggleTalkInterest"
          >
            <AppIcon name="heart" :size="13" :weight="selected.is_interested ? 'fill' : 'regular'" />
            <span>{{ selected.is_interested ? '已想听' : '想听' }}</span>
            <span v-if="selected.interest_count > 0" class="interest-num">{{ selected.interest_count }}</span>
          </button>
        </div>

        <div class="talk-time-row">
          <div class="talk-time-display">
            <AppIcon name="clock" :size="15" class="time-clock-icon" />
            <span class="mono accent time-text">
              {{ selected.date }} · {{ selected.time }}（北京时间）
            </span>
          </div>
          <button
            v-if="canAdjustTime && !adjustingTime"
            type="button"
            class="button small secondary quick-adjust-btn"
            title="快捷调整报告时间"
            @click="openQuickAdjustTime"
          >
            <AppIcon name="edit" :size="12" />
            <span>调整时间</span>
          </button>
        </div>

        <!-- 快捷调整时间面板 -->
        <div v-if="adjustingTime" class="quick-time-box">
          <div class="quick-time-header">
            <strong>快捷调整报告时间</strong>
            <span class="muted" style="font-size: 12px;">调整后周日程将即时更新</span>
          </div>
          <div class="quick-time-fields">
            <label>
              报告日期
              <input v-model="quickTimeForm.date" type="date" required />
            </label>
            <label>
              开始时间
              <input v-model="quickTimeForm.time" type="time" required />
            </label>
          </div>
          <div class="quick-time-actions">
            <button type="button" class="button small ghost" :disabled="savingQuickTime" @click="adjustingTime = false">取消</button>
            <button type="button" class="button small primary" :disabled="savingQuickTime" @click="saveQuickTime">
              {{ savingQuickTime ? '正在保存…' : '确认保存新时间' }}
            </button>
          </div>
        </div>

        <p>报告人：{{ selected.speaker || '待补充' }}</p>
        <p>地点：{{ selected.location || '待补充' }}</p>
        <AttachmentLink :url="selected.poster_url" label="打开报告海报" poster />
        <p v-if="!selected.poster_url" class="muted">暂未提供海报</p>
        <div v-if="selected.notes" class="talk-abstract-wrap">
          <h4 class="talk-abstract-heading">报告摘要 / 详情说明</h4>
          <p class="mail-notes" v-html="renderLatex(selected.notes)"></p>
        </div>
      </div>
      <div v-if="canEdit || canDelete" class="form-actions">
        <button v-if="canEdit" class="button secondary" @click="edit">编辑{{ selected.event_type === 'conference' ? '会议' : '报告' }}</button>
        <button v-if="canDelete" class="button danger" @click="remove">删除{{ selected.event_type === 'conference' ? '会议' : '报告' }}</button>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.talk-info { display:grid; gap:18px; font-size:14px; }
.talk-header-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mail-notes { white-space:pre-wrap; line-height:1.85; overflow-wrap:anywhere; }
.talk-abstract-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: var(--surface, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border);
  border-radius: 10px;
}
.talk-abstract-heading {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.02em;
}
.talk-notes-preview {
  margin-top: -6px;
  margin-bottom: 8px;
  padding: 12px 14px;
  background: var(--surface, rgba(255, 255, 255, 0.03));
  border: 1px dashed var(--accent, #6366f1);
  border-radius: 8px;
}
.talk-notes-preview-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 6px;
  letter-spacing: 0.03em;
}
.talk-notes-preview-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text);
}
.parse-warnings { padding:13px; border:1px solid var(--warning); border-radius:10px; color:var(--warning); font-size:13px; }
.parse-warnings p+p { margin-top:6px; }

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
  border-color: color-mix(in srgb, #f43f5e 50%, var(--line));
  color: #f43f5e;
  background: var(--raised);
  transform: scale(1.03);
}
.detail-interest-btn.is-interested {
  border-color: #f43f5e;
  background: color-mix(in srgb, #f43f5e 14%, var(--surface));
  color: #f43f5e;
  font-weight: 600;
  box-shadow: 0 0 10px color-mix(in srgb, #f43f5e 22%, transparent);
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
  background: color-mix(in srgb, #f43f5e 22%, transparent);
  color: #f43f5e;
}

.event-type-segmented {
  display: flex;
  background: var(--surface, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  border-radius: 9px;
  padding: 3px;
  gap: 4px;
  margin-bottom: 6px;
}
.event-type-segmented button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}
.event-type-segmented button:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
}
.event-type-segmented button.active {
  background: var(--raised, rgba(255, 255, 255, 0.14));
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.form-row-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}
@media (max-width: 640px) {
  .form-row-3 {
    grid-template-columns: 1fr !important;
  }
}
.badge.blue {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.35);
}

.talk-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.talk-time-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-clock-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.time-text {
  font-size: 15px;
  font-weight: 500;
}

.quick-adjust-btn {
  padding: 4px 10px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.quick-time-box {
  display: grid;
  gap: 12px;
  padding: 14px;
  background: var(--surface-hover, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border);
  border-radius: 10px;
}

.quick-time-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.quick-time-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}

.quick-time-fields label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--muted);
}

.quick-time-fields input {
  padding: 6px 10px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
}

.quick-time-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 会议表单与抽屉增强样式 */
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

.conf-detail-wrapper {
  gap: 16px;
}

.conf-badge-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.sub-badge {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  color: var(--text-muted);
}

.conf-city-badge {
  display: inline-block;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.conf-detail-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text);
  letter-spacing: -0.01em;
}

.conf-meta-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: var(--surface, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border);
  border-radius: 10px;
}

.conf-meta-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
}

.conf-meta-item svg,
.conf-meta-item .app-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--text-muted);
}

.conf-deadlines-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: var(--surface, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border);
  border-radius: 10px;
}

.conf-section-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.conf-deadlines-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}

.conf-deadline-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  background: var(--bg-card, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: border-color 0.2s;
}

.conf-deadline-item.is-urgent {
  border-color: rgba(245, 158, 11, 0.5);
  background: rgba(245, 158, 11, 0.05);
}

.conf-deadline-item.is-passed {
  opacity: 0.7;
}

.conf-deadline-label {
  font-size: 11px;
  color: var(--text-muted);
}

.conf-deadline-date {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.conf-deadline-status {
  font-size: 11px;
  color: var(--text-muted);
}

.conf-deadline-status.urgent-text {
  color: #f59e0b;
  font-weight: 600;
}

.conf-deadline-status.passed-text {
  color: var(--text-muted);
}

.conf-empty-deadlines {
  font-size: 12px;
  margin: 0;
}

.conf-actions-section {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 8px;
}

.conf-notes-wrap {
  position: relative;
}

.conf-fold-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 0 0 0;
  align-self: flex-start;
  transition: opacity 0.2s;
}

.conf-fold-btn:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.conf-poster-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conf-meta-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-muted);
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}

.conf-interest-notice {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.conf-interest-notice svg,
.conf-interest-notice .app-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--accent);
}
</style>
