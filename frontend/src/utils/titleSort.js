/**
 * Utility for sorting titles by first letter/character (首字母/首字排序)
 * Supports Chinese (Pinyin), English (Alphabetical), numbers, and LaTeX titles.
 */

export function cleanTitleForSort(title) {
  if (typeof title !== 'string') return ''
  return title
    .trim()
    .replace(/^["'“”‘’\$*#`\s<>《》「」【】\[\]\(\)（）—\-_·]+/, '')
    .trim()
}

export function compareTitle(aTitle, bTitle) {
  const strA = cleanTitleForSort(aTitle)
  const strB = cleanTitleForSort(bTitle)

  if (!strA && !strB) return 0
  if (!strA) return 1
  if (!strB) return -1

  return strA.localeCompare(strB, 'zh-Hans-CN', {
    numeric: true,
    sensitivity: 'base'
  })
}
