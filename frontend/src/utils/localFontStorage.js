const DB_NAME = 'labhub_local_assets'
const DB_VERSION = 2
const STORE_NAME = 'fonts'
const LEGACY_FONT_KEY = 'custom_font'

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'))
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('backgrounds')) {
        db.createObjectStore('backgrounds')
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 根据文件名或 MIME 解析字体格式
 * @param {string} filename 
 * @returns {'woff2' | 'woff' | 'truetype' | 'opentype' | null}
 */
export function getFontFormat(filename = '') {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.woff2')) return 'woff2'
  if (lower.endsWith('.woff')) return 'woff'
  if (lower.endsWith('.ttf')) return 'truetype'
  if (lower.endsWith('.otf')) return 'opentype'
  return null
}

/**
 * 获取槽位存储键名
 * @param {'unified' | 'en' | 'zh'} slot 
 */
export function getSlotKey(slot = 'unified') {
  if (slot === 'en') return 'custom_font_en'
  if (slot === 'zh') return 'custom_font_zh'
  return 'custom_font_unified'
}

let inMemoryMode = 'unified'

/**
 * 获取当前字体模式（'unified' 统一模式 或 'split' 中英分离模式）
 * @returns {'unified' | 'split'}
 */
export function getFontMode() {
  try {
    if (typeof localStorage !== 'undefined') {
      const mode = localStorage.getItem('labhub_font_mode')
      return mode === 'split' ? 'split' : 'unified'
    }
    return inMemoryMode
  } catch {
    return inMemoryMode
  }
}

/**
 * 设置字体模式
 * @param {'unified' | 'split'} mode 
 */
export function setFontMode(mode = 'unified') {
  const validMode = mode === 'split' ? 'split' : 'unified'
  inMemoryMode = validMode
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('labhub_font_mode', validMode)
    }
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('local-font-mode-changed', { detail: { mode: validMode } }))
  }
  return validMode
}

/**
 * 保存本地字体文件到指定槽位（纯本地 IndexedDB，绝不上云）
 * @param {File} file 
 * @param {'unified' | 'en' | 'zh'} slot
 * @returns {Promise<{ name: string, format: string, size: number, slot: string }>}
 */
export async function saveLocalFont(file, slot = 'unified') {
  if (!file) throw new Error('未提供有效的字体文件')
  const format = getFontFormat(file.name)
  if (!format) {
    throw new Error('仅支持上传 WOFF2、WOFF、TTF 或 OTF 格式的字体文件')
  }

  const record = {
    blob: file,
    name: file.name,
    format,
    size: file.size,
    slot,
    updatedAt: Date.now()
  }

  const db = await openDB()
  const key = getSlotKey(slot)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(record, key)
    if (slot === 'unified') {
      // 保持对旧版本 custom_font 键的兼容性写入
      store.put(record, LEGACY_FONT_KEY)
    }
    tx.oncomplete = () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('local-font-changed', { detail: { slot, record } }))
      }
      resolve({
        name: record.name,
        format: record.format,
        size: record.size,
        slot
      })
    }
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 获取指定槽位存储的本地字体（包含 Blob 与 ObjectURL）
 * @param {'unified' | 'en' | 'zh'} slot 
 * @returns {Promise<{ blob: Blob, url: string, name: string, format: string, size: number, slot: string } | null>}
 */
export async function getLocalFont(slot = 'unified') {
  try {
    const db = await openDB()
    const key = getSlotKey(slot)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => {
        const record = req.result
        if (!record && slot === 'unified') {
          // 尝试读取旧版 legacy 键作为兜底
          const legacyReq = store.get(LEGACY_FONT_KEY)
          legacyReq.onsuccess = () => {
            const legacyRec = legacyReq.result
            if (!legacyRec || !legacyRec.blob) return resolve(null)
            const url = URL.createObjectURL(legacyRec.blob)
            resolve({
              blob: legacyRec.blob,
              url,
              name: legacyRec.name,
              format: legacyRec.format,
              size: legacyRec.size,
              slot: 'unified'
            })
          }
          legacyReq.onerror = () => resolve(null)
          return
        }

        if (!record || !record.blob) {
          return resolve(null)
        }
        const url = URL.createObjectURL(record.blob)
        resolve({
          blob: record.blob,
          url,
          name: record.name,
          format: record.format,
          size: record.size,
          slot
        })
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('Failed to retrieve local font from IndexedDB:', e)
    return null
  }
}

/**
 * 获取指定槽位的本地字体元数据（无需生成 ObjectURL）
 * @param {'unified' | 'en' | 'zh'} slot 
 * @returns {Promise<{ name: string, format: string, size: number, slot: string } | null>}
 */
export async function getLocalFontMeta(slot = 'unified') {
  try {
    const db = await openDB()
    const key = getSlotKey(slot)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => {
        const record = req.result
        if (!record && slot === 'unified') {
          const legacyReq = store.get(LEGACY_FONT_KEY)
          legacyReq.onsuccess = () => {
            const legacyRec = legacyReq.result
            if (!legacyRec || !legacyRec.blob) return resolve(null)
            resolve({
              name: legacyRec.name,
              format: legacyRec.format,
              size: legacyRec.size,
              slot: 'unified'
            })
          }
          legacyReq.onerror = () => resolve(null)
          return
        }

        if (!record || !record.blob) {
          return resolve(null)
        }
        resolve({
          name: record.name,
          format: record.format,
          size: record.size,
          slot
        })
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    return null
  }
}

/**
 * 在槽位之间复制字体记录（支持一键中英共用同一字体）
 * @param {'unified' | 'en' | 'zh'} fromSlot 
 * @param {'unified' | 'en' | 'zh'} toSlot 
 */
export async function copyLocalFont(fromSlot, toSlot) {
  if (fromSlot === toSlot) return true
  try {
    const db = await openDB()
    const fromKey = getSlotKey(fromSlot)
    const toKey = getSlotKey(toSlot)

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(fromKey)
      req.onsuccess = () => {
        let record = req.result
        if (!record && fromSlot === 'unified') {
          const legacyReq = store.get(LEGACY_FONT_KEY)
          legacyReq.onsuccess = () => {
            const leg = legacyReq.result
            if (!leg || !leg.blob) return resolve(false)
            const newRecord = { ...leg, slot: toSlot, updatedAt: Date.now() }
            store.put(newRecord, toKey)
          }
          return
        }
        if (!record || !record.blob) return resolve(false)
        const newRecord = { ...record, slot: toSlot, updatedAt: Date.now() }
        store.put(newRecord, toKey)
      }
      tx.oncomplete = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('local-font-changed', { detail: { slot: toSlot } }))
        }
        resolve(true)
      }
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('Failed to copy font slot:', e)
    return false
  }
}

/**
 * 清除指定槽位的本地字体文件
 * @param {'unified' | 'en' | 'zh'} slot 
 */
export async function removeLocalFont(slot = 'unified') {
  try {
    const db = await openDB()
    const key = getSlotKey(slot)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(key)
      if (slot === 'unified') {
        store.delete(LEGACY_FONT_KEY)
      }
      tx.oncomplete = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('local-font-changed', { detail: { slot, record: null } }))
        }
        resolve(true)
      }
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('Failed to remove local font:', e)
    return false
  }
}

/**
 * 清除所有本地字体文件
 */
export async function removeAllLocalFonts() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(LEGACY_FONT_KEY)
      store.delete('custom_font_unified')
      store.delete('custom_font_en')
      store.delete('custom_font_zh')
      tx.oncomplete = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('local-font-changed', { detail: { slot: 'all', record: null } }))
        }
        resolve(true)
      }
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('Failed to remove all local fonts:', e)
    return false
  }
}

