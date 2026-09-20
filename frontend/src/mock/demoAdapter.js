/**
 * LabOrbit 客户端 Mock Axios 适配器
 * 用于 GitHub Pages 纯静态展示环境，拦截所有 /api/* 请求，在浏览器本地模拟持久化与完整交互体验
 */

import {
  DEMO_MEMBERS,
  DEMO_SITE_CONFIG,
  DEMO_SEMINARS,
  DEMO_ARXIV_PAPERS,
  DEMO_NOTICES,
  DEMO_RESOURCES_CATEGORIES,
  DEMO_BOOKS,
  DEMO_LIBRARY_PAPERS,
  DEMO_PENDING_IMPORTS,
  DEMO_TALKS,
  DEMO_EMAILS,
  DEMO_FEEDBACK_ITEMS
} from './demoData'

const STORAGE_KEYS = {
  VERSION: 'laborbit_demo_version_v2',
  SEMINARS: 'laborbit_demo_seminars',
  PAPERS: 'laborbit_demo_papers',
  NOTICES: 'laborbit_demo_notices',
  RESOURCES_CATEGORIES: 'laborbit_demo_resources_categories',
  BOOKS: 'laborbit_demo_books',
  LIBRARY: 'laborbit_demo_library',
  PENDING_IMPORTS: 'laborbit_demo_pending_imports',
  TALKS: 'laborbit_demo_talks',
  SETTINGS: 'laborbit_demo_settings',
  EMAILS: 'laborbit_demo_emails',
  MAILBOX_CONFIG: 'laborbit_demo_mailbox_config',
  SMTP_CONFIG: 'laborbit_demo_smtp_config',
  FEEDBACK: 'laborbit_demo_feedback'
}

// 初始化或重置持久化数据
export function initDemoStorage(force = false) {
  if (typeof localStorage === 'undefined') return

  const isCurrentVersion = localStorage.getItem(STORAGE_KEYS.VERSION) === '2.0'
  if (!isCurrentVersion || force) {
    localStorage.setItem(STORAGE_KEYS.VERSION, '2.0')
    localStorage.setItem(STORAGE_KEYS.SEMINARS, JSON.stringify(DEMO_SEMINARS))
    localStorage.setItem(STORAGE_KEYS.PAPERS, JSON.stringify(DEMO_ARXIV_PAPERS))
    localStorage.setItem(STORAGE_KEYS.NOTICES, JSON.stringify(DEMO_NOTICES))
    localStorage.setItem(STORAGE_KEYS.RESOURCES_CATEGORIES, JSON.stringify(DEMO_RESOURCES_CATEGORIES))
    localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(DEMO_BOOKS))
    localStorage.setItem(STORAGE_KEYS.LIBRARY, JSON.stringify(DEMO_LIBRARY_PAPERS))
    localStorage.setItem(STORAGE_KEYS.PENDING_IMPORTS, JSON.stringify(DEMO_PENDING_IMPORTS))
    localStorage.setItem(STORAGE_KEYS.TALKS, JSON.stringify(DEMO_TALKS))
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEMO_SITE_CONFIG))
    localStorage.setItem(STORAGE_KEYS.EMAILS, JSON.stringify(DEMO_EMAILS))
    localStorage.setItem(STORAGE_KEYS.FEEDBACK, JSON.stringify(DEMO_FEEDBACK_ITEMS))
    localStorage.setItem(STORAGE_KEYS.MAILBOX_CONFIG, JSON.stringify({
      has_config: true,
      email_address: 'astro_lab@cstnet.cn',
      protocol: 'imap',
      server_host: 'mail.cstnet.cn',
      server_port: 993,
      use_ssl: true,
      username: 'astro_lab',
      has_password: true,
      updated_at: '2026-09-01T00:00:00Z'
    }))
    localStorage.setItem(STORAGE_KEYS.SMTP_CONFIG, JSON.stringify({
      has_config: true,
      host: 'mail.cstnet.cn',
      port: 465,
      use_ssl: true,
      username: 'astro_lab',
      from_email: 'astro_lab@cstnet.cn',
      from_name: '天体物理课题组',
      has_password: true,
      use_imap_password: true,
      updated_at: '2026-09-01T00:00:00Z'
    }))
  }
}

export function resetDemoStorage() {
  initDemoStorage(true)
  localStorage.setItem('labhub_user', JSON.stringify(DEMO_MEMBERS[0]))
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

  const fullUrl = (config.url || '').replace(/^\/api/, '/api')
  const [cleanUrl, queryString] = fullUrl.split('?')
  const queryParams = new URLSearchParams(queryString || '')
  const getParam = (key) => {
    if (config.params && config.params[key] !== undefined) return config.params[key]
    return queryParams.get(key)
  }

  const method = (config.method || 'get').toLowerCase()
  const body = parseJsonBody(config)

  // 模拟稍微真实的微小延迟 (20ms ~ 50ms)
  await new Promise(r => setTimeout(r, 30))

  const respond = (data, status = 200) => ({
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' },
    config
  })

  // 1. 系统配置与健康状态
  if (cleanUrl === '/api/system/status' || cleanUrl === '/api/system/settings') {
    const settings = getStored(STORAGE_KEYS.SETTINGS, DEMO_SITE_CONFIG)
    if (method === 'put') {
      Object.assign(settings, body)
      setStored(STORAGE_KEYS.SETTINGS, settings)
    }
    return respond(settings)
  }
  if (cleanUrl === '/api/health') {
    return respond({ status: 'healthy', service: 'LabOrbit GitHub Pages Demo API', demo: true })
  }

  // 2. 身份认证与成员 (Auth & Members)
  if (cleanUrl === '/api/auth/me') {
    const user = getStored('labhub_user', DEMO_MEMBERS[0])
    return respond(user)
  }
  if (cleanUrl === '/api/auth/login') {
    const email = body.email || ''
    const found = DEMO_MEMBERS.find(m => m.email === email) || DEMO_MEMBERS[0]
    localStorage.setItem('labhub_token', 'demo_jwt_token_laborbit_experience')
    localStorage.setItem('labhub_user', JSON.stringify(found))
    return respond({ access_token: 'demo_jwt_token_laborbit_experience', token_type: 'bearer', user: found })
  }
  if (cleanUrl === '/api/auth/heartbeat') {
    return respond({ success: true, timestamp: new Date().toISOString() })
  }
  if (cleanUrl === '/api/auth/members') {
    return respond(DEMO_MEMBERS)
  }
  if (cleanUrl === '/api/auth/complete-tutorial') {
    const cur = getStored('labhub_user', DEMO_MEMBERS[0])
    cur.is_tutorial_completed = true
    setStored('labhub_user', cur)
    return respond({ success: true, message: '向导已完成' })
  }
  if (cleanUrl.startsWith('/api/auth/members/')) {
    return respond({ success: true })
  }
  if (cleanUrl === '/api/auth/invite-codes') {
    return respond([
      { id: 1, code: 'ASTRO-2026', note: '新学期研究生入组注册', registration_role: 'member', registration_identity: 'student', is_active: true }
    ])
  }

  // 3. 组会排期 (Seminars)
  if (cleanUrl.startsWith('/api/seminars')) {
    let seminars = getStored(STORAGE_KEYS.SEMINARS, DEMO_SEMINARS)

    if (cleanUrl === '/api/seminars/mine/upcoming') {
      const cur = getStored('labhub_user', DEMO_MEMBERS[0])
      const today = new Date().toISOString().split('T')[0]
      const upcomingSeminars = seminars.filter(s => s.status === 'upcoming' && s.date >= today).sort((a, b) => a.date.localeCompare(b.date))

      let main = null
      let arxiv = null

      for (const s of upcomingSeminars) {
        const days_until = Math.max(0, Math.ceil((new Date(s.date) - new Date(today)) / (1000 * 60 * 60 * 24)))
        if (!main && (s.presenter_id === cur.id || s.presenter_name?.includes(cur.real_name))) {
          main = {
            id: s.id,
            date: s.date,
            time: s.time,
            topic: s.topic,
            location: s.location,
            days_until,
            abstract_missing: !s.abstract
          }
        }
        if (!arxiv && Array.isArray(s.presentations)) {
          const pMatch = s.presentations.find(p => p.presenter_id === cur.id || p.presenter_name?.includes(cur.real_name))
          if (pMatch) {
            arxiv = {
              id: s.id,
              date: s.date,
              time: s.time,
              topic: s.topic,
              location: s.location,
              days_until,
              papers: [pMatch.arxiv_id]
            }
          }
        }
      }

      // 演示降级保底：若当前角色未被指派具体汇报，展示最近一次排期倒计时保证界面美观完整
      if (!main && upcomingSeminars.length > 0) {
        const s = upcomingSeminars[0]
        const days_until = Math.max(0, Math.ceil((new Date(s.date) - new Date(today)) / (1000 * 60 * 60 * 24)))
        main = {
          id: s.id,
          date: s.date,
          time: s.time,
          topic: s.topic,
          location: s.location,
          days_until,
          abstract_missing: !s.abstract
        }
      }
      if (!arxiv && upcomingSeminars.length > 0) {
        const s = upcomingSeminars[0]
        const days_until = Math.max(0, Math.ceil((new Date(s.date) - new Date(today)) / (1000 * 60 * 60 * 24)))
        const pId = (s.presentations && s.presentations[0]) ? s.presentations[0].arxiv_id : '2403.08852'
        arxiv = {
          id: s.id,
          date: s.date,
          time: s.time,
          topic: s.topic,
          location: s.location,
          days_until,
          papers: [pId]
        }
      }

      return respond({ main, arxiv })
    }

    if (cleanUrl === '/api/seminars/reminders') {
      const needFill = seminars.filter(s => s.status === 'upcoming' && (!s.topic || !s.abstract))
      return respond(needFill)
    }

    if (cleanUrl === '/api/seminars/settings') {
      return respond({ day_of_week: 5, start_time: '14:30', location: '科研实验楼 5-516 会议室' })
    }

    if (cleanUrl === '/api/seminars' && method === 'get') {
      return respond(seminars)
    }

    if (cleanUrl === '/api/seminars' && method === 'post') {
      const cur = getStored('labhub_user', DEMO_MEMBERS[0])
      const newSeminar = {
        id: Date.now(),
        date: body.date || '2026-10-16',
        time: body.time || '14:30',
        location: body.location || '科研实验楼 5-516 会议室',
        presenter_name: body.presenter_name || cur.name,
        presenter_id: body.presenter_id || cur.id,
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

    const mAbstract = cleanUrl.match(/\/api\/seminars\/(\d+)\/(abstract|topic)/)
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

    const mId = cleanUrl.match(/\/api\/seminars\/(\d+)$/)
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

    if (cleanUrl.includes('/postpone-cascade')) {
      return respond({ success: true, message: '排期已顺延' })
    }
    if (cleanUrl.includes('/batch-location')) {
      return respond({ success: true, message: '地点已批量更新' })
    }
    if (cleanUrl.includes('/admin/association-stats')) {
      return respond({ total: seminars.length, matched: seminars.length, unmatched: 0 })
    }
    if (cleanUrl.includes('/check-arxiv-presented')) {
      return respond({ presented: false })
    }
    if (cleanUrl.includes('/interest-toggle')) {
      return respond({ interested: true })
    }
  }

  // 4. arXiv 文献订阅流 (Arxiv Papers)
  if (cleanUrl.startsWith('/api/arxiv')) {
    let papers = getStored(STORAGE_KEYS.PAPERS, DEMO_ARXIV_PAPERS)

    if (cleanUrl.startsWith('/api/arxiv/feed')) {
      return respond(papers)
    }

    if (cleanUrl === '/api/arxiv/preview') {
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

    if (cleanUrl === '/api/arxiv/recommend' && method === 'post') {
      const cur = getStored('labhub_user', DEMO_MEMBERS[0])
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
        recommender: {
          id: cur.id,
          name: cur.name,
          real_name: cur.real_name,
          identity: cur.identity,
          role: cur.role
        },
        recommended_by: cur.name,
        recommended_at: new Date().toISOString().split('T')[0],
        notes: body.notes || '',
        likes_count: 1,
        user_liked: false,
        is_liked_by_me: false,
        read: false,
        is_read_by_me: false,
        comments: []
      }
      papers.unshift(newPaper)
      setStored(STORAGE_KEYS.PAPERS, papers)
      return respond(newPaper)
    }

    const mRead = cleanUrl.match(/\/api\/arxiv\/(\d+)\/read-toggle/)
    if (mRead && method === 'post') {
      const pId = parseInt(mRead[1], 10)
      const p = papers.find(item => item.id === pId)
      if (p) {
        p.read = !p.read
        p.is_read_by_me = p.read
        setStored(STORAGE_KEYS.PAPERS, papers)
        return respond({ read: p.read })
      }
    }

    const mLike = cleanUrl.match(/\/api\/arxiv\/(\d+)\/like/)
    if (mLike && method === 'post') {
      const pId = parseInt(mLike[1], 10)
      const p = papers.find(item => item.id === pId)
      if (p) {
        p.user_liked = !p.user_liked
        p.is_liked_by_me = p.user_liked
        p.likes_count = (p.likes_count || 0) + (p.user_liked ? 1 : -1)
        setStored(STORAGE_KEYS.PAPERS, papers)
        return respond({ user_liked: p.user_liked, likes_count: p.likes_count })
      }
    }

    const mComments = cleanUrl.match(/\/api\/arxiv\/(\d+)\/comments/)
    if (mComments) {
      const pId = parseInt(mComments[1], 10)
      const p = papers.find(item => item.id === pId)
      if (method === 'get') {
        return respond(p?.comments || [])
      }
      if (method === 'post') {
        const cur = getStored('labhub_user', DEMO_MEMBERS[0])
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

    const mDelComment = cleanUrl.match(/\/api\/arxiv\/comments\/(\d+)/)
    if (mDelComment && method === 'delete') {
      const cId = parseInt(mDelComment[1], 10)
      papers.forEach(p => {
        if (p.comments) p.comments = p.comments.filter(c => c.id !== cId)
      })
      setStored(STORAGE_KEYS.PAPERS, papers)
      return respond({ success: true })
    }

    const mVis = cleanUrl.match(/\/api\/arxiv\/(\d+)\/visibility/)
    if (mVis && method === 'put') {
      const pId = parseInt(mVis[1], 10)
      const p = papers.find(item => item.id === pId)
      if (p) {
        Object.assign(p, body)
        setStored(STORAGE_KEYS.PAPERS, papers)
        return respond(p)
      }
    }

    const mPaperId = cleanUrl.match(/\/api\/arxiv\/(\d+)$/)
    if (mPaperId && method === 'delete') {
      const pId = parseInt(mPaperId[1], 10)
      papers = papers.filter(p => p.id !== pId)
      setStored(STORAGE_KEYS.PAPERS, papers)
      return respond({ success: true })
    }
  }

  // 5. 公共文献库 (Library)
  if (cleanUrl === '/api/library') {
    let lib = getStored(STORAGE_KEYS.LIBRARY, DEMO_LIBRARY_PAPERS)
    const q = (getParam('q') || '').toLowerCase().trim()
    if (q) {
      lib = lib.filter(p => (p.title || '').toLowerCase().includes(q) || (p.authors || '').toLowerCase().includes(q))
    }
    return respond(lib)
  }
  if (cleanUrl.match(/\/api\/library\/(\d+)$/) && method === 'delete') {
    return respond({ success: true })
  }

  // 6. 公文通知 (Notices)
  if (cleanUrl.startsWith('/api/notices')) {
    let notices = getStored(STORAGE_KEYS.NOTICES, DEMO_NOTICES)

    if (cleanUrl === '/api/notices' && method === 'get') {
      return respond(notices)
    }

    if (cleanUrl === '/api/notices' && method === 'post') {
      const cur = getStored('labhub_user', DEMO_MEMBERS[0])
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

    const mNoticeId = cleanUrl.match(/\/api\/notices\/(\d+)$/)
    if (mNoticeId && method === 'delete') {
      const nId = parseInt(mNoticeId[1], 10)
      notices = notices.filter(n => n.id !== nId)
      setStored(STORAGE_KEYS.NOTICES, notices)
      return respond({ success: true })
    }
  }

  // 7. 学术资源与资料库 (Resources Hub & Books)
  if (cleanUrl.startsWith('/api/resources')) {
    let categories = getStored(STORAGE_KEYS.RESOURCES_CATEGORIES, DEMO_RESOURCES_CATEGORIES)
    let books = getStored(STORAGE_KEYS.BOOKS, DEMO_BOOKS)

    if (cleanUrl === '/api/resources/categories') {
      if (method === 'get') return respond(categories)
      if (method === 'post') {
        const newCat = { id: Date.now(), name: body.name || '新分类', is_default: false }
        categories.push(newCat)
        setStored(STORAGE_KEYS.RESOURCES_CATEGORIES, categories)
        return respond(newCat)
      }
    }

    if (cleanUrl.startsWith('/api/resources/categories/') && method === 'delete') {
      const catName = decodeURIComponent(cleanUrl.replace('/api/resources/categories/', ''))
      categories = categories.filter(c => c.name !== catName)
      setStored(STORAGE_KEYS.RESOURCES_CATEGORIES, categories)
      return respond({ success: true })
    }

    if (cleanUrl === '/api/resources/books') {
      if (method === 'get') {
        const cat = getParam('category')
        const q = (getParam('q') || '').toLowerCase().trim()
        let result = [...books]
        if (cat && cat !== '全部') {
          result = result.filter(b => b.category === cat)
        }
        if (q) {
          result = result.filter(b => (b.title || '').toLowerCase().includes(q) || (b.authors || '').toLowerCase().includes(q) || (b.description || '').toLowerCase().includes(q))
        }
        return respond(result)
      }

      if (method === 'post') {
        const newBook = {
          id: Date.now(),
          title: body.title || '新学术资料',
          authors: body.authors || '',
          category: body.category || '教材',
          description: body.description || '',
          cover_url: body.cover_url || '',
          url: body.url || '',
          tutorial_url: body.tutorial_url || '',
          exercise_url: body.exercise_url || '',
          github_url: body.github_url || '',
          favorite_count: 0,
          is_favorited: false,
          created_at: new Date().toISOString()
        }
        books.unshift(newBook)
        setStored(STORAGE_KEYS.BOOKS, books)
        return respond(newBook)
      }
    }

    const mBookId = cleanUrl.match(/\/api\/resources\/books\/(\d+)$/)
    if (mBookId) {
      const bId = parseInt(mBookId[1], 10)
      if (method === 'put') {
        const target = books.find(b => b.id === bId)
        if (target) {
          Object.assign(target, body)
          setStored(STORAGE_KEYS.BOOKS, books)
          return respond(target)
        }
      }
      if (method === 'delete') {
        books = books.filter(b => b.id !== bId)
        setStored(STORAGE_KEYS.BOOKS, books)
        return respond({ success: true })
      }
    }

    if (cleanUrl === '/api/resources/pdf') {
      return respond({ url: 'https://example.com/demo_doc.pdf', filename: 'demo_doc.pdf' })
    }
  }

  // 8. 学术邮箱中转 (Mailbox)
  if (cleanUrl.startsWith('/api/mailbox')) {
    let emails = getStored(STORAGE_KEYS.EMAILS, DEMO_EMAILS)

    if (cleanUrl === '/api/mailbox/config') {
      let mConfig = getStored(STORAGE_KEYS.MAILBOX_CONFIG, {
        has_config: true,
        email_address: 'astro_lab@cstnet.cn',
        protocol: 'imap',
        server_host: 'mail.cstnet.cn',
        server_port: 993,
        use_ssl: true,
        username: 'astro_lab',
        has_password: true,
        updated_at: '2026-09-01T00:00:00Z'
      })
      if (method === 'get') return respond(mConfig)
      if (method === 'post') {
        mConfig = { ...mConfig, ...body, has_config: true, has_password: true, updated_at: new Date().toISOString() }
        setStored(STORAGE_KEYS.MAILBOX_CONFIG, mConfig)
        return respond(mConfig)
      }
      if (method === 'delete') {
        mConfig.has_config = false
        setStored(STORAGE_KEYS.MAILBOX_CONFIG, mConfig)
        return respond({ success: true })
      }
    }

    if (cleanUrl === '/api/mailbox/test') {
      return respond({ success: true, message: 'IMAP 连接测试成功' })
    }

    if (cleanUrl === '/api/mailbox/smtp-config') {
      let sCon = getStored(STORAGE_KEYS.SMTP_CONFIG, {
        has_config: true,
        host: 'mail.cstnet.cn',
        port: 465,
        use_ssl: true,
        username: 'astro_lab',
        from_email: 'astro_lab@cstnet.cn',
        from_name: '天体物理课题组',
        has_password: true,
        use_imap_password: true,
        updated_at: '2026-09-01T00:00:00Z'
      })
      if (method === 'get') return respond(sCon)
      if (method === 'post') {
        sCon = { ...sCon, ...body, has_config: true, has_password: true, updated_at: new Date().toISOString() }
        setStored(STORAGE_KEYS.SMTP_CONFIG, sCon)
        return respond(sCon)
      }
    }

    if (cleanUrl === '/api/mailbox/test-smtp') {
      return respond({ success: true, message: 'SMTP 连通性测试通过' })
    }

    if (cleanUrl === '/api/mailbox/emails') {
      if (method === 'get') {
        const q = (getParam('q') || '').toLowerCase().trim()
        let result = [...emails]
        if (q) {
          result = result.filter(e => (e.subject || '').toLowerCase().includes(q) || (e.from_name || '').toLowerCase().includes(q) || (e.body_text || '').toLowerCase().includes(q))
        }
        return respond(result)
      }
      if (method === 'delete') {
        setStored(STORAGE_KEYS.EMAILS, [])
        return respond({ success: true, count: 0 })
      }
    }

    const mEmailId = cleanUrl.match(/\/api\/mailbox\/emails\/(\d+)$/)
    if (mEmailId) {
      const emailId = parseInt(mEmailId[1], 10)
      if (method === 'get') {
        const found = emails.find(e => e.id === emailId) || emails[0]
        return respond(found)
      }
      if (method === 'delete') {
        emails = emails.filter(e => e.id !== emailId)
        setStored(STORAGE_KEYS.EMAILS, emails)
        return respond({ success: true })
      }
    }

    if (cleanUrl === '/api/mailbox/sent-emails') {
      return respond([])
    }

    if (cleanUrl === '/api/mailbox/send-seminar-notice') {
      return respond({ success: true, message: '组会通知邮件已模拟发送至课题组成员邮箱' })
    }
  }

  // 9. 用户反馈与治理系统 (Feedback)
  if (cleanUrl.startsWith('/api/feedback')) {
    let items = getStored(STORAGE_KEYS.FEEDBACK, DEMO_FEEDBACK_ITEMS)

    if (cleanUrl === '/api/feedback') {
      if (method === 'get') return respond(items)
      if (method === 'post') {
        const cur = getStored('labhub_user', DEMO_MEMBERS[0])
        const newItem = {
          id: Date.now(),
          title: body.title || '问题反馈',
          content: body.content || '',
          author: cur.name,
          author_id: cur.id,
          page: body.page || '',
          resolved: false,
          created_at: new Date().toISOString().replace('Z', ''),
          replies: []
        }
        items.unshift(newItem)
        setStored(STORAGE_KEYS.FEEDBACK, items)
        return respond(newItem)
      }
    }

    if (cleanUrl === '/api/feedback/mine') {
      const cur = getStored('labhub_user', DEMO_MEMBERS[0])
      let mine = items.filter(f => f.author_id === cur.id)
      if (!mine.length) mine = items
      return respond(mine)
    }

    if (cleanUrl === '/api/feedback/unread') {
      return respond({ count: 0, unread_count: 0 })
    }

    const mFeedbackReply = cleanUrl.match(/\/api\/feedback\/(\d+)\/replies/)
    if (mFeedbackReply && method === 'post') {
      const fId = parseInt(mFeedbackReply[1], 10)
      const cur = getStored('labhub_user', DEMO_MEMBERS[0])
      const target = items.find(f => f.id === fId)
      if (target) {
        const newReply = {
          id: Date.now(),
          author: cur.name,
          content: body.content || '',
          created_at: new Date().toISOString().replace('Z', ''),
          read_at: null
        }
        target.replies = target.replies || []
        target.replies.push(newReply)
        if (body.resolved !== undefined) target.resolved = body.resolved
        setStored(STORAGE_KEYS.FEEDBACK, items)
        return respond(newReply)
      }
      return respond({ success: true })
    }

    if (cleanUrl.match(/\/api\/feedback\/replies\/(\d+)\/read/)) {
      return respond({ success: true })
    }

    const mFeedbackId = cleanUrl.match(/\/api\/feedback\/(\d+)$/)
    if (mFeedbackId && method === 'patch') {
      const fId = parseInt(mFeedbackId[1], 10)
      const target = items.find(f => f.id === fId)
      if (target && body.resolved !== undefined) {
        target.resolved = body.resolved
        setStored(STORAGE_KEYS.FEEDBACK, items)
        return respond(target)
      }
      return respond({ success: true })
    }
  }

  // 10. 协同待处理队列 (Schedule Imports)
  if (cleanUrl.startsWith('/api/schedule-imports')) {
    let pending = getStored(STORAGE_KEYS.PENDING_IMPORTS, DEMO_PENDING_IMPORTS)

    if (cleanUrl === '/api/schedule-imports/pending' && method === 'get') {
      return respond({ list: pending, total: pending.length })
    }

    if (cleanUrl === '/api/schedule-imports/pending' && method === 'post') {
      const cur = getStored('labhub_user', DEMO_MEMBERS[0])
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

    const mResolve = cleanUrl.match(/\/api\/schedule-imports\/(\d+)\/resolve/)
    if (mResolve && method === 'post') {
      const id = parseInt(mResolve[1], 10)
      pending = pending.filter(p => p.id !== id)
      setStored(STORAGE_KEYS.PENDING_IMPORTS, pending)
      return respond({ success: true, message: '已审核并正式发布' })
    }

    const mDelPending = cleanUrl.match(/\/api\/schedule-imports\/(\d+)$/)
    if (mDelPending && method === 'delete') {
      const id = parseInt(mDelPending[1], 10)
      pending = pending.filter(p => p.id !== id)
      setStored(STORAGE_KEYS.PENDING_IMPORTS, pending)
      return respond({ success: true, message: '已删除' })
    }
  }

  // 11. 天文台报告与学术会议 (Talks)
  if (cleanUrl.startsWith('/api/talks')) {
    let talks = getStored(STORAGE_KEYS.TALKS, DEMO_TALKS)
    if (cleanUrl === '/api/talks' && method === 'get') {
      return respond(talks)
    }
    if (cleanUrl === '/api/talks' && method === 'post') {
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

  // 12. 收藏夹 (Favorites) & 个人中心 (Account)
  if (cleanUrl === '/api/favorites') {
    return respond({ papers: [], books: [] })
  }
  if (cleanUrl.startsWith('/api/favorites/')) {
    return respond({ success: true })
  }
  if (cleanUrl.startsWith('/api/account/profile') && method === 'put') {
    const cur = getStored('labhub_user', DEMO_MEMBERS[0])
    Object.assign(cur, body)
    setStored('labhub_user', cur)
    return respond(cur)
  }
  if (cleanUrl.startsWith('/api/account/credentials')) {
    return respond({ success: true })
  }
  if (cleanUrl.startsWith('/api/account/avatar')) {
    return respond({ url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80' })
  }
  if (cleanUrl === '/api/files') {
    return respond({ url: 'https://example.com/file.pdf', filename: 'file.pdf' })
  }

  // 13. 通用兜底响应：防止未处理的接口报错中断页面
  console.log(`[DemoMode] Mock hit generic fallback: ${method.toUpperCase()} ${cleanUrl}`)
  return respond({
    success: true,
    message: 'Demo Mock Handled',
    list: [],
    total: 0
  })
}
