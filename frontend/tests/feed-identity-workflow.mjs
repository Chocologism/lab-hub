// Read-only browser checks; never creates or edits business records.
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const base = process.env.LABHUB_TEST_URL
if (!base) throw new Error('Set LABHUB_TEST_URL')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  const auth = await (await page.request.post(`${base}/api/auth/login`, { data: { email: 'admin@lab.edu', password: 'lab123456' } })).json()
  const headers = { Authorization: `Bearer ${auth.access_token}` }
  const all = await (await page.request.get(`${base}/api/arxiv/feed?scope=all`, { headers })).json()
  const sent = await (await page.request.get(`${base}/api/arxiv/feed?scope=sent`, { headers })).json()
  await page.goto(base)
  await page.evaluate(auth => {
    localStorage.setItem('labhub_token', auth.access_token)
    localStorage.setItem('labhub_user', '{broken old cache')
  }, auth)
  await page.goto(`${base}/arxiv`)
  await page.getByRole('button', { name: '我发出的', exact: true }).click()
  await page.getByRole('status').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.paper-row').count(), sent.length)
  assert.ok(sent.every(p => p.recommender.id === auth.user.id))
  assert.equal(await page.getByRole('button', { name: '编辑可见范围', exact: true }).count(), sent.length)
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('labhub_user')))
  assert.equal(cached.id, auth.user.id)
  if (sent.length) {
    await page.getByRole('button', { name: '编辑可见范围', exact: true }).first().click()
    await page.getByRole('dialog', { name: '编辑可见范围', exact: true }).waitFor()
    await page.getByRole('button', { name: '取消', exact: true }).click()
  }
  // Reproduce the screenshot: a stale server ignores sent and returns everyone.
  assert.ok(all.some(p => p.recommender.id !== auth.user.id))
  await page.route('**/api/arxiv/feed?scope=sent', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(all) }))
  await page.getByRole('button', { name: '我发出的', exact: true }).click()
  await page.getByText('后端未正确处理“我发出的”筛选，请重启后端服务至当前版本后重试。', { exact: true }).waitFor()
  assert.equal(await page.locator('.paper-row').count(), 0)
  await page.unroute('**/api/arxiv/feed?scope=sent')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await page.getByRole('status').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.paper-row').count(), sent.length)
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 600)) })
  await page.screenshot({ path: '/tmp/labhub-live-sent-fixed.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS: live sent filter, missing/corrupt user-cache recovery, edit button, stale-backend detection, retry')
} finally { await browser.close() }
