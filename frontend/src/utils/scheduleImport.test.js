import { describe, it, expect } from 'vitest'
import { parseScheduleCsv } from './scheduleImport'
describe('schedule CSV import', () => {
  it('accepts BOM, quoted titles and missing optional fields', () => {
    const rows = parseScheduleCsv('\uFEFF日期,主讲人,主题\r\n2026-10-16,张明,"Stars, galaxies"')
    expect(rows[0]).toMatchObject({date:'2026-10-16',time:'14:30',topic:'Stars, galaxies',presenter_name:'张明'})
  })
  it('handles escaped quotes and embedded newlines', () => {
    expect(parseScheduleCsv('日期,主讲人,主题\n2026-10-16,张明,"A ""quoted""\ntitle"')[0].topic).toBe('A "quoted"\ntitle')
  })
  it('rejects incomplete or empty imports', () => {
    for (const text of ['日期,主讲人\n', 'name,date\nA,2026-10-16', '日期,主讲人\n2026-10-16,"张明', '日期,主讲人\n2026-10-16,张明,Extra']) expect(() => parseScheduleCsv(text)).toThrow()
  })
})
