import axios from 'axios'
import { applyViewMode } from '../composables/useAdminMode'
import { isDemoMode, initDemoAuth } from '../mock/isDemo'
import { demoAxiosAdapter } from '../mock/demoAdapter'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
})

if (isDemoMode()) {
  initDemoAuth()
  api.defaults.adapter = demoAxiosAdapter
}

// 请求拦截器：自动注入 Bearer Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('labhub_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：401 / 凭据失效处理
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const isAuthMe404 = error.response && error.response.status === 404 && error.config?.url?.includes('/api/auth/me')
    if (error.response && (error.response.status === 401 || isAuthMe404)) {
      if (!isDemoMode()) {
        localStorage.removeItem('labhub_token')
        localStorage.removeItem('labhub_user')
        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/quick-share')) {
          window.location.href = '/login'
        }
      }
    }
    const detail = error.response?.data?.detail
    const message = typeof detail === 'string' ? detail : detail?.message || (Array.isArray(detail) ? '请检查输入内容和日期格式。' : error.message || '请求失败')
    const wrapped = new Error(message)
    wrapped.status = error.response?.status
    wrapped.detail = detail
    return Promise.reject(wrapped)
  }
)

export const authApi = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  register: (name, nickname, email, password, invite_code, identity = 'student') =>
    api.post('/api/auth/register', { name, nickname, email, password, invite_code, identity }),
  getMe: async () => {
    const res = await api.get('/api/auth/me')
    return applyViewMode(res)
  },
  heartbeat: () => api.post('/api/auth/heartbeat'),
  getMembers: () => api.get('/api/auth/members'),
  setMemberRole: (userId, role) => api.patch(`/api/auth/members/${userId}/role`, { role }),
  setMemberIdentity: (userId, identity) => api.patch(`/api/auth/members/${userId}/identity`, { identity }),
  setSeminarPermission: (id, can_manage_seminars) => api.patch(`/api/auth/members/${id}/seminar-permission`, { can_manage_seminars }),
  createMember: data => api.post('/api/auth/members', data),
  deleteMember: userId => api.delete(`/api/auth/members/${userId}`),
  // 邀请码管理（管理员专属）
  getInviteCodes: () => api.get('/api/auth/invite-codes'),
  createInviteCode: (code, note, registration_role, registration_identity) => api.post('/api/auth/invite-codes', { code, note, registration_role, registration_identity }),
  updateInviteCode: (id, registration_role, registration_identity) => api.patch(`/api/auth/invite-codes/${id}`, { registration_role, registration_identity }),
  deleteInviteCode: (id) => api.delete(`/api/auth/invite-codes/${id}`),
  toggleInviteCode: (id) => api.patch(`/api/auth/invite-codes/${id}/toggle`),
  completeTutorial: () => api.post('/api/auth/complete-tutorial'),
}

export const systemApi = {
  getStatus: () => api.get('/api/system/status'),
  setup: (data) => api.post('/api/system/setup', data),
  getSettings: () => api.get('/api/system/settings'),
  updateSettings: (data) => api.put('/api/system/settings', data),
}

export const accountApi = {
  profile: data => api.put('/api/account/profile', data),
  credentials: data => api.put('/api/account/credentials', data),
  avatar: file => { const data = new FormData(); data.append('file', file); return api.post('/api/account/avatar', data) },
}

export const arxivApi = {
  preview: (url_or_id) => api.post('/api/arxiv/preview', { url_or_id }, { timeout: 25000 }),
  recommend: (data) => api.post('/api/arxiv/recommend', data),
  updateVisibility: (id, data) => api.put(`/api/arxiv/${id}/visibility`, data),
  update: (id, data) => api.put(`/api/arxiv/${id}`, data),
  getFeed: (scope = 'all') => api.get(`/api/arxiv/feed?scope=${scope}`),
  toggleRead: (paper_id) => api.post(`/api/arxiv/${paper_id}/read-toggle`),
  toggleLike: (paper_id) => api.post(`/api/arxiv/${paper_id}/like`),
  deletePaper: (paper_id) => api.delete(`/api/arxiv/${paper_id}`),
  addComment: (paper_id, content) => api.post(`/api/arxiv/${paper_id}/comments`, { content }),
  deleteComment: (comment_id) => api.delete(`/api/arxiv/comments/${comment_id}`),
  getComments: (paper_id, since_id = 0) => api.get(`/api/arxiv/${paper_id}/comments`, { params: since_id ? { since_id } : {} }),
}

export const seminarApi = {
  upcoming: () => api.get('/api/seminars/mine/upcoming'),
  reminders: () => api.get('/api/seminars/reminders'),
  abstract: (id, abstract, topic) => api.put(`/api/seminars/${id}/abstract`, { abstract, topic }),
  topic: (id, topic) => api.put(`/api/seminars/${id}/topic`, { topic }),
  getSettings: () => api.get('/api/seminars/settings'),
  updateSettings: (data) => api.put('/api/seminars/settings', data),
  getAssociationStats: () => api.get('/api/seminars/admin/association-stats'),
  batchMatchPresenters: () => api.post('/api/seminars/admin/batch-match-presenters'),
  batchLocation: (location, scope = 'upcoming') => api.post('/api/seminars/batch-location', { location, scope }),
  postponeCascade: (id, days) => api.post(`/api/seminars/${id}/postpone-cascade`, { days }),
  checkArxivPresented: (arxivId, currentSeminarId = null) => api.get('/api/seminars/check-arxiv-presented', {
    params: { arxiv_id: arxivId, current_seminar_id: currentSeminarId }
  }),
  submitPresentationArxiv: (seminarId, data) => api.put(`/api/seminars/${seminarId}/presentation-arxiv`, data),
  submitPresentationShare: (seminarId, data) => api.put(`/api/seminars/${seminarId}/presentation-share`, data),
  importSchedule: rows => api.post('/api/seminars/import', { rows }),
  parseImportFile: (file, sheetName = '') => {
    const data = new FormData()
    data.append('file', file)
    const url = '/api/seminars/parse-import-file' + (sheetName ? `?sheet_name=${encodeURIComponent(sheetName)}` : '')
    return api.post(url, data, { timeout: 35000 })
  },
  parseImportText: (text) => api.post('/api/seminars/parse-import-text', { text }),
  reschedule: (changes) => api.post('/api/seminars/reschedule', { changes }),
  getSeminars: () => api.get('/api/seminars'),
  createSeminar: (data) => api.post('/api/seminars', data, { timeout: 35000 }),
  updateSeminar: (id, data) => api.put(`/api/seminars/${id}`, data, { timeout: 35000 }),
  deleteSeminar: (id) => api.delete(`/api/seminars/${id}`),
  toggleInterest: (type, id) => api.post('/api/seminars/interest-toggle', { item_type: type, item_id: id }),
}

export const resourceApi = {
  uploadPdf: file => { const data = new FormData(); data.append('file', file); return api.post('/api/resources/pdf', data, { timeout: 60000 }) },
  getCategories: () => api.get('/api/resources/categories'),
  createCategory: (name) => api.post('/api/resources/categories', { name }),
  deleteCategory: (name) => api.delete(`/api/resources/categories/${encodeURIComponent(name)}`),
  getBooks: (category, q = '') => api.get('/api/resources/books', { params: { ...(category ? { category } : {}), ...(q ? { q } : {}) } }),
  createBook: (data) => api.post('/api/resources/books', data),
  updateBook: (id, data) => api.put(`/api/resources/books/${id}`, data),
  deleteBook: (id) => api.delete(`/api/resources/books/${id}`),
}

export default api

export const personalApi = {
  favorites: () => api.get('/api/favorites'),
  save: (kind, target) => api.put(`/api/favorites/${kind}/${encodeURIComponent(target)}`),
  remove: (kind, target) => api.delete(`/api/favorites/${kind}/${encodeURIComponent(target)}`),
  submitFeedback: data => api.post('/api/feedback', data),
  feedback: () => api.get('/api/feedback'),
  myFeedback: () => api.get('/api/feedback/mine'),
  unreadFeedback: () => api.get('/api/feedback/unread'),
  replyFeedback: (id, data) => api.post(`/api/feedback/${id}/replies`, data),
  readReply: id => api.put(`/api/feedback/replies/${id}/read`),
  resolve: (id, resolved) => api.patch(`/api/feedback/${id}`, { resolved }),
}

export const libraryApi = {
  list: (q = '', source = 'all') => api.get('/api/library', { params: { q, source } }),
  refresh: id => api.post(`/api/library/${id}/refresh`, null, { timeout: 25000 }),
  delete: id => api.delete(`/api/library/${id}`),
  remove: id => api.delete(`/api/library/${id}`),
}
export const talkApi = {
  list: () => api.get('/api/talks'),
  parse: data => api.post('/api/talks/parse-email', data),
  create: data => api.post('/api/talks', data),
  update: (id, data) => api.put(`/api/talks/${id}`, data),
  remove: id => api.delete(`/api/talks/${id}`),
}
export const fileApi = {
  upload: file => { const data = new FormData(); data.append('file', file); return api.post('/api/files', data, { timeout: 60000 }) },
  read: url => api.get(url, { responseType: 'blob' }),
}
export const mailboxApi = {
  getConfig: () => api.get('/api/mailbox/config'),
  saveConfig: data => api.post('/api/mailbox/config', data),
  testConfig: data => api.post('/api/mailbox/test', data, { timeout: 15000 }),
  deleteConfig: () => api.delete('/api/mailbox/config'),
  getSmtpConfig: () => api.get('/api/mailbox/smtp-config'),
  saveSmtpConfig: data => api.post('/api/mailbox/smtp-config', data),
  testSmtp: data => api.post('/api/mailbox/test-smtp', data, { timeout: 15000 }),
  sendSeminarNotice: data => api.post('/api/mailbox/send-seminar-notice', data, { timeout: 45000 }),
  getSentEmails: () => api.get('/api/mailbox/sent-emails'),
  getSentEmailDetail: id => api.get(`/api/mailbox/sent-emails/${id}`),
  getEmails: (params = {}) => api.get('/api/mailbox/emails', { params, timeout: 60000 }),
  getEmailDetail: id => api.get(`/api/mailbox/emails/${id}`),
  clearEmails: () => api.delete('/api/mailbox/emails'),
  deleteEmail: id => api.delete(`/api/mailbox/emails/${id}`),
  syncStream: (onProgress, onDone, onError) => {
    const token = localStorage.getItem('labhub_token')
    const base = API_BASE_URL.replace(/\/$/, '')
    const url = `${base}/api/mailbox/sync-stream`
    const controller = new AbortController()
    fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      signal: controller.signal
    }).then(async (response) => {
      if (!response.ok) {
        let errMsg = `同步失败 (HTTP ${response.status})`
        try {
          const errData = await response.json()
          if (errData.detail) errMsg = errData.detail
        } catch {}
        throw new Error(errMsg)
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let finished = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6))
              if (data.type === 'progress') {
                onProgress?.(data)
              } else if (data.type === 'done') {
                finished = true
                onDone?.(data)
              } else if (data.type === 'error') {
                finished = true
                onError?.(new Error(data.message || '邮件同步出错'))
              }
            } catch (e) {
              console.warn('SSE parse error:', e)
            }
          }
        }
      }
      if (!finished) {
        onDone?.({ message: '同步完成' })
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        onError?.(err)
      }
    })
    return () => controller.abort()
  }
}

export const noticeApi = {
  list: (params = {}) => api.get('/api/notices', { params }),
  get: (id) => api.get(`/api/notices/${id}`),
  create: (data) => api.post('/api/notices', data),
  batchCreate: (notices) => api.post('/api/notices/batch', { notices }),
  update: (id, data) => api.put(`/api/notices/${id}`, data),
  delete: (id) => api.delete(`/api/notices/${id}`),
}

export const scheduleImportApi = {
  listPending: () => api.get('/api/schedule-imports/pending'),
  createPending: (data) => api.post('/api/schedule-imports/pending', data),
  resolvePending: (id, data) => api.post(`/api/schedule-imports/${id}/resolve`, data),
  deletePending: (id) => api.delete(`/api/schedule-imports/${id}`),
}

