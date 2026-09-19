import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs'

// Configure worker for browser environment
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()
  } catch (e) {
    // Falls back to main-thread fake worker
  }
}

/**
 * 从 PDF 文件 URL 中提取正文文字
 * @param {string} pdfUrl PDF 文件的网络或本地接口地址
 * @param {Object} options 可选配置（maxPages 默认 5 页，signal 取消信号）
 * @returns {Promise<string>} 提取到的纯文本
 */
export async function extractTextFromPdfUrl(pdfUrl, { maxPages = 5, signal } = {}) {
  if (!pdfUrl) return ''

  try {
    const response = await fetch(pdfUrl, { signal })
    if (!response.ok) {
      throw new Error(`获取 PDF 文件失败: HTTP ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true
    })

    const pdf = await loadingTask.promise
    const pagesCount = Math.min(pdf.numPages, maxPages)
    const textChunks = []

    for (let pageNum = 1; pageNum <= pagesCount; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
      if (pageText.trim()) {
        textChunks.push(`--- 第 ${pageNum} 页 ---\n${pageText.trim()}`)
      }
    }

    return textChunks.join('\n\n')
  } catch (err) {
    console.warn('从 PDF 中提取文本失败:', err)
    return ''
  }
}

/**
 * 将 PDF 首页渲染为 JPEG 图片 Data URL，用于 Vision 多模态识别与海报回显
 * @param {string} pdfUrl PDF 文件地址
 * @param {Object} options 可选配置（scale 默认 1.5，signal 取消信号）
 * @returns {Promise<string>} 图片 Data URL（失败时返回空字符串）
 */
export async function renderPdfFirstPageToDataUrl(pdfUrl, { scale = 1.5, signal } = {}) {
  if (!pdfUrl || typeof document === 'undefined') return ''

  try {
    const response = await fetch(pdfUrl, { signal })
    if (!response.ok) return ''
    const arrayBuffer = await response.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true
    })

    const pdf = await loadingTask.promise
    if (pdf.numPages < 1) return ''

    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    canvas.width = viewport.width
    canvas.height = viewport.height

    const renderContext = {
      canvasContext: ctx,
      viewport
    }

    await page.render(renderContext).promise
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch (err) {
    console.warn('PDF 首页渲染为图片失败:', err)
    return ''
  }
}
