import { shanghaiToday } from "./schedule"

/**
 * 提取通知的生效/通知发布日期（YYYY-MM-DD）。
 * 优先取 start_date，若不存在或无法解析则回退取 created_at。
 *
 * @param {Object} notice - 通知对象
 * @returns {string} YYYY-MM-DD 格式日期字符串，解析失败返回空字符串
 */
export function getNoticeDate(notice) {
  if (!notice) return ""

  if (notice.start_date && typeof notice.start_date === "string") {
    const s = notice.start_date.trim()
    const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
    if (m) {
      const y = m[1]
      const month = m[2].padStart(2, "0")
      const day = m[3].padStart(2, "0")
      return `${y}-${month}-${day}`
    }
  }

  if (notice.created_at && typeof notice.created_at === "string") {
    const s = notice.created_at.trim()
    const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
    if (m) {
      const y = m[1]
      const month = m[2].padStart(2, "0")
      const day = m[3].padStart(2, "0")
      return `${y}-${month}-${day}`
    }
  }

  return ""
}

/**
 * 计算两个标准日期（YYYY-MM-DD）之间的天数差（toDate - fromDate）。
 *
 * @param {string} fromDateStr - 起始日期 YYYY-MM-DD
 * @param {string} toDateStr - 终止日期 YYYY-MM-DD
 * @returns {number} 相隔天数
 */
export function getDaysDifference(fromDateStr, toDateStr) {
  if (!fromDateStr || !toDateStr) return 0
  const [y1, m1, d1] = fromDateStr.split("-").map(Number)
  const [y2, m2, d2] = toDateStr.split("-").map(Number)
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0
  const utc1 = Date.UTC(y1, m1 - 1, d1)
  const utc2 = Date.UTC(y2, m2 - 1, d2)
  return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24))
}

/**
 * 校验通知当前是否可在工作台走马灯滚动展示：
 * 1. 若具有截止日期 end_date：必须在截止日期前（end_date >= todayStr）。
 * 2. 若属于长期有效通知（无 end_date 或为空）：
 *    在超过其邮件通知/发布时间 2 周（14天）后，不再在走马灯上显示。
 *
 * @param {Object} notice - 通知对象
 * @param {string} [todayStr] - 基准今天日期（默认上海时区今天）
 * @param {number} [maxPermanentDays=14] - 长期有效通知在走马灯上展示的最长天数（默认14天即2周）
 * @returns {boolean} 是否符合走马灯展示条件
 */
export function isNoticeActiveForMarquee(notice, todayStr = shanghaiToday(), maxPermanentDays = 14) {
  if (!notice) return false

  // 1. 时效性通知：设定了具体的截止日期
  if (notice.end_date && typeof notice.end_date === "string" && notice.end_date.trim()) {
    return notice.end_date.trim() >= todayStr
  }

  // 2. 长期有效通知：无明确截止日期
  const noticeDate = getNoticeDate(notice)
  if (!noticeDate) {
    // 缺失发布时间时默认保留展示
    return true
  }

  // 计算从邮件通知/发布日期到今天经过的天数
  const daysPassed = getDaysDifference(noticeDate, todayStr)

  // 超过 2 周（14 天）后不再在走马灯展示
  return daysPassed <= maxPermanentDays
}

/**
 * 过滤出所有符合走马灯展示条件的通知列表。
 *
 * @param {Array} notices - 待过滤的通知列表
 * @param {string} [todayStr] - 基准今天日期
 * @param {number} [maxPermanentDays=14] - 长期有效最长展示天数
 * @returns {Array} 过滤后的通知列表
 */
export function filterMarqueeNotices(notices, todayStr = shanghaiToday(), maxPermanentDays = 14) {
  if (!Array.isArray(notices) || notices.length === 0) return []
  return notices.filter(item => isNoticeActiveForMarquee(item, todayStr, maxPermanentDays))
}
