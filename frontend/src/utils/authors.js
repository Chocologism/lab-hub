/**
 * Utility functions for handling paper authors
 */

/**
 * Parses authors from various possible formats (Array, JSON string, comma/semicolon delimited string)
 * @param {string[]|string|null|undefined} authors
 * @returns {string[]} Cleaned list of author names
 */
export function parseAuthors(authors) {
  if (!authors) return []
  if (Array.isArray(authors)) {
    return authors.map(a => String(a).trim()).filter(Boolean)
  }
  if (typeof authors === 'string') {
    const trimmed = authors.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map(a => String(a).trim()).filter(Boolean)
        }
      } catch {
        // fallthrough to string split
      }
    }
    // split by comma, semicolon, or full-width equivalents
    return trimmed.split(/[,，;；\n]/).map(a => a.trim()).filter(Boolean)
  }
  return []
}

/**
 * Formats authors into a human-readable comma-separated string
 * @param {string[]|string|null|undefined} authors
 * @returns {string}
 */
export function formatAuthors(authors) {
  const list = parseAuthors(authors)
  if (list.length > 0) {
    return list.join(', ')
  }
  if (typeof authors === 'string') return authors.trim()
  return ''
}

/**
 * Heuristic estimation of whether authors will exceed a single line (useful for initial SSR/jsdom fallback)
 * @param {string[]|string|null|undefined} authors
 * @param {number} charThreshold
 * @param {number} countThreshold
 * @returns {boolean}
 */
export function isPotentialMultiLine(authors, charThreshold = 55, countThreshold = 3) {
  const list = parseAuthors(authors)
  if (list.length > countThreshold) return true
  const text = formatAuthors(authors)
  return text.length > charThreshold
}
