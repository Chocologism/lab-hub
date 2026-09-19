import { describe, it, expect } from 'vitest'
import { renderLatex, escapeHtml, normalizeTexAccents, replaceBareSymbols, hasLatex, preprocessAstroTex, LATEX_MACROS } from './latex'

describe('latex utils', () => {
  it('should escape HTML to prevent XSS in plain text', () => {
    const raw = '<script>alert("xss")</script> & "quotes"'
    const escaped = escapeHtml(raw)
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;quotes&quot;')
  })

  it('should return empty string for null or empty input', () => {
    expect(renderLatex('')).toBe('')
    expect(renderLatex(null)).toBe('')
    expect(renderLatex(undefined)).toBe('')
  })

  it('should return plain text escaped when no LaTeX is present', () => {
    const text = 'Simple plain text without any formula.'
    expect(renderLatex(text)).toBe(text)
  })

  it('should render inline math with single dollar delimiter $ ... $', () => {
    const text = 'Hubble constant is $H_0 = 70\\text{ km/s/Mpc}$ in this work.'
    const rendered = renderLatex(text)
    expect(rendered).toContain('class="katex"')
    expect(rendered).toContain('Hubble constant is ')
    expect(rendered).toContain(' in this work.')
  })

  it('should render display math with $$ ... $$', () => {
    const text = 'Mass energy equivalence: $$E = mc^2$$ is fundamental.'
    const rendered = renderLatex(text)
    expect(rendered).toContain('class="katex-display"')
    expect(rendered).toContain('Mass energy equivalence: ')
  })

  it('should render display math with \\[ ... \\] and inline with \\( ... \\)', () => {
    const text = 'Inline \\(z=6\\) and block \\[\\sigma_8 = 0.8\\]'
    const rendered = renderLatex(text)
    expect(rendered).toContain('class="katex"')
    expect(rendered).toContain('class="katex-display"')
  })

  it('should normalize TeX accents in author/text names', () => {
    const text = "2D S\\'ersic and Poincar\\'e profile"
    expect(normalizeTexAccents(text)).toBe('2D Sérsic and Poincaré profile')
  })

  it('should replace bare symbols in non-math text', () => {
    const text = 'Scale is \\sim 100 kpc with \\pm 5% error.'
    expect(replaceBareSymbols(text)).toBe('Scale is ∼ 100 kpc with ± 5% error.')
    const rendered = renderLatex(text)
    expect(rendered).toContain('∼ 100 kpc with ± 5%')
  })

  it('should support astronomy custom macros like \\sun, \\earth, \\arcsec', () => {
    const text = 'Halo mass of $10^{12} M_\\sun$ within $60\\arcsec$.'
    const rendered = renderLatex(text)
    expect(rendered).toContain('class="katex"')
    expect(rendered).not.toContain('katex-error')
  })

  it('should handle complex arXiv abstract snippets safely', () => {
    const snippet = 'Using DESI DR1 ($M_\\star < 10^9\\,M_\\odot$), $0.01 < z < 0.2$, we measure $w_p$, $\\Delta\\Sigma$, and $N_{\\rm sat}$. In a flat $Λ$CDM framework...'
    const rendered = renderLatex(snippet)
    expect(rendered).toContain('class="katex"')
    expect(rendered).toContain('Using DESI DR1 (')
  })

  it('should not treat normal currency dollar signs as math', () => {
    const text = 'The prize was $ 100 and another was $ 200.'
    const rendered = renderLatex(text)
    expect(rendered).toBe('The prize was $ 100 and another was $ 200.')
  })

  it('should correctly detect LaTeX presence with hasLatex', () => {
    expect(hasLatex('')).toBe(false)
    expect(hasLatex(null)).toBe(false)
    expect(hasLatex('Plain title without math')).toBe(false)
    expect(hasLatex('Title with $H_0$')).toBe(true)
    expect(hasLatex('Title with \\kms')).toBe(true)
  })

  it('should support astrophysics velocity and solar mass macros', () => {
    const text = 'Velocity is $100\\kms$ and stellar mass is $10^{11} \\Msun$.'
    const rendered = renderLatex(text)
    expect(rendered).toContain('class="katex"')
    expect(rendered).not.toContain('katex-error')
  })

  it('should define astronomical macros like farcs, farcm, fdg, fs in LATEX_MACROS', () => {
    expect(LATEX_MACROS['\\farcs']).toBe('.\\!^{\\prime\\prime}')
    expect(LATEX_MACROS['\\farcm']).toBe('.\\!^{\\prime}')
    expect(LATEX_MACROS['\\fdg']).toBe('.\\!^{\\circ}')
    expect(LATEX_MACROS['\\fs']).toBe('.\\!^{\\mathrm{s}}')
  })

  it('should preprocess bare astronomy macros without breaking math or code blocks', () => {
    // 1. 普通正文中的裸露宏自动包裹为行内公式
    expect(preprocessAstroTex('角分辨率为 1\\farcs5 左右')).toBe('角分辨率为 $1\\farcs5$ 左右')
    expect(preprocessAstroTex('误差级别为 \\farcs 级')).toBe('误差级别为 $\\farcs$ 级')

    // 2. 已经在行内公式内部的宏不会被重复包裹
    expect(preprocessAstroTex('公式 $\\theta = 1\\farcs5 + \\delta$')).toBe('公式 $\\theta = 1\\farcs5 + \\delta$')

    // 3. 行内代码与多行代码块中的宏保持原样
    expect(preprocessAstroTex('代码 `1\\farcs5` 不变')).toBe('代码 `1\\farcs5` 不变')
    expect(preprocessAstroTex('```latex\n\\theta = 1\\farcs5\n```')).toBe('```latex\n\\theta = 1\\farcs5\n```')
  })

  it('should render astronomy farcs macro seamlessly in renderLatex', () => {
    const text = '望远镜分辨率优于 $1\\farcs5$，误差 $\\sim 0\\farcs1$。'
    const rendered = renderLatex(text)
    expect(rendered).toContain('class="katex"')
    expect(rendered).not.toContain('katex-error')
  })

  it('should recognize and render textsc syntax in abstracts as small caps', () => {
    // 1. 标准 \textsc{...} 语法
    const t1 = 'We use the \\textsc{Simba} cosmological simulations.'
    const r1 = renderLatex(t1)
    expect(r1).toContain('<span class="tex-sc" style="font-variant: small-caps;">Simba</span>')
    expect(r1).not.toContain('\\textsc')

    // 2. 带空格的 \textsc {Cloudy}
    const t2 = 'Modeled with \\textsc {Cloudy 17.02} package.'
    const r2 = renderLatex(t2)
    expect(r2).toContain('<span class="tex-sc" style="font-variant: small-caps;">Cloudy 17.02</span>')
    expect(r2).not.toContain('\\textsc')

    // 3. 旧式作用域语法 {\textsc Simba} 与 {\sc Gadget}
    const t3 = 'Codes: {\\textsc Simba} and {\\sc Gadget-4} are tested.'
    const r3 = renderLatex(t3)
    expect(r3).toContain('<span class="tex-sc" style="font-variant: small-caps;">Simba</span>')
    expect(r3).toContain('<span class="tex-sc" style="font-variant: small-caps;">Gadget-4</span>')
    expect(r3).not.toContain('\\textsc')
    expect(r3).not.toContain('\\sc')

    // 4. 外层冗余花括号解构 {\textsc{Eagle}}
    const t4 = 'The {\\textsc{Eagle}} suite.'
    const r4 = renderLatex(t4)
    expect(r4).toBe('The <span class="tex-sc" style="font-variant: small-caps;">Eagle</span> suite.')

    // 5. 嵌套样式与薄空格：\textsc{H\,ii}
    const t5 = 'Observed \\textsc{H\\,ii} regions.'
    const r5 = renderLatex(t5)
    expect(r5).toContain('<span class="tex-sc" style="font-variant: small-caps;">H\u2009ii</span>')
  })

  it('should safely escape XSS while formatting textsc', () => {
    const malicious = '\\textsc{<script>alert("xss")</script> & "quotes"}'
    const rendered = renderLatex(malicious)
    expect(rendered).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    expect(rendered).toContain('class="tex-sc"')
    expect(rendered).not.toContain('<script>')
  })

  it('should support textsc in complex abstract text mixed with math', () => {
    const abstract = 'We present the \\textsc{Simba} simulation suite. Using a flat $\\Lambda$CDM cosmology with $\\Omega_m = 0.3$, we measure $H_0 = 70\\kms$ and compare with {\\sc IllustrisTNG}.'
    const rendered = renderLatex(abstract)
    expect(rendered).toContain('<span class="tex-sc" style="font-variant: small-caps;">Simba</span>')
    expect(rendered).toContain('<span class="tex-sc" style="font-variant: small-caps;">IllustrisTNG</span>')
    expect(rendered).toContain('class="katex"')
    expect(rendered).not.toContain('\\textsc')
  })

  it('should support textsc in KaTeX math mode without throwing error', () => {
    const math = '$\\textsc{Simba}$ and $M_{\\textsc{halo}}$'
    const rendered = renderLatex(math)
    expect(rendered).toContain('class="katex"')
    expect(rendered).not.toContain('katex-error')
  })
})
