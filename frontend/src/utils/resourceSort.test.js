import { describe, it, expect } from 'vitest'
import { compareTitle } from './titleSort'

describe('ResourceHub and Favorites sorting & link logic', () => {
  // Test sorting logic for ResourceHubView
  function sortBooks(books, sortBy, favoritedIds = new Set()) {
    return [...books].sort((a, b) => {
      const aFav = favoritedIds.has(String(a.id)) ? 1 : 0
      const bFav = favoritedIds.has(String(b.id)) ? 1 : 0
      if (aFav !== bFav) return bFav - aFav

      if (sortBy === 'favorites') {
        const aCount = Number(a.favorite_count || 0)
        const bCount = Number(b.favorite_count || 0)
        if (bCount !== aCount) return bCount - aCount
        return compareTitle(a.title, b.title)
      }

      return compareTitle(a.title, b.title)
    })
  }

  it('sorts by title by default, keeping current user favorited items first', () => {
    const books = [
      { id: 1, title: '高等数学', favorite_count: 5 },
      { id: 2, title: '北京天文台', favorite_count: 2 },
      { id: 3, title: 'Astrophysics', favorite_count: 10 },
      { id: 4, title: '宇宙物理学', favorite_count: 0 },
    ]
    // User favorited book 4 (宇宙物理学)
    const favorited = new Set(['4'])
    const sorted = sortBooks(books, 'title', favorited)

    // Book 4 must be first because it is favorited
    expect(sorted[0].id).toBe(4)
    // Remaining are sorted by title: 北京天文台 (B), 高等数学 (G), Astrophysics (A)
    expect(sorted[1].title).toBe('北京天文台')
    expect(sorted[2].title).toBe('高等数学')
    expect(sorted[3].title).toBe('Astrophysics')
  })

  it('sorts by favorite_count descending when sortBy is favorites, keeping favorited items first', () => {
    const books = [
      { id: 1, title: '高等数学', favorite_count: 5 },
      { id: 2, title: '北京天文台', favorite_count: 2 },
      { id: 3, title: 'Astrophysics', favorite_count: 10 },
      { id: 4, title: '宇宙物理学', favorite_count: 1 },
    ]
    // User favorited book 2 (北京天文台, count 2) and book 4 (宇宙物理学, count 1)
    const favorited = new Set(['2', '4'])
    const sorted = sortBooks(books, 'favorites', favorited)

    // Favorited items are at top, ordered by favorite_count: 2 (count 2), then 4 (count 1)
    expect(sorted[0].id).toBe(2)
    expect(sorted[1].id).toBe(4)

    // Non-favorited items follow, ordered by favorite_count: 3 (count 10), then 1 (count 5)
    expect(sorted[2].id).toBe(3)
    expect(sorted[3].id).toBe(1)
  })

  // Test FavoritesView website card link generation
  function getResourceLinks(item) {
    if (!item) return []
    if (item.category === '网站') {
      let siteUrl = item.download_url || item.tutorial_url || item.github_url || ''
      if (!siteUrl && item.title && (item.title.includes('http://') || item.title.includes('https://') || item.title.includes('.org') || item.title.includes('.com') || item.title.includes('.cn') || item.title.includes('.net') || item.title.includes('.edu'))) {
        siteUrl = item.title
      }
      const finalUrl = siteUrl ? (siteUrl.startsWith('/') || /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`) : ''
      return finalUrl ? [{ url: finalUrl, label: '跳转' }] : []
    }
    return [
      { url: item.tutorial_url, label: '讲义' },
      { url: item.exercise_url, label: '习题' },
      { url: item.github_url, label: '代码' },
      { url: item.download_url, label: '下载' }
    ].filter(link => Boolean(link.url && link.url !== '#'))
  }

  it('renders "跳转" instead of "下载" for website cards in favorites', () => {
    const websiteItem = {
      category: '网站',
      title: 'NASA ADS',
      download_url: 'https://ui.adsabs.harvard.edu'
    }
    const links = getResourceLinks(websiteItem)
    expect(links).toHaveLength(1)
    expect(links[0].label).toBe('跳转')
    expect(links[0].url).toBe('https://ui.adsabs.harvard.edu')
    expect(links.some(l => l.label === '下载')).toBe(false)
  })

  it('renders "下载" and other fields for non-website cards in favorites', () => {
    const textbookItem = {
      category: '教材',
      title: '宇宙学导论',
      download_url: '/api/files/abc.pdf',
      tutorial_url: 'https://example.com/slides'
    }
    const links = getResourceLinks(textbookItem)
    expect(links).toHaveLength(2)
    expect(links.some(l => l.label === '下载')).toBe(true)
    expect(links.some(l => l.label === '讲义')).toBe(true)
    expect(links.some(l => l.label === '跳转')).toBe(false)
  })

  // Test getFirstLink logic from ResourceHubView
  function normalizeUrl(url) {
    if (!url) return ''
    url = url.trim()
    if (url.startsWith('/') || /^https?:\/\//i.test(url)) return url
    return 'https://' + url
  }

  function getFirstLink(book) {
    if (!book) return ''
    if (book.category === '网站') {
      let siteUrl = book.download_url || book.tutorial_url || book.github_url || ''
      if (!siteUrl && book.title && (book.title.includes('.org') || book.title.includes('.com'))) {
        siteUrl = book.title
      }
      if (siteUrl) return normalizeUrl(siteUrl)
    }
    if (book.download_url && book.download_url.trim()) {
      return normalizeUrl(book.download_url)
    }
    if (book.tutorial_url && book.tutorial_url.trim()) {
      return normalizeUrl(book.tutorial_url)
    }
    if (book.exercise_url && book.exercise_url.trim()) {
      return normalizeUrl(book.exercise_url)
    }
    if (book.github_url && book.github_url.trim()) {
      return normalizeUrl(book.github_url)
    }
    return ''
  }

  it('prioritizes download_url for book cards when download_url is provided', () => {
    const bookWithAllLinks = {
      category: '教材',
      title: '统计学习方法',
      download_url: 'https://pan.baidu.com/s/12345',
      tutorial_url: 'https://example.com/slides',
      exercise_url: 'https://example.com/exercises',
      github_url: 'https://github.com/example/code'
    }
    // download_url must be prioritized
    expect(getFirstLink(bookWithAllLinks)).toBe('https://pan.baidu.com/s/12345')
  })

  it('falls back to tutorial, exercise, or github link if download_url is empty', () => {
    const bookWithoutDownload = {
      category: '教材',
      title: '统计学习方法',
      download_url: '',
      tutorial_url: 'https://example.com/slides',
      exercise_url: 'https://example.com/exercises',
      github_url: 'https://github.com/example/code'
    }
    expect(getFirstLink(bookWithoutDownload)).toBe('https://example.com/slides')

    const bookWithOnlyCode = {
      category: '工具',
      title: 'PyTorch 源码',
      download_url: '',
      github_url: 'https://github.com/pytorch/pytorch'
    }
    expect(getFirstLink(bookWithOnlyCode)).toBe('https://github.com/pytorch/pytorch')
  })
})
