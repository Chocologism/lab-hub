<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { addDays, monday, shanghaiToday, seminarTime, sortSeminars, statusLabel, getSemester, currentSemester, extractSemesters, weekScheduleIcs, filterScheduleEvents } from '../utils/schedule'
import { getHoliday } from '../utils/holidays'
import { notify } from '../composables/feedback'
import { renderLatex } from '../utils/latex'
import AppIcon from './AppIcon.vue'
import BaseDialog from './BaseDialog.vue'
import SeminarCarousel3D from './SeminarCarousel3D.vue'
import PopularPumaLikeButton from './PopularPumaLikeButton.vue'
import { useWeekDrag } from '../composables/useWeekDrag'
import { seminarApi } from '../api/client'
const props = defineProps({
  seminars: { type: Array, default: () => [] },
  talks: { type: Array, default: () => [] },
  mode: String,
  focusDate: { type: String, default: '' },
  canManage: { type: Boolean, default: false },
  targetSeminarId: { type: [Number, String], default: null },
  disableAutoReset: { type: Boolean, default: false },
})
const emit = defineEmits(['select-seminar', 'select-talk', 'update:focusDate', 'swap-seminars', 'update-interest'])
const focus = ref(props.focusDate || shanghaiToday()), history = ref(false)
const draggingSeminar = ref(null)
const dropTargetId = ref(null)

const activeSemester = currentSemester()
const semesters = computed(() => extractSemesters(props.seminars || []))
const selectedSemester = ref(activeSemester?.id || 'all')

watch(
  [() => props.targetSeminarId, () => props.seminars],
  ([targetId, list]) => {
    if (!targetId || !list || !list.length) return
    const idNum = Number(targetId)
    const targetItem = list.find(s => s.id === idNum)
    if (targetItem) {
      const sem = getSemester(targetItem.date)
      if (sem && selectedSemester.value !== 'all' && selectedSemester.value !== sem.id) {
        selectedSemester.value = sem.id
      }
    }
  },
  { immediate: true }
)

function onDragStart(event, item) {
  if (!props.canManage || item.status !== 'upcoming') {
    event.preventDefault()
    return
  }
  draggingSeminar.value = item
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(item.id))
}

function onDragOver(event, item) {
  if (!draggingSeminar.value) return
  if (item.status !== 'upcoming' || item.id === draggingSeminar.value.id) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dropTargetId.value = item.id
}

function onDragLeave(event, item) {
  if (dropTargetId.value === item.id) {
    dropTargetId.value = null
  }
}

function onDrop(event, targetItem) {
  event.preventDefault()
  const source = draggingSeminar.value
  dropTargetId.value = null
  draggingSeminar.value = null

  if (!source || !targetItem || source.id === targetItem.id) return
  if (source.status !== 'upcoming' || targetItem.status !== 'upcoming') return

  emit('swap-seminars', { itemA: source, itemB: targetItem })
}

function onDragEnd() {
  draggingSeminar.value = null
  dropTargetId.value = null
}

watch(() => props.focusDate, (val) => { if (val && val !== focus.value) focus.value = val })
function setFocus(newVal) {
  focus.value = newVal
  emit('update:focusDate', newVal)
}

const weekDrag = useWeekDrag({
  onPrev: () => setFocus(addDays(focus.value, -7)),
  onNext: () => setFocus(addDays(focus.value, 7)),
  threshold: 45
})

function goToThisWeek() {
  const today = shanghaiToday()
  const todayMon = monday(today)
  const currentMon = monday(focus.value)
  if (todayMon === currentMon) return
  const diff = new Date(`${todayMon}T00:00:00Z`).getTime() - new Date(`${currentMon}T00:00:00Z`).getTime()
  weekDrag.slideTransition(diff > 0 ? 1 : -1, () => setFocus(today))
}

const focusedTargetDay = ref(null)
let focusTargetTimer = null

function scrollToTargetDay(targetDay) {
  if (!targetDay) return
  if (typeof window === 'undefined' || window.innerWidth > 768) return

  nextTick(() => {
    setTimeout(() => {
      const el = document.getElementById(`week-day-${targetDay}`)
      if (!el) return

      const headerOffset = 64
      const elPosition = el.getBoundingClientRect().top
      const offsetPosition = elPosition + (window.pageYOffset || document.documentElement.scrollTop) - headerOffset

      window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: 'smooth'
      })

      focusedTargetDay.value = targetDay
      if (focusTargetTimer) clearTimeout(focusTargetTimer)
      focusTargetTimer = setTimeout(() => {
        focusedTargetDay.value = null
      }, 2500)
    }, 200)
  })
}

watch(
  () => [props.focusDate, props.mode],
  ([newDate, newMode]) => {
    if (newMode === 'week' && newDate) {
      scrollToTargetDay(newDate)
    }
  }
)

onMounted(() => {
  if (props.mode === 'week' && (props.focusDate || focus.value)) {
    scrollToTargetDay(props.focusDate || focus.value)
  }
})

onBeforeUnmount(() => {
  if (focusTargetTimer) clearTimeout(focusTargetTimer)
})

const week = computed(() => Array.from({ length: 7 }, (_, i) => addDays(monday(focus.value), i)))
const ordered = computed(() => {
  const list = sortSeminars((props.seminars || []).filter(s => s.status !== 'cancelled'))
  if (selectedSemester.value === 'all') return list
  return list.filter(s => getSemester(s.date)?.id === selectedSemester.value)
})
const upcoming = computed(() => ordered.value.filter(s => s.status === 'upcoming' && seminarTime(s) >= Date.now()))
const past = computed(() => ordered.value.filter(s => seminarTime(s) < Date.now()))
const nearestIndex = computed(() => {
  if (!ordered.value.length) return 0
  if (upcoming.value.length) {
    const idx = ordered.value.findIndex(s => s.id === upcoming.value[0].id)
    return idx >= 0 ? idx : 0
  }
  return ordered.value.length - 1
})
const targetIndex = computed(() => {
  if (!props.targetSeminarId) return -1
  const idNum = Number(props.targetSeminarId)
  return ordered.value.findIndex(s => s.id === idNum)
})
function normalizeScheduleTitle(t) {
  return (t || '')
    .replace(/^[【\[](?:学术报告|通知|讲座|报告|天体物理中心)[\]】]\s*/i, '')
    .replace(/[《》""''“”‘’\s，。、：:；;！!？?·•\-—_]/g, '')
    .toLowerCase()
}

function normalizeScheduleSpeaker(s) {
  return (s || '').replace(/[\s·•（）()\[\]]/g, '').toLowerCase()
}

const hoveredEventId = ref(null)

const events = computed(() => Object.fromEntries(week.value.map(day => {
  const daySeminars = (props.seminars || [])
    .filter(s => s.date === day && s.status !== 'cancelled')
    .map(s => ({ ...s, type: 'seminar', title: s.topic, speaker: s.presenter_name }))

  const dayTalks = []
  const seenTalks = []
  for (const t of (props.talks || [])) {
    const isConference = t.event_type === 'conference' || (t.end_date && t.end_date !== t.date)
    const startDate = t.date
    const endDate = t.end_date || t.date

    // 日程需包含当前日期 (startDate <= day <= endDate)
    if (day < startDate || day > endDate) continue

    const normTitle = normalizeScheduleTitle(t.title)
    const normSpeaker = normalizeScheduleSpeaker(t.speaker)

    const isDup = seenTalks.some(st => {
      if (st.id === t.id) return true
      if (st.isConference !== isConference) return false
      if (normTitle && st.normTitle && (normTitle === st.normTitle || normTitle.includes(st.normTitle) || st.normTitle.includes(normTitle))) {
        return true
      }
      if (normSpeaker && st.normSpeaker && (normSpeaker === st.normSpeaker || (normSpeaker.length >= 2 && (normSpeaker.includes(st.normSpeaker) || st.normSpeaker.includes(normSpeaker))))) {
        return true
      }
      return false
    })

    if (!isDup) {
      seenTalks.push({ id: t.id, isConference, normTitle, normSpeaker })
      dayTalks.push({
        ...t,
        type: isConference ? 'conference' : 'talk',
        is_conference: isConference
      })
    }
  }

  return [
    day,
    [...daySeminars, ...dayTalks].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  ]
})))
const dayLabel = date => new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

const togglingInterest = ref(new Set())

async function handleToggleInterest(item) {
  const key = `${item.type}-${item.id}`
  if (togglingInterest.value.has(key)) return
  togglingInterest.value.add(key)

  const wasInterested = Boolean(item.is_interested)
  const prevCount = Number(item.interest_count || 0)
  const nextInterested = !wasInterested
  const nextCount = Math.max(0, prevCount + (nextInterested ? 1 : -1))

  // 乐观更新：同步更新所有同ID跨日日程卡片
  item.is_interested = nextInterested
  item.interest_count = nextCount
  if (item.id) {
    allWeekEvents.value.filter(ev => ev.id === item.id).forEach(ev => {
      ev.is_interested = nextInterested
      ev.interest_count = nextCount
    })
  }

  try {
    const res = await seminarApi.toggleInterest(item.type, item.id)
    if (res && res.success) {
      item.is_interested = Boolean(res.is_interested)
      item.interest_count = Number(res.interest_count || 0)
    }
    if (item.id) {
      allWeekEvents.value.filter(ev => ev.id === item.id).forEach(ev => {
        ev.is_interested = item.is_interested
        ev.interest_count = item.interest_count
      })
    }
    emit('update-interest', {
      type: item.type,
      id: item.id,
      is_interested: item.is_interested,
      interest_count: item.interest_count
    })
    window.dispatchEvent(new CustomEvent('schedule-interest-updated', {
      detail: {
        type: item.type,
        id: item.id,
        is_interested: item.is_interested,
        interest_count: item.interest_count
      }
    }))
  } catch (err) {
    // 异常回滚
    item.is_interested = wasInterested
    item.interest_count = prevCount
    if (item.id) {
      allWeekEvents.value.filter(ev => ev.id === item.id).forEach(ev => {
        ev.is_interested = wasInterested
        ev.interest_count = prevCount
      })
    }
    notify(err.message || '标记想听失败，请重试', 'error')
  } finally {
    togglingInterest.value.delete(key)
  }
}

// 导出日历配置与弹窗状态
const showExportDialog = ref(false)
const exportScope = ref('all') // 'all' | 'interested'
const includeSeminars = ref(true)
const includeTalks = ref(true)

const allWeekEvents = computed(() => week.value.flatMap(day => events.value[day] || []))

const matchedExportEvents = computed(() => {
  return filterScheduleEvents(allWeekEvents.value, {
    scope: exportScope.value,
    includeSeminars: includeSeminars.value,
    includeTalks: includeTalks.value
  })
})

function openExportDialog() {
  if (!allWeekEvents.value.length) {
    notify('当前周暂无日程安排，无需导出', 'info')
    return
  }
  showExportDialog.value = true
}

function doExportCalendar() {
  const list = matchedExportEvents.value
  if (!list.length) {
    notify('当前筛选条件下没有匹配的日程，无法导出', 'error')
    return
  }
  try {
    const rangeStr = `${week.value[0]} 至 ${week.value[6]}`
    const suffix = exportScope.value === 'interested' ? ' (我的想听)' : ''
    const calName = `学术周日程${suffix} (${rangeStr})`
    const icsContent = weekScheduleIcs(list, calName)
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const scopeTag = exportScope.value === 'interested' ? '-interested' : ''
    link.download = `schedule-${week.value[0]}${scopeTag}.ics`
    link.click()
    URL.revokeObjectURL(url)
    showExportDialog.value = false
    notify(`已成功导出 ${list.length} 项日程！可在 macOS「日历」等软件中直接导入。`, 'success')
  } catch (err) {
    notify(err.message || '导出日历失败', 'error')
  }
}
</script>
<template>
  <section v-if="mode === 'timeline'" class="timeline-view" aria-label="组会时间线">
    <!-- 学期隔离与切换选择条 -->
    <div v-if="semesters.length > 1" class="semester-filter-bar">
      <div class="semester-pills">
        <button
          v-for="sem in semesters"
          :key="sem.id"
          type="button"
          class="semester-pill"
          :class="{ active: selectedSemester === sem.id, 'is-current': sem.id === activeSemester?.id }"
          @click="selectedSemester = sem.id"
        >
          <span v-if="sem.id === activeSemester?.id" class="current-sem-dot"></span>
          <span>{{ sem.name }}</span>
          <span v-if="sem.id === activeSemester?.id" class="current-sem-tag">本学期</span>
        </button>
        <button
          type="button"
          class="semester-pill"
          :class="{ active: selectedSemester === 'all' }"
          @click="selectedSemester = 'all'"
        >
          <span>全部学期</span>
        </button>
      </div>
    </div>

    <SeminarCarousel3D 
      :items="ordered" 
      :nearest-index="nearestIndex" 
      :target-index="targetIndex"
      :disable-auto-reset="disableAutoReset"
      @select-seminar="$emit('select-seminar', $event)" 
    />
    <button class="button ghost history-toggle" @click="history = !history">{{ history ? '收起全部排期' : `查看${selectedSemester === 'all' ? '全部' : '本学期'} ${ordered.length} 场组会` }}<AppIcon :name="history ? 'close' : 'right'" /></button>
    <div v-if="history" class="history-list">
      <div v-if="canManage" class="history-admin-tip">
        <AppIcon name="drag" :size="14" />
        <span>排期调整提示：拖动任意「待举行」日程到另一场待举行组会上，可直接交换两者的排期。</span>
      </div>
      <div 
        v-for="item in ordered" 
        :key="item.id" 
        class="history-entry" 
        :class="{ 
          'draggable': canManage && item.status === 'upcoming',
          'is-dragging': draggingSeminar?.id === item.id,
          'drop-target-active': dropTargetId === item.id 
        }"
        :draggable="canManage && item.status === 'upcoming'"
        @dragstart="onDragStart($event, item)"
        @dragover="onDragOver($event, item)"
        @dragleave="onDragLeave($event, item)"
        @drop="onDrop($event, item)"
        @dragend="onDragEnd"
        @click="$emit('select-seminar', item)"
      >
        <div v-if="canManage && item.status === 'upcoming'" class="drag-cue" title="拖动以交换排期" @click.stop>
          <AppIcon name="drag" :size="16" />
        </div>
        <time class="mono">{{ item.date }}<small>{{ item.time }}</small></time>
        <div class="history-info">
          <h3>{{ item.topic }}</h3>
          <p>主讲：{{ item.presenter_name }} · arXiv 分享：{{ item.presentations?.map(p => p.presenter_name).join('、') || '暂未安排' }}</p>
        </div>
        <span v-if="dropTargetId === item.id" class="drop-indicator-badge">释放交换排期</span>
        <span v-else class="badge">{{ statusLabel(item) }}</span>
      </div>
    </div>
  </section>
  <section v-else class="week-view" aria-label="组会与报告周日程表">
    <header class="week-header">
      <div>
        <h2>{{ monday(focus) === monday(shanghaiToday()) ? '本周日程' : '周日程' }}</h2>
        <p class="mono muted">{{ week[0] }} — {{ week[6] }} · 北京时间</p>
      </div>
      <div class="week-nav">
        <div class="week-nav-arrows">
          <button class="button small secondary" aria-label="上一周" @click="weekDrag.slidePrev()"><AppIcon name="left" />上周</button>
          <button class="button small ghost" @click="goToThisWeek">本周</button>
          <button class="button small secondary" aria-label="下一周" @click="weekDrag.slideNext()">下周<AppIcon name="right" /></button>
        </div>
        <button id="tour-week-export" class="button small ghost export-week-btn" title="导出本周日程到 macOS 系统日历 / iOS / Outlook" @click="openExportDialog">
          <AppIcon name="calendar" :size="14" />
          <span>导出到日历</span>
        </button>
      </div>
    </header>
    <div class="week-legend">
      <span class="badge cyan">组会</span>
      <span class="badge amber">报告</span>
      <span class="badge blue">会议</span>
      <span class="muted">按开始时间排列</span>
      <span class="week-drag-hint"><AppIcon name="drag" :size="13" />按住拖动或双指横滑换周</span>
    </div>
    <div
      ref="weekDrag.containerRef"
      class="week-slider-wrapper"
      :class="{ 'is-dragging': weekDrag.isDragging.value }"
      @pointerdown="weekDrag.onPointerDown"
      @wheel="weekDrag.onWheel"
      @click.capture="weekDrag.handleCaptureClick"
    >
      <div
        v-if="weekDrag.isDragging.value"
        class="week-drag-indicator left"
        :class="{ active: weekDrag.dragDirection.value === 'prev' && weekDrag.isThresholdMet.value }"
        :style="{ opacity: Math.min(1, Math.max(0, weekDrag.dragOffset.value / 35)) }"
      >
        <AppIcon name="left" :size="15" />
        <span>{{ weekDrag.isThresholdMet.value && weekDrag.dragDirection.value === 'prev' ? '释放查看上周' : '上一周' }}</span>
      </div>

      <div
        v-if="weekDrag.isDragging.value"
        class="week-drag-indicator right"
        :class="{ active: weekDrag.dragDirection.value === 'next' && weekDrag.isThresholdMet.value }"
        :style="{ opacity: Math.min(1, Math.max(0, -weekDrag.dragOffset.value / 35)) }"
      >
        <span>{{ weekDrag.isThresholdMet.value && weekDrag.dragDirection.value === 'next' ? '释放查看下周' : '下一周' }}</span>
        <AppIcon name="right" :size="15" />
      </div>

      <div
        ref="weekDrag.trackRef"
        class="week-slider-track"
        :style="weekDrag.trackStyle.value"
      >
        <div id="tour-week-grid" class="week-grid">
          <section
            v-for="day in week"
            :id="'week-day-' + day"
            :key="day"
            class="week-day"
            :class="{
              today: day === shanghaiToday(),
              'is-holiday': Boolean(getHoliday(day)),
              'is-target-day': focusedTargetDay === day
            }"
          >
            <header><span>{{ dayLabel(day) }}</span><time>{{ day.slice(5) }}</time></header>
            <article
              v-for="item in events[day]"
              :key="`${item.type}-${item.id}-${day}`"
              class="week-event"
              :class="[item.type, { 'linked-hover': item.type === 'conference' && hoveredEventId === item.id }]"
              role="button"
              tabindex="0"
              @mouseenter="item.type === 'conference' ? hoveredEventId = item.id : null"
              @mouseleave="item.type === 'conference' ? hoveredEventId = null : null"
              @click="$emit(item.type === 'seminar' ? 'select-seminar' : 'select-talk', item)"
              @keydown.enter="$emit(item.type === 'seminar' ? 'select-seminar' : 'select-talk', item)"
              @keydown.space.prevent="$emit(item.type === 'seminar' ? 'select-seminar' : 'select-talk', item)"
            >
              <div class="event-meta-bar">
                <span class="event-type">
                  <template v-if="item.type === 'conference'">
                    会议<template v-if="item.end_date && item.end_date !== item.date"> · {{ item.date.slice(5) }} - {{ item.end_date.slice(5) }}</template><template v-else-if="item.time && item.time !== '全天'"> · {{ item.time }}</template>
                  </template>
                  <template v-else>
                    {{ item.type === 'seminar' ? '组会' : '报告' }} · {{ item.time }}
                  </template>
                </span>
                <PopularPumaLikeButton
                  v-if="item.type === 'talk' || item.type === 'conference'"
                  :liked="Boolean(item.is_interested)"
                  :count="Number(item.interest_count || 0)"
                  :disabled="togglingInterest.has(`${item.type}-${item.id}`)"
                  size="small"
                  label="想听"
                  @toggle="handleToggleInterest(item)"
                />
              </div>
              <h3 v-html="renderLatex(item.title)"></h3>
              <p>{{ item.speaker || (item.type === 'conference' ? '主办方/学者待补充' : '报告人待补充') }}</p>
              <p v-if="item.type === 'seminar' && item.presentations?.length" class="event-sharing">arXiv：{{ item.presentations.map(p => p.presenter_name).join('、') }}</p>
              <small v-if="item.location">{{ item.location }}</small>
            </article>
            <p v-if="!events[day].length" class="day-empty" :class="{ 'is-holiday': Boolean(getHoliday(day)) }">
              <span v-if="getHoliday(day)" class="holiday-pill" :title="`法定节假日：${getHoliday(day)}`">{{ getHoliday(day) }}</span>
              <span v-else>暂无日程</span>
            </p>
          </section>
        </div>
      </div>
    </div>
  </section>

  <!-- 导出日历配置弹窗 -->
  <BaseDialog
    :open="showExportDialog"
    title="导出周日程到系统日历"
    @close="showExportDialog = false"
  >
    <div class="calendar-export-dialog">
      <p class="export-dialog-desc">
        将日程导出为标准 <code>.ics</code> 日历文件，支持在 macOS「日历」、iPhone / iPad、Google Calendar 与 Outlook 中一键导入。
      </p>

      <div class="export-section">
        <label class="export-label">导出范围</label>
        <div class="segmented export-scope-segmented">
          <button
            type="button"
            :class="{ active: exportScope === 'all' }"
            @click="exportScope = 'all'"
          >
            本周全部日程 ({{ allWeekEvents.length }})
          </button>
          <button
            type="button"
            :class="{ active: exportScope === 'interested' }"
            @click="exportScope = 'interested'"
          >
            仅当周「想听」的日程
          </button>
        </div>
      </div>

      <div class="export-section">
        <label class="export-label">日程分类过滤</label>
        <div class="export-checkbox-group">
          <label class="checkbox-pill">
            <input type="checkbox" v-model="includeSeminars" />
            <span>包含组会安排</span>
            <span class="badge cyan small">组会</span>
          </label>
          <label class="checkbox-pill">
            <input type="checkbox" v-model="includeTalks" />
            <span>包含报告与会议</span>
            <span class="badge amber small">报告</span>
            <span class="badge blue small">会议</span>
          </label>
        </div>
      </div>

      <div class="export-preview-box">
        <div class="preview-header">
          <span class="preview-title">导出日程清单预览</span>
          <span class="preview-count" :class="{ empty: matchedExportEvents.length === 0 }">
            已匹配 {{ matchedExportEvents.length }} 项日程
          </span>
        </div>
        <ul v-if="matchedExportEvents.length > 0" class="preview-list">
          <li v-for="ev in matchedExportEvents" :key="`${ev.type}-${ev.id}-${ev.date}`" class="preview-item">
            <span class="preview-time mono">{{ ev.date?.slice(5) }} {{ ev.time }}</span>
            <span class="badge small" :class="ev.type === 'seminar' ? 'cyan' : (ev.type === 'conference' ? 'blue' : 'amber')">
              {{ ev.type === 'seminar' ? '组会' : (ev.type === 'conference' ? '会议' : '报告') }}
            </span>
            <span class="preview-item-title" v-html="renderLatex(ev.title)"></span>
            <span v-if="ev.is_interested" class="badge-interest-cue">
              <AppIcon name="headphones" :size="11" /> 想听
            </span>
          </li>
        </ul>
        <div v-else class="preview-empty-tip">
          <AppIcon name="warning" :size="16" />
          <span>当前筛选条件下暂无匹配日程。{{ exportScope === 'interested' ? '可先在周日程卡片上点击「想听」，或切换为“本周全部日程”。' : '请至少勾选一种日程分类。' }}</span>
        </div>
      </div>

      <div class="dialog-actions">
        <button type="button" class="button secondary" @click="showExportDialog = false">
          取消
        </button>
        <button
          type="button"
          class="button primary calendar-confirm-btn"
          :disabled="matchedExportEvents.length === 0"
          @click="doExportCalendar"
        >
          <AppIcon name="calendar" :size="15" />
          <span>确认导出 .ics 文件</span>
        </button>
      </div>
    </div>
  </BaseDialog>
</template>
<style scoped>
.adjacent-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }
.timeline-slot { display:flex; flex-direction:column; align-items:flex-start; padding:24px; border:1px solid var(--line); border-radius:16px; background:var(--panel); box-shadow: 0 1px 3px rgba(0,0,0,0.03); transition: all 0.2s ease; }
.timeline-slot.nearest { border: 1.5px solid var(--accent); background: linear-gradient(135deg, var(--surface) 0%, var(--surface) 100%); box-shadow: 0 10px 25px -4px rgba(184, 155, 248, 0.15), 0 4px 10px -2px rgba(0, 0, 0, 0.04); }
.timeline-slot.nearest .eyebrow { color: var(--accent); background: var(--raised); padding: 2px 10px; border-radius: 9999px; font-weight: 700; display: inline-block; margin-bottom: 10px; }
.timeline-slot.nearest h2 { color: var(--text); font-size: 21px; font-weight: 700; line-height: 1.5; margin: 12px 0; }
.timeline-slot.nearest p { color: var(--soft); font-size: 13px; }
.timeline-slot.nearest .mono.accent { color: var(--accent); font-weight: 600; }
.timeline-slot.nearest .button.secondary { background: var(--accent); color: var(--panel); border-color: var(--accent); font-weight: 600; box-shadow: 0 2px 8px rgba(184, 155, 248, 0.35); }
.timeline-slot.nearest .button.secondary:hover { background: var(--accent-strong); border-color: var(--accent-strong); }
.timeline-slot h2 { font-size:21px; line-height:1.6; margin:12px 0; }
.timeline-slot>p { font-size:13px; }
.sharing-list { padding:18px 0; margin-bottom:auto; width:100%; }
.sharing-list>span { font-size:11px; }
.sharing-list p { font-size:13px; margin-top:8px; color: var(--soft); }
.sharing-list p span { display:block; font-size:11px; margin-top:3px; color: var(--muted); }
.empty-slot { padding:30px 0; }
.history-toggle { margin-top:15px; }
.history-list { display:grid; gap:10px; margin-top:14px; }
.history-admin-tip { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: rgba(184, 155, 248, 0.12); border: 1px dashed rgba(184, 155, 248, 0.35); border-radius: 8px; font-size: 12px; color: var(--accent); }
.history-entry { width:100%; text-align:left; display:flex; align-items:center; gap:20px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px 18px; color:var(--text); transition: all 0.2s ease; cursor: pointer; }
.history-entry.draggable { cursor: grab; }
.history-entry.draggable:active { cursor: grabbing; }
.history-entry.is-dragging { opacity: 0.4; border-style: dashed; border-color: var(--accent); }
.history-entry.drop-target-active { border-color: var(--accent); background: var(--raised); box-shadow: 0 0 0 2px var(--accent); transform: scale(1.01); }
.drag-cue { display: flex; align-items: center; justify-content: center; color: var(--muted); cursor: grab; padding: 4px; border-radius: 4px; }
.history-entry:hover .drag-cue { color: var(--accent); }
.history-info { flex: 1; }
.drop-indicator-badge { margin-left: auto; background: var(--accent); color: #0f1923; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; }
.history-entry time { color:var(--accent); font-size:12px; flex-shrink:0; }
.history-entry small { display:block; margin-top:6px; }
.history-entry h3 { font-size:14px; }
.history-entry p { color:var(--muted); font-size:12px; margin-top:5px; }
.history-entry .badge { margin-left:auto; }
.week-view { border:1px solid var(--line); border-radius:16px; overflow:hidden; background:var(--panel); box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
.week-header { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:22px; }
.week-header h2 { font-size:18px; }
.week-header p { margin-top:7px; font-size:12px; }
.week-nav { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.week-nav-arrows { display:inline-flex; align-items:center; gap:6px; }
.week-legend { display:flex; align-items:center; gap:8px; }
.export-week-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
}
.export-week-btn:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: var(--accent);
  transform: translateY(-1px);
}
.week-legend { padding:0 22px 18px; font-size:11px; }
.week-drag-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--muted);
  font-size: 11.5px;
  user-select: none;
}
.week-slider-wrapper {
  position: relative;
  overflow: hidden;
  touch-action: pan-y;
  cursor: grab;
  user-select: none;
  border-radius: 0 0 16px 16px;
}
.week-slider-wrapper.is-dragging {
  cursor: grabbing !important;
}
.week-slider-wrapper.is-dragging * {
  cursor: grabbing !important;
  user-select: none !important;
}
.week-slider-track {
  width: 100%;
}
.week-drag-indicator {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 9999px;
  background: var(--panel-solid, rgba(12, 10, 26, 0.94));
  border: 1.5px solid var(--line, rgba(184, 155, 248, 0.3));
  color: var(--soft);
  font-size: 13px;
  font-weight: 600;
  backdrop-filter: blur(16px);
  pointer-events: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  transition: border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.week-drag-indicator.left {
  left: 24px;
}
.week-drag-indicator.right {
  right: 24px;
}
.week-drag-indicator.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--panel);
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 35%, transparent);
  transform: translateY(-50%) scale(1.08);
}
.week-grid { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); border-top:1px solid var(--line); }
.week-day { min-height:330px; padding:10px 6px; border-right:1px solid var(--line); transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease; }
.week-day:last-child { border-right:0; }
.week-day>header { display:flex; justify-content:space-between; padding:5px 2px 13px; color:var(--muted); font-size:11px; }
.week-day.today>header { color:var(--accent); }
.week-day.today { background: color-mix(in srgb, var(--accent) 8%, var(--panel)); }
.week-day.is-holiday { background:color-mix(in srgb, var(--accent) 3%, transparent); }
.week-day.today.is-holiday { background: color-mix(in srgb, var(--accent) 12%, var(--panel)); }
.week-day.is-target-day {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 1.5px var(--accent), 0 6px 20px color-mix(in srgb, var(--accent) 25%, transparent) !important;
}
.week-event { 
  display:block; 
  width:100%; 
  text-align:left; 
  padding:10px 8px; 
  border:1px solid var(--line); 
  border-radius:10px; 
  background:var(--surface); 
  color:var(--text); 
  margin-bottom:10px; 
  overflow:hidden; 
  container-type:inline-size; 
  overflow-wrap:anywhere; 
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03); 
  transition: all 0.18s ease; 
}
.week-event:hover { background:var(--raised); border-color:var(--accent); transform: translateY(-1px); box-shadow: 0 4px 10px rgba(184, 155, 248, 0.15); }
.week-event.talk { border-color:rgba(243,216,162,.3); background:var(--warning-bg); }
.week-event.talk:hover { background:var(--warning-bg); border-color:var(--warning); }
.week-event.conference { border-color:rgba(56,189,248,.35); background:rgba(56,189,248,.08); }
.week-event.conference:hover,
.week-event.conference.linked-hover {
  background:rgba(56,189,248,.16);
  border-color:rgba(56,189,248,.85);
  box-shadow: 0 4px 14px rgba(56, 189, 248, 0.25);
  transform: translateY(-1px);
}
.event-meta-bar { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  gap: 4px; 
  margin-bottom: 6px; 
  min-height: 24px;
  flex-wrap: wrap;
}
.event-type { 
  color: var(--accent); 
  font-size: 10.5px; 
  font-weight: 600; 
  white-space: nowrap; 
  flex-shrink: 0;
  line-height: 1.2;
}
.talk .event-type { 
  color: var(--warning); 
}
.conference .event-type {
  color: #38bdf8;
}
.badge.blue {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.35);
}

/* 导出日历图标轻微往复旋转动画 (参考 giant-termite-81) */
@keyframes calendar-wobble {
  0% { transform: rotate(0deg); }
  25% { transform: rotate(-12deg); }
  50% { transform: rotate(12deg); }
  75% { transform: rotate(-6deg); }
  100% { transform: rotate(0deg); }
}
.export-week-btn:hover .app-icon,
.calendar-confirm-btn:hover .app-icon {
  animation: calendar-wobble 0.85s ease-in-out infinite;
  transform-origin: center center;
}
.week-event h3 { font-size:13px; line-height:1.5; margin:5px 0 7px; color:var(--text); font-weight:600; }
.week-event p { font-size:12px; color:var(--soft); }
.week-event small { display:block; color:var(--muted); font-size:10px; margin-top:8px; }
.event-sharing { margin-top:8px; }
.day-empty { text-align:center; color:var(--muted); padding:30px 0; font-size:11px; }
.day-empty.is-holiday { padding:24px 0; }
.day-empty .holiday-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent);
  letter-spacing: 0.5px;
  line-height: 1.4;
  user-select: none;
  transition: all 0.18s ease;
}
.day-empty .holiday-pill:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: var(--accent);
}

/* 导出日历配置弹窗样式 */
.calendar-export-dialog {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 0;
}
.export-dialog-desc {
  font-size: 13px;
  color: var(--soft);
  line-height: 1.6;
}
.export-dialog-desc code {
  font-family: var(--font-mono, monospace);
  background: var(--raised);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--accent);
  font-size: 12px;
}
.export-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.export-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.export-scope-segmented {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.export-scope-segmented button {
  padding: 8px 12px;
  font-size: 13px;
}
.export-checkbox-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.checkbox-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
  user-select: none;
  transition: all 0.18s ease;
}
.checkbox-pill:hover {
  border-color: var(--accent);
  background: var(--raised);
}
.checkbox-pill input {
  accent-color: var(--accent);
  cursor: pointer;
  width: 15px;
  height: 15px;
}
.export-preview-box {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 220px;
  overflow-y: auto;
}
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.preview-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--soft);
}
.preview-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}
.preview-count.empty {
  color: var(--warning, #e5a93c);
}
.preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text);
}
.preview-time {
  font-size: 11.5px;
  color: var(--muted);
  flex-shrink: 0;
}
.preview-item-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge-interest-cue {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.preview-empty-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}
.semester-filter-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 22px;
}
.semester-pills {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: var(--surface, rgba(12, 10, 26, 0.7));
  border: 1px solid var(--line, rgba(184, 155, 248, 0.16));
  border-radius: 9999px;
  backdrop-filter: blur(16px);
}
.semester-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: 9999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted, rgba(255, 255, 255, 0.6));
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.22s ease;
}
.semester-pill:hover {
  color: var(--text, #ffffff);
  background: rgba(255, 255, 255, 0.06);
}
.semester-pill.active {
  background: rgba(184, 155, 248, 0.18);
  border-color: rgba(184, 155, 248, 0.4);
  color: var(--accent, #b89bf8);
  font-weight: 600;
  box-shadow: 0 0 12px rgba(184, 155, 248, 0.3);
}
.current-sem-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent, #b89bf8);
  box-shadow: 0 0 6px var(--accent, #b89bf8);
}
.current-sem-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(184, 155, 248, 0.2);
  color: var(--accent, #b89bf8);
  font-weight: 600;
}
@media(max-width:1000px) and (min-width:769px) { 
  .week-grid { grid-template-columns:repeat(7,minmax(150px,1fr)); overflow-x:auto; }
  .timeline-slot { padding:18px; }
  .timeline-slot h2 { font-size:18px; } 
}

@media(max-width:768px) {
  /* 组会日程保留PC设计，支持水平手势左右滑动 */
  .adjacent-grid {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    gap: 14px;
    padding: 0 4px 14px;
    -webkit-overflow-scrolling: touch;
  }
  .adjacent-grid::-webkit-scrollbar {
    height: 4px;
  }
  .adjacent-grid::-webkit-scrollbar-thumb {
    background: var(--line);
    border-radius: 4px;
  }
  .timeline-slot {
    flex: 0 0 84%;
    min-width: 260px;
    max-width: 320px;
    scroll-snap-align: center;
    padding: 18px 16px;
  }
  .timeline-slot h2 {
    font-size: 18px;
  }

  /* 学期筛选胶囊横向滑动 */
  .semester-filter-bar {
    overflow-x: auto;
    justify-content: flex-start;
    padding: 0 4px 16px;
    -webkit-overflow-scrolling: touch;
  }
  .semester-pills {
    white-space: nowrap;
  }

  /* 历史排期列表适配 */
  .history-entry {
    padding: 12px 14px;
    gap: 12px;
    flex-wrap: wrap;
  }
  .history-entry time {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .history-entry small {
    display: inline-block;
    margin-top: 0;
    margin-left: 8px;
  }

  /* 周日程：周一至周日按自然时间顺序自上而下单列瀑布流展开 */
  .week-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    width: 100%;
    box-sizing: border-box;
  }
  .week-nav {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    box-sizing: border-box;
  }
  .week-nav-arrows {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex-wrap: nowrap;
  }
  .week-nav-arrows .button {
    padding: 6px 9px;
    font-size: 12px;
    min-height: 32px;
    height: 32px;
  }
  .export-week-btn {
    padding: 6px 10px;
    font-size: 12px;
    min-height: 32px;
    height: 32px;
    white-space: nowrap;
    box-sizing: border-box;
    flex-shrink: 0;
  }
  .week-legend {
    padding: 0 16px 12px;
    flex-wrap: wrap;
  }
  .week-drag-indicator {
    padding: 6px 12px;
    font-size: 12px;
  }
  .week-drag-indicator.left {
    left: 10px;
  }
  .week-drag-indicator.right {
    right: 10px;
  }
  .week-grid {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--line);
  }
  .week-day {
    min-height: auto;
    padding: 12px 14px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .week-day:last-child {
    border-bottom: 0;
  }
  .week-day>header {
    padding: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .week-day>header span {
    font-size: 14px;
    color: var(--soft);
  }
  .week-day.today>header span {
    color: var(--accent);
  }
  .week-day .day-empty {
    padding: 6px 0 2px;
    text-align: left;
    color: var(--muted);
    font-size: 12px;
  }
  .week-day .day-empty.is-holiday {
    padding: 6px 0 4px;
  }
  .week-event {
    margin-bottom: 8px;
    padding: 10px 12px;
  }
  .week-event h3 {
    font-size: 13.5px;
  }
  .history-admin-tip,
  .drag-cue {
    display: none !important;
  }
  .week-day.is-target-day {
    border-left: 4px solid var(--accent) !important;
    background: color-mix(in srgb, var(--accent) 12%, var(--panel)) !important;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 15%, transparent) !important;
  }
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .timeline-slot.nearest {
  box-shadow: 0 10px 25px -4px rgba(197, 230, 223, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.04) !important;
}

[data-theme-style="vanta-fog"] .timeline-slot.nearest .button.secondary {
  box-shadow: 0 2px 8px rgba(197, 230, 223, 0.25) !important;
}

[data-theme-style="vanta-fog"] .history-admin-tip {
  background: rgba(197, 230, 223, 0.08) !important;
  border-color: rgba(197, 230, 223, 0.3) !important;
}

[data-theme-style="vanta-fog"] .week-drag-indicator {
  background: rgba(14, 36, 44, 0.94) !important;
  border: 1.5px solid rgba(197, 230, 223, 0.3) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4) !important;
}

[data-theme-style="vanta-fog"] .week-drag-indicator.active {
  background: rgba(18, 48, 56, 0.98) !important;
  box-shadow: 0 0 20px rgba(197, 230, 223, 0.45) !important;
}

[data-theme-style="vanta-fog"] .week-day.today {
  background: rgba(197, 230, 223, .06) !important;
}

[data-theme-style="vanta-fog"] .week-event:hover {
  box-shadow: 0 4px 10px rgba(197, 230, 223, 0.12) !important;
}

[data-theme-style="vanta-fog"] .semester-nav-bar {
  background: rgba(14, 36, 44, 0.7) !important;
  border: 1px solid rgba(218, 238, 235, 0.14) !important;
}

[data-theme-style="vanta-fog"] .semester-pill.active {
  background: rgba(197, 230, 223, 0.16) !important;
  border-color: rgba(197, 230, 223, 0.4) !important;
  color: var(--accent, #c5e6df) !important;
  box-shadow: 0 0 12px rgba(197, 230, 223, 0.2) !important;
}

[data-theme-style="vanta-fog"] .current-sem-dot {
  background: var(--accent, #c5e6df) !important;
  box-shadow: 0 0 6px var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .current-sem-tag {
  background: rgba(197, 230, 223, 0.2) !important;
  color: var(--accent, #c5e6df) !important;
}
</style>
