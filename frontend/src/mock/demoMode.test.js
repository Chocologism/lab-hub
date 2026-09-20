import { describe, it, expect, beforeEach } from 'vitest'
import { isDemoMode, initDemoAuth, switchDemoRole } from './isDemo'
import { demoAxiosAdapter, initDemoStorage, resetDemoStorage } from './demoAdapter'
import { DEMO_MEMBERS, DEMO_SEMINARS, DEMO_ARXIV_PAPERS } from './demoData'

const store = {}
const mockLocalStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: (k) => { delete store[k] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) }
}
globalThis.localStorage = mockLocalStorage

describe('Demo Mode & Mock Adapter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initDemoAuth correctly injects default experience token and admin user', () => {
    localStorage.setItem('labhub_force_demo', '1')
    expect(isDemoMode()).toBe(true)

    initDemoAuth()
    const token = localStorage.getItem('labhub_token')
    const userRaw = localStorage.getItem('labhub_user')

    expect(token).toBeTruthy()
    expect(userRaw).toBeTruthy()
    const user = JSON.parse(userRaw)
    expect(user.name).toContain('李华')
    expect(user.role).toBe('admin')
  })

  it('switchDemoRole switches between admin and member roles', () => {
    const member = switchDemoRole('member')
    expect(member.role).toBe('member')
    expect(member.name).toContain('陈晨')

    const admin = switchDemoRole('admin')
    expect(admin.role).toBe('admin')
    expect(admin.name).toContain('李华')
  })

  it('demoAxiosAdapter serves system status and settings', async () => {
    initDemoStorage(true)
    const res = await demoAxiosAdapter({ url: '/api/system/status', method: 'get' })
    expect(res.status).toBe(200)
    expect(res.data.initialized).toBe(true)
    expect(res.data.lab_short_name).toBe('LabOrbit')
  })

  it('demoAxiosAdapter serves seminars and upcoming schedule countdowns', async () => {
    initDemoStorage(true)
    initDemoAuth()

    const listRes = await demoAxiosAdapter({ url: '/api/seminars', method: 'get' })
    expect(listRes.status).toBe(200)
    expect(listRes.data.length).toBeGreaterThanOrEqual(3)

    const upcomingRes = await demoAxiosAdapter({ url: '/api/seminars/mine/upcoming', method: 'get' })
    expect(upcomingRes.status).toBe(200)
    expect(upcomingRes.data).toBeTruthy()
    expect(upcomingRes.data.main).toBeTruthy()
    expect(upcomingRes.data.main.days_until).toBeDefined()
    expect(upcomingRes.data.arxiv).toBeTruthy()
    expect(upcomingRes.data.arxiv.days_until).toBeDefined()
  })

  it('demoAxiosAdapter serves library, resources, mailbox and feedback endpoints cleanly', async () => {
    initDemoStorage(true)
    initDemoAuth()

    // 1. Library with query parameters
    const libRes = await demoAxiosAdapter({ url: '/api/library?q=&source=all', method: 'get' })
    expect(libRes.status).toBe(200)
    expect(Array.isArray(libRes.data)).toBe(true)
    expect(libRes.data.length).toBeGreaterThanOrEqual(2)

    // 2. Resource hub categories & books
    const catRes = await demoAxiosAdapter({ url: '/api/resources/categories', method: 'get' })
    expect(catRes.status).toBe(200)
    expect(catRes.data.some(c => c.name === '教材')).toBe(true)

    const booksRes = await demoAxiosAdapter({ url: '/api/resources/books?category=教材', method: 'get' })
    expect(booksRes.status).toBe(200)
    expect(Array.isArray(booksRes.data)).toBe(true)
    expect(booksRes.data.length).toBeGreaterThanOrEqual(1)

    // 3. Mailbox config and emails
    const mailConfigRes = await demoAxiosAdapter({ url: '/api/mailbox/config', method: 'get' })
    expect(mailConfigRes.status).toBe(200)
    expect(mailConfigRes.data.has_config).toBe(true)

    const emailsRes = await demoAxiosAdapter({ url: '/api/mailbox/emails', method: 'get' })
    expect(emailsRes.status).toBe(200)
    expect(Array.isArray(emailsRes.data)).toBe(true)
    expect(emailsRes.data.length).toBeGreaterThanOrEqual(4)

    // 4. Feedback endpoints
    const feedbackRes = await demoAxiosAdapter({ url: '/api/feedback', method: 'get' })
    expect(feedbackRes.status).toBe(200)
    expect(Array.isArray(feedbackRes.data)).toBe(true)
    expect(feedbackRes.data.length).toBeGreaterThanOrEqual(2)

    const unreadRes = await demoAxiosAdapter({ url: '/api/feedback/unread', method: 'get' })
    expect(unreadRes.status).toBe(200)
    expect(unreadRes.data.count).toBe(0)
  })

  it('demoAxiosAdapter handles arXiv paper toggle read and likes with full recommender', async () => {
    initDemoStorage(true)
    const feedRes = await demoAxiosAdapter({ url: '/api/arxiv/feed', method: 'get' })
    expect(feedRes.status).toBe(200)
    const firstPaper = feedRes.data[0]
    expect(firstPaper.recommender).toBeDefined()
    expect(firstPaper.recommender.id).toBeDefined()

    // Toggle read
    const toggleReadRes = await demoAxiosAdapter({
      url: `/api/arxiv/${firstPaper.id}/read-toggle`,
      method: 'post'
    })
    expect(toggleReadRes.status).toBe(200)
    expect(toggleReadRes.data.read).toBe(!firstPaper.read)

    // Toggle like
    const initialLikes = firstPaper.likes_count
    const toggleLikeRes = await demoAxiosAdapter({
      url: `/api/arxiv/${firstPaper.id}/like`,
      method: 'post'
    })
    expect(toggleLikeRes.status).toBe(200)
    expect(toggleLikeRes.data.user_liked).toBe(!firstPaper.user_liked)
  })

  it('demoAxiosAdapter gracefully handles unknown endpoints with generic mock fallback', async () => {
    const unknownRes = await demoAxiosAdapter({ url: '/api/some/custom/endpoint', method: 'post' })
    expect(unknownRes.status).toBe(200)
    expect(unknownRes.data.success).toBe(true)
  })
})
