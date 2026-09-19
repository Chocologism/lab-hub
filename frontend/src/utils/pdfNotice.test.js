import { describe, it, expect } from 'vitest'
import { extractTextFromPdfUrl, renderPdfFirstPageToDataUrl } from './pdfNotice'

describe('pdfNotice utility', () => {
  it('returns empty string when pdfUrl is empty or null', async () => {
    expect(await extractTextFromPdfUrl('')).toBe('')
    expect(await extractTextFromPdfUrl(null)).toBe('')
  })

  it('handles network failure gracefully without throwing', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = () => Promise.reject(new Error('Network offline / ENOTFOUND'))
    try {
      const result = await extractTextFromPdfUrl('http://invalid-non-existent-domain-xyz.local/test.pdf')
      expect(result).toBe('')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('renderPdfFirstPageToDataUrl returns empty string when pdfUrl is empty', async () => {
    expect(await renderPdfFirstPageToDataUrl('')).toBe('')
    expect(await renderPdfFirstPageToDataUrl(null)).toBe('')
  })
})
