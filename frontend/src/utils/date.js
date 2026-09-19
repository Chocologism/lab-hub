/**
 * Safely parse a date string or timestamp from database/API into a local Date object.
 * Handles SQLite UTC strings (e.g. "YYYY-MM-DD HH:mm:ss") by ensuring UTC context.
 * @param {string|number|Date|null|undefined} input
 * @returns {Date|null}
 */
export function parseUtcDate(input) {
  if (!input) return null
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input
  if (typeof input === 'number') {
    const d = new Date(input)
    return isNaN(d.getTime()) ? null : d
  }
  try {
    let s = String(input).trim()
    if (!s) return null
    // If string lacks timezone offset/Z, SQLite returns UTC without indicator
    if (!s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z'
    }
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

/**
 * Formats comment timestamp into readable local time.
 * If today, returns "HH:mm". Otherwise returns "M/D HH:mm".
 * @param {string|number|Date} isoStr
 * @param {Date} [now]
 * @returns {string}
 */
export function formatCommentTime(isoStr, now = new Date()) {
  if (!isoStr) return ''
  try {
    const d = parseUtcDate(isoStr)
    if (!d) return ''
    const isToday = d.toDateString() === now.toDateString()
    const hours = String(d.getHours()).padStart(2, '0')
    const mins = String(d.getMinutes()).padStart(2, '0')
    if (isToday) return `${hours}:${mins}`
    const m = d.getMonth() + 1
    const day = d.getDate()
    return `${m}/${day} ${hours}:${mins}`
  } catch {
    return ''
  }
}
