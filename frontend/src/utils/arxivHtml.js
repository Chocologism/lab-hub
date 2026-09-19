/**
 * arXiv HTML 全文抓取与学术 Markdown 解析工具
 * 纯浏览器客户端直连抓取（arXiv 官方 HTML 端点原生开启 Access-Control-Allow-Origin: *）
 * 0 云端服务消耗，高效保真还原论文标题、作者、摘要、各级章节与 LaTeX 数学公式。
 */

/**
 * 规范化 arXiv 编号
 * @param {string} rawId
 * @returns {string} 如 '2609.19132v1' 或 '2401.00001'
 */
export function cleanArxivId(rawId) {
  if (!rawId || typeof rawId !== 'string') return ''
  return rawId
    .trim()
    .replace(/^arxiv:\s*/i, '')
    .replace(/\.pdf$/i, '')
    .trim()
}

/**
 * 获取 arXiv 官方 HTML 页面 URL
 * @param {string} rawId 
 * @returns {string}
 */
export function getArxivHtmlUrl(rawId) {
  const id = cleanArxivId(rawId)
  return id ? `https://arxiv.org/html/${id}` : ''
}

/**
 * 预处理 HTML 中的数学公式与无关标记
 * 将 LaTeXML 的 <math> 标注提取为标准 LaTeX 行内 ($...$) 或块级 ($$...$$) 公式
 * @param {string} html 
 * @returns {string}
 */
function preprocessArxivHtml(html) {
  if (!html) return ''

  // 1. 提取 <math> 标签内的 LaTeX TeX 源码
  let text = html.replace(/<math[^>]*>([\s\S]*?)<\/math>/gi, (match) => {
    const isDisplay = match.includes('display="block"') || match.includes('display=\'block\'')
    // 优先提取 <annotation encoding="application/x-tex">TeX</annotation>
    const annotMatch = match.match(/<annotation[^>]*encoding=["']application\/x-tex["'][^>]*>([\s\S]*?)<\/annotation>/i)
    if (annotMatch && annotMatch[1]) {
      const tex = annotMatch[1].trim()
      return isDisplay ? `\n\n$$\n${tex}\n$$\n\n` : ` $${tex}$ `
    }
    // 降级提取 alttext 属性
    const altMatch = match.match(/alttext=["']([^"']*)["']/i)
    if (altMatch && altMatch[1]) {
      const tex = altMatch[1].trim()
      return isDisplay ? `\n\n$$\n${tex}\n$$\n\n` : ` $${tex}$ `
    }
    return match
  })

  // 2. 移除对正文研读无用且大幅增加 Token 开销的导航与目录标记
  text = text.replace(/<div class=["'][^"']*ltx_page_navbar[^"']*["'][\s\S]*?<\/div>/gi, '')
  text = text.replace(/<div class=["'][^"']*ltx_TOC[^"']*["'][\s\S]*?<\/div>/gi, '')
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  text = text.replace(/<header class=["'][^"']*ltx_header[^"']*["'][\s\S]*?<\/header>/gi, '')
  text = text.replace(/<div class=["'][^"']*ltx_page_sidebar[^"']*["'][\s\S]*?<\/div>/gi, '')
  text = text.replace(/<div class=["'][^"']*ltx_page_footer[^"']*["'][\s\S]*?<\/div>/gi, '')
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')

  return text
}

/**
 * 递归解析 DOM 节点为清晰的 Markdown 文本
 * @param {Node} node 
 * @returns {string}
 */
function nodeToMarkdown(node) {
  if (!node) return ''

  // 文本节点
  if (node.nodeType === 3) { // Node.TEXT_NODE
    return node.nodeValue || ''
  }

  if (node.nodeType !== 1) { // 不是元素节点
    return ''
  }

  const el = node
  const tag = el.tagName.toLowerCase()

  // 忽略不可见或已处理标签
  if (['script', 'style', 'nav', 'noscript'].includes(tag)) {
    return ''
  }

  // 参考文献部分通常体量巨大且以引用元数据为主，精简保留或跳过
  if (el.classList && el.classList.contains('ltx_bibliography')) {
    return '\n\n## References\n*(参考文献列表已略，如需特定文献引用可在提问中指出)*\n\n'
  }

  // 子节点递归
  const childTexts = []
  for (let i = 0; i < el.childNodes.length; i++) {
    childTexts.push(nodeToMarkdown(el.childNodes[i]))
  }
  const childrenMarkdown = childTexts.join('')

  // 根据元素类型格式化
  switch (tag) {
    case 'h1':
      return `\n\n# ${childrenMarkdown.trim()}\n\n`
    case 'h2':
      return `\n\n## ${childrenMarkdown.trim()}\n\n`
    case 'h3':
      return `\n\n### ${childrenMarkdown.trim()}\n\n`
    case 'h4':
    case 'h5':
    case 'h6':
      return `\n\n#### ${childrenMarkdown.trim()}\n\n`
    case 'p':
      return `\n\n${childrenMarkdown.trim()}\n\n`
    case 'blockquote':
      return `\n\n> ${childrenMarkdown.trim()}\n\n`
    case 'ul':
      return `\n\n${childrenMarkdown}\n\n`
    case 'ol':
      return `\n\n${childrenMarkdown}\n\n`
    case 'li':
      return `\n- ${childrenMarkdown.trim()}`
    case 'strong':
    case 'b':
      return ` **${childrenMarkdown.trim()}** `
    case 'em':
    case 'i':
      return ` *${childrenMarkdown.trim()}* `
    case 'code':
      return ` \`${childrenMarkdown.trim()}\` `
    case 'figcaption':
      return `\n\n*图表说明: ${childrenMarkdown.trim()}*\n\n`
    case 'table':
      return `\n\n${childrenMarkdown.trim()}\n\n`
    case 'tr':
      return `\n${childrenMarkdown.trim()}`
    case 'th':
    case 'td':
      return ` | ${childrenMarkdown.trim()} `
    default:
      return childrenMarkdown
  }
}

/**
 * 将 arXiv HTML 字符串转换为学术 Markdown 文本
 * @param {string} htmlString 原始 HTML
 * @param {string} arxivId arXiv 编号
 * @returns {{ title: string, authors: string, abstract: string, markdown: string, wordCount: number }}
 */
export function parseArxivHtmlToMarkdown(htmlString, arxivId = '') {
  if (!htmlString || typeof htmlString !== 'string') {
    return {
      title: '',
      authors: '',
      abstract: '',
      markdown: '',
      wordCount: 0
    }
  }

  const cleanHtml = preprocessArxivHtml(htmlString)

  // 1. 尝试使用浏览器环境的 DOMParser
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(cleanHtml, 'text/html')

      // 提取标题
      const titleEl = doc.querySelector('.ltx_title_document') || doc.querySelector('h1') || doc.querySelector('title')
      let title = titleEl ? titleEl.textContent.replace(/^arXiv:\S+\s*/i, '').trim() : ''

      // 提取作者
      const authorsEl = doc.querySelector('.ltx_authors')
      let authors = authorsEl ? authorsEl.textContent.trim().replace(/\s+/g, ' ') : ''

      // 提取摘要
      const abstractEl = doc.querySelector('.ltx_abstract')
      let abstract = ''
      if (abstractEl) {
        abstract = abstractEl.textContent.replace(/^Abstract:?\s*/i, '').trim()
      }

      // 获取文章正文根节点
      const mainEl = doc.querySelector('.ltx_document') || doc.querySelector('article') || doc.body
      let rawMarkdown = nodeToMarkdown(mainEl)

      // 去除连续 3 个以上的换行
      rawMarkdown = rawMarkdown.replace(/\n{3,}/g, '\n\n').trim()

      return {
        title,
        authors,
        abstract,
        markdown: rawMarkdown,
        wordCount: rawMarkdown.length
      }
    } catch (_) {
      // DOMParser 异常时降级使用正则清洗
    }
  }

  // 2. 正则兜底解析器（支持 Node 环境及纯文本降级）
  let title = ''
  const titleMatch = cleanHtml.match(/<h1[^>]*class=["'][^"']*ltx_title_document[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
                     cleanHtml.match(/<title>([^<]+)<\/title>/i)
  if (titleMatch) {
    title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/^arXiv:\S+\s*/i, '').trim()
  }

  let authors = ''
  const authorsMatch = cleanHtml.match(/<div[^>]*class=["'][^"']*ltx_authors[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
  if (authorsMatch) {
    authors = authorsMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ')
  }

  let abstract = ''
  const absMatch = cleanHtml.match(/<div[^>]*class=["'][^"']*ltx_abstract[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
  if (absMatch) {
    abstract = absMatch[1].replace(/<[^>]+>/g, '').replace(/^Abstract:?\s*/i, '').trim()
  }

  // 剥离剩余 HTML 标签并保留换行
  let rawMarkdown = cleanHtml
    .replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, '\n\n## $1\n\n')
    .replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, '\n\n### $1\n\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    title,
    authors,
    abstract,
    markdown: rawMarkdown,
    wordCount: rawMarkdown.length
  }
}

/**
 * 纯客户端异步抓取并解析 arXiv 论文全文
 * @param {string} rawId arXiv 编号
 * @param {Object} options
 * @param {AbortSignal} [options.signal] 取消信号
 * @param {number} [options.timeout=20000] 超时时间毫秒数
 * @returns {Promise<{ ok: boolean, fullText: string, title: string, authors: string, abstract: string, wordCount: number, error?: string, isFallback?: boolean }>}
 */
export async function fetchArxivPaperFulltext(rawId, { signal, timeout = 20000 } = {}) {
  const cleanId = cleanArxivId(rawId)
  if (!cleanId) {
    return {
      ok: false,
      fullText: '',
      title: '',
      authors: '',
      abstract: '',
      wordCount: 0,
      error: '无效的 arXiv 论文编号'
    }
  }

  const htmlUrl = getArxivHtmlUrl(cleanId)

  // 带有超时的控制器
  const timeoutCtrl = new AbortController()
  const timer = setTimeout(() => timeoutCtrl.abort(), timeout)

  // 若传入外部 signal，联动触发
  if (signal) {
    signal.addEventListener('abort', () => timeoutCtrl.abort(), { once: true })
  }

  try {
    const res = await fetch(htmlUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: timeoutCtrl.signal
    })
    clearTimeout(timer)

    if (res.status === 200) {
      const htmlText = await res.text()
      const parsed = parseArxivHtmlToMarkdown(htmlText, cleanId)
      if (parsed.markdown && parsed.markdown.length > 200) {
        return {
          ok: true,
          fullText: parsed.markdown,
          title: parsed.title,
          authors: parsed.authors,
          abstract: parsed.abstract,
          wordCount: parsed.wordCount
        }
      }
    }

    if (res.status === 404) {
      return {
        ok: false,
        fullText: '',
        title: '',
        authors: '',
        abstract: '',
        wordCount: 0,
        error: '该论文在 arXiv 上尚未生成实验性 HTML 网页版本 (HTTP 404)'
      }
    }

    return {
      ok: false,
      fullText: '',
      title: '',
      authors: '',
      abstract: '',
      wordCount: 0,
      error: `抓取 arXiv HTML 失败，服务器返回 HTTP ${res.status}`
    }
  } catch (err) {
    clearTimeout(timer)
    if (signal?.aborted || timeoutCtrl.signal.aborted) {
      return {
        ok: false,
        fullText: '',
        title: '',
        authors: '',
        abstract: '',
        wordCount: 0,
        error: '获取 arXiv HTML 超时，请检查网络环境'
      }
    }
    return {
      ok: false,
      fullText: '',
      title: '',
      authors: '',
      abstract: '',
      wordCount: 0,
      error: `抓取 arXiv HTML 网络错误: ${err.message || '网络连接异常'}`
    }
  }
}
