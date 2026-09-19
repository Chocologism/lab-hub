import { ref } from 'vue'

export const COLOR_SCHEMES = [
  {
    id: 'classic-cyan',
    name: '经典冷青与玄青',
    subtitle: '静谧冷青高光 · 经典玄青基底',
    colors: ['#081f28', '#c5e6df', '#102f33'], // Base, Primary Accent, Secondary Surface
    primaryColor: '#c5e6df',
    baseColor: '#081f28',
    surfaceColor: '#102f33'
  },
  {
    id: 'nebula-purple',
    name: '星云紫与深曜黑',
    subtitle: '深空星云紫高光 · 曜黑深邃基底',
    colors: ['#03020a', '#b89bf8', '#16122e'], // Base, Primary Accent, Secondary Surface
    primaryColor: '#b89bf8',
    baseColor: '#03020a',
    surfaceColor: '#16122e'
  }
]

export const BG_OPTIONS = [
  {
    id: 'galaxy',
    name: '星际穿越（动态）',
    subtitle: '动态宇宙星空 · WebGL 粒子与引力交互',
    type: 'dynamic'
  },
  {
    id: 'vanta-fog',
    name: '水波云雾（动态）',
    subtitle: '动态流体水雾 · WebGL 实时着色器',
    type: 'dynamic'
  },
  {
    id: 'clouds-static',
    name: '云山日光（静态）',
    subtitle: '静态日光云海 · 静谧清晰',
    type: 'static'
  },
  {
    id: 'custom-local',
    name: '自定义本地背景',
    subtitle: '支持本地高清图片与静音视频 · 纯本地加载不上云',
    type: 'custom'
  }
]

// 兼容旧版 THEME_STYLES 导出
export const THEME_STYLES = [
  {
    id: 'galaxy',
    name: '星际穿越（动态）',
    subtitle: '星云紫与深曜黑',
    colors: ['#03020a', '#b89bf8', '#16122e'],
    primaryColor: '#b89bf8',
    bgPreview: '#03020a'
  },
  {
    id: 'vanta-fog',
    name: '水波云雾（动态）',
    subtitle: '动态水雾 · 经典冷青与玄青',
    colors: ['#081f28', '#c5e6df', '#102f33'],
    primaryColor: '#c5e6df',
    bgPreview: '#081f28'
  },
  {
    id: 'clouds-static',
    name: '云山日光（静态）',
    subtitle: '云山日光 · 经典冷青与玄青',
    colors: ['#081f28', '#c5e6df', '#102f33'],
    primaryColor: '#c5e6df',
    bgPreview: '#081f28'
  }
]

const COLOR_SCHEME_KEY = 'labhub_color_scheme'
const BG_TYPE_KEY = 'labhub_bg_type'
const LEGACY_STORAGE_KEY = 'labhub_theme_style'
export const CUSTOM_COLOR_SCHEME_KEY = 'labhub_custom_color_scheme'

export const DEFAULT_CUSTOM_COLOR_SCHEME = {
  id: 'custom',
  name: '自定义配色',
  primaryColor: '#38bdf8', // 极光天蓝
  baseColor: '#071326',    // 深邃星海基底
  panelHex: '#0d203d',
  panelColor: 'rgba(13, 32, 61, 0.82)',
  surfaceColor: 'rgba(8, 22, 42, 0.75)',
  accentInk: '#041019',
  accentStrong: '#7dd3fc',
  lineColor: 'rgba(56, 189, 248, 0.20)',
  raised: 'rgba(56, 189, 248, 0.12)',
  glass: 'rgba(13, 32, 61, 0.50)',
  autoDerive: true
}

export const CUSTOM_PRESET_TEMPLATES = [
  {
    id: 'aurora-blue',
    name: '极光深蓝',
    subtitle: '清澈天蓝高光 · 深海沉静基底',
    primaryColor: '#38bdf8',
    baseColor: '#071326',
    panelHex: '#0d203d',
    panelColor: 'rgba(13, 32, 61, 0.82)'
  },
  {
    id: 'emerald-jade',
    name: '翡翠墨玉',
    subtitle: '青翠竹影高光 · 玄墨幽林基底',
    primaryColor: '#34d399',
    baseColor: '#051812',
    panelHex: '#0c2d24',
    panelColor: 'rgba(12, 45, 36, 0.82)'
  },
  {
    id: 'amber-gold',
    name: '琥珀炽金',
    subtitle: '辉煌暖金高光 · 沉稳玄棕基底',
    primaryColor: '#fbbf24',
    baseColor: '#181206',
    panelHex: '#2b200b',
    panelColor: 'rgba(43, 32, 11, 0.82)'
  },
  {
    id: 'crimson-rose',
    name: '绯红极夜',
    subtitle: '蔷薇绯红高光 · 极夜深暗基底',
    primaryColor: '#fb7185',
    baseColor: '#1a080f',
    panelHex: '#2e101c',
    panelColor: 'rgba(46, 16, 28, 0.82)'
  },
  {
    id: 'cyber-neon',
    name: '赛博霓虹',
    subtitle: '荧光玫红高光 · 幻彩暗紫基底',
    primaryColor: '#f43f5e',
    baseColor: '#0d0b1a',
    panelHex: '#1a1633',
    panelColor: 'rgba(26, 22, 51, 0.82)'
  },
  {
    id: 'obsidian-slate',
    name: '曜石碳灰',
    subtitle: '高级冷灰高光 · 纯粹石墨基底',
    primaryColor: '#94a3b8',
    baseColor: '#090d16',
    panelHex: '#161e2e',
    panelColor: 'rgba(22, 30, 46, 0.82)'
  }
]

export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 56, g: 189, b: 248 }
  const trimmed = hex.trim()
  const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgbMatch) {
    return {
      r: Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10))),
      g: Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10))),
      b: Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10)))
    }
  }
  let clean = trimmed.replace(/^#/, '')
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('')
  }
  const num = parseInt(clean, 16)
  if (isNaN(num) || clean.length !== 6) {
    return { r: 56, g: 189, b: 248 }
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  }
}

export function rgbToHex(r, g, b) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('')
}

export function calculateLuminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function deriveThemePalette(primaryHex, baseHex, customPanelHex = null) {
  const p = hexToRgb(primaryHex)
  const b = hexToRgb(baseHex)

  // 计算强调色背景文字对比反色
  const lum = calculateLuminance(p.r, p.g, p.b)
  const accentInk = lum > 140 ? '#041019' : '#ffffff'

  // 计算悬停高亮色 (偏亮)
  const strongR = Math.min(255, Math.round(p.r * 1.15 + 15))
  const strongG = Math.min(255, Math.round(p.g * 1.15 + 15))
  const strongB = Math.min(255, Math.round(p.b * 1.15 + 15))
  const accentStrong = rgbToHex(strongR, strongG, strongB)

  // 面板色：如果未手动指定，则按底色 85% + 主色 15% 进行融合，并施加 0.82 不透明度
  let panelColor = ''
  let surfaceColor = ''
  let panelHex = ''
  if (customPanelHex) {
    const cp = hexToRgb(customPanelHex)
    panelHex = rgbToHex(cp.r, cp.g, cp.b)
    panelColor = `rgba(${cp.r}, ${cp.g}, ${cp.b}, 0.82)`
    const sR = Math.max(0, Math.round(cp.r * 0.75))
    const sG = Math.max(0, Math.round(cp.g * 0.75))
    const sB = Math.max(0, Math.round(cp.b * 0.75))
    surfaceColor = `rgba(${sR}, ${sG}, ${sB}, 0.75)`
  } else {
    const panR = Math.round(b.r * 0.85 + p.r * 0.15)
    const panG = Math.round(b.g * 0.85 + p.g * 0.15)
    const panB = Math.round(b.b * 0.85 + p.b * 0.15)
    panelHex = rgbToHex(panR, panG, panB)
    panelColor = `rgba(${panR}, ${panG}, ${panB}, 0.82)`

    const surR = Math.round(b.r * 0.92 + p.r * 0.08)
    const surG = Math.round(b.g * 0.92 + p.g * 0.08)
    const surB = Math.round(b.b * 0.92 + p.b * 0.08)
    surfaceColor = `rgba(${surR}, ${surG}, ${surB}, 0.75)`
  }

  const lineColor = `rgba(${p.r}, ${p.g}, ${p.b}, 0.20)`
  const raisedColor = `rgba(${p.r}, ${p.g}, ${p.b}, 0.12)`
  const glassColor = `rgba(${p.r}, ${p.g}, ${p.b}, 0.25)`

  return {
    id: 'custom',
    name: '自定义配色',
    primaryColor: primaryHex,
    baseColor: baseHex,
    panelHex,
    panelColor,
    surfaceColor,
    accentInk,
    accentStrong,
    lineColor,
    raised: raisedColor,
    glass: glassColor
  }
}

export function getSavedCustomColorScheme() {
  if (typeof window === 'undefined') return { ...DEFAULT_CUSTOM_COLOR_SCHEME }
  try {
    const raw = localStorage.getItem(CUSTOM_COLOR_SCHEME_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.primaryColor && parsed.baseColor) {
        const derived = deriveThemePalette(
          parsed.primaryColor,
          parsed.baseColor,
          parsed.autoDerive === false ? (parsed.panelHex || parsed.panelColor) : (parsed.panelHex || null)
        )
        return {
          ...DEFAULT_CUSTOM_COLOR_SCHEME,
          ...parsed,
          ...derived,
          panelHex: (parsed.autoDerive === false && parsed.panelHex) ? parsed.panelHex : derived.panelHex,
          name: parsed.name || derived.name,
          autoDerive: parsed.autoDerive !== false,
          id: 'custom'
        }
      }
    }
  } catch (e) {
    console.warn('Failed to parse custom color scheme from localStorage:', e)
  }
  return { ...DEFAULT_CUSTOM_COLOR_SCHEME }
}

export const customColorScheme = ref(getSavedCustomColorScheme())

export function saveCustomColorScheme(palette) {
  try {
    const derived = deriveThemePalette(
      palette.primaryColor,
      palette.baseColor,
      palette.autoDerive ? null : (palette.panelColor || palette.panelHex)
    )
    const merged = {
      ...DEFAULT_CUSTOM_COLOR_SCHEME,
      ...palette,
      ...derived,
      panelHex: (palette.autoDerive === false && palette.panelHex) ? palette.panelHex : derived.panelHex,
      name: palette.name || derived.name,
      autoDerive: palette.autoDerive !== false,
      id: 'custom'
    }
    customColorScheme.value = merged
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_COLOR_SCHEME_KEY, JSON.stringify(merged))
    }
    if (currentColorScheme.value === 'custom') {
      applyThemeToDOM('custom', currentBgType.value)
    }
    return true
  } catch (e) {
    console.error('Failed to save custom color scheme:', e)
    return false
  }
}

function getInitialColorScheme() {
  if (typeof window === 'undefined') return 'classic-cyan'
  try {
    const saved = localStorage.getItem(COLOR_SCHEME_KEY)
    if (saved === 'classic-cyan' || saved === 'nebula-purple' || saved === 'custom') {
      return saved
    }
    // 从旧版兼容器迁移
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy === 'galaxy') return 'nebula-purple'
  } catch (e) {
    console.warn('Failed to read color scheme from localStorage:', e)
  }
  return 'classic-cyan'
}

function getInitialBgType() {
  if (typeof window === 'undefined') return 'clouds-static'
  try {
    const saved = localStorage.getItem(BG_TYPE_KEY)
    if (saved === 'galaxy' || saved === 'vanta-fog' || saved === 'clouds-static' || saved === 'custom-local') {
      return saved
    }
    // 从旧版兼容器迁移
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy === 'galaxy' || legacy === 'vanta-fog' || legacy === 'clouds-static') {
      return legacy
    }
  } catch (e) {
    console.warn('Failed to read bg type from localStorage:', e)
  }
  return 'clouds-static'
}

export const currentColorScheme = ref(getInitialColorScheme())
export const currentBgType = ref(getInitialBgType())

// 兼容器：保留 currentThemeStyle 响应式对象
function resolveLegacyTheme(scheme, bg) {
  if (scheme === 'nebula-purple') return 'galaxy'
  if (scheme === 'custom') return 'custom'
  if (bg === 'vanta-fog') return 'vanta-fog'
  return 'clouds-static'
}

export const currentThemeStyle = ref(resolveLegacyTheme(currentColorScheme.value, currentBgType.value))

const CUSTOM_CSS_VARS = [
  '--bg',
  '--panel',
  '--panel-solid',
  '--surface',
  '--raised',
  '--glass',
  '--text',
  '--soft',
  '--muted',
  '--accent',
  '--accent-strong',
  '--accent-ink',
  '--line',
  '--focus'
]

export function applyThemeToDOM(scheme = currentColorScheme.value, bg = currentBgType.value) {
  if (typeof document === 'undefined' || !document.documentElement) return
  const doc = document.documentElement

  // 如果传入的是旧版风格名称（如 'galaxy' / 'vanta-fog' / 'clouds-static'），智能解构为对应的配色与背景
  let actualScheme = scheme
  let actualBg = bg
  if (scheme === 'galaxy') {
    actualScheme = 'nebula-purple'
    if (!bg || bg === 'galaxy') actualBg = currentBgType.value || 'galaxy'
  } else if (scheme === 'vanta-fog') {
    actualScheme = 'classic-cyan'
    if (!bg || bg === 'vanta-fog') actualBg = currentBgType.value || 'vanta-fog'
  } else if (scheme === 'clouds-static') {
    actualScheme = 'classic-cyan'
    if (!bg || bg === 'clouds-static') actualBg = currentBgType.value || 'clouds-static'
  }

  if (actualScheme !== 'nebula-purple' && actualScheme !== 'custom') {
    actualScheme = 'classic-cyan'
  }

  actualBg = (actualBg === 'galaxy' || actualBg === 'vanta-fog' || actualBg === 'clouds-static' || actualBg === 'custom-local')
    ? actualBg
    : (currentBgType.value || 'clouds-static')

  const legacyTheme = actualScheme === 'nebula-purple' ? 'galaxy' : (actualScheme === 'custom' ? 'custom' : 'vanta-fog')

  // 1. 设置解耦属性
  doc.setAttribute('data-color-scheme', actualScheme)
  doc.setAttribute('data-bg-type', actualBg)

  // 2. 兼容旧版属性
  doc.setAttribute('data-theme-style', legacyTheme)
  doc.setAttribute('data-bg-style', actualBg)

  // 3. 根节点底色与背景图
  if (doc.style) {
    if (actualScheme === 'custom') {
      const palette = getSavedCustomColorScheme()
      doc.style.setProperty('--bg', palette.baseColor)
      doc.style.setProperty('--panel', palette.panelColor)
      doc.style.setProperty('--panel-solid', palette.panelHex || '#0d203d')
      doc.style.setProperty('--surface', palette.surfaceColor)
      doc.style.setProperty('--raised', palette.raised || 'rgba(255, 255, 255, 0.1)')
      doc.style.setProperty('--glass', palette.glass || 'rgba(0, 0, 0, 0.3)')
      doc.style.setProperty('--text', '#f8fafc')
      doc.style.setProperty('--soft', '#cbd5e1')
      doc.style.setProperty('--muted', '#94a3b8')
      doc.style.setProperty('--accent', palette.primaryColor)
      doc.style.setProperty('--accent-strong', palette.accentStrong || palette.primaryColor)
      doc.style.setProperty('--accent-ink', palette.accentInk || '#000000')
      doc.style.setProperty('--line', palette.lineColor)
      doc.style.setProperty('--focus', palette.primaryColor)
      doc.style.backgroundColor = palette.baseColor
    } else {
      // 切换为预设方案时，移除内联自定义 CSS 变量，确保 index.css 规则干净生效
      CUSTOM_CSS_VARS.forEach(v => {
        if (typeof doc.style.removeProperty === 'function') {
          doc.style.removeProperty(v)
        }
      })
      const baseBg = actualScheme === 'nebula-purple' ? '#03020a' : '#081f28'
      doc.style.backgroundColor = baseBg
    }

    if (actualBg === 'clouds-static') {
      doc.style.backgroundImage = "url('/assets/forecast/forecast-clouds-drift-seamless.jpg')"
      doc.style.backgroundPosition = 'center center'
      doc.style.backgroundSize = 'cover'
      doc.style.backgroundRepeat = 'no-repeat'
    } else {
      doc.style.backgroundImage = 'none'
    }
  }
}

export function applyPreviewPaletteToDOM(palette) {
  if (typeof document === 'undefined' || !document.documentElement || !palette) return
  const doc = document.documentElement
  doc.setAttribute('data-color-scheme', 'custom')
  doc.setAttribute('data-theme-style', 'custom')
  if (doc.style) {
    doc.style.setProperty('--bg', palette.baseColor)
    doc.style.setProperty('--panel', palette.panelColor)
    doc.style.setProperty('--panel-solid', palette.panelHex || '#0d203d')
    doc.style.setProperty('--surface', palette.surfaceColor)
    doc.style.setProperty('--raised', palette.raised || 'rgba(255, 255, 255, 0.1)')
    doc.style.setProperty('--glass', palette.glass || 'rgba(0, 0, 0, 0.3)')
    doc.style.setProperty('--text', '#f8fafc')
    doc.style.setProperty('--soft', '#cbd5e1')
    doc.style.setProperty('--muted', '#94a3b8')
    doc.style.setProperty('--accent', palette.primaryColor)
    doc.style.setProperty('--accent-strong', palette.accentStrong || palette.primaryColor)
    doc.style.setProperty('--accent-ink', palette.accentInk || '#000000')
    doc.style.setProperty('--line', palette.lineColor)
    doc.style.setProperty('--focus', palette.primaryColor)
    doc.style.backgroundColor = palette.baseColor
  }
}

// 确保首次加载时 DOM 属性与状态同步
applyThemeToDOM(currentColorScheme.value, currentBgType.value)

export function useThemeStyle() {
  function setColorScheme(scheme) {
    if (scheme !== 'classic-cyan' && scheme !== 'nebula-purple' && scheme !== 'custom') return
    currentColorScheme.value = scheme
    currentThemeStyle.value = resolveLegacyTheme(scheme, currentBgType.value)
    applyThemeToDOM(scheme, currentBgType.value)
    try {
      localStorage.setItem(COLOR_SCHEME_KEY, scheme)
      localStorage.setItem(LEGACY_STORAGE_KEY, currentThemeStyle.value)
    } catch (e) {
      console.warn('Failed to save color scheme to localStorage:', e)
    }
  }

  function setBgType(bgType) {
    if (bgType !== 'galaxy' && bgType !== 'vanta-fog' && bgType !== 'clouds-static' && bgType !== 'custom-local') return
    currentBgType.value = bgType
    currentThemeStyle.value = resolveLegacyTheme(currentColorScheme.value, bgType)
    applyThemeToDOM(currentColorScheme.value, bgType)
    try {
      localStorage.setItem(BG_TYPE_KEY, bgType)
      localStorage.setItem(LEGACY_STORAGE_KEY, currentThemeStyle.value)
    } catch (e) {
      console.warn('Failed to save bg type to localStorage:', e)
    }
  }

  // 兼容旧版 setThemeStyle 调用
  function setThemeStyle(style) {
    if (style === 'galaxy') {
      setColorScheme('nebula-purple')
      setBgType('galaxy')
    } else if (style === 'vanta-fog') {
      setColorScheme('classic-cyan')
      setBgType('vanta-fog')
    } else if (style === 'clouds-static') {
      setColorScheme('classic-cyan')
      setBgType('clouds-static')
    }
  }

  return {
    currentColorScheme,
    currentBgType,
    currentThemeStyle,
    colorSchemes: COLOR_SCHEMES,
    bgOptions: BG_OPTIONS,
    themeStyles: THEME_STYLES,
    customColorScheme,
    customPresetTemplates: CUSTOM_PRESET_TEMPLATES,
    setColorScheme,
    setBgType,
    setThemeStyle,
    saveCustomColorScheme,
    deriveThemePalette,
    applyPreviewPaletteToDOM,
    applyThemeToDOM,
    hexToRgb,
    rgbToHex
  }
}

export { COLOR_SCHEMES as colorSchemes, BG_OPTIONS as bgOptions, THEME_STYLES as themeStyles }

