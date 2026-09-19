// Use a separately seeded test server. Creates recommendations and removes them at the end.
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const base = process.env.LABHUB_TEST_URL
if (!base) throw new Error('Set LABHUB_TEST_URL to an isolated test server.')
const browser = await chromium.launch({ headless: true, channel: process.env.LABHUB_BROWSER_CHANNEL || 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const created = [], errors = []
const paper = { arxiv_id: '2609.' + String(Date.now() % 100000).padStart(5, '0'), title: 'Directional sharing browser test', authors: ['Test Author'], abstract: 'An arXiv metadata fixture for a browser test.' }
let token, previewCalls = 0
page.on('pageerror', error => errors.push(error.message))
page.on('response', async response => {
  if (response.request().method() === 'POST' && response.url().endsWith('/api/arxiv/recommend') && response.ok()) created.push((await response.json()).id)
})
await page.route('**/api/arxiv/preview', route => { previewCalls++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paper) }) })
const shot = async path => { await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 600)) }); await page.screenshot({ path, fullPage: true }) }
try {
  await page.goto(`${base}/quick-share?url_or_id=${paper.arxiv_id}`)
  await page.getByLabel('组内邮箱', { exact: true }).waitFor()
  assert.equal(previewCalls, 0, 'Do not request metadata before login')
  await page.getByLabel('组内邮箱', { exact: true }).fill('student@lab.edu')
  await page.getByLabel('密码', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: '登录并继续' }).click()
  await page.getByRole('alert').filter({ hasText: '登录失败' }).waitFor()
  await page.getByLabel('密码', { exact: true }).fill('lab123456')
  await page.getByRole('button', { name: '登录并继续' }).click()
  await page.getByRole('heading', { name: paper.title }).waitFor()
  assert.equal(await page.getByLabel('arXiv 链接或编号', { exact: true }).inputValue(), paper.arxiv_id)
  token = await page.evaluate(() => localStorage.getItem('labhub_token'))
  await page.getByRole('button', { name: '定向推荐', exact: true }).click()
  assert.ok(await page.getByRole('button', { name: '发送定向推荐', exact: true }).isDisabled())
  await page.getByLabel('查找接收人').fill('shu@lab.edu')
  await page.getByRole('checkbox').check()
  await page.getByLabel('推荐理由或研读重点（可选）').fill('仅发送给导师的研究想法')
  await shot('/tmp/labhub-directed-share.png')
  await page.getByRole('button', { name: '发送定向推荐', exact: true }).click()
  await page.getByRole('heading', { name: '定向推荐已发送' }).waitFor()
  await page.getByRole('link', { name: '返回推荐流' }).click()
  await page.getByRole('button', { name: '我发出的', exact: true }).click()
  await page.getByRole('heading', { name: paper.title }).waitFor()
  await page.getByRole('button', { name: '公共推荐', exact: true }).click()
  await page.getByRole('status').waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('heading', { name: paper.title }).count(), 0)

  // The ordinary recommendation form supports the same audience selection.
  await page.getByRole('button', { name: '推荐论文', exact: true }).click()
  await page.getByRole('textbox', { name: '文献编号或链接' }).fill(paper.arxiv_id)
  await page.getByRole('button', { name: '解析文献', exact: true }).click()
  await page.getByRole('button', { name: '定向推荐', exact: true }).click()
  await page.getByLabel('查找接收人').fill('wang@lab.edu')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: '发送定向推荐', exact: true }).click()
  await page.locator('.paper-row').filter({ hasText: '合作导师' }).filter({ hasText: paper.title }).waitFor()

  await page.goto(`${base}/arxiv`)
  await page.getByRole('button', { name: '我发出的', exact: true }).click()
  await page.locator('.paper-row').filter({ hasText: paper.title }).first().waitFor()
  await shot('/tmp/labhub-directed-feed.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot('/tmp/labhub-directed-mobile.png')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  assert.deepEqual(errors, [])
  console.log('PASS: login recovery, recipient selection, public/direct publishing, feed filters, mobile layout')
} finally {
  if (token) for (const id of created) await page.request.delete(`${base}/api/arxiv/${id}`, { headers: { Authorization: `Bearer ${token}` } })
  await browser.close()
}
