<script setup>
import { computed, ref } from 'vue'
import { shanghaiToday } from '../utils/schedule'
import { renderLatex } from '../utils/latex'
import AppIcon from './AppIcon.vue'
import PopularPumaLikeButton from './PopularPumaLikeButton.vue'

const props = defineProps({
  conferences: {
    type: Array,
    default: () => []
  },
  canManage: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select-conference', 'create-conference', 'toggle-interest'])

const today = shanghaiToday()
const statusFilter = ref('upcoming') // 'upcoming' | 'past' | 'all'
const currentYear = new Date().getFullYear().toString()
const yearFilter = ref(currentYear)
const searchQuery = ref('')
const onlyInterested = ref(false)

// 提取所有可选项年份
const availableYears = computed(() => {
  const set = new Set()
  for (const c of props.conferences) {
    if (c.date && c.date.length >= 4) {
      set.add(c.date.slice(0, 4))
    }
  }
  set.add(currentYear)
  return Array.from(set).sort((a, b) => b.localeCompare(a))
})

// 计算天数差（targetDate - baseDate）
function diffDays(targetDate, baseDate = today) {
  if (!targetDate || !baseDate) return null
  const [y1, m1, d1] = targetDate.split('-').map(Number)
  const [y2, m2, d2] = baseDate.split('-').map(Number)
  const t1 = Date.UTC(y1, m1 - 1, d1)
  const t2 = Date.UTC(y2, m2 - 1, d2)
  return Math.round((t1 - t2) / (1000 * 60 * 60 * 24))
}

// 格式化日期为 MM.DD
function formatShortDate(dateStr) {
  if (!dateStr || dateStr.length < 10) return dateStr || ''
  return `${dateStr.slice(5, 7)}.${dateStr.slice(8, 10)}`
}

// 计算卡片左侧日期标牌信息
function getDateBadgeInfo(conf) {
  const start = conf.date || ''
  const end = conf.end_date || conf.date || ''

  if (!start) {
    return { dayText: '待定', monthText: '待定', isCrossMonth: false }
  }

  const startMonth = Number(start.slice(5, 7))
  const startDay = start.slice(8, 10)

  if (!end || end === start) {
    return {
      dayText: startDay,
      monthText: `${startMonth}月`,
      isCrossMonth: false
    }
  }

  const endMonth = Number(end.slice(5, 7))
  const endDay = end.slice(8, 10)

  if (startMonth === endMonth) {
    return {
      dayText: `${startDay}—${endDay}`,
      monthText: `${startMonth}月`,
      isCrossMonth: false
    }
  }

  // 跨月
  return {
    dayText: `${formatShortDate(start)}—${formatShortDate(end)}`,
    monthText: '跨月',
    isCrossMonth: true
  }
}

// 计算最临近未到期的截止日期
function getDeadlineStatus(conf) {
  const hasEnded = (conf.end_date || conf.date) < today

  const deadlineCandidates = [
    { key: 'early_bird_deadline', label: '早鸟注册截止', date: conf.early_bird_deadline },
    { key: 'abstract_deadline', label: '摘要提交截止', date: conf.abstract_deadline },
    { key: 'registration_deadline', label: '报名截止', date: conf.registration_deadline }
  ].filter(item => Boolean(item.date && item.date.trim()))

  if (!deadlineCandidates.length) {
    return {
      state: 'tbd',
      text: '截止日期待补充',
      isUrgent: false
    }
  }

  // 找出所有未来尚未到期的截止日
  const pending = deadlineCandidates
    .map(item => ({ ...item, diff: diffDays(item.date, today) }))
    .filter(item => item.diff !== null && item.diff >= 0)
    .sort((a, b) => a.diff - b.diff)

  if (pending.length > 0) {
    const closest = pending[0]
    const isUrgent = closest.diff <= 7
    let diffText = ''
    if (closest.diff === 0) {
      diffText = '今天截止'
    } else if (closest.diff === 1) {
      diffText = '明天截止'
    } else {
      diffText = `还剩 ${closest.diff} 天`
    }

    return {
      state: 'open',
      text: `${closest.label}：${formatShortDate(closest.date)} (${diffText})`,
      isUrgent,
      diff: closest.diff
    }
  }

  // 所有截止日期均已过去
  return {
    state: 'closed',
    text: hasEnded ? '会议已结束' : '报名已截止',
    isUrgent: false
  }
}

// 格式化城市与主办单位
function getSecondEyeText(conf) {
  const city = conf.city?.trim() || ''
  const location = conf.location?.trim() || ''
  const organizer = conf.organizer?.trim() || conf.speaker?.trim() || ''

  let place = city || location || '线上/待定'
  if (city && location && location !== city) {
    place = `${city} · ${location}`
  }

  const host = organizer || '主办单位待补充'
  return `${place} · ${host}`
}

// 筛选会议列表
const filteredConferences = computed(() => {
  let list = [...props.conferences]

  // 状态筛选
  if (statusFilter.value === 'upcoming') {
    list = list.filter(c => (c.end_date || c.date) >= today)
  } else if (statusFilter.value === 'past') {
    list = list.filter(c => (c.end_date || c.date) < today)
  }

  // 年份筛选
  if (yearFilter.value !== 'all') {
    list = list.filter(c => (c.date || '').startsWith(yearFilter.value))
  }

  // 关注筛选
  if (onlyInterested.value) {
    list = list.filter(c => Boolean(c.is_interested))
  }

  // 搜索关键词
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(c => {
      const matchTitle = (c.title || '').toLowerCase().includes(q)
      const matchCity = (c.city || '').toLowerCase().includes(q)
      const matchLoc = (c.location || '').toLowerCase().includes(q)
      const matchOrg = (c.organizer || '').toLowerCase().includes(q)
      const matchSpeaker = (c.speaker || '').toLowerCase().includes(q)
      const matchNotes = (c.notes || '').toLowerCase().includes(q)
      return matchTitle || matchCity || matchLoc || matchOrg || matchSpeaker || matchNotes
    })
  }

  // 排序：即将举行按开始日期正序；历史会议按开始日期倒序
  if (statusFilter.value === 'past') {
    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || '') || b.id - a.id)
  } else {
    list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || '') || a.id - b.id)
  }

  return list
})

// 按月份分组
const groupedConferences = computed(() => {
  const groups = []
  const map = new Map()

  for (const conf of filteredConferences.value) {
    const monthKey = (conf.date || '').slice(0, 7) || '待定'
    if (!map.has(monthKey)) {
      map.set(monthKey, [])
      groups.push({
        monthKey,
        title: formatGroupTitle(monthKey),
        items: map.get(monthKey)
      })
    }
    map.get(monthKey).push(conf)
  }

  return groups
})

function formatGroupTitle(monthKey) {
  if (!monthKey || monthKey === '待定' || monthKey.length < 7) return '日期待定'
  const year = monthKey.slice(0, 4)
  const month = Number(monthKey.slice(5, 7))
  if (yearFilter.value !== 'all' && year === yearFilter.value) {
    return `${month} 月`
  }
  return `${year} 年 ${month} 月`
}
</script>

<template>
  <div class="conference-list-view" role="tabpanel" id="tabpanel-conferences" aria-labelledby="tab-conferences">
    <!-- 顶部筛选与控制栏 -->
    <div id="tour-conf-toolbar" class="conference-toolbar">
      <div class="toolbar-left">
        <!-- 状态筛选 -->
        <div class="custom-select-wrap">
          <select v-model="statusFilter" class="toolbar-select" aria-label="会议状态筛选">
            <option value="upcoming">即将举行</option>
            <option value="past">历史会议</option>
            <option value="all">全部会议</option>
          </select>
          <AppIcon name="right" :size="12" class="select-chevron" />
        </div>

        <!-- 年份筛选 -->
        <div class="custom-select-wrap">
          <select v-model="yearFilter" class="toolbar-select" aria-label="会议年份筛选">
            <option v-for="y in availableYears" :key="y" :value="y">{{ y }} 年</option>
            <option value="all">全部年份</option>
          </select>
          <AppIcon name="right" :size="12" class="select-chevron" />
        </div>

        <!-- 关键词搜索 -->
        <div class="search-input-wrap">
          <AppIcon name="search" :size="14" class="search-icon" />
          <input
            v-model="searchQuery"
            type="search"
            class="search-input"
            placeholder="搜索会议名称、地点、主办单位…"
            aria-label="搜索学术会议"
          />
        </div>

        <!-- 只看我感兴趣的 -->
        <label class="interested-checkbox-label">
          <input v-model="onlyInterested" type="checkbox" class="interested-checkbox" />
          <span>只看我关注的</span>
        </label>
      </div>

      <div class="toolbar-right">
        <button
          type="button"
          class="button primary create-conference-btn"
          @click="emit('create-conference')"
        >
          <AppIcon name="plus" :size="14" />
          <span>录入会议</span>
        </button>
      </div>
    </div>

    <!-- 会议纵向列表 -->
    <div v-if="groupedConferences.length > 0" class="conference-groups">
      <section v-for="(group, gIdx) in groupedConferences" :key="group.monthKey" class="conference-month-group">
        <header class="group-month-header">
          <span class="group-month-tag">{{ group.title }}</span>
          <span class="group-count-badge">{{ group.items.length }} 场会议</span>
        </header>

        <div class="conference-cards-grid">
          <article
            v-for="(conf, cIdx) in group.items"
            :key="conf.id"
            :id="gIdx === 0 && cIdx === 0 ? 'tour-conf-card' : undefined"
            class="glass-card conference-card"
            tabindex="0"
            @click="emit('select-conference', conf)"
            @keydown.enter.prevent="emit('select-conference', conf)"
            @keydown.space.prevent="emit('select-conference', conf)"
          >
            <!-- 左侧：日期标牌 -->
            <div
              class="conf-date-col"
              :class="{ 'is-cross-month': getDateBadgeInfo(conf).isCrossMonth }"
            >
              <span class="date-day-text mono">{{ getDateBadgeInfo(conf).dayText }}</span>
              <span class="date-month-text">{{ getDateBadgeInfo(conf).monthText }}</span>
            </div>

            <!-- 中间：三层信息展示 -->
            <div class="conf-info-col">
              <!-- 第一眼：会议名称与细分类型 -->
              <div class="conf-first-eye">
                <span v-if="conf.sub_type" class="conf-type-badge">{{ conf.sub_type }}</span>
                <span v-else class="conf-type-badge blue">学术会议</span>
                <h3 class="conf-title academic" v-html="renderLatex(conf.title)"></h3>
              </div>

              <!-- 第二眼：城市/线上 · 主办单位 -->
              <div class="conf-second-eye">
                <AppIcon name="location" :size="14" class="loc-icon" />
                <span class="second-eye-text">{{ getSecondEyeText(conf) }}</span>
              </div>

              <!-- 需要行动：临近截止日期提示 -->
              <div class="conf-actionable-row">
                <span
                  class="deadline-cue"
                  :class="{
                    'is-urgent': getDeadlineStatus(conf).isUrgent,
                    'is-closed': getDeadlineStatus(conf).state === 'closed',
                    'is-tbd': getDeadlineStatus(conf).state === 'tbd'
                  }"
                >
                  <AppIcon
                    :name="getDeadlineStatus(conf).isUrgent ? 'clock' : 'calendar'"
                    :size="13"
                    class="deadline-icon"
                  />
                  <span>{{ getDeadlineStatus(conf).text }}</span>
                </span>
              </div>
            </div>

            <!-- 右侧：行动与详情操作 -->
            <div class="conf-actions-col" @click.stop>
              <PopularPumaLikeButton
                :liked="Boolean(conf.is_interested)"
                :count="Number(conf.interest_count || 0)"
                size="small"
                label="关注"
                compact
                title="关注此会议（仅表示个人关注，不代表已在官网报名）"
                @toggle="emit('toggle-interest', conf)"
              />

              <button
                type="button"
                class="view-detail-btn"
                title="查看会议详情与日程安排"
                @click.stop="emit('select-conference', conf)"
              >
                <span>查看</span>
                <AppIcon name="right" :size="14" />
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <!-- 空状态 -->
    <div v-else class="conference-empty-state">
      <div class="empty-icon-wrap">
        <AppIcon name="calendar" :size="38" />
      </div>
      <h3>暂无匹配的学术会议</h3>
      <p v-if="searchQuery || onlyInterested || statusFilter !== 'upcoming' || yearFilter !== currentYear">
        当前筛选条件下未检索到相关会议安排，您可以尝试清空搜索词或切换筛选选项。
      </p>
      <p v-else>
        目前暂无排期中的学术会议。您可以点击右上角“录入会议”快速发布学术研讨会、年会或暑期学校通知。
      </p>
      <button
        type="button"
        class="button secondary empty-action-btn"
        @click="emit('create-conference')"
      >
        <AppIcon name="plus" :size="14" />
        <span>录入第一场学术会议</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.conference-list-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
}

/* 工具栏 */
.conference-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border);
  border-radius: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.custom-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.toolbar-select {
  appearance: none;
  background: var(--surface-subtle, rgba(255, 255, 255, 0.05));
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 7px 32px 7px 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}

.toolbar-select:hover,
.toolbar-select:focus {
  border-color: var(--accent);
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.select-chevron {
  position: absolute;
  right: 10px;
  pointer-events: none;
  color: var(--text-muted, #8b949e);
  transform: rotate(90deg);
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 240px;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted, #8b949e);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 7px 12px 7px 32px;
  background: var(--surface-subtle, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}

.search-input:focus {
  border-color: var(--accent);
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}

.interested-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  user-select: none;
  padding: 0 4px;
}

.interested-checkbox {
  cursor: pointer;
  accent-color: var(--accent);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.create-conference-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 7px 14px;
}

/* 分组纵向流 */
.conference-groups {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.conference-month-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-month-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--border);
}

.group-month-tag {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}

.group-count-badge {
  font-size: 12px;
  color: var(--text-muted, #8b949e);
}

/* 卡片栅格与横向卡片 */
.conference-cards-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.conference-card {
  display: grid;
  grid-template-columns: 88px 1fr auto;
  align-items: center;
  gap: 18px;
  padding: 16px 20px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--surface, rgba(255, 255, 255, 0.03));
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.conference-card:hover {
  transform: translateY(-1px);
  border-color: var(--accent);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.conference-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* 左侧日期标牌 */
.conf-date-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 6px;
  background: var(--surface-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border);
  border-radius: 12px;
  text-align: center;
  min-height: 64px;
}

.conf-date-col.is-cross-month {
  padding: 8px 4px;
}

.date-day-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.15;
}

.conf-date-col.is-cross-month .date-day-text {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.date-month-text {
  font-size: 11px;
  color: var(--accent);
  font-weight: 600;
  margin-top: 2px;
}

/* 中间信息列 */
.conf-info-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.conf-first-eye {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.conf-type-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  background: var(--accent-subtle, rgba(99, 102, 241, 0.15));
  color: var(--accent);
  border: 1px solid rgba(99, 102, 241, 0.25);
  white-space: nowrap;
}

.conf-type-badge.blue {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.25);
}

.conf-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.conf-second-eye {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
}

.loc-icon {
  flex-shrink: 0;
  color: var(--text-muted, #94a3b8);
}

.second-eye-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conf-actionable-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.deadline-cue {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  font-weight: 500;
}

.deadline-cue.is-urgent {
  color: var(--warning, #f59e0b);
  font-weight: 600;
}

.deadline-cue.is-closed {
  color: var(--text-subtle, #64748b);
}

.deadline-cue.is-tbd {
  color: var(--text-subtle, #64748b);
}

.deadline-icon {
  flex-shrink: 0;
}

/* 右侧操作列 */
.conf-actions-col {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.view-detail-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: transparent;
  color: var(--accent);
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.view-detail-btn:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--border);
}

/* 空状态 */
.conference-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  text-align: center;
  background: var(--surface, rgba(255, 255, 255, 0.02));
  border: 1px dashed var(--border);
  border-radius: 20px;
}

.empty-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: var(--surface-subtle, rgba(255, 255, 255, 0.05));
  color: var(--accent);
  margin-bottom: 16px;
}

.conference-empty-state h3 {
  margin: 0 0 8px 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
}

.conference-empty-state p {
  margin: 0 0 20px 0;
  max-width: 480px;
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
  line-height: 1.6;
}

.empty-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .conference-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar-left {
    flex-direction: column;
    align-items: stretch;
  }
  .search-input-wrap {
    min-width: 100%;
  }
  .conference-card {
    grid-template-columns: 72px 1fr;
    gap: 12px;
    padding: 14px;
  }
  .conf-actions-col {
    grid-column: 1 / -1;
    justify-content: space-between;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .conf-title {
    font-size: 15px;
  }
  .date-day-text {
    font-size: 16px;
  }
}
</style>
