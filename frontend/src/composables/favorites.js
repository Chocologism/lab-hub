import { ref } from 'vue'
import { personalApi } from '../api/client'

const entries = ref([]), ready = ref(false), error = ref(''), pending = ref(new Set())
let owner, request
const token = () => localStorage.getItem('labhub_token')
const key = (kind, target) => `${kind}:${kind === 'paper' && !/^(doi:|url:)/i.test(target) ? String(target).replace(/v\d+$/i, '') : target}`

export function useFavorites() {
  if (owner !== token()) {
    owner = token(); entries.value = []; ready.value = false; error.value = ''; pending.value = new Set(); request = null
  }
  async function load(force = false) {
    if (request) { await request; if (!force) return }
    if (ready.value && !force) return
    const requestedOwner = owner
    error.value = ''
    const work = personalApi.favorites().then(data => {
      if (owner === requestedOwner) { entries.value = data; ready.value = true }
    }).catch(e => { if (owner === requestedOwner) { error.value = e.message; ready.value = false }; throw e })
    request = work
    try { await work } finally { if (request === work) request = null }
  }
  const saved = (kind, target) => entries.value.some(e => key(e.kind, e.target) === key(kind, target))
  async function toggle(kind, target) {
    const id = key(kind, target), requestedOwner = owner
    if (pending.value.has(id)) return
    pending.value.add(id)
    const wasSaved = saved(kind, target)
    const prevEntries = [...entries.value]
    if (wasSaved) {
      entries.value = entries.value.filter(e => key(e.kind, e.target) !== id)
    } else {
      entries.value = [...entries.value, { kind, target, created_at: new Date().toISOString() }]
    }
    try {
      if (wasSaved) {
        await personalApi.remove(kind, target)
      } else {
        await personalApi.save(kind, target)
      }
    } catch (err) {
      if (owner === requestedOwner) entries.value = prevEntries
      throw err
    } finally {
      pending.value.delete(id)
    }
  }
  return { entries, ready, error, load, saved, toggle, busy: (kind, target) => pending.value.has(key(kind, target)) }
}
