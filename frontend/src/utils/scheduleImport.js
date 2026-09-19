// RFC 4180-style CSV cells, including quoted commas and embedded newlines.
export function parseScheduleCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '' }
    else cell += char
  }
  if (quoted) throw new Error('CSV 引号没有闭合')
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row)
  const headers = rows.shift()?.map(h => h.replace(/^\uFEFF/, '')) || []
  const aliases = { '日期':'date', '时间':'time', '主讲人':'presenter_name', '主题':'topic', '地点':'location', '邮箱':'email' }
  const keys = headers.map(h => aliases[h] || h)
  if (!keys.includes('date') || !keys.includes('presenter_name')) throw new Error('CSV 表头需要包含“日期”和“主讲人”')
  if (!rows.length || rows.length > 200) throw new Error('一次导入需要 1–200 行排期')
  return rows.map((cells, i) => {
    if (cells.length !== headers.length) throw new Error(`第 ${i + 2} 行列数与表头不一致`)
    const data = Object.fromEntries(keys.map((key, j) => [key, cells[j]]))
    return { date: data.date, time: data.time || '14:30', presenter_name: data.presenter_name, email: data.email || '', topic: data.topic || '主讲主题待定', location: data.location || '地点待定', presenter_id: null }
  })
}
