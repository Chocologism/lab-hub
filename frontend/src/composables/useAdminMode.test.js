import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('useAdminMode', () => {
  const STORAGE_KEY = 'labhub_admin_view_mode'
  let store = {}
  let eventListeners = {}

  beforeEach(() => {
    store = {}
    eventListeners = {}

    // Mock localStorage
    global.localStorage = {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, val) => { store[key] = String(val) }),
      removeItem: vi.fn((key) => { delete store[key] }),
      clear: vi.fn(() => { store = {} })
    }

    // Mock window
    global.window = {
      localStorage: global.localStorage,
      addEventListener: vi.fn((event, handler) => {
        if (!eventListeners[event]) eventListeners[event] = []
        eventListeners[event].push(handler)
      }),
      removeEventListener: vi.fn((event, handler) => {
        if (!eventListeners[event]) return
        eventListeners[event] = eventListeners[event].filter(h => h !== handler)
      }),
      dispatchEvent: vi.fn((event) => {
        const type = event.type || (event instanceof CustomEvent ? event.type : 'unknown')
        const handlers = eventListeners[type] || []
        handlers.forEach(h => h(event))
        return true
      })
    }
  })

  afterEach(() => {
    delete global.localStorage
    delete global.window
  })

  it('defaults to admin mode when localStorage is empty', async () => {
    const { getAdminMode, useAdminMode } = await import('./useAdminMode')
    expect(getAdminMode()).toBe('admin')
    const { currentMode, isAdminMode, isUserMode } = useAdminMode()
    expect(currentMode.value).toBe('admin')
    expect(isAdminMode.value).toBe(true)
    expect(isUserMode.value).toBe(false)
  })

  it('can set and persist user mode in localStorage and triggers events', async () => {
    const { setAdminMode, getAdminMode, useAdminMode } = await import('./useAdminMode')
    const { currentMode } = useAdminMode()

    const res = setAdminMode('user')
    expect(res).toBe('user')
    expect(getAdminMode()).toBe('user')
    expect(global.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'user')
    expect(global.window.dispatchEvent).toHaveBeenCalled()
    expect(currentMode.value).toBe('user')
  })

  it('applies view mode to admin user: downgrades role to user in user mode', async () => {
    const { setAdminMode, applyViewMode } = await import('./useAdminMode')
    setAdminMode('user')

    const adminUser = {
      id: 1,
      name: 'Admin User',
      role: 'admin',
      can_manage_seminars: true,
      can_manage_talks: true
    }

    const mapped = applyViewMode(adminUser)
    expect(mapped.role).toBe('user')
    expect(mapped.effective_role).toBe('user')
    expect(mapped.actual_role).toBe('admin')
    expect(mapped.is_admin_account).toBe(true)
    expect(mapped.can_manage_seminars).toBe(false)
    expect(mapped.can_manage_talks).toBe(false)
  })

  it('restores full privileges when switched back to admin mode', async () => {
    const { setAdminMode, applyViewMode } = await import('./useAdminMode')
    setAdminMode('admin')

    const adminUser = {
      id: 1,
      name: 'Admin User',
      role: 'admin',
      actual_role: 'admin',
      can_manage_seminars: true
    }

    const mapped = applyViewMode(adminUser)
    expect(mapped.role).toBe('admin')
    expect(mapped.effective_role).toBe('admin')
    expect(mapped.actual_role).toBe('admin')
    expect(mapped.is_admin_account).toBe(true)
    expect(mapped.can_manage_seminars).toBe(true)
  })

  it('does not alter or elevate non-admin users even in user mode', async () => {
    const { setAdminMode, applyViewMode } = await import('./useAdminMode')
    setAdminMode('user')

    const studentUser = {
      id: 2,
      name: 'Student User',
      role: 'student',
      identity: 'student'
    }

    const mapped = applyViewMode(studentUser)
    expect(mapped.role).toBe('student')
    expect(mapped.actual_role).toBe('student')
    expect(mapped.is_admin_account).toBe(false)
  })

  it('synchronizes cached labhub_user in localStorage when setting mode', async () => {
    const { setAdminMode } = await import('./useAdminMode')
    const initialUser = { id: 1, name: 'Root', role: 'admin', can_manage_seminars: true }
    store['labhub_user'] = JSON.stringify(initialUser)

    setAdminMode('user')
    const updated = JSON.parse(store['labhub_user'])
    expect(updated.role).toBe('user')
    expect(updated.actual_role).toBe('admin')
    expect(updated.is_admin_account).toBe(true)

    setAdminMode('admin')
    const restored = JSON.parse(store['labhub_user'])
    expect(restored.role).toBe('admin')
  })
})
