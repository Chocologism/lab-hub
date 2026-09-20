/**
 * LabOrbit 客户端 Mock Axios 适配器
 * 用于 GitHub Pages 纯静态展示环境，拦截所有 /api/* 请求，在浏览器本地模拟持久化
 */

import {
  DEMO_MEMBERS,
  DEMO_SITE_CONFIG,
  DEMO_SEMINARS,
  DEMO_ARXIV_PAPERS,
  DEMO_NOTICES,
  DEMO_RESOURCES_CATEGORIES,
  DEMO_PENDING_IMPORTS,
  DEMO_TALKS
} from './demoData'

const STORAGE_KEYS = {
  VERSION: 'laborbit_demo_version_v1',
  SEMINARS: 'laborbit_demo_seminars',
  PAPERS: 'laborbit_demo_papers',
  NOTICES: 'laborbit_demo_notices',
  RESOURCES: 'laborbit_demo_resources',
  PENDING_IMPORTS: 'laborbit_demo_pending_imports',
  TALKS: 'laborbit_demo_talks',
  SETTINGS: 'laborbit_demo_settings'
}

// 初始化或恢复持久化数据
export function initDemoStorage(force = false) {
  if (typeof localStorage === 'undefined') return

  const isCurrentVersion = localStorage.getItem(STORAGE_KEYS.VERSION) === '1.0'
  if (!isCurrentVersion || force) {
    localStorage.setItem(STORAGE_KEYS.VERSION, '1.0')
    localStorage.setItem(STORAGE_KEYS.SEMINARS, JSON.stringify(DEMO_SEMINARS))
    localStorage.setItem(STORAGE_KEYS.PAPERS, JSON.stringify(DEMO_ARXIV_PAPERS))
    localStorage.setItem(STORAGE_KEYS.NOTICES, JSON.stringify(DEMO_NOTICES))
    localStorage.setItem(STORAGE_KEYS.RESOURCES, JSON.stringify(DEMO_RESOURCES_CATEGORIES))
    localStorage.setItem(STORAGE_KEYS.PENDING_IMPORTS, JSON.stringify(DEMO_PENDING_IMPORTS))
    localStorage.setItem(STORAGE_KEYS.TALKS, JSON.stringify(DEMO_TALKS))
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEMO_SITE_CONFIG))
  }
}

export function resetDemoStorage() {
  initDemoStorage(true)
  localStorage.setItem('labhub_user', JSON.stringify(DEMO_MEMBERS[1]))
  localStorage.setItem('labhub_token', 'demo_jwt_token_laborbit_experience')
  window.location.reload()
}

function getStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (e) {
    return fallback
  }
}

function setStored(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch (e) {
    console.warn('Demo storage quota exceeded:', e)
  }
}

function parseJsonBody(config) {
  if (!config.data) return {}
  if (typeof config.data === 'object' && !(config.data instanceof FormData)) return config.data
  try {
    return JSON.parse(config.data)
  } catch (e) {
    return {}
  }
}

/**
 * 自定义 Axios 适配器
 */
export async function demoAxiosAdapter(config) {
  initDemoStorage()

  const url = (config.url || '').replace(/^\/api/, '/api')
  const method = (config.method || 'get').toLowerCase()
  const body = parseJsonBody(config)

  // 模拟稍微真实的微小延迟 (20ms ~ 60ms)，避免界面视觉突兀
  await new Promise(r => setTimeout(r, 40))

  const respond = (data, status = 200) => ({
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' },
    config
  })

  // 1. 系统配置与健康状态
  if (url === '/api/system/status' || url === '/api/system/settings') {
    const settings = getStored(STORAGE_KEYS.SETTINGS, DEMO_SITE_CONFIG)
    return respond(settings)
  }
  if (url === '/api/health') {
    return respond({ status: 'healthy', service: 'LabOrbit GitHub Pages Demo API', demo: true })
  }

  // 2. 身份认证与成员
  if (url === '/api/auth/me') {
    const user = getStored('labhub_user', DEMO_MEMBERS[1])
    return respond(user)
  }
  if (url === '/api/auth/login') {
    const email = body.email || ''
    const found = DEMO_MEMBERS.find(m => m.email === email) || DEMO_MEMBERS[1]
    localStorage.setItem('labhub_token', 'demo_jwt_token_laborbit_experience')
    localStorage.setItem('labhub_user', JSON.stringify(found))
    return respond({ access_token: 'demo_jwt_token_laborbit_experience', token_type: 'bearer', user: found })
  }
  if (url === '/api/auth/heartbeat') {
    return respond({ success: true, timestamp: new Date().toISOString() })
  }
  if (url === '/api/auth/members') {
    return respond(DEMO_MEMBERS)
  }
  if (url === '/api/auth/complete-tutorial') {
    const cur = getStored('labhub_user', DEMO_MEMBERS[1])
    cur.is_tutorial_completed = true
    setStored('labhub_user', cur)
    return respond({ success: true, message: '向导已完成' })
  }

  // 3. 组会排期 (Seminars)
  if (url.startsWith('/api/seminars')) {
    let seminars = getStored(STORAGE_KEYS.SEMINARS, DEMO_SEMINARS)

    if (url === '/api/seminars/mine/upcoming') {
      const cur = getStored('labhub_user', DEMO_MEMBERS[1])
      const mine = seminars.find(s => s.presenter_id === cur.id && s.status === 'upcoming') || seminars[0] || null
      return respond(mine)
    }

    if (url === '/api/seminars/reminders') {
      const needFill = seminars.filter(s => s.status === 'upcoming' && (!s.topic || !s.abstract))
      return respond(needFill)
    }

    if (url === '/api/seminars/settings') {
      return respond({ day_of_week: 5, start_time: '14:30', location: '科研实验楼 5-516 会议室' })
    }

    if (url === '/api/seminars' && method === 'get') {
      return respond(seminars)
    }

    if (url === '/api/seminars' && method === 'post') {
      const newSeminar = {
        id: Date.now(),
        date: body.date || '2026-10-16',
        time: body.time || '14:30',
        location: body.location || '科研实验楼 5-516 会议室',
        presenter_name: body.presenter_name || '主讲人',
        presenter_id: body.presenter_id || 2,
        topic: body.topic || '新排期研讨',
        abstract: body.abstract || '',
        slides_url: body.slides_url || '',
        status: 'upcoming',
        created_at: new Date().toISOString(),
        presentations: body.presentations || []
      }
      seminars.unshift(newSeminar)
      setStored(STORAGE_KEYS.SEMINARS, seminars)
      return respond(newSeminar)
    }

    // PUT /api/seminars/:id/abstract or topic
    const mAbstract = url.match(/\/api\/seminars\/(\d+)\/(abstract|topic)/)
    if (mAbstract && method === 'put') {
      const sId = parseInt(mAbstract[1], 10)
      const target = seminars.find(s => s.id === sId)
      if (target) {
        if (body.abstract !== undefined) target.abstract = body.abstract
        if (body.topic !== undefined) target.topic = body.topic
        setStored(STORAGE_KEYS.SEMINARS, seminars)
      }
      return respond(target || { success: true })
    }

    // PUT /api/seminars/:id
    const mId = url.match(/\/api\/seminars\/(\d+)$/)
    if (mId && method === 'put') {
      const sId = parseInt(mId[1], 10)
      const idx = seminars.findIndex(s => s.id === sId)
      if (idx !== -1) {
        seminars[idx] = { ...seminars[idx], ...body }
        setStored(STORAGE_KEYS.SEMINARS, seminars)
        return respond(seminars[idx])
      }
    }

    if (mId && method === 'delete') {
      const sId = parseInt(mId[1], 10)
      seminars = seminars.filter(s => s.id !== sId)
      setStored(STORAGE_KEYS.SEMINARS, seminars)
      return respond({ success: true, message: '已删除' })
    }
  }

  // 4. arXiv 文献订阅流 (Arxiv Papers)
  if (url.startsWith('/api/arxiv')) {
    let papers = getStored(STORAGE_KEYS.PAPERS, DEMO_ARXIV_PAPERS)

    if (url.startsWith('/api/arxiv/feed')) {
      return respond(papers)
    }

    if (url === '/api/arxiv/preview') {
      return respond({
        title: 'High-Precision Cosmological Inference from JWST Deep Field Galaxy Clustering',
        authors: 'Alex Turner, Elena Vasquez, Hua Li',
        journal: 'arXiv:2409.11029',
        published_date: '2026-09-18',
        abstract: 'We present cosmological parameter estimations based on three-dimensional clustering of high-redshift galaxies identified in public JWST NIRCam surveys, demonstrating strong sensitivity to primordial non-Gaussianity.',
        primary_category: 'astro-ph.CO',
        pdf_url: 'https://arxiv.org/pdf/2409.11029.pdf'
      })
    }

    if (url === '/api/arxiv/recommend' && method === 'post') {
      const cur = getStored('labhub_user', DEMO_MEMBERS[1])
      const newPaper = {
        id: Date.now(),
        arxiv_id: body.arxiv_id || '2409.11029',
        title: body.title || '最新文献分享',
        authors: body.authors || cur.real_name,
        journal: `arXiv:${body.arxiv_id || '2409.11029'}`,
        primary_category: body.primary_category || 'astro-ph.CO',
        published_date: new Date().toISOString().split('T')[0],
        source_url: `https://arxiv.org/abs/${body.arxiv_id || '2409.11029'}`,
        pdf_url: `https://arxiv.org/pdf/${body.arxiv_id || '2409.11029'}.pdf`,
        abstract: body.abstract || '用户在线推荐文献摘要。',
        recommended_by: cur.name,
        recommended_at: new Date().toISOString().split('T')[0],
        notes: body.notes || '',
        likes_count: 1,
        user_liked: false,
        read: false,
        comments: []
      }
      papers.unshift(newPaper)
      setStored(STORAGE_KEYS.PAPERS, papers)
      return respond(newPaper)
    }

    // Toggle Read
    const mRead = url.match(/\/api\/arxiv\/(\d+)\/read-toggle/)
    if (mRead && method === 'post') {
      const pId = parseInt(mRead[1], 10)
      const p = papers.find(item => item.id === pId)
      if (p) {
        p.read = !p.read
        setStored(STORAGE_KEYS.PAPERS, papers)
        return respond({ read: p.read })
      }
    }

    // Toggle Like
    const mLike = url.match(/\/api\/arxiv\/(\d+)\/like/)
    if (mLike && method === 'post') {
      const pId = parseInt(mLike[1], 10)
      const p = papers.find(item => item.id === pId)
      if (p) {
        p.user_liked = !p.user_liked
        p.likes_count = (p.likes_count || 0) + (p.user_liked ? 1 : -1)
        setStored(STORAGE_KEYS.PAPERS, papers)
        return respond({ user_liked: p.user_liked, likes_count: p.likes_count })
      }
    }

    // Comments
    const mComments = url.match(/\/api\/arxiv\/(\d+)\/comments/)
    if (mComments) {
      const pId = parseInt(mComments[1], 10)
      const p = papers.find(item => item.id === pId)
      if (method === 'get') {
        return respond(p?.comments || [])
      }
      if (method === 'post') {
        const cur = getStored('labhub_user', DEMO_MEMBERS[1])
        const newC = {
          id: Date.now(),
          paper_id: pId,
          user_id: cur.id,
          user_name: cur.name,
          user_nickname: cur.real_name || cur.name,
          content: body.content || '',
          created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        }
        if (p) {
          p.comments = p.comments || []
          p.comments.push(newC)
          setStored(STORAGE_KEYS.PAPERS, papers)
        }
        return respond(newC)
      }
    }

    const mDelComment = url.match(/\/api\/arxiv\/comments\/(\d+)/)
    if (mDelComment && method === 'delete') {
      const cId = parseInt(mDelComment[1], 10)
      papers.forEach(p => {
        if (p.comments) p.comments = p.comments.filter(c => c.id !== cId)
      })
      setStored(STORAGE_KEYS.PAPERS, papers)
      return respond({ success: true })
    }
  }

  // 5. 公文通知 (Notices)
  if (url.startsWith('/api/notices')) {
    let notices = getStored(STORAGE_KEYS.NOTICES, DEMO_NOTICES)

    if (url === '/api/notices' && method === 'get') {
      return respond(notices)
    }

    if (url === '/api/notices' && method === 'post') {
      const cur = getStored('labhub_user', DEMO_MEMBERS[1])
      const newNotice = {
        id: Date.now(),
        title: body.title || '新通知',
        content: body.content || '',
        category: body.category || 'general',
        importance: body.importance || 'normal',
        start_date: body.start_date || new Date().toISOString().split('T')[0],
        end_date: body.end_date || '',
        created_by_name: cur.name,
        created_at: new Date().toISOString(),
        attachments: body.attachments || []
      }
      notices.unshift(newNotice)
      setStored(STORAGE_KEYS.NOTICES, notices)
      return respond(newNotice)
    }

    const mNoticeId = url.match(/\/api\/notices\/(\d+)$/)
    if (mNoticeId && method === 'delete') {
      const nId = parseInt(mNoticeId[1], 10)
      notices = notices.filter(n => n.id !== nId)
      setStored(STORAGE_KEYS.NOTICES, notices)
      return respond({ success: true })
    }
  }

  // 6. 学术资源与教材 (Resources)
  if (url.startsWith('/api/resources')) {
    let categories = getStored(STORAGE_KEYS.RESOURCES, DEMO_RESOURCES_CATEGORIES)
    if (url === '/api/resources/categories') {
      return respond(categories)
    }
    if (url === '/api/resources/books' && method === 'post') {
      const newBook = {
        id: Date.now(),
        title: body.title || '新学术资源',
        author: body.author || '',
        category_id: body.category_id || 1,
        rating: 5,
        notes: body.notes || '',
        file_url: body.file_url || '',
        link_url: body.link_url || ''
      }
      const cat = categories.find(c => c.id === newBook.category_id)
      if (cat) {
        cat.books = cat.books || []
        cat.books.push(newBook)
        setStored(STORAGE_KEYS.RESOURCES, categories)
      }
      return respond(newBook)
    }
  }

  // 7. 协同待处理队列 (Schedule Imports)
  if (url.startsWith('/api/schedule-imports')) {
    let pending = getStored(STORAGE_KEYS.PENDING_IMPORTS, DEMO_PENDING_IMPORTS)

    if (url === '/api/schedule-imports/pending' && method === 'get') {
      return respond({ list: pending, total: pending.length })
    }

    if (url === '/api/schedule-imports/pending' && method === 'post') {
      const cur = getStored('labhub_user', DEMO_MEMBERS[1])
      const item = {
        id: Date.now(),
        raw_text: body.raw_text || '',
        inferred_type: body.inferred_type || 'talk',
        parsed_data: body.parsed_data || {},
        image_urls: body.image_urls || [],
        file_attachments: body.file_attachments || [],
        status: 'pending',
        created_by_id: cur.id,
        created_by_name: cur.name,
        created_at: new Date().toISOString()
      }
      pending.unshift(item)
      setStored(STORAGE_KEYS.PENDING_IMPORTS, pending)
      return respond({ success: true, id: item.id, message: '已加入协同待处理队列' })
    }

    const mResolve = url.match(/\/api\/schedule-imports\/(\d+)\/resolve/)
    if (mResolve && method === 'post') {
      const id = parseInt(mResolve[1], 10)
      pending = pending.filter(p => p.id !== id)
      setStored(STORAGE_KEYS.PENDING_IMPORTS, pending)
      return respond({ success: true, message: '已审核并正式发布' })
    }

    const mDelPending = url.match(/\/api\/schedule-imports\/(\d+)$/)
    if (mDelPending && method === 'delete') {
      const id = parseInt(mDelPending[1], 10)
      pending = pending.filter(p => p.id !== id)
      setStored(STORAGE_KEYS.PENDING_IMPORTS, pending)
      return respond({ success: true, message: '已删除' })
    }
  }

  // 8. 天文台报告与学术会议 (Talks)
  if (url.startsWith('/api/talks')) {
    let talks = getStored(STORAGE_KEYS.TALKS, DEMO_TALKS)
    if (url === '/api/talks' && method === 'get') {
      return respond(talks)
    }
    if (url === '/api/talks' && method === 'post') {
      const newTalk = {
        id: Date.now(),
        title: body.title || '学术报告',
        speaker: body.speaker || '',
        date: body.date || new Date().toISOString().split('T')[0],
        time: body.time || '10:00',
        location: body.location || '研讨室',
        notes: body.notes || '',
        event_type: body.event_type || 'talk',
        source: '在线演示创建'
      }
      talks.unshift(newTalk)
      setStored(STORAGE_KEYS.TALKS, talks)
      return respond(newTalk)
    }
  }

  // 9. 收藏夹 (Favorites) & 个人中心 (Account)
  if (url === '/api/favorites') {
    return respond({ papers: [], books: [] })
  }
  if (url === '/api/library') {
    return respond([])
  }
  if (url.startsWith('/api/account/profile') && method === 'put') {
    const cur = getStored('labhub_user', DEMO_MEMBERS[1])
    Object.assign(cur, body)
    setStored('labhub_user', cur)
    return respond(cur)
  }

  // 10. 通用兜底响应：防止未处理的接口报错中断页面
  console.log(`[DemoMode] Mock hit generic fallback: ${method.toUpperCase()} ${url}`)
  return respond({
    success: true,
    message: 'Demo Mock Handled',
    list: [],
    total: 0
  })
}
