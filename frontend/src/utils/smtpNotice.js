/**
 * 将外部邮箱输入（逗号、分号、换行分隔）解析并校验提取为合法邮箱列表
 */
export function parseExternalEmails(raw) {
  if (!raw) return []
  const tokens = String(raw).split(/[\s,;，；\n\r]+/).map(s => s.trim()).filter(Boolean)
  const validEmails = []
  const seen = new Set()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  for (const t of tokens) {
    const clean = t.toLowerCase()
    if (emailRegex.test(clean) && !seen.has(clean)) {
      seen.add(clean)
      validEmails.push(clean)
    }
  }
  return validEmails
}

/**
 * 格式化组会日期与时间为自然语言（如：9月16日（周三）上午10点）
 */
export function formatSeminarDateTime(dateStr, timeStr) {
  if (!dateStr) return ''
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const parts = String(dateStr).split('-')
  if (parts.length < 3) return `${dateStr} ${timeStr || ''}`.trim()

  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  const d = new Date(`${dateStr}T00:00:00`)
  const w = isNaN(d.getDay()) ? '' : weekdays[d.getDay()]

  let formattedTime = (timeStr || '').trim()
  if (formattedTime) {
    const [hStr, mStr] = formattedTime.split(':')
    const h = parseInt(hStr, 10)
    const m = parseInt(mStr || '0', 10)
    if (!isNaN(h)) {
      const period = h < 12 ? '上午' : (h === 12 ? '中午' : '下午')
      const hourDisplay = h > 12 ? (h - 12) : (h === 0 ? 12 : h)
      if (m === 0) {
        formattedTime = `${period}${hourDisplay}点`
      } else {
        formattedTime = `${period}${hourDisplay}点${m}分`
      }
    }
  }

  const datePart = `${month}月${day}日${w ? `（${w}）` : ''}`
  return `${datePart}${formattedTime ? ' ' + formattedTime : ''}`.trim()
}

/**
 * 组会通知固定模板生成器
 */
export function buildSeminarNoticeBody(params) {
  const formattedTime = formatSeminarDateTime(params.dateStr, params.timeStr)
  const loc = (params.location || '').trim()

  // 区分线下地点与线上腾讯会议
  let offlineLoc = loc
  let onlineMeeting = ''

  const onlineMatch = loc.match(/(腾讯会议|Zoom|会议号|Voov)[:：\s]*([0-9\s\-]+)/i)
  if (onlineMatch) {
    onlineMeeting = onlineMatch[0].trim()
    offlineLoc = loc.replace(onlineMatch[0], '').replace(/[\/|,，]/g, '').trim()
  }

  if (!offlineLoc && !onlineMeeting) {
    offlineLoc = '5-511'
    onlineMeeting = '腾讯会议（待定）'
  }

  const lines = [
    '大家好，',
    '',
    '下次组会安排如下：',
    '',
    `时间：${formattedTime || '待定'}`,
    ''
  ]

  if (offlineLoc) {
    lines.push(`地点：${offlineLoc}`)
    lines.push('')
  }

  if (onlineMeeting) {
    lines.push(`线上：${onlineMeeting}`)
    lines.push('')
  }

  lines.push(`主讲人：${params.presenterName || '待定'}`)
  lines.push('')

  if (params.presentationsText && params.presentationsText.trim()) {
    lines.push(`arXiv分享人：${params.presentationsText.trim()}`)
    lines.push('')
  }

  lines.push(`本次组会将围绕 ${params.topic || '近期科研进展'} 进行分享和讨论。`)
  lines.push('')
  lines.push('请大家准时参加，谢谢！')
  lines.push('')
  lines.push('祝好，')
  lines.push('')
  lines.push(params.adminName || '管理员')

  return lines.join('\n')
}
