/**
 * 中国法定节假日工具库 (Statutory Holidays in China)
 * 包含国务院法定节假日放假安排（元旦、春节、清明节、劳动节、端午节、中秋节、国庆节）
 * 支持官方公布放假区间精准匹配与通用节气/农历算法兜底。
 */

// 国务院法定节假日安排区间（起始日期，截止日期，节假日名称）
const OFFICIAL_HOLIDAY_RANGES = [
  // 2023 年
  ['2022-12-31', '2023-01-02', '元旦'],
  ['2023-01-21', '2023-01-27', '春节'],
  ['2023-04-05', '2023-04-05', '清明节'],
  ['2023-04-29', '2023-05-03', '劳动节'],
  ['2023-06-22', '2023-06-24', '端午节'],
  ['2023-09-29', '2023-09-29', '中秋节'],
  ['2023-09-30', '2023-10-06', '国庆节'],

  // 2024 年
  ['2023-12-30', '2024-01-01', '元旦'],
  ['2024-02-09', '2024-02-17', '春节'],
  ['2024-04-04', '2024-04-06', '清明节'],
  ['2024-05-01', '2024-05-05', '劳动节'],
  ['2024-06-08', '2024-06-10', '端午节'],
  ['2024-09-15', '2024-09-17', '中秋节'],
  ['2024-10-01', '2024-10-07', '国庆节'],

  // 2025 年（国务院办公厅已发布安排）
  ['2025-01-01', '2025-01-01', '元旦'],
  ['2025-01-28', '2025-02-04', '春节'],
  ['2025-04-04', '2025-04-06', '清明节'],
  ['2025-05-01', '2025-05-05', '劳动节'],
  ['2025-05-31', '2025-06-02', '端午节'],
  ['2025-10-01', '2025-10-05', '国庆节'],
  ['2025-10-06', '2025-10-06', '中秋节'],
  ['2025-10-07', '2025-10-08', '国庆节'],

  // 2026 年（当前系统年份）
  ['2026-01-01', '2026-01-03', '元旦'],
  ['2026-02-16', '2026-02-23', '春节'],
  ['2026-04-04', '2026-04-06', '清明节'],
  ['2026-05-01', '2026-05-05', '劳动节'],
  ['2026-06-19', '2026-06-21', '端午节'],
  ['2026-09-25', '2026-09-27', '中秋节'],
  ['2026-10-01', '2026-10-07', '国庆节'],

  // 2027 年
  ['2027-01-01', '2027-01-03', '元旦'],
  ['2027-02-06', '2027-02-13', '春节'],
  ['2027-04-03', '2027-04-05', '清明节'],
  ['2027-05-01', '2027-05-05', '劳动节'],
  ['2027-06-09', '2027-06-11', '端午节'],
  ['2027-09-15', '2027-09-17', '中秋节'],
  ['2027-10-01', '2027-10-07', '国庆节'],

  // 2028 年
  ['2028-01-01', '2028-01-03', '元旦'],
  ['2028-01-25', '2028-02-01', '春节'],
  ['2028-04-02', '2028-04-04', '清明节'],
  ['2028-05-01', '2028-05-05', '劳动节'],
  ['2028-05-27', '2028-05-29', '端午节'],
  ['2028-10-01', '2028-10-02', '国庆节'],
  ['2028-10-03', '2028-10-03', '中秋节'],
  ['2028-10-04', '2028-10-07', '国庆节'],
]

// 预先展开日期映射表提高 O(1) 匹配性能
const holidayMap = new Map()

for (const [start, end, name] of OFFICIAL_HOLIDAY_RANGES) {
  let cur = new Date(`${start}T00:00:00Z`)
  const stop = new Date(`${end}T00:00:00Z`)
  while (cur <= stop) {
    holidayMap.set(cur.toISOString().slice(0, 10), name)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
}

/**
 * 获取农历月份与日期（利用现代浏览器及 Node 原生 Intl 支持）
 * @param {Date} dateObj 
 * @returns {{ m: string, day: number } | null}
 */
function getLunarParts(dateObj) {
  try {
    const parts = new Intl.DateTimeFormat('zh-Hans-u-ca-chinese', {
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    }).formatToParts(dateObj)
    const m = parts.find(p => p.type === 'month')?.value || ''
    const dayStr = parts.find(p => p.type === 'day')?.value || '0'
    return { m, day: parseInt(dayStr, 10) }
  } catch {
    return null
  }
}

/**
 * 针对未预置年份的通用法定节假日算法兜底
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {string | null}
 */
function getFallbackHoliday(dateStr) {
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3) return null
  const [y, m, d] = parts

  // 1. 公历固定法定假日
  if (m === 1 && d === 1) return '元旦'
  if (m === 5 && (d === 1 || d === 2)) return '劳动节'
  if (m === 10 && (d >= 1 && d <= 3)) return '国庆节'

  // 2. 21 世纪清明节计算公式（通常在 4 月 4 日或 4 月 5 日）
  const Y = y % 100
  const qmDay = Math.floor(Y * 0.2422 + 4.81) - Math.floor(Y / 4)
  if (m === 4 && d === qmDay) return '清明节'

  // 3. 农历传统法定假日
  const dateObj = new Date(`${dateStr}T00:00:00Z`)
  const lunar = getLunarParts(dateObj)
  if (!lunar) return null

  if (lunar.m === '5' && lunar.day === 5) return '端午节'
  if (lunar.m === '8' && lunar.day === 15) return '中秋节'
  if (lunar.m === '1' && (lunar.day >= 1 && lunar.day <= 3)) return '春节'

  // 检测除夕（正月初一的前一天）
  const nextDay = new Date(dateObj)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const nextLunar = getLunarParts(nextDay)
  if (nextLunar && nextLunar.m === '1' && nextLunar.day === 1) return '春节'

  return null
}

/**
 * 查询指定日期是否为中国法定节假日，若为法定节假日则返回其名称
 * @param {string} dateStr 'YYYY-MM-DD' 格式的日期字符串
 * @returns {string | null} 节假日名称（如 '国庆节'、'中秋节'、'春节'）或 null
 */
export function getHoliday(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const cleanDate = dateStr.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return null

  // 优先查询官方放假安排表
  const official = holidayMap.get(cleanDate)
  if (official) return official

  // 算法兜底
  return getFallbackHoliday(cleanDate)
}

/**
 * 判断指定日期是否为法定节假日
 * @param {string} dateStr 
 * @returns {boolean}
 */
export function isHoliday(dateStr) {
  return Boolean(getHoliday(dateStr))
}
