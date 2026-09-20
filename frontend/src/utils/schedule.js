// Calendar arithmetic uses UTC only as a timezone-free carrier for YYYY-MM-DD.
// Actual seminar times always refer to the research group's Asia/Shanghai zone.
export function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [y, m, d] = value.split('-').map(Number)
  const result = new Date(0)
  result.setUTCFullYear(y, m - 1, d)
  result.setUTCHours(0, 0, 0, 0)
  return result.getUTCFullYear() === y && result.getUTCMonth() === m - 1 && result.getUTCDate() === d ? result : null
}
export const dateString = date => date.toISOString().slice(0, 10)
export function addDays(value, count) {
  const date = parseDate(value)
  if (!date) throw new Error('无效日期')
  date.setUTCDate(date.getUTCDate() + count)
  return dateString(date)
}
export function monday(value) {
  const date = parseDate(value)
  if (!date) throw new Error('无效日期')
  return addDays(value, -((date.getUTCDay() + 6) % 7))
}
export const railDates = focus => Array.from({ length: 14 }, (_, i) => addDays(monday(focus), i))
export function shanghaiToday(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]))
  return `${p.year}-${p.month}-${p.day}`
}
export function timeString(value) {
  const match = /^(\d{1,2})[:：](\d{2})$/.exec((value || '').trim())
  if (!match || +match[1] > 23 || +match[2] > 59) return null
  return `${match[1].padStart(2, '0')}:${match[2]}`
}
export function seminarTime(item) {
  const time = timeString(item.time)
  return parseDate(item.date) && time ? Date.parse(`${item.date}T${time}:00+08:00`) : NaN
}
export function eventTime(item, defaultTime = '14:30') {
  const time = timeString(item.time) || defaultTime
  return parseDate(item.date) ? Date.parse(`${item.date}T${time}:00+08:00`) : NaN
}
export function statusLabel(item, now = Date.now()) {
  if (item.status === 'completed') return '已完成'
  return seminarTime(item) < now ? '待补纪要' : '待举行'
}
export const sortSeminars = items => [...items].sort((a, b) => `${a.date} ${timeString(a.time) || a.time}`.localeCompare(`${b.date} ${timeString(b.time) || b.time}`) || a.id - b.id)
export function nextSeminar(items, now = Date.now()) {
  return sortSeminars(items).find(item => item.status === 'upcoming' && seminarTime(item) >= now) || null
}
export function filterSeminars(items, status, presenter) {
  return sortSeminars(items.filter(s => (status === 'all' || s.status === status) && (!presenter || s.presenter_name === presenter)))
}
export function moveDraft(drafts, item, date) {
  if (item.status !== 'upcoming' || !parseDate(date) || !parseDate(item.date)) return drafts
  const result = { ...drafts }
  const original = result[item.id]?.expected_date || item.date
  if (date === original) delete result[item.id]
  else result[item.id] = { id: item.id, expected_date: original, date }
  return result
}
export const previewSeminars = (items, drafts) => items.map(item => ({ ...item, date: drafts[item.id]?.date || item.date }))
export function reconcileChanges(changes, current) {
  const map = new Map(current.map(s => [s.id, s]))
  if (changes.every(c => map.get(c.id)?.date === c.date)) return 'saved'
  if (changes.every(c => map.get(c.id)?.date === c.expected_date && map.get(c.id)?.status === 'upcoming')) return 'unchanged'
  return 'conflict'
}
export function findConflicts(changes, current) {
  const map = new Map(current.map(s => [s.id, s]))
  return changes.filter(c => !map.has(c.id) || map.get(c.id).status !== 'upcoming' || map.get(c.id).date !== c.expected_date).map(c => ({
    ...c, current_date: map.get(c.id)?.date || null, status: map.get(c.id)?.status || null,
  }))
}

const escapeIcs = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\n|\r/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
const utcStamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
function foldLine(line) {
  const encoder = new TextEncoder()
  let out = '', length = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    if (length + size > 75) { out += '\r\n '; length = 1 }
    out += char; length += size
  }
  return out
}
export function seminarIcs(item, now = new Date()) {
  const start = seminarTime(item)
  if (!Number.isFinite(start)) throw new Error('请先修正组会日期与时间，再加入日历。')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LabOrbit//Seminars//CN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:seminar-${item.id}@laborbit.local`, `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(new Date(start))}`, `DTEND:${utcStamp(new Date(start + 2 * 3600000))}`,
    `SUMMARY:${escapeIcs(`[组会] ${item.topic} (${item.presenter_name})`)}`,
    `LOCATION:${escapeIcs(item.location)}`,
    `DESCRIPTION:${escapeIcs(`主讲人: ${item.presenter_name}\n${item.notes || ''}`)}`,
    'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR', '',
  ].map(foldLine).join('\r\n')
}

export function weekScheduleIcs(eventsList, calendarName = '课题组周日程', now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LabOrbit//WeeklySchedule//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Shanghai',
  ]

  for (const item of eventsList) {
    const isSeminar = item.type === 'seminar'
    const isConference = item.type === 'conference'
    const defaultTime = isSeminar ? '14:30' : (isConference ? '09:00' : '10:00')
    const startMs = eventTime(item, defaultTime)
    if (!Number.isFinite(startMs)) continue

    const durationMs = (isSeminar ? 2 : (isConference ? 8 : 1.5)) * 3600 * 1000
    const endMs = startMs + durationMs

    const uid = `${item.type || 'event'}-${item.id}-${item.date}@laborbit.local`
    const summary = isSeminar
      ? `[组会] ${item.topic || item.title || '工作汇报'} (${item.presenter_name || item.speaker || '待定'})`
      : isConference
      ? `[学术会议] ${item.title} (${item.speaker || '主办方/学者'})`
      : `[学术报告] ${item.title} (${item.speaker || '报告专家'})`

    let desc = ''
    if (isSeminar) {
      desc = `主讲人: ${item.presenter_name || item.speaker || '待定'}\n`
      if (item.presentations?.length) {
        desc += `arXiv 分享: ${item.presentations.map(p => `${p.presenter_name}${p.arxiv_id ? ` (${p.arxiv_id})` : ''}`).join('、')}\n`
      }
      if (item.notes) desc += `备注: ${item.notes}\n`
      if (item.abstract) desc += `摘要:\n${item.abstract}`
    } else if (isConference) {
      desc = `主办方/学者: ${item.speaker || '待定'}\n`
      if (item.end_date && item.end_date !== item.date) desc += `会议会期: ${item.date} 至 ${item.end_date}\n`
      if (item.location) desc += `地点/网址: ${item.location}\n`
      if (item.notes) desc += `会议说明:\n${item.notes}\n`
      if (item.poster_url) desc += `会议链接/海报: ${item.poster_url}`
    } else {
      desc = `报告专家: ${item.speaker || '待定'}\n`
      if (item.location) desc += `地点: ${item.location}\n`
      if (item.notes) desc += `详情说明:\n${item.notes}\n`
      if (item.poster_url) desc += `海报/链接: ${item.poster_url}`
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${utcStamp(new Date(startMs))}`,
      `DTEND:${utcStamp(new Date(endMs))}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `LOCATION:${escapeIcs(item.location || (isSeminar ? '物理楼研讨室 / 腾讯会议' : '天文楼'))}`,
      `DESCRIPTION:${escapeIcs(desc.trim())}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    )
  }

  lines.push('END:VCALENDAR', '')
  return lines.map(foldLine).join('\r\n')
}

export function getSemester(dateStr) {
  if (!dateStr) return null
  const [y, m] = dateStr.split('-').map(Number)
  if (!y || !m) return null
  if (m >= 2 && m <= 7) {
    return {
      id: `${y}-spring`,
      name: `${y}年春季学期`,
      start: `${y}-02-01`,
      end: `${y}-07-31`,
      year: y,
      term: 'spring'
    }
  } else if (m >= 8) {
    return {
      id: `${y}-autumn`,
      name: `${y}年秋季学期`,
      start: `${y}-08-01`,
      end: `${y + 1}-01-31`,
      year: y,
      term: 'autumn'
    }
  } else {
    return {
      id: `${y - 1}-autumn`,
      name: `${y - 1}年秋季学期`,
      start: `${y - 1}-08-01`,
      end: `${y}-01-31`,
      year: y - 1,
      term: 'autumn'
    }
  }
}

export function currentSemester(nowStr = shanghaiToday()) {
  return getSemester(nowStr)
}

export function extractSemesters(seminars = []) {
  const map = new Map()
  for (const s of seminars) {
    if (!s.date) continue
    const sem = getSemester(s.date)
    if (sem && !map.has(sem.id)) {
      map.set(sem.id, sem)
    }
  }
  const curr = currentSemester()
  if (curr && !map.has(curr.id)) {
    map.set(curr.id, curr)
  }
  return Array.from(map.values()).sort((a, b) => b.start.localeCompare(a.start))
}

export function filterScheduleEvents(eventsList = [], options = {}) {
  const { scope = 'all', includeSeminars = true, includeTalks = true } = options
  return (eventsList || []).filter(item => {
    if (item.type === 'seminar') {
      return Boolean(includeSeminars)
    }
    if (item.type === 'talk' || item.type === 'conference') {
      if (!includeTalks) return false
      if (scope === 'interested' && !item.is_interested) return false
      return true
    }
    return true
  })
}

