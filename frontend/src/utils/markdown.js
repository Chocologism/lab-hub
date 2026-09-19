import { Marked } from 'marked'
import katex from 'katex'
import { escapeHtml, LATEX_MACROS, normalizeTexAccents, preprocessAstroTex, replaceBareSymbols, renderTexTextFormatting } from './latex.js'

/**
 * 创建并配置一个同时支持 GitHub Flavored Markdown 与 LaTeX 数学公式的渲染器
 */
export function createMarkdownRenderer(options = {}) {
  const marked = new Marked({
    gfm: true,
    breaks: true,
    ...(options.markedOptions || {})
  })

  // 配置 Markdown 渲染器规则与 XSS 防护
  marked.use({
    renderer: {
      // 禁用原始 HTML 注入，对用户直接输入的 HTML 标签进行安全转义
      html({ text }) {
        return escapeHtml(text)
      },
      // 超链接安全处理：仅允许安全协议，默认开启 target="_blank" 与 rel 属性
      link({ href, title, text }) {
        const cleanHref = (href || '').trim()
        const isSafe = /^(https?:\/\/|mailto:|\/|#)/i.test(cleanHref)
        const safeHref = isSafe ? escapeHtml(cleanHref) : '#'
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`
      },
      // 纯文本节点：支持非公式区域的裸 TeX 符号转 Unicode（如 \sim -> ∼），且支持 \textsc 等 TeX 文本样式排版
      text(token) {
        if ('tokens' in token && token.tokens) {
          return this.parser.parseInline(token.tokens)
        }
        const replaced = replaceBareSymbols(token.text)
        const safe = 'escaped' in token && token.escaped ? replaced : escapeHtml(replaced)
        return renderTexTextFormatting(safe)
      }
    },
    extensions: [
      // 独立块级公式：$$...$$ 或 \[...\]
      {
        name: 'blockMath',
        level: 'block',
        start(src) {
          const idx1 = src.indexOf('$$')
          const idx2 = src.indexOf('\\[')
          if (idx1 === -1) return idx2
          if (idx2 === -1) return idx1
          return Math.min(idx1, idx2)
        },
        tokenizer(src) {
          const match = src.match(/^(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/)
          if (match) {
            const raw = match[0]
            const text = raw.startsWith('$$') ? raw.slice(2, -2).trim() : raw.slice(2, -2).trim()
            return { type: 'blockMath', raw, text }
          }
        },
        renderer(token) {
          try {
            return katex.renderToString(token.text, {
              displayMode: true,
              throwOnError: false,
              strict: false,
              macros: { ...LATEX_MACROS, ...(options.macros || {}) },
              output: 'htmlAndMathml'
            })
          } catch (e) {
            return `<pre class="math-error">${escapeHtml(token.raw)}</pre>`
          }
        }
      },
      // 行内公式：$...$ 或 \(...\)
      {
        name: 'inlineMath',
        level: 'inline',
        start(src) {
          const idx1 = src.indexOf('$')
          const idx2 = src.indexOf('\\(')
          if (idx1 === -1) return idx2
          if (idx2 === -1) return idx1
          return Math.min(idx1, idx2)
        },
        tokenizer(src) {
          const match = src.match(/^(\\\([\s\S]*?\\\)|\$(?!\s)((?:\\\$|[^\$\n])+?)(?<!\s)\$)/)
          if (match) {
            const raw = match[0]
            const text = raw.startsWith('\\(') ? raw.slice(2, -2).trim() : match[2].trim()
            return { type: 'inlineMath', raw, text }
          }
        },
        renderer(token) {
          try {
            return katex.renderToString(token.text, {
              displayMode: false,
              throwOnError: false,
              strict: false,
              macros: { ...LATEX_MACROS, ...(options.macros || {}) },
              output: 'htmlAndMathml'
            })
          } catch (e) {
            return `<code>${escapeHtml(token.raw)}</code>`
          }
        }
      }
    ]
  })

  return (content) => {
    if (!content) return ''
    const withAstro = preprocessAstroTex(String(content))
    const normalized = normalizeTexAccents(withAstro)
    return marked.parse(normalized)
  }
}

const defaultMarkdownRenderer = createMarkdownRenderer()

// 针对流式高频渲染的 LRU 缓存，避免对历史消息与相同文本重复执行全量 Markdown 与 KaTeX 解析
const markdownCache = new Map()
const MAX_MARKDOWN_CACHE_SIZE = 500

/**
 * 渲染 Markdown 文本（集成 KaTeX 公式与 XSS 防护）
 * @param {string} text - Markdown 格式文本
 * @param {object} [options] - 可选配置
 * @returns {string} 渲染后的安全 HTML
 */
export function renderMarkdown(text, options) {
  if (!text) return ''
  if (options) {
    return createMarkdownRenderer(options)(text)
  }

  const cached = markdownCache.get(text)
  if (cached !== undefined) {
    return cached
  }

  const rendered = defaultMarkdownRenderer(text)

  if (markdownCache.size >= MAX_MARKDOWN_CACHE_SIZE) {
    // 释放最早的 100 条缓存记录
    const iter = markdownCache.keys()
    for (let i = 0; i < 100; i++) {
      const next = iter.next()
      if (next.done) break
      markdownCache.delete(next.value)
    }
  }

  markdownCache.set(text, rendered)
  return rendered
}
