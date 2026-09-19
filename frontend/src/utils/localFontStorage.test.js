import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getFontFormat,
  saveLocalFont,
  getLocalFont,
  getLocalFontMeta,
  removeLocalFont,
  copyLocalFont,
  getFontMode,
  setFontMode,
  removeAllLocalFonts
} from './localFontStorage'

describe('localFontStorage', () => {
  let mockStore = new Map()

  beforeEach(() => {
    mockStore = new Map()

    const mockIDB = {
      open: vi.fn(() => {
        const req = {
          result: {
            objectStoreNames: {
              contains: vi.fn(() => true)
            },
            createObjectStore: vi.fn(),
            transaction: vi.fn(() => {
              const tx = {
                oncomplete: null,
                onerror: null,
                objectStore: vi.fn(() => ({
                  put: vi.fn((val, key) => {
                    mockStore.set(key, val)
                    const r = {}
                    setTimeout(() => r.onsuccess && r.onsuccess(), 0)
                    return r
                  }),
                  get: vi.fn((key) => {
                    const r = { result: mockStore.get(key) }
                    setTimeout(() => r.onsuccess && r.onsuccess(), 0)
                    return r
                  }),
                  delete: vi.fn((key) => {
                    mockStore.delete(key)
                    const r = {}
                    setTimeout(() => r.onsuccess && r.onsuccess(), 0)
                    return r
                  })
                }))
              }
              setTimeout(() => tx.oncomplete && tx.oncomplete(), 0)
              return tx
            })
          }
        }
        setTimeout(() => req.onsuccess && req.onsuccess(), 0)
        return req
      })
    }

    global.indexedDB = mockIDB
    global.URL = {
      createObjectURL: vi.fn(() => 'blob:mock-font-url'),
      revokeObjectURL: vi.fn()
    }
    global.window = {
      dispatchEvent: vi.fn()
    }
    global.CustomEvent = class {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    }
  })

  it('correctly resolves font format by filename extension', () => {
    expect(getFontFormat('SmileySans-Oblique.woff2')).toBe('woff2')
    expect(getFontFormat('Inter-Regular.woff')).toBe('woff')
    expect(getFontFormat('HarmonyOS_Sans.ttf')).toBe('truetype')
    expect(getFontFormat('SourceHanSans.otf')).toBe('opentype')
    expect(getFontFormat('document.pdf')).toBeNull()
    expect(getFontFormat('image.png')).toBeNull()
  })

  it('saves local font and dispatches local-font-changed event', async () => {
    const fakeFile = {
      name: 'SmileySans.woff2',
      size: 1048576,
      type: 'font/woff2'
    }

    const result = await saveLocalFont(fakeFile, 'unified')
    expect(result.name).toBe('SmileySans.woff2')
    expect(result.format).toBe('woff2')
    expect(result.size).toBe(1048576)

    expect(global.window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'local-font-changed',
        detail: expect.objectContaining({ slot: 'unified' })
      })
    )

    const meta = await getLocalFontMeta('unified')
    expect(meta).toEqual({
      name: 'SmileySans.woff2',
      format: 'woff2',
      size: 1048576,
      slot: 'unified'
    })

    const fontObj = await getLocalFont('unified')
    expect(fontObj.name).toBe('SmileySans.woff2')
    expect(fontObj.url).toBe('blob:mock-font-url')
  })

  it('supports separate en and zh slots and allows copying between slots', async () => {
    const enFile = {
      name: 'JetBrainsMono-Regular.woff2',
      size: 50000,
      type: 'font/woff2'
    }
    const zhFile = {
      name: 'LXGWWenKai-Regular.ttf',
      size: 8000000,
      type: 'font/ttf'
    }

    // 保存英文字体
    const resEn = await saveLocalFont(enFile, 'en')
    expect(resEn.slot).toBe('en')

    // 保存中文字体
    const resZh = await saveLocalFont(zhFile, 'zh')
    expect(resZh.slot).toBe('zh')

    const enMeta = await getLocalFontMeta('en')
    const zhMeta = await getLocalFontMeta('zh')
    expect(enMeta.name).toBe('JetBrainsMono-Regular.woff2')
    expect(zhMeta.name).toBe('LXGWWenKai-Regular.ttf')

    // 测试中英共用同一字体：将英文字体同步复制到中文字体槽位
    await copyLocalFont('en', 'zh')
    const zhMetaAfterCopy = await getLocalFontMeta('zh')
    expect(zhMetaAfterCopy.name).toBe('JetBrainsMono-Regular.woff2')
  })

  it('manages font mode state between unified and split', () => {
    expect(getFontMode()).toBe('unified')
    setFontMode('split')
    expect(getFontMode()).toBe('split')
    setFontMode('unified')
    expect(getFontMode()).toBe('unified')
  })

  it('rejects invalid font format', async () => {
    const invalidFile = {
      name: 'malicious.exe',
      size: 500,
      type: 'application/octet-stream'
    }
    await expect(saveLocalFont(invalidFile)).rejects.toThrow('仅支持上传 WOFF2、WOFF、TTF 或 OTF 格式的字体文件')
  })

  it('removes local font and clears slots', async () => {
    mockStore.set('custom_font_unified', {
      blob: new Blob(['font-data']),
      name: 'test.ttf',
      format: 'truetype',
      size: 123
    })

    const removed = await removeLocalFont('unified')
    expect(removed).toBe(true)
    expect(mockStore.has('custom_font_unified')).toBe(false)

    const meta = await getLocalFontMeta('unified')
    expect(meta).toBeNull()
  })
})

