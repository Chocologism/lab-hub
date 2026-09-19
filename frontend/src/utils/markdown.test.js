import { describe, it, expect } from 'vitest'
import { renderMarkdown, createMarkdownRenderer } from './markdown'

describe('markdown utils', () => {
  it('should return empty string for null or empty input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null)).toBe('')
    expect(renderMarkdown(undefined)).toBe('')
  })

  it('should render standard markdown formatting (bold, italic, strikethrough, code)', () => {
    const md = '**粗体**、*斜体*、~~删除线~~ 与 `inline code`'
    const html = renderMarkdown(md)
    expect(html).toContain('<strong>粗体</strong>')
    expect(html).toContain('<em>斜体</em>')
    expect(html).toContain('<del>删除线</del>')
    expect(html).toContain('<code>inline code</code>')
  })

  it('should render lists and blockquotes correctly', () => {
    const md = `
> 这是研读引述

- 重点 1
- 重点 2

1. 步骤 A
2. 步骤 B
`
    const html = renderMarkdown(md)
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>重点 1</li>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>步骤 A</li>')
  })

  it('should render fenced code blocks', () => {
    const md = '```python\nprint("hello world")\n```'
    const html = renderMarkdown(md)
    expect(html).toContain('<pre><code class="language-python">')
    expect(html).toContain('print(&quot;hello world&quot;)')
  })

  it('should sanitize links and open them in a new tab', () => {
    const safeMd = '[arXiv Paper](https://arxiv.org/abs/2609.04305)'
    const safeHtml = renderMarkdown(safeMd)
    expect(safeHtml).toContain('href="https://arxiv.org/abs/2609.04305"')
    expect(safeHtml).toContain('target="_blank"')
    expect(safeHtml).toContain('rel="noopener noreferrer"')

    const evilMd = '[Click Me](javascript:alert("hacked"))'
    const evilHtml = renderMarkdown(evilMd)
    expect(evilHtml).toContain('href="#"')
    expect(evilHtml).not.toContain('javascript:')
  })

  it('should escape raw HTML tags to prevent XSS injection', () => {
    const evilInput = '<script>alert("xss")</script><img src="x" onerror="alert(1)">'
    const html = renderMarkdown(evilInput)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    expect(html).not.toContain('<img src="x"')
    expect(html).toContain('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;')
  })

  it('should render inline and display math seamlessly with KaTeX', () => {
    const md = `
推荐重点：
- 测得常数 $H_0 = 73.04 \\pm 1.04$
- 宇宙学能量公式：
  $$E = mc^2$$
`
    const html = renderMarkdown(md)
    expect(html).toContain('class="katex"')
    expect(html).toContain('class="katex-display"')
  })

  it('should not break markdown parsing when math contains underscores or asterisks', () => {
    const md = '这里有公式 **$x_1 * x_2$** 和 $z_{opt}$，以及 `code with $dollar$`'
    const html = renderMarkdown(md)
    expect(html).toContain('<strong><span class="katex">')
    expect(html).toContain('<code>code with $dollar$</code>')
  })

  it('should support astronomy macros in math formulas', () => {
    const md = '恒星质量为 $1.4 M_\\sun$，角距离为 $30\\arcsec$'
    const html = renderMarkdown(md)
    expect(html).toContain('class="katex"')
    expect(html).not.toContain('katex-error')
  })

  it('should support soft breaks with single newline', () => {
    const md = '第一行研读重点\n第二行研读重点'
    const html = renderMarkdown(md)
    expect(html).toContain('<br>')
  })

  it('should replace bare LaTeX symbols in non-math plain text', () => {
    const md = 'Scale is \\sim 100 kpc with \\pm 5% error.'
    const html = renderMarkdown(md)
    expect(html).toContain('∼ 100 kpc with ± 5% error.')
  })

  it('should render bold markdown and LaTeX formulas inside list items', () => {
    const md = `
1. **直击冷暗物质模型（$\\Lambda\\text{CDM}$）的重大困境**：尺度（$r_{\\text{eff}} \\sim 5\\text{ kpc}$）
2. **第一性原理突破**：质量 $m_\\psi = 2.88 \\times 10^{-22}\\text{ eV}$
`
    const html = renderMarkdown(md)
    expect(html).toContain('<ol>')
    expect(html).toContain('<strong>直击冷暗物质模型（')
    expect(html).toContain('class="katex"')
    expect(html).not.toContain('**直击冷暗物质模型')
    expect(html).toContain('<strong>第一性原理突破</strong>')
  })

  it('should render astronomy farcs macro both in plain text and formulas within markdown', () => {
    // 正文直接书写 1\farcs5
    const md1 = '角大小约为 1\\farcs5 左右，极限分辨率达到 $0\\farcs05$。'
    const html1 = renderMarkdown(md1)
    expect(html1).toContain('class="katex"')
    expect(html1).not.toContain('katex-error')

    // 代码块中的宏必须保持纯文本
    const md2 = '```\n1\\farcs5\n```'
    const html2 = renderMarkdown(md2)
    expect(html2).toContain('<pre>')
    expect(html2).toContain('1\\farcs5')
    expect(html2).not.toContain('class="katex"')
  })

  it('should render textsc syntax inside markdown comments and lists', () => {
    const md = '研读笔记：\n- 本文使用了 \\textsc{Simba} 模拟与 {\\sc Cloudy} 模型。\n- 支持粗体嵌套 **\\textsc{Fast}** 算法。'
    const html = renderMarkdown(md)
    expect(html).toContain('<span class="tex-sc" style="font-variant: small-caps;">Simba</span>')
    expect(html).toContain('<span class="tex-sc" style="font-variant: small-caps;">Cloudy</span>')
    expect(html).toContain('<strong><span class="tex-sc" style="font-variant: small-caps;">Fast</span></strong>')
  })
})
