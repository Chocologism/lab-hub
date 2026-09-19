import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('useThemeStyle', () => {
  const STORAGE_KEY = 'labhub_theme_style'
  let store = {}
  let attrs = {}

  beforeEach(() => {
    store = {}
    attrs = {}

    // Mock localStorage
    global.localStorage = {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, val) => { store[key] = String(val) }),
      removeItem: vi.fn((key) => { delete store[key] }),
      clear: vi.fn(() => { store = {} })
    }

    // Mock window & document
    global.window = {}
    global.document = {
      createElement: vi.fn(() => ({})),
      documentElement: {
        setAttribute: vi.fn((k, v) => { attrs[k] = v }),
        getAttribute: vi.fn((k) => attrs[k] || null),
        removeAttribute: vi.fn((k) => { delete attrs[k] })
      }
    }
  })

  afterEach(() => {
    delete global.localStorage
    delete global.window
    delete global.document
  })

  it('defaults to clouds-static for first-time visitors when localStorage is empty', async () => {
    const { currentThemeStyle } = await import('./useThemeStyle')
    expect(currentThemeStyle.value).toBe('clouds-static')
  })

  it('allows changing theme style and persists to localStorage and DOM', async () => {
    const { useThemeStyle, currentThemeStyle } = await import('./useThemeStyle')
    const { setThemeStyle } = useThemeStyle()

    setThemeStyle('galaxy')
    expect(currentThemeStyle.value).toBe('galaxy')
    expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'galaxy')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme-style', 'galaxy')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-bg-style', 'galaxy')

    setThemeStyle('clouds-static')
    expect(currentThemeStyle.value).toBe('clouds-static')
    expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'clouds-static')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme-style', 'vanta-fog')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-bg-style', 'clouds-static')
  })

  it('supports decoupled color schemes and backgrounds with DOM data attributes', async () => {
    const { useThemeStyle, currentColorScheme, currentBgType, colorSchemes, bgOptions } = await import('./useThemeStyle')
    const { setColorScheme, setBgType } = useThemeStyle()

    expect(colorSchemes).toHaveLength(2)
    expect(colorSchemes.map(s => s.id)).toEqual(['classic-cyan', 'nebula-purple'])
    expect(colorSchemes[0].colors).toBeDefined()
    expect(colorSchemes[0].colors.length).toBeGreaterThanOrEqual(3)

    expect(bgOptions).toHaveLength(4)
    expect(bgOptions.map(b => b.id)).toEqual(['galaxy', 'vanta-fog', 'clouds-static', 'custom-local'])

    // Change color scheme to nebula-purple
    setColorScheme('nebula-purple')
    expect(currentColorScheme.value).toBe('nebula-purple')
    expect(localStorage.setItem).toHaveBeenCalledWith('labhub_color_scheme', 'nebula-purple')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-color-scheme', 'nebula-purple')

    // Change background type to custom-local
    setBgType('custom-local')
    expect(currentBgType.value).toBe('custom-local')
    expect(localStorage.setItem).toHaveBeenCalledWith('labhub_bg_type', 'custom-local')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-bg-type', 'custom-local')
  })
})
