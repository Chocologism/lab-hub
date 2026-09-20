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

  it('initDemoAuth correctly injects default experience token and user', () => {
    localStorage.setItem('labhub_force_demo', '1')
    expect(isDemoMode()).toBe(true)

    initDemoAuth()
    const token = localStorage.getItem('labhub_token')
    const userRaw = localStorage.getItem('labhub_user')

    expect(token).toBeTruthy()
    expect(userRaw).toBeTruthy()
    const user = JSON.parse(userRaw)
    expect(user.name).toContain('陈晨')
    expect(user.identity).toBe('student')
  })

  it('switchDemoRole switches between teacher and student roles', () => {
    const teacher = switchDemoRole('teacher')
    expect(teacher.identity).toBe('teacher')
    expect(teacher.name).toContain('李华')

    const student = switchDemoRole('student')
    expect(student.identity).toBe('student')
    expect(student.name).toContain('陈晨')
  })

  it('demoAxiosAdapter serves system status and settings', async () => {
    initDemoStorage(true)
    const res = await demoAxiosAdapter({ url: '/api/system/status', method: 'get' })
    expect(res.status).toBe(200)
    expect(res.data.initialized).toBe(true)
    expect(res.data.lab_short_name).toBe('LabOrbit')
  })

  it('demoAxiosAdapter serves seminars and upcoming meeting', async () => {
    initDemoStorage(true)
    initDemoAuth()

    const listRes = await demoAxiosAdapter({ url: '/api/seminars', method: 'get' })
    expect(listRes.status).toBe(200)
    expect(listRes.data.length).toBeGreaterThanOrEqual(3)

    const upcomingRes = await demoAxiosAdapter({ url: '/api/seminars/mine/upcoming', method: 'get' })
    expect(upcomingRes.status).toBe(200)
    expect(upcomingRes.data).toBeTruthy()
    expect(upcomingRes.data.topic).toBeTruthy()
  })

  it('demoAxiosAdapter handles arXiv paper toggle read and likes', async () => {
    initDemoStorage(true)
    const feedRes = await demoAxiosAdapter({ url: '/api/arxiv/feed', method: 'get' })
    expect(feedRes.status).toBe(200)
    const firstPaper = feedRes.data[0]

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
