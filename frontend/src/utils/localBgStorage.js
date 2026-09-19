const DB_NAME = 'labhub_local_assets'
const DB_VERSION = 2
const STORE_NAME = 'backgrounds'
const BG_KEY = 'custom_bg'

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
      if (!db.objectStoreNames.contains('fonts')) {
        db.createObjectStore('fonts')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 保存本地图片或视频到 IndexedDB
 * @param {File} file 
 * @returns {Promise<{ name: string, type: 'image' | 'video', mime: string, size: number }>}
 */
export async function saveLocalBackground(file) {
  if (!file) throw new Error('未提供有效文件')
  const fileName = file.name || ''
  const isVideoExt = /\.(mov|mp4|webm|m4v|mkv|ogg)$/i.test(fileName)
  const isImageExt = /\.(jpe?g|png|webp|gif|svg|avif|bmp)$/i.test(fileName)
  const isVideo = (file.type && file.type.startsWith('video/')) || isVideoExt
  const isImage = (file.type && file.type.startsWith('image/')) || isImageExt
  if (!isVideo && !isImage) {
    throw new Error('仅支持上传图片或视频文件（如 JPG、PNG、WebP、MP4、WebM、MOV）')
  }

  const mime = file.type || (isVideo ? (/\.mov$/i.test(fileName) ? 'video/quicktime' : 'video/mp4') : 'image/jpeg')
  const record = {
    blob: file,
    name: file.name,
    type: isVideo ? 'video' : 'image',
    mime,
    size: file.size,
    updatedAt: Date.now()
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(record, BG_KEY)
    req.onsuccess = () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('local-bg-changed', { detail: record }))
      }
      resolve({
        name: record.name,
        type: record.type,
        mime: record.mime,
        size: record.size
      })
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * 获取存储的本地背景媒体
 * @returns {Promise<{ blob: Blob, url: string, name: string, type: 'image' | 'video', mime: string, size: number } | null>}
 */
export async function getLocalBackground() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(BG_KEY)
      req.onsuccess = () => {
        const record = req.result
        if (!record || !record.blob) {
          return resolve(null)
        }
        const url = URL.createObjectURL(record.blob)
        resolve({
          blob: record.blob,
          url,
          name: record.name,
          type: record.type,
          mime: record.mime,
          size: record.size
        })
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('Failed to retrieve local background from IndexedDB:', e)
    return null
  }
}

/**
 * 仅获取元数据（用于设置界面展示文件信息，不创建 URL）
 */
export async function getLocalBackgroundMeta() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(BG_KEY)
      req.onsuccess = () => {
        const record = req.result
        if (!record || !record.blob) {
          return resolve(null)
        }
        resolve({
          name: record.name,
          type: record.type,
          mime: record.mime,
          size: record.size
        })
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    return null
  }
}

/**
 * 移除本地背景
 */
export async function removeLocalBackground() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(BG_KEY)
      req.onsuccess = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('local-bg-changed', { detail: null }))
        }
        resolve(true)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('Failed to remove local background:', e)
    return false
  }
}
