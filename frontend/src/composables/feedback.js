import { reactive } from 'vue'
export const feedback = reactive({ toasts: [], confirmation: null })
let sequence = 0
export function notify(message, type = 'success') {
  const id = ++sequence
  feedback.toasts.push({ id, message, type })
  setTimeout(() => dismissToast(id), type === 'error' ? 9000 : 5000)
}
export function dismissToast(id) { feedback.toasts = feedback.toasts.filter(t => t.id !== id) }
export function confirmAction(message, { title = '确认操作', confirmLabel = '确认', danger = false } = {}) {
  feedback.confirmation?.resolve(false)
  return new Promise(resolve => { feedback.confirmation = { message, title, confirmLabel, danger, resolve } })
}
export function answerConfirmation(answer) {
  const current = feedback.confirmation
  feedback.confirmation = null
  current?.resolve(answer)
}
