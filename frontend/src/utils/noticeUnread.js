/**
 * 通知中心未读消息角标与查看状态管理工具
 * 基于 localStorage 存储已查看通知 ID，支持全局跨组件事件响应
 */

import { shanghaiToday } from './schedule'

export const VIEWED_NOTICES_STORAGE_KEY = 'labhub_viewed_notice_ids'
export const NOTICES_READ_EVENT = 'labhub-notices-read'

/**
 * 获取本地存储的已查看通知 ID 集合
 * @returns {Set<number>}
 */
export function getViewedNoticeIds() {
  try {
    const raw = localStorage.getItem(VIEWED_NOTICES_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return new Set(parsed.map(id => Number(id)).filter(id => !isNaN(id)))
    }
  } catch (e) {}
  return new Set()
}

/**
 * 内部持久化存储已读 ID 集合
 * @param {Set<number>} idSet 
 */
function saveViewedNoticeIds(idSet) {
  try {
    const list = Array.from(idSet).slice(-500) // 最多保留最近 500 个以控制体积
    localStorage.setItem(VIEWED_NOTICES_STORAGE_KEY, JSON.stringify(list))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(NOTICES_READ_EVENT, { detail: { viewedIds: list } }))
    }
  } catch (e) {}
}

/**
 * 标记单条通知为已读
 * @param {number|string} id 
 */
export function markNoticeAsRead(id) {
  const numId = Number(id)
  if (isNaN(numId)) return
  const set = getViewedNoticeIds()
  if (!set.has(numId)) {
    set.add(numId)
    saveViewedNoticeIds(set)
  }
}

/**
 * 批量标记通知为已读
 * @param {Array<number|string>} ids 
 */
export function markAllNoticesAsRead(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return
  const set = getViewedNoticeIds()
  let changed = false
  for (const rawId of ids) {
    const numId = Number(rawId)
    if (!isNaN(numId) && !set.has(numId)) {
      set.add(numId)
      changed = true
    }
  }
  if (changed) {
    saveViewedNoticeIds(set)
  }
}

/**
 * 计算未读的有效通知数量
 * 规则：通知必须还在时效内（未过期），且未在已查看 ID 集合中
 * @param {Array} notices - 全部通知列表
 * @param {Set<number>} [viewedSet] - 可选的已读集合
 * @returns {number} 未读通知数量
 */
export function getUnreadNoticesCount(notices, viewedSet) {
  if (!Array.isArray(notices) || notices.length === 0) return 0
  const viewed = viewedSet || getViewedNoticeIds()
  const today = shanghaiToday()

  let count = 0
  for (const item of notices) {
    if (!item || !item.id) continue
    const numId = Number(item.id)
    // 若已读，跳过
    if (viewed.has(numId)) continue

    // 检查时效性：已过期的通知不计入未读红点干扰用户
    if (item.end_date && item.end_date < today) continue

    count++
  }
  return count
}
