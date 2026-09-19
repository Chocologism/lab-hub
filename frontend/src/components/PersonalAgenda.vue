<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { seminarApi, personalApi } from '../api/client'

const router = useRouter()
const data = ref(null), error = ref(''), unread = ref(0)
let timer, alive = true, busy = false

async function load() {
  if (busy || document.hidden) return
  busy = true
  const [agenda, replies] = await Promise.allSettled([seminarApi.upcoming(), personalApi.unreadFeedback()])
  if (alive) {
    if (agenda.status === 'fulfilled') { data.value = agenda.value; error.value = '' } else error.value = '个人汇报安排暂时无法读取'
    if (replies.status === 'fulfilled') unread.value = replies.value.count
    nextTick(() => {
      window.dispatchEvent(new CustomEvent('agenda-updated'))
    })
  }
  busy = false
}

function goToSeminarTimeline(roleId) {
  const item = data.value?.[roleId]
  if (!item || !item.id) return
  router.push({
    path: '/seminars',
    query: {
      view: 'timeline',
      target_seminar: String(item.id),
      no_reset: '1'
    }
  })
}

onMounted(() => { load(); timer = setInterval(load, 60000); document.addEventListener('visibilitychange', load); window.addEventListener('feedback-updated', load); window.addEventListener('seminar-updated', load) })
onBeforeUnmount(() => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', load); window.removeEventListener('feedback-updated', load); window.removeEventListener('seminar-updated', load) })
</script>
<template>
  <section class="personal-agenda" aria-label="我的汇报安排">
    <p v-if="error" class="error-banner" role="status">{{ error }} <button class="button small secondary" @click="load">重试</button></p>
    <div class="agenda-grid">
      <article
        v-for="role in [{id:'main',label:'下一次主讲'},{id:'arxiv',label:'下一次 arXiv 分享'}]"
        :key="role.id"
        class="glass-card agenda-card liquid-glass-card"
        :class="{ 'is-clickable': Boolean(data && data[role.id]?.id) }"
        :role="data && data[role.id]?.id ? 'button' : undefined"
        :tabindex="data && data[role.id]?.id ? 0 : undefined"
        :aria-label="data && data[role.id]?.id ? `${role.label}，点击前往组会时间线` : role.label"
        @click="goToSeminarTimeline(role.id)"
        @keydown.enter.prevent="goToSeminarTimeline(role.id)"
      >
        <span class="muted">{{ role.label }}</span>
        <template v-if="!data">
          <div class="countdown">
            <strong>—</strong>
            <span class="muted">读取中…</span>
          </div>
        </template>
        <template v-else-if="data[role.id]">
          <div class="countdown">
            <strong>{{ data[role.id].days_until === 0 ? '今天' : data[role.id].days_until }}</strong>
            <span v-if="data[role.id].days_until">天后</span>
          </div>
        </template>
        <p v-else class="agenda-empty">暂无安排</p>
      </article>
    </div>
  </section>
</template>
<style scoped>
.personal-agenda { margin:12px 0 24px; }
.agenda-heading { display:flex; align-items:center; flex-wrap:wrap; justify-content:space-between; gap:12px; margin-bottom:12px; }
.agenda-heading h2 { font-size:18px; font-weight:500; }
.agenda-heading a { font-size:13px; }
.agenda-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
.agenda-card { padding:16px 20px; display:grid; align-content:start; gap:6px; overflow-wrap:anywhere; border-radius:var(--radius); }
.agenda-card p,.agenda-card>a,.agenda-card>.muted { margin:0; font-size:13px; }
.agenda-card.is-clickable { cursor:pointer; transition:transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
.agenda-card.is-clickable:hover { transform:translateY(-2px); border-color:rgba(14, 165, 233, 0.4); box-shadow:0 6px 20px rgba(0, 0, 0, 0.15); }
.agenda-card.is-clickable:focus-visible { outline:2px solid var(--cyan, #0ea5e9); outline-offset:2px; }
.countdown { display:flex; align-items:baseline; gap:8px; }
.countdown strong { font-size:32px; font-weight:400; line-height:1.2; font-variant-numeric:tabular-nums; }
.countdown span { color:var(--muted); font-size:13px; }
.agenda-topic { color:var(--soft); }
.agenda-empty { padding:12px 0; color:var(--muted); }
@media(max-width:650px) { .agenda-grid { grid-template-columns:1fr; } }
</style>
