import { ref } from 'vue'
import {
  getLocalFont,
  getFontMode,
  setFontMode,
  removeLocalFont,
  removeAllLocalFonts
} from '../utils/localFontStorage'

export const DEFAULT_FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
export const CUSTOM_UNIFIED_FAMILY = 'CustomUnifiedFont'
export const CUSTOM_EN_FAMILY = 'CustomEnFont'
export const CUSTOM_ZH_FAMILY = 'CustomZhFont'
export const CUSTOM_FONT_FAMILY = 'CustomUserFont' // 兼容旧版命名

export const LATIN_UNICODE_RANGE = 'U+0000-024F, U+0259, U+1E00-1EFF, U+2000-206F, U+2070-209F, U+20A0-20CF, U+2100-214F, U+2200-22FF'

export const currentFontInfo = ref(null)
export const fontConfig = ref({
  mode: 'unified',
  unified: null,
  en: null,
  zh: null,
  hasCustom: false
})
export const isFontLoading = ref(false)

const activeFaces = {
  unified: null,
  en: null,
  zh: null
}

const activeBlobUrls = {
  unified: null,
  en: null,
  zh: null
}

let isInitialized = false

function unmountFace(slot) {
  if (activeFaces[slot] && typeof document !== 'undefined' && document.fonts) {
    try {
      document.fonts.delete(activeFaces[slot])
    } catch (e) {}
  }
  activeFaces[slot] = null

  if (activeBlobUrls[slot]) {
    try {
      URL.revokeObjectURL(activeBlobUrls[slot])
    } catch (e) {}
    activeBlobUrls[slot] = null
  }
}

async function mountFace(slot, familyName, blob, options = {}) {
  unmountFace(slot)
  if (!blob) return null

  const blobUrl = URL.createObjectURL(blob)
  activeBlobUrls[slot] = blobUrl

  if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
    const face = new FontFace(familyName, `url(${blobUrl})`, {
      style: 'normal',
      weight: '100 900',
      ...options
    })
    await face.load()
    document.fonts.add(face)
    activeFaces[slot] = face
    return face
  }
  return null
}

/**
 * 刷新并应用当前字体配置（支持统一模式与分离模式）
 */
export async function refreshFontConfig() {
  isFontLoading.value = true
  const mode = getFontMode()

  try {
    if (mode === 'unified') {
      const unifiedRecord = await getLocalFont('unified')
      unmountFace('en')
      unmountFace('zh')

      if (unifiedRecord && unifiedRecord.blob) {
        await mountFace('unified', CUSTOM_UNIFIED_FAMILY, unifiedRecord.blob)
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--font', `'${CUSTOM_UNIFIED_FAMILY}', ${DEFAULT_FONT_STACK}`)
          document.documentElement.setAttribute('data-custom-font', 'unified')
        }
        try {
          localStorage.setItem('labhub_custom_font_active', 'true')
          localStorage.setItem('labhub_custom_font_name', unifiedRecord.name)
        } catch (e) {}

        currentFontInfo.value = {
          name: unifiedRecord.name,
          format: unifiedRecord.format,
          size: unifiedRecord.size,
          active: true
        }
        fontConfig.value = {
          mode: 'unified',
          unified: { name: unifiedRecord.name, format: unifiedRecord.format, size: unifiedRecord.size },
          en: null,
          zh: null,
          hasCustom: true
        }
      } else {
        clearCustomFont()
      }
    } else {
      // 分离模式：分别读取英文字体和中文字体
      const [enRecord, zhRecord] = await Promise.all([
        getLocalFont('en'),
        getLocalFont('zh')
      ])

      unmountFace('unified')

      if (enRecord && enRecord.blob) {
        await mountFace('en', CUSTOM_EN_FAMILY, enRecord.blob, { unicodeRange: LATIN_UNICODE_RANGE })
      } else {
        unmountFace('en')
      }

      if (zhRecord && zhRecord.blob) {
        await mountFace('zh', CUSTOM_ZH_FAMILY, zhRecord.blob)
      } else {
        unmountFace('zh')
      }

      const hasEn = Boolean(enRecord && enRecord.blob)
      const hasZh = Boolean(zhRecord && zhRecord.blob)

      if (hasEn && hasZh) {
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty(
            '--font',
            `'${CUSTOM_EN_FAMILY}', '${CUSTOM_ZH_FAMILY}', ${DEFAULT_FONT_STACK}`
          )
          document.documentElement.setAttribute('data-custom-font', 'split')
        }
      } else if (hasEn) {
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty(
            '--font',
            `'${CUSTOM_EN_FAMILY}', ${DEFAULT_FONT_STACK}`
          )
          document.documentElement.setAttribute('data-custom-font', 'split-en')
        }
      } else if (hasZh) {
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty(
            '--font',
            `'${CUSTOM_ZH_FAMILY}', ${DEFAULT_FONT_STACK}`
          )
          document.documentElement.setAttribute('data-custom-font', 'split-zh')
        }
      } else {
        clearCustomFont()
        return
      }

      const displayName = [hasEn ? `英: ${enRecord.name}` : '', hasZh ? `中: ${zhRecord.name}` : '']
        .filter(Boolean)
        .join(' / ')

      try {
        localStorage.setItem('labhub_custom_font_active', 'true')
        localStorage.setItem('labhub_custom_font_name', displayName)
      } catch (e) {}

      currentFontInfo.value = {
        name: displayName,
        active: true
      }

      fontConfig.value = {
        mode: 'split',
        unified: null,
        en: hasEn ? { name: enRecord.name, format: enRecord.format, size: enRecord.size } : null,
        zh: hasZh ? { name: zhRecord.name, format: zhRecord.format, size: zhRecord.size } : null,
        hasCustom: true
      }
    }
  } catch (err) {
    console.warn('Failed to apply font config:', err)
    clearCustomFont()
  } finally {
    isFontLoading.value = false
  }
}

/**
 * 将指定字体文件直接应用到槽位（兼容旧接口）
 * @param {{ blob: Blob, name: string, format: string, size: number }} fontRecord 
 * @param {'unified' | 'en' | 'zh'} slot 
 */
export async function applyCustomFont(fontRecord, slot = 'unified') {
  if (!fontRecord || !fontRecord.blob) {
    clearCustomFont()
    return
  }
  await refreshFontConfig()
}

/**
 * 恢复系统默认字体方案（彻底清除自定义 FontFace 与 CSS 变量覆盖）
 */
export function clearCustomFont() {
  unmountFace('unified')
  unmountFace('en')
  unmountFace('zh')

  if (typeof document !== 'undefined') {
    document.documentElement.style.removeProperty('--font')
    document.documentElement.removeAttribute('data-custom-font')
  }

  try {
    localStorage.removeItem('labhub_custom_font_active')
    localStorage.removeItem('labhub_custom_font_name')
  } catch (e) {}

  currentFontInfo.value = null
  fontConfig.value = {
    mode: getFontMode(),
    unified: null,
    en: null,
    zh: null,
    hasCustom: false
  }
}

/**
 * 应用启动时自动从 IndexedDB 检查并初始化本地自定义字体
 */
export async function initCustomFont() {
  if (isInitialized) return
  isInitialized = true

  // 绑定全局自定义事件同步
  if (typeof window !== 'undefined') {
    window.addEventListener('local-font-changed', async () => {
      await refreshFontConfig()
    })
    window.addEventListener('local-font-mode-changed', async () => {
      await refreshFontConfig()
    })
  }

  try {
    const isCustomActive = typeof localStorage !== 'undefined' && localStorage.getItem('labhub_custom_font_active') === 'true'
    if (isCustomActive) {
      await refreshFontConfig()
    } else {
      clearCustomFont()
    }
  } catch (e) {
    clearCustomFont()
  }
}

export function useCustomFont() {
  return {
    currentFontInfo,
    fontConfig,
    isFontLoading,
    defaultFontStack: DEFAULT_FONT_STACK,
    customUnifiedFamily: CUSTOM_UNIFIED_FAMILY,
    customEnFamily: CUSTOM_EN_FAMILY,
    customZhFamily: CUSTOM_ZH_FAMILY,
    customFontFamily: CUSTOM_FONT_FAMILY,
    refreshFontConfig,
    applyCustomFont,
    clearCustomFont,
    initCustomFont
  }
}

