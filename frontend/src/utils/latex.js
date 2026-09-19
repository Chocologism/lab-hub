import katex from 'katex'

/**
 * HTML 转义函数，确保非数学公式部分的文本不会引入 XSS
 */
export function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 快速检测文本中是否包含 LaTeX 标记或公式定界符
 */
export function hasLatex(text) {
  if (!text) return false
  const str = String(text)
  return str.includes('$') || str.includes('\\')
}

/**
 * 针对天文/物理学 arXiv 文献中常见的宏与重音符号进行预处理
 */
export const LATEX_MACROS = {
  // 天文/物理学常用天体符号与单位
  '\\sun': '\\odot',
  '\\earth': '\\oplus',
  '\\arcsec': '^{\\prime\\prime}',
  '\\arcmin': '^{\\prime}',
  '\\degr': '^{\\circ}',
  '\\arcdeg': '^{\\circ}',
  // 天文角秒/角分/度数与时间小数角点宏（如 1\farcs5 代表 1."5）
  '\\farcs': '.\\!^{\\prime\\prime}',
  '\\farcm': '.\\!^{\\prime}',
  '\\fdg': '.\\!^{\\circ}',
  '\\fs': '.\\!^{\\mathrm{s}}',
  '\\fm': '.\\!^{\\mathrm{m}}',
  '\\fh': '.\\!^{\\mathrm{h}}',
  '\\fp': '.\\!^{\\mathrm{p}}',
  // 物理与天体物理常用单位与复合符号
  '\\micron': '\\mu\\mathrm{m}',
  '\\kms': '\\mathrm{km\\,s^{-1}}',
  '\\Msun': 'M_{\\odot}',
  '\\Lsun': 'L_{\\odot}',
  '\\Rsun': 'R_{\\odot}',
  '\\Zsun': 'Z_{\\odot}',
  '\\nodata': '\\cdots',
  '\\la': '\\lesssim',
  '\\ga': '\\gtrsim',
  // 文本样式宏兼容（防止在公式内出现 \textsc / \sc 等报错）
  '\\textsc': '\\mathrm{#1}',
  '\\sc': '\\mathrm',
}

/**
 * 转换正文中常见的 TeX 重音符号（如 S\'ersic -> Sérsic）
 */
export function normalizeTexAccents(text) {
  if (!text) return ''
  return text
    .replace(/\\'\s*([a-zA-Z])/g, (m, c) => {
      const map = { e: 'é', E: 'É', a: 'á', A: 'Á', o: 'ó', O: 'Ó', i: 'í', I: 'Í', u: 'ú', U: 'Ú', c: 'ć', C: 'Ć', n: 'ń', N: 'Ń' }
      return map[c] || c
    })
    .replace(/\\`\s*([a-zA-Z])/g, (m, c) => {
      const map = { e: 'è', E: 'È', a: 'à', A: 'À', o: 'ò', O: 'Ò', i: 'ì', I: 'Ì', u: 'ù', U: 'Ù' }
      return map[c] || c
    })
    .replace(/\\"\s*([a-zA-Z])/g, (m, c) => {
      const map = { e: 'ë', E: 'Ë', a: 'ä', A: 'Ä', o: 'ö', O: 'Ö', u: 'ü', U: 'Ü' }
      return map[c] || c
    })
    .replace(/\\\^\s*([a-zA-Z])/g, (m, c) => {
      const map = { e: 'ê', E: 'Ê', a: 'â', A: 'Â', o: 'ô', O: 'Ô', u: 'û', U: 'Û', i: 'î', I: 'Î' }
      return map[c] || c
    })
    .replace(/\\~([a-zA-Z])/g, (m, c) => {
      const map = { n: 'ñ', N: 'Ñ', a: 'ã', A: 'Ã', o: 'õ', O: 'Õ' }
      return map[c] || c
    })
    .replace(/\\c\s*\{?c\}?/gi, 'ç')
    .replace(/\\AA\b/g, 'Å')
    .replace(/\\aa\b/g, 'å')
}

/**
 * 对未被公式定界符包裹的天文常用宏进行预处理（如 1\farcs5 -> $1\farcs5$、\farcs -> $\farcs$）
 * 严格保留 Markdown 中的代码块 (```...```)、行内代码 (`...`) 以及已有数学公式 ($$...$$, \[...\], $...$, \(...\)) 原始内容不受干扰
 */
export function preprocessAstroTex(text) {
  if (!text) return ''
  const str = String(text)
  if (!str.includes('\\farcs') && !str.includes('\\farcm') && !str.includes('\\fdg') && !str.includes('\\fs') && !str.includes('\\fm') && !str.includes('\\fh') && !str.includes('\\arcsec') && !str.includes('\\arcmin') && !str.includes('\\arcdeg')) {
    return str
  }

  // 保护代码块与已有数学公式区域
  const protectedPattern = /(```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\s)(?:\\\$|[^\$\n])+?(?<!\s)\$)/g
  const parts = str.split(protectedPattern)
  return parts.map((part, i) => {
    // 奇数索引为已包裹的代码块或公式，直接原样保留
    if (i % 2 === 1) return part
    // 在普通正文区域，将裸露的天文角秒/角分/度数/时间小数宏自动转为行内公式
    return part.replace(/(?<!\$|[a-zA-Z0-9\\])(\d*\\(?:farcs|farcm|fdg|fs|fm|fh)\d*)(?!\$|[a-zA-Z0-9])/g, (match) => {
      return `$${match}$`
    })
  }).join('')
}

/**
 * 将非公式文本中的常见裸 TeX 符号转为友好的 Unicode 字符（如 \sim -> ∼）
 */
export function replaceBareSymbols(text) {
  if (!text) return ''
  return text
    .replace(/\\farcs\b/g, '.″')
    .replace(/\\farcm\b/g, '.′')
    .replace(/\\fdg\b/g, '.°')
    .replace(/\\arcsec\b/g, '″')
    .replace(/\\arcmin\b/g, '′')
    .replace(/\\degr?\b/g, '°')
    .replace(/\\arcdeg\b/g, '°')
    .replace(/\\sun\b/g, '⊙')
    .replace(/\\earth\b/g, '⊕')
    .replace(/\\sim\b/g, '∼')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\pm\b/g, '±')
    .replace(/\\mp\b/g, '∓')
    .replace(/\\times\b/g, '×')
    .replace(/\\div\b/g, '÷')
    .replace(/\\leq?\b/g, '≤')
    .replace(/\\geq?\b/g, '≥')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\odot\b/g, '⊙')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\propto\b/g, '∝')
    .replace(/\\ll\b/g, '≪')
    .replace(/\\gg\b/g, '≫')
    .replace(/\\,/g, '\u2009')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
}

/**
 * 渲染正文非数学公式区域的常见 TeX 文本样式指令
 * 核心支持：
 * - 小型大写字母：\textsc{...}、{\textsc ...}、{\sc ...}、\sc{...}
 * - 粗体：\textbf{...}、{\bf ...}、{\bfseries ...}
 * - 斜体：\textit{...}、\emph{...}、{\it ...}、{\em ...}
 * - 等宽字体：\texttt{...}、{\tt ...}
 * - 无衬线/衬线：\textsf{...}、{\sf ...}、\textrm{...}、{\rm ...}
 * - 上下标与下划线：\textsuperscript{...}、\textsubscript{...}、\underline{...}
 * 
 * 严格支持任意嵌套、参数前空白与花括号边界匹配，并保持已转义 HTML 安全性
 */
export function renderTexTextFormatting(escapedText, depth = 0) {
  if (depth > 8 || !escapedText || (!escapedText.includes('\\') && !escapedText.includes('{'))) {
    return escapedText
  }

  // 1. 解构包裹在单条命令外的冗余花括号，如 { \textsc{Simba} } -> \textsc{Simba}
  let res = escapedText.replace(/\{(\s*\\[a-zA-Z]+\s*\{[^{}]+\}\s*)\}/g, '$1')

  // 2. 处理 {\cmd ...} 旧式作用域分组语法（常见于天文文献中的 {\sc Simba} 或 {\bf Important}）
  res = res.replace(/\{\s*\\(?:textsc|sc)\s+([^{}]+?)\}/gi, (m, inner) => {
    return `<span class="tex-sc" style="font-variant: small-caps;">${inner.trim()}</span>`
  })
  res = res.replace(/\{\s*\\(?:bf|bfseries)\s+([^{}]+?)\}/gi, '<strong>$1</strong>')
  res = res.replace(/\{\s*\\(?:it|em)\s+([^{}]+?)\}/gi, '<em>$1</em>')
  res = res.replace(/\{\s*\\tt\s+([^{}]+?)\}/gi, '<code class="tex-tt">$1</code>')
  res = res.replace(/\{\s*\\sf\s+([^{}]+?)\}/gi, '<span class="tex-sf" style="font-family: sans-serif;">$1</span>')
  res = res.replace(/\{\s*\\rm\s+([^{}]+?)\}/gi, '<span class="tex-rm" style="font-family: serif;">$1</span>')

  // 3. 处理标准 \cmd{...} 语法，精确处理空格与递归嵌套花括号
  const commands = [
    { name: 'textsc', tag: 'span', attrs: 'class="tex-sc" style="font-variant: small-caps;"' },
    { name: 'sc', tag: 'span', attrs: 'class="tex-sc" style="font-variant: small-caps;"' },
    { name: 'textbf', tag: 'strong' },
    { name: 'textit', tag: 'em' },
    { name: 'emph', tag: 'em' },
    { name: 'texttt', tag: 'code', attrs: 'class="tex-tt"' },
    { name: 'textsf', tag: 'span', attrs: 'class="tex-sf" style="font-family: sans-serif;"' },
    { name: 'textrm', tag: 'span', attrs: 'class="tex-rm" style="font-family: serif;"' },
    { name: 'underline', tag: 'u' },
    { name: 'textsuperscript', tag: 'sup' },
    { name: 'textsubscript', tag: 'sub' }
  ]

  for (const cmd of commands) {
    const pattern = new RegExp('\\\\' + cmd.name + '\\s*\\{', 'gi')
    let match
    let out = ''
    let lastIdx = 0
    while ((match = pattern.exec(res)) !== null) {
      const startIdx = match.index
      const contentStart = startIdx + match[0].length
      let braceDepth = 1
      let j = contentStart
      while (j < res.length && braceDepth > 0) {
        if (res[j] === '{') braceDepth++
        else if (res[j] === '}') braceDepth--
        j++
      }
      if (braceDepth === 0) {
        out += res.slice(lastIdx, startIdx)
        const inner = res.slice(contentStart, j - 1)
        const openTag = cmd.attrs ? `<${cmd.tag} ${cmd.attrs}>` : `<${cmd.tag}>`
        const closeTag = `</${cmd.tag}>`
        out += `${openTag}${renderTexTextFormatting(inner, depth + 1)}${closeTag}`
        lastIdx = j
        pattern.lastIndex = j
      } else {
        break
      }
    }
    out += res.slice(lastIdx)
    res = out
  }

  return res
}

/**
 * 将混合文本（包含纯文本与 LaTeX 公式）渲染为安全的 HTML 字符串
 * 支持：
 * - $$ ... $$ (独立块级公式)
 * - \[ ... \] (独立块级公式)
 * - \( ... \) (行内公式)
 * - $ ... $ (行内公式)
 * - \textsc{...} 等常见学术文本格式排版
 * 
 * @param {string} text - 原始文本
 * @param {object} options - 选项
 * @returns {string} 安全的 HTML 字符串
 */
export function renderLatex(text, options = {}) {
  if (!text) return ''
  
  const textStr = String(text)
  // 如果完全不包含 $、\ 或 {，无需 KaTeX 解析，直接转义返回，极大节省性能
  if (!textStr.includes('$') && !textStr.includes('\\') && !textStr.includes('{')) {
    return escapeHtml(textStr)
  }

  const withAstro = preprocessAstroTex(textStr)
  const cleanText = normalizeTexAccents(withAstro)

  // 匹配各类 LaTeX 定界符的正则：
  // 1. $$ ... $$ (块级)
  // 2. \[ ... \] (块级)
  // 3. \( ... \) (行内)
  // 4. $...$ (行内，避免跨段落与空格混淆)
  const delimiterRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\s)(?:\\\$|[^\$\n])+?(?<!\s)\$)/g

  const parts = cleanText.split(delimiterRegex)

  return parts.map(part => {
    if (!part) return ''

    let math = ''
    let displayMode = false
    let isMath = false

    if (part.startsWith('$$') && part.endsWith('$$') && part.length >= 4) {
      math = part.slice(2, -2).trim()
      displayMode = true
      isMath = true
    } else if (part.startsWith('\\[') && part.endsWith('\\]') && part.length >= 4) {
      math = part.slice(2, -2).trim()
      displayMode = true
      isMath = true
    } else if (part.startsWith('\\(') && part.endsWith('\\)') && part.length >= 4) {
      math = part.slice(2, -2).trim()
      displayMode = false
      isMath = true
    } else if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
      math = part.slice(1, -1).trim()
      displayMode = false
      isMath = true
    }

    if (isMath) {
      if (!math) return ''
      try {
        return katex.renderToString(math, {
          displayMode: options.displayMode !== undefined ? options.displayMode : displayMode,
          throwOnError: false,
          strict: false,
          macros: { ...LATEX_MACROS, ...(options.macros || {}) },
          output: 'htmlAndMathml'
        })
      } catch (err) {
        // 渲染异常时优雅降级为转义字符
        return escapeHtml(part)
      }
    }

    // 非公式片段进行裸符号替换、HTML 安全转义与 TeX 文本样式渲染（如 \textsc{...} 小型大写）
    const safeText = escapeHtml(replaceBareSymbols(part))
    return renderTexTextFormatting(safeText)
  }).join('')
}
