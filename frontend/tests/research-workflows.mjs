// Run against an isolated, seeded backend: LABHUB_TEST_URL=http://127.0.0.1:8011 node tests/research-workflows.mjs
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { addDays, monday, shanghaiToday } from '../src/utils/schedule.js'
const base = process.env.LABHUB_TEST_URL
if (!base) throw new Error('Set LABHUB_TEST_URL to an isolated test server; this test creates records.')
const browser = await chromium.launch({ headless: true, channel: process.env.LABHUB_BROWSER_CHANNEL || 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const errors = [], created = []
const runId = Date.now().toString(36)
const meetingTitle = `浏览器测试：每周工作汇报 ${runId}`
const reportTitle = `浏览器验证报告 ${runId}`
const meetingDate = addDays(monday(shanghaiToday()), 4)
const reportDate = shanghaiToday()
let authHeaders
page.on('response', async response => {
  if (response.request().method() === 'POST' && /\/api\/(seminars|talks)$/.test(response.url()) && response.ok()) {
    const result = await response.json(); created.push(`${response.url()}/${result.id}`)
  }
})
async function screenshot(path) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => setTimeout(resolve, 700)) })
  await page.screenshot({ path, fullPage: true })
}
page.on('pageerror', error => errors.push(error.message))
try {
  const login = await page.request.post(`${base}/api/auth/login`, { data: { email: 'student@lab.edu', password: 'lab123456' } })
  assert.equal(login.status(), 200)
  const auth = await login.json()
  authHeaders = { Authorization: `Bearer ${auth.access_token}` }
  const fixture = await page.request.post(`${base}/api/arxiv/recommend`, { headers: authHeaders, data: {
    arxiv_id: '2609.04305', title: 'TNFlow: Amortized Posterior Inference for Trans-Neptunian Object Surface Composition',
    authors: ['Agastya Gaur', 'Cristina M. Dalle Ore', 'Alessandra Ricca'], abstract: 'Browser-test metadata fixture.',
  } })
  assert.ok([200, 400].includes(fixture.status()))
  if (fixture.status() === 200) created.push(`${base}/api/arxiv/${(await fixture.json()).id}`)
  await page.goto(base)
  await page.evaluate(auth => { localStorage.setItem('labhub_token', auth.access_token); localStorage.setItem('labhub_user', JSON.stringify(auth.user)) }, auth)
  await page.goto(`${base}/seminars`)
  await page.getByRole('region', { name: '组会时间线', exact: true }).waitFor()
  await screenshot('/tmp/labhub-timeline-desktop.png')
  await page.getByRole('button', { name: '组会与报告 · 周日程' }).click()
  await page.getByRole('region', { name: '组会与报告周日程表' }).waitFor()
  const week = await page.locator('.week-header .mono').textContent()
  await page.getByRole('button', { name: '下一周', exact: true }).click()
  assert.notEqual(await page.locator('.week-header .mono').textContent(), week)
  await page.getByRole('button', { name: '上一周', exact: true }).click()
  assert.equal(await page.locator('.week-header .mono').textContent(), week)
  await screenshot('/tmp/labhub-week-desktop.png')

  await page.getByRole('button', { name: '新建组会', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '新建组会', exact: true })
  await dialog.getByLabel('组会日期').fill(meetingDate)
  await dialog.getByLabel('主讲人', { exact: true }).fill('浏览器测试主讲人')
  await dialog.getByLabel('主讲工作汇报主题').fill(meetingTitle)
  await dialog.getByRole('button', { name: '添加分享人' }).click()
  await dialog.getByRole('button', { name: '添加分享人' }).click()
  const presentations = dialog.locator('.presentation-form')
  for (let i = 0; i < 2; i++) {
    await presentations.nth(i).getByLabel('分享人', { exact: true }).fill(`文献分享人 ${i + 1}`)
    await presentations.nth(i).getByLabel('arXiv 编号或链接').fill(i ? 'https://arxiv.org/abs/2609.04305' : 'arXiv:2609.04305')
  }
  await dialog.locator('input[type=file]').first().setInputFiles({ name: 'test-slides.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') })
  await page.getByText('test-slides.pdf 已上传', { exact: true }).waitFor()
  await screenshot('/tmp/labhub-seminar-form.png')
  await dialog.getByRole('button', { name: '保存日程' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '组会与报告 · 周日程' }).click()
  await page.locator('.week-event').filter({ hasText: meetingTitle }).click()
  dialog = page.getByRole('dialog', { name: meetingTitle })
  await dialog.getByText('arXiv 文献分享 · 2 人').waitFor()
  await dialog.getByRole('link', { name: '打开 Slides' }).waitFor()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })

  await page.getByRole('button', { name: '导入报告邮件', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '导入报告邮件', exact: true })
  await dialog.getByLabel('或粘贴邮件正文').fill(`报告题目：${reportTitle}\n报告时间：${reportDate} 16:00\n报告人：测试教授\n地点：天文台报告厅`)
  await dialog.getByRole('button', { name: '解析邮件', exact: true }).click()
  await dialog.getByLabel('报告标题').waitFor()
  assert.equal(await dialog.getByLabel('报告日期').inputValue(), reportDate)
  assert.equal(await dialog.getByLabel('开始时间（北京时间）').inputValue(), '16:00')
  await dialog.getByRole('button', { name: '确认保存日程' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.locator('.week-event').filter({ hasText: reportTitle }).waitFor()
  await page.getByRole('button', { name: '组会时间线', exact: true }).click()
  assert.equal(await page.locator('.timeline-view').getByText(reportTitle).count(), 0)

  await page.goto(`${base}/library`)
  await page.getByLabel('检索文献', { exact: true }).fill('TNFlow')
  await page.getByRole('button', { name: '检索', exact: true }).click()
  await page.locator('.library-paper').filter({ hasText: 'TNFlow' }).waitFor()
  assert.equal(await page.locator('.library-paper').count(), 1)
  await screenshot('/tmp/labhub-library-desktop.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot('/tmp/labhub-library-mobile.png')
  await page.goto(`${base}/seminars`)
  await page.getByRole('region', { name: '组会时间线', exact: true }).waitFor()
  await screenshot('/tmp/labhub-timeline-mobile.png')
  await page.getByRole('button', { name: '组会与报告 · 周日程' }).click()
  await screenshot('/tmp/labhub-week-mobile.png')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Page must not overflow horizontally')
  const nav = await page.locator('.mobile-nav').boundingBox()
  assert.ok(nav.y > 700 && nav.y + nav.height <= 844, 'Mobile navigation must stay at the bottom of the viewport')
  assert.deepEqual(errors, [])
  console.log('PASS: timeline, week navigation, two presenters, slides upload, email import, library search, mobile layout; no browser errors')
} finally {
  for (const url of created.reverse()) await page.request.delete(url, { headers: authHeaders })
  await browser.close()
}
