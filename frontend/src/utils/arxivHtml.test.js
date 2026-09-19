import { describe, it, expect, vi } from 'vitest'
import { cleanArxivId, getArxivHtmlUrl, parseArxivHtmlToMarkdown, fetchArxivPaperFulltext } from './arxivHtml'

describe('arxivHtml utility', () => {
  it('cleans various arxiv ID formats', () => {
    expect(cleanArxivId('2609.19132v1')).toBe('2609.19132v1')
    expect(cleanArxivId('arXiv:2609.19132v1')).toBe('2609.19132v1')
    expect(cleanArxivId('ARXIV:2401.00001')).toBe('2401.00001')
    expect(cleanArxivId(' 2502.03530.pdf ')).toBe('2502.03530')
    expect(cleanArxivId('')).toBe('')
    expect(cleanArxivId(null)).toBe('')
  })

  it('generates standard arxiv html urls', () => {
    expect(getArxivHtmlUrl('2609.19132v1')).toBe('https://arxiv.org/html/2609.19132v1')
    expect(getArxivHtmlUrl('arXiv:2401.00001')).toBe('https://arxiv.org/html/2401.00001')
    expect(getArxivHtmlUrl('')).toBe('')
  })

  it('parses LaTeXML HTML into structured markdown with LaTeX math preservation', () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>arXiv:2609.19132 - Dark Matter Density in Galaxies</title>
        </head>
        <body>
          <div class="ltx_page_navbar">Navigation links to be stripped</div>
          <div class="ltx_TOC">TOC to be stripped</div>
          <article class="ltx_document">
            <h1 class="ltx_title ltx_title_document">Dark Matter Density in Nearby Galaxies</h1>
            <div class="ltx_authors">Yu-Chen Wang, Yingjie Peng</div>
            <div class="ltx_abstract">
              <h6 class="ltx_title">Abstract</h6>
              <p class="ltx_p">We present a comprehensive study of dark matter density profiles.</p>
            </div>
            <section class="ltx_section">
              <h2 class="ltx_title">1 Introduction</h2>
              <p class="ltx_p">
                Galactic halos follow the profile described by
                <math class="ltx_Math" alttext="\\rho(r)" display="inline">
                  <semantics>
                    <annotation encoding="application/x-tex">\\rho(r) = \\frac{\\rho_0}{(r/r_s)(1+r/r_s)^2}</annotation>
                  </semantics>
                </math>
                where <math class="ltx_Math" alttext="r_s"><semantics><annotation encoding="application/x-tex">r_s</annotation></semantics></math> is the scale radius.
              </p>
            </section>
            <section class="ltx_section">
              <h2 class="ltx_title">2 Observations and Methods</h2>
              <p class="ltx_p">The observations were conducted using MaNGA survey data.</p>
              <ul>
                <li>Sample selection criteria</li>
                <li>Kinematic fitting</li>
              </ul>
            </section>
            <section class="ltx_bibliography">
              <h2>References</h2>
              <p>Reference 1, Reference 2...</p>
            </section>
          </article>
        </body>
      </html>
    `

    const parsed = parseArxivHtmlToMarkdown(mockHtml, '2609.19132')
    expect(parsed.title).toContain('Dark Matter Density in Nearby Galaxies')
    expect(parsed.authors).toContain('Yu-Chen Wang')
    expect(parsed.abstract).toContain('comprehensive study of dark matter density profiles')
    expect(parsed.markdown).toContain('$\\rho(r) = \\frac{\\rho_0}{(r/r_s)(1+r/r_s)^2}$')
    expect(parsed.markdown).toContain('$r_s$')
    expect(parsed.markdown).not.toContain('Navigation links to be stripped')
    expect(parsed.markdown).not.toContain('TOC to be stripped')
    expect(parsed.wordCount).toBeGreaterThan(100)
  })

  it('safely handles empty or invalid html content', () => {
    const emptyParsed = parseArxivHtmlToMarkdown('', 'test')
    expect(emptyParsed.title).toBe('')
    expect(emptyParsed.markdown).toBe('')
    expect(emptyParsed.wordCount).toBe(0)
  })

  it('handles 404 response in fetchArxivPaperFulltext', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 404,
      text: async () => 'Not Found'
    })

    const res = await fetchArxivPaperFulltext('2001.00001')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('404')

    globalThis.fetch = originalFetch
  })
})
