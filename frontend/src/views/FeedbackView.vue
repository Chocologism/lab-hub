<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { personalApi } from '../api/client'
import LoadingState from '../components/LoadingState.vue'
import IssueFeedbackDialog from '../components/IssueFeedbackDialog.vue'
import { notify } from '../composables/feedback'
const props = defineProps({ admin: Boolean })
const rows = ref([]), loading = ref(true), error = ref(''), filter = ref('all'), search = ref(''), busy = ref(null), showSubmit = ref(false)
const drafts = reactive({}), finished = reactive({})
const shown = computed(() => rows.value.filter(r => (filter.value === 'all' || r.resolved === (filter.value === 'resolved')) && `${r.title} ${r.content} ${r.author}`.toLowerCase().includes(search.value.toLowerCase())))
const pending = computed(() => rows.value.filter(r => !r.resolved).length)
const unread = row => row.replies.some(r => !r.read_at)
const date = value => new Date(`${value}Z`).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
let alive = true, timer, fetching = false
async function load(initial = false) {
  if (fetching) return
  fetching = true; if (initial) loading.value = true
  try { const result = await (props.admin ? personalApi.feedback() : personalApi.myFeedback()); if (alive) { rows.value = result; error.value = '' } }
  catch (e) { if (alive) error.value = e.status === 404 ? '反馈接口尚未加载，请重启后端服务后重试。' : e.message }
  finally { fetching = false; if (alive) loading.value = false }
}
async function resolve(row) {
  busy.value = row.id
  try { const result = await personalApi.resolve(row.id, !row.resolved); row.resolved = result.resolved; notify(row.resolved ? '已标记处理完成；可继续发送处理说明。' : '反馈已重新打开') }
  catch(e) { notify(e.message, 'error') } finally { busy.value = null }
}
async function reply(row) {
  if (busy.value !== null || !drafts[row.id]?.trim()) return
  busy.value = row.id
  try { await personalApi.replyFeedback(row.id, { content: drafts[row.id], resolved: finished[row.id] !== false }); drafts[row.id] = ''; notify('处理回复已发送给提交人'); await load() }
  catch(e) { notify(e.message, 'error') } finally { busy.value = null }
}
async function markRead(row) {
  busy.value = row.id
  try { await Promise.all(row.replies.filter(r => !r.read_at).map(r => personalApi.readReply(r.id))); await load(); window.dispatchEvent(new Event('feedback-updated')) }
  catch(e) { notify(e.message, 'error') } finally { busy.value = null }
}
const refresh = () => { if (!document.hidden) load() }
onMounted(() => { load(true); timer = setInterval(refresh, 60000); window.addEventListener('feedback-updated', refresh); document.addEventListener('visibilitychange', refresh) })
onBeforeUnmount(() => { alive = false; clearInterval(timer); window.removeEventListener('feedback-updated', refresh); document.removeEventListener('visibilitychange', refresh) })
</script>
<template>
  <main class="personal-page feedback-page">
    <header class="page-heading"><div><p class="eyebrow">{{ admin ? 'ADMINISTRATION' : 'MY FEEDBACK' }}</p><h1>{{ admin ? '问题反馈管理' : '我的反馈' }}</h1><p v-if="!admin">查看你提交的问题与管理员的处理回复，其他成员无法查看。</p></div><button class="button primary" @click="showSubmit = true">提交新反馈</button></header>
    <LoadingState v-if="loading" label="正在读取反馈" />
    <div v-if="error" class="error-banner" role="alert">{{ error }} <button class="button secondary" @click="load(true)">重试</button></div>
    <template v-if="!loading && !error">
      <div class="feedback-filters"><div class="segmented" aria-label="反馈状态"><button v-for="s in [{id:'all',name:`全部 ${rows.length}`},{id:'pending',name:`待处理 ${pending}`},{id:'resolved',name:`已处理 ${rows.length-pending}`}]" :key="s.id" :class="{active:filter===s.id}" :aria-pressed="filter===s.id" @click="filter=s.id">{{ s.name }}</button></div><input v-model="search" aria-label="搜索反馈" placeholder="搜索标题、内容或提交人" type="search" /></div>
      <div v-if="!shown.length" class="panel collection-empty">暂无符合条件的反馈</div>
      <article v-for="row in shown" :key="row.id" class="panel feedback-card">
        <div class="collection-meta"><span class="badge">{{ row.resolved ? '已处理' : '待处理' }}</span><span v-if="!admin && unread(row)" class="badge">有新回复</span><span>#{{ row.id }} · {{ row.author }} · {{ date(row.created_at) }}</span></div>
        <h2>{{ row.title }}</h2><p class="feedback-content">{{ row.content }}</p><p class="muted">提交页面：{{ row.page || '未记录' }}</p>
        <section v-if="row.replies.length" class="reply-history" aria-label="处理记录"><h3>管理员回复</h3><article v-for="item in row.replies" :key="item.id" class="reply-item"><p class="muted">{{ item.author }} · {{ date(item.created_at) }} · {{ item.read_at ? '提交人已读' : '提交人未读' }}</p><p class="feedback-content">{{ item.content }}</p></article></section>
        <p v-else class="muted">{{ row.resolved ? '已标记处理完成，尚未填写处理说明。' : '等待管理员处理回复。' }}</p>
        <form v-if="admin" class="reply-form" @submit.prevent="reply(row)"><label :for="`reply-${row.id}`">向 {{ row.author }} 回复处理结果</label><textarea :id="`reply-${row.id}`" v-model="drafts[row.id]" required maxlength="5000" rows="3" placeholder="说明处理结果，或告知还需要补充的信息" :disabled="busy === row.id" /><label class="reply-check"><input type="checkbox" :checked="finished[row.id] !== false" @change="finished[row.id] = $event.target.checked" />发送后标记为已处理</label><div class="reply-actions"><button type="button" class="button secondary" :disabled="busy !== null" @click="resolve(row)">{{ row.resolved ? '重新打开' : '仅标记已处理' }}</button><button class="button primary" :disabled="busy !== null || !drafts[row.id]?.trim()">{{ busy === row.id ? '保存中…' : '发送处理回复' }}</button></div></form>
        <button v-else-if="unread(row)" class="button secondary" :disabled="busy !== null" @click="markRead(row)">标记回复已读</button>
      </article>
    </template>
    <IssueFeedbackDialog :open="showSubmit" @close="showSubmit = false" />
  </main>
</template>
<style scoped>
.feedback-page { display:grid; gap:20px; }.feedback-filters { display:flex; flex-wrap:wrap; gap:16px; align-items:center; }.feedback-filters>input { width:min(100%,360px); }.feedback-card { overflow-wrap:anywhere; margin:0; }.feedback-card h2 { font-size:21px; font-weight:500; margin:16px 0; }.feedback-card .muted { font-size:13px; }.reply-history,.reply-form { border-top:1px solid var(--line); padding-top:20px; margin-top:20px; }.reply-history h3 { font-size:15px; font-weight:500; }.reply-item { padding:12px 16px; margin-top:12px; border-radius:12px; background:var(--surface); }.reply-form { display:grid; gap:12px; }.reply-form>label { font-size:14px; }.reply-check { display:flex; gap:8px; align-items:center; }.reply-check input { width:18px; height:18px; }.reply-actions { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:12px; }.feedback-content { white-space:pre-wrap; overflow-wrap:anywhere; }.page-heading { flex-wrap:wrap; gap:16px; }
@media(max-width:650px) { .feedback-filters>input { width:100%; }.reply-actions .button { flex:1; }.feedback-card h2 { font-size:19px; } }
</style>
