import { describe, it, expect } from 'vitest'
import { isJournal, paperLabel, paperSource, paperRead, paperReadLabel } from './papers'

describe('frontend papers utils', () => {
  it('identifies journal / non-arxiv papers properly', () => {
    expect(isJournal({ arxiv_id: '2502.03530' })).toBe(false)
    expect(isJournal({ arxiv_id: 'doi:10.1038/s41586-020-2649-2' })).toBe(true)
    expect(isJournal({ arxiv_id: 'url:https://example.com' })).toBe(true)
    expect(isJournal({ arxiv_id: 'custom:1741764000' })).toBe(true)
    expect(isJournal({})).toBe(false)
  })

  it('formats paperLabel accurately for arXiv, DOI, and custom papers', () => {
    expect(paperLabel({ arxiv_id: '2502.03530' })).toBe('arXiv:2502.03530')
    expect(paperLabel({ arxiv_id: 'doi:10.1038/s41586-020-2649-2' })).toBe('DOI:10.1038/s41586-020-2649-2')
    expect(paperLabel({ arxiv_id: 'custom:1741764000' })).toBe('组会文献')
    expect(paperLabel({ arxiv_id: '', journal: 'Nature' })).toBe('Nature')
    expect(paperLabel({})).toBe('期刊论文')
  })

  it('generates paperSource correctly', () => {
    expect(paperSource({ arxiv_id: '2502.03530' })).toBe('https://arxiv.org/abs/2502.03530')
    expect(paperSource({ arxiv_id: 'doi:10.1038/abc' })).toBe('https://doi.org/10.1038/abc')
    expect(paperSource({ source_url: 'https://example.com/paper' })).toBe('https://example.com/paper')
  })

  it('generates paperRead and paperReadLabel correctly', () => {
    expect(paperRead({ arxiv_id: '2502.03530' })).toBe('https://arxiv.org/pdf/2502.03530')
    expect(paperRead({ arxiv_id: '2502.03530', pdf_url: 'https://cdn.example.com/test.pdf' })).toBe('https://cdn.example.com/test.pdf')
    expect(paperReadLabel({ arxiv_id: '2502.03530' })).toBe('打开 PDF ↗')
    expect(paperReadLabel({ arxiv_id: 'doi:10.1038/abc' })).toBe('文献原文 ↗')
  })

  it('parses arXiv HTML abstract page correctly', async () => {
    const { parseArxivAbsHtml } = await import('../../functions/api/utils/papers')
    const sampleHtml = `
      <h1 class="title mathjax"><span class="descriptor">Title:</span>Dark Matter-Baryon Separability Predicts the Dynamics of an Almost-Dark Galaxy</h1>
      <div class="authors"><span class="descriptor">Authors:</span><a href="...">Oem Trivedi</a>, <a href="...">Abraham Loeb</a></div>
      <blockquote class="abstract mathjax"><span class="descriptor">Abstract:</span>We extend the Dark Matter-Baryon Separability Condition...</blockquote>
      <meta name="citation_date" content="2026/09/09" />
      <span class="primary-subject">Cosmology and Nongalactic Astrophysics (astro-ph.CO)</span>
    `
    const meta = parseArxivAbsHtml(sampleHtml, '2609.10661')
    expect(meta.title).toBe('Dark Matter-Baryon Separability Predicts the Dynamics of an Almost-Dark Galaxy')
    expect(meta.authors).toEqual(['Oem Trivedi', 'Abraham Loeb'])
    expect(meta.published_date).toBe('2026-09-09')
    expect(meta.primary_category).toBe('astro-ph.CO')
    expect(meta.abstract).toBe('We extend the Dark Matter-Baryon Separability Condition...')
    expect(meta.pdf_url).toBe('https://arxiv.org/pdf/2609.10661.pdf')
    expect(meta.source_url).toBe('https://arxiv.org/abs/2609.10661')
  })
})
