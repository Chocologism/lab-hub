import { DEMO_MEMBERS } from './demoData'

export function isDemoMode() {
  // 1. 构建环境变量指定
  if (import.meta.env?.VITE_DEMO_MODE === 'true') return true

  const storage = typeof localStorage !== 'undefined' ? localStorage : (typeof globalThis !== 'undefined' ? globalThis.localStorage : null)
  if (storage?.getItem('labhub_force_demo') === '1') return true

  if (typeof window === 'undefined') return false

  // 2. 位于 GitHub Pages 域名
  const host = window.location.hostname || ''
  if (host.endsWith('github.io') || host.includes('github.io')) return true

  // 3. URL Query 强制启动 (?demo=1)
  const params = new URLSearchParams(window.location.search)
  if (params.get('demo') === '1' || params.get('demo') === 'true') return true

  return false
}

/**
 * 初始化演示环境：自动注入体验官身份凭据，免密直通主看板
 */
export function initDemoAuth() {
  if (!isDemoMode()) return

  const existingToken = localStorage.getItem('labhub_token')
  if (!existingToken || existingToken.startsWith('demo_')) {
    // 默认以体验官（陈晨 - 博士生）身份免密进入
    const defaultUser = DEMO_MEMBERS[1]
    localStorage.setItem('labhub_token', 'demo_jwt_token_laborbit_experience')
    localStorage.setItem('labhub_user', JSON.stringify(defaultUser))
  }
}

/**
 * 演示模式下切换体验身份（导师 vs 组员/博士生）
 */
export function switchDemoRole(identity = 'student') {
  const targetUser = DEMO_MEMBERS.find(m => m.identity === identity) || DEMO_MEMBERS[1]
  localStorage.setItem('labhub_user', JSON.stringify(targetUser))
  localStorage.setItem('labhub_token', 'demo_jwt_token_laborbit_experience')
  return targetUser
}
