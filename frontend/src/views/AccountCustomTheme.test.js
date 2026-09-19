import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('Custom Color Scheme System', () => {
  let store = {}
  let attrs = {}
  let styles = {}

  beforeEach(() => {
    store = {}
    attrs = {}
    styles = {}

    global.localStorage = {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, val) => { store[key] = String(val) }),
      removeItem: vi.fn((key) => { delete store[key] }),
      clear: vi.fn(() => { store = {} })
    }

    global.window = {}
    global.document = {
      createElement: vi.fn(() => ({})),
      documentElement: {
        setAttribute: vi.fn((k, v) => { attrs[k] = v }),
        getAttribute: vi.fn((k) => attrs[k] || null),
        removeAttribute: vi.fn((k) => { delete attrs[k] }),
        style: {
          setProperty: vi.fn((prop, val) => { styles[prop] = String(val) }),
          getPropertyValue: vi.fn((prop) => styles[prop] || ''),
          removeProperty: vi.fn((prop) => { delete styles[prop] }),
          backgroundColor: ''
        }
      }
    }
  })

  afterEach(() => {
    delete global.localStorage
    delete global.window
    delete global.document
  })

  it('calculates correct luminance and contrast accent text ink', async () => {
    const { deriveThemePalette, calculateLuminance } = await import('../composables/useThemeStyle')

    // Light accent (yellow/amber) should have dark text (#041019)
    const amberLum = calculateLuminance(251, 191, 36)
    expect(amberLum).toBeGreaterThan(140)
    const amberPalette = deriveThemePalette('#fbbf24', '#181206')
    expect(amberPalette.accentInk).toBe('#041019')

    // Deep blue accent has lower luminance and gets white text (#ffffff)
    const darkPalette = deriveThemePalette('#1d4ed8', '#030712')
    const darkLum = calculateLuminance(29, 78, 216)
    expect(darkLum).toBeLessThanOrEqual(140)
    expect(darkPalette.accentInk).toBe('#ffffff')
  })

  it('derives hover accentStrong and translucent panel and surface colors', async () => {
    const { deriveThemePalette } = await import('../composables/useThemeStyle')

    const palette = deriveThemePalette('#38bdf8', '#071326')
    expect(palette.primaryColor).toBe('#38bdf8')
    expect(palette.baseColor).toBe('#071326')
    expect(palette.panelColor).toContain('rgba(')
    expect(palette.surfaceColor).toContain('rgba(')
    expect(palette.lineColor).toContain('rgba(')
    expect(palette.panelHex).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('supports manual panel color override when autoDerive is false', async () => {
    const { deriveThemePalette, hexToRgb } = await import('../composables/useThemeStyle')

    const palette = deriveThemePalette('#38bdf8', '#071326', '#1e293b')
    expect(palette.panelHex).toBe('#1e293b')
    const rgb = hexToRgb('#1e293b')
    expect(palette.panelColor).toBe(`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.82)`)
  })

  it('provides 6 curated dark-mode inspiration templates', async () => {
    const { CUSTOM_PRESET_TEMPLATES } = await import('../composables/useThemeStyle')

    expect(CUSTOM_PRESET_TEMPLATES.length).toBe(6)
    const names = CUSTOM_PRESET_TEMPLATES.map(t => t.name)
    expect(names).toContain('极光深蓝')
    expect(names).toContain('翡翠墨玉')
    expect(names).toContain('琥珀炽金')
    expect(names).toContain('绯红极夜')
    expect(names).toContain('赛博霓虹')
    expect(names).toContain('曜石碳灰')

    for (const tpl of CUSTOM_PRESET_TEMPLATES) {
      expect(tpl.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(tpl.baseColor).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(tpl.panelHex).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('saves custom color scheme to localStorage and applies CSS variables when active', async () => {
    const {
      useThemeStyle,
      saveCustomColorScheme,
      getSavedCustomColorScheme,
      CUSTOM_COLOR_SCHEME_KEY
    } = await import('../composables/useThemeStyle')
    const { setColorScheme, currentColorScheme } = useThemeStyle()

    // Switch to custom
    setColorScheme('custom')
    expect(currentColorScheme.value).toBe('custom')
    expect(attrs['data-color-scheme']).toBe('custom')

    // Save new custom colors
    const ok = saveCustomColorScheme({
      name: '琥珀炽金',
      primaryColor: '#fbbf24',
      baseColor: '#181206',
      autoDerive: true
    })
    expect(ok).toBe(true)

    // Verify localStorage item was stored
    expect(localStorage.setItem).toHaveBeenCalledWith(
      CUSTOM_COLOR_SCHEME_KEY,
      expect.stringContaining('琥珀炽金')
    )

    const saved = getSavedCustomColorScheme()
    expect(saved.name).toBe('琥珀炽金')
    expect(saved.primaryColor).toBe('#fbbf24')
    expect(saved.baseColor).toBe('#181206')

    // Verify DOM CSS variables were injected
    expect(styles['--accent']).toBe('#fbbf24')
    expect(styles['--bg']).toBe('#181206')
    expect(styles['--accent-ink']).toBe('#041019')

    // When switching back to classic-cyan, custom inline CSS variables are cleared
    setColorScheme('classic-cyan')
    expect(attrs['data-color-scheme']).toBe('classic-cyan')
    expect(document.documentElement.style.removeProperty).toHaveBeenCalledWith('--accent')
    expect(document.documentElement.style.removeProperty).toHaveBeenCalledWith('--bg')
  })

  it('supports real-time live preview broadcasting to document.documentElement via applyPreviewPaletteToDOM', async () => {
    const { applyPreviewPaletteToDOM, deriveThemePalette } = await import('../composables/useThemeStyle')

    const preview = deriveThemePalette('#fbbf24', '#181206', '#2b200b')
    applyPreviewPaletteToDOM(preview)

    expect(attrs['data-color-scheme']).toBe('custom')
    expect(styles['--accent']).toBe('#fbbf24')
    expect(styles['--bg']).toBe('#181206')
    expect(styles['--panel-solid']).toBe('#2b200b')
    expect(styles['--panel']).toBe('rgba(43, 32, 11, 0.82)')
    expect(styles['--line']).toContain('rgba(')
  })

  it('binds sidebar and all cards directly to theme CSS variables under custom scheme in index.css', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(__dirname, '../index.css')
    const css = fs.readFileSync(cssPath, 'utf-8')

    // Base sidebar uses var(--panel)
    expect(css).toContain('.forecast-sidebar { position:fixed; z-index:40; top:0; bottom:0; left:0; width:var(--sidebar); display:flex; align-items:center; flex-direction:column; padding:16px 0 20px; border-right:1px solid var(--line); background:var(--panel);')
    expect(css).not.toContain('.forecast-sidebar { position:fixed; z-index:40; top:0; bottom:0; left:0; width:var(--sidebar); display:flex; align-items:center; flex-direction:column; padding:16px 0 20px; border-right:1px solid var(--line); background:rgba(12,10,26,.82);')

    // High specificity custom scheme rules for sidebar
    expect(css).toContain('[data-color-scheme="custom"] .forecast-sidebar {')
    expect(css).toContain('[data-color-scheme="custom"] .forecast-sidebar.is-floating {')

    // Cards explicitly use var(--panel) and var(--line)
    expect(css).toContain('[data-color-scheme="custom"] .panel,')
    expect(css).toContain('[data-color-scheme="custom"] .glass-card,')
    expect(css).toContain('[data-color-scheme="custom"] .account-section,')
    expect(css).toContain('[data-color-scheme="custom"] .theme-card,')
    expect(css).toContain('[data-color-scheme="custom"] .seminar-card,')
    expect(css).toContain('background: var(--panel) !important;')
    expect(css).toContain('border-color: var(--line) !important;')
  })
})
