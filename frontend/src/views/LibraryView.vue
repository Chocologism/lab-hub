<script setup>
import { paperLabel, paperSource, paperRead, paperReadLabel } from '../utils/papers'
import { renderLatex } from '../utils/latex'
import FavoriteButton from '../components/FavoriteButton.vue'
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authApi, libraryApi } from '../api/client'
import LoadingState from '../components/LoadingState.vue'
import AppIcon from '../components/AppIcon.vue'
import WaveInput from '../components/WaveInput.vue'
import SmartEmuDelete from '../components/SmartEmuDelete.vue'
import { notify } from '../composables/feedback'

const router = useRouter()
const query = ref(''), source = ref('all'), papers = ref([]), loading = ref(true), error = ref(''), refreshing = ref(null), deleting = ref(null), currentUser = ref(null)
let request = 0

function handlePaperCardClick(paper, event) {
  if (!paper.seminar_id) return
  if (event?.target?.closest('a, button, input, textarea, select, .card-star, .smart-emu-btn')) return
  goToSeminar(paper.seminar_id)
}

function goToSeminar(seminarId) {
  if (!seminarId) return
  router.push({
    path: '/seminars',
    query: {
      view: 'timeline',
      target_seminar: String(seminarId),
      no_reset: '1'
    }
  })
}

async function load() {
  const id = ++request; loading.value = true; error.value = ''
  try { const data = await libraryApi.list(query.value, source.value); if (id === request) papers.value = Array.isArray(data) ? data : [] }
  catch (e) { if (id === request) { papers.value = []; error.value = e.message || '检索文献库失败，请稍后重试' } }
  finally { if (id === request) loading.value = false }
}

async function refresh(paper) {
  refreshing.value = paper.id
  try { await libraryApi.refresh(paper.id); await load(); notify('文献信息已补全') }
  catch (e) { notify(e.message, 'error') }
  finally { refreshing.value = null }
}

async function deletePaper(paper) {
  if (!window.confirm(`确定要从文献库中删除文献《${paper.title}》吗？删除后不可恢复。`)) return
  deleting.value = paper.id
  try {
    await libraryApi.delete(paper.id)
    papers.value = papers.value.filter(p => p.id !== paper.id)
    notify('文献已成功删除')
  } catch (e) {
    notify(e.message || '删除文献失败', 'error')
  } finally {
    deleting.value = null
  }
}

watch(source, load)
onMounted(async () => {
  try { currentUser.value = await authApi.getMe() } catch (e) {}
  load()
})
</script>
<template>
  <div class="library-page"><header class="page-heading"><div><div class="eyebrow">Shared literature</div><h1>文献库</h1></div></header>
    <form class="library-search" @submit.prevent="load">
      <WaveInput
        id="library-query"
        v-model="query"
        type="search"
        label="关键词、标题、作者、摘要或 arXiv 编号"
        wrapper-class="library-wave-box"
        clearable
        @clear="load"
        @keydown.enter.prevent="load"
      />
      <button class="button primary library-search-btn" type="submit">
        <span class="search-icon-pig" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path class="speed-line-1" d="M14 5H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <path class="speed-line-2" d="M14 8H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M21 11.5C21 16.75 16.75 21 11.5 21C6.25 21 2 16.75 2 11.5C2 6.25 6.25 2 11.5 2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M22 22L20 20" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span>检索</span>
      </button>
    </form>
    <div class="segmented"><button :class="{ active: source === 'all' }" @click="source = 'all'">全部文献</button><button :class="{ active: source === 'recommendation' }" @click="source = 'recommendation'">来自推荐</button><button :class="{ active: source === 'direct' }" @click="source = 'direct'">定向收录</button><button :class="{ active: source === 'seminar' }" @click="source = 'seminar'">来自组会</button></div>
    <LoadingState v-if="loading" message="正在检索文献库" /><div v-else-if="error" class="error-banner">{{ error }}<button class="button secondary" @click="load">重试</button></div>
    <template v-else><p class="muted">共 {{ papers.length }} 篇 · 同一 arXiv 文献自动合并版本</p><div v-if="!papers.length" class="library-empty">没有匹配的文献。试试其他关键词，或在推荐和组会中添加文献。</div>
    <article
      v-for="paper in papers"
      :key="paper.id"
      class="library-paper"
      :class="{ 'clickable-seminar-card': paper.seminar_id }"
      @click="handlePaperCardClick(paper, $event)"
    >
      <FavoriteButton kind="paper" :target="paper.arxiv_id" class="card-star" />
      <div class="paper-badges">
        <span class="mono accent">{{ paperLabel(paper) }}</span>
        <span v-if="paper.from_recommendation" class="badge cyan">文献推荐</span>
        <span v-if="paper.from_direct" class="badge amber">我的定向收录</span>
        <span
          v-if="paper.from_seminar"
          class="badge amber"
          :class="{ 'seminar-jump-pill': paper.seminar_id }"
          :title="paper.seminar_id ? '点击可跳转至该次组会时间线卡片' : '组会讨论'"
          @click.stop="paper.seminar_id && goToSeminar(paper.seminar_id)"
        >
          组会讨论{{ paper.seminar_id ? ' ↗' : '' }}
        </span>
        <span v-if="paper.journal" class="badge">{{ paper.journal }}</span>
        <span v-if="paper.primary_category" class="badge">{{ paper.primary_category }}</span>
      </div>
      <h2 class="academic"><a :href="paperSource(paper)" target="_blank" rel="noreferrer" v-html="renderLatex(paper.title)"></a></h2>
      <p class="muted">{{ paper.authors.join(' · ') }} <span v-if="paper.published_date">· {{ paper.published_date }}</span></p>
      <p class="abstract" v-html="renderLatex(paper.abstract || '已保存文献链接，元数据待补全。')"></p>
      <div class="paper-actions">
        <a class="button small secondary" :href="paperRead(paper)" target="_blank" rel="noreferrer">{{ paperReadLabel(paper) }}</a>
        <button
          v-if="paper.seminar_id"
          class="button small secondary"
          type="button"
          title="跳转至对应组会时间线卡片"
          @click.stop="goToSeminar(paper.seminar_id)"
        >
          查看组会
        </button>
        <button v-if="paper.metadata_status === 'pending'" class="button small ghost" :disabled="refreshing !== null" @click="refresh(paper)">{{ refreshing === paper.id ? '正在抓取…' : '补全文献信息' }}</button>
        <SmartEmuDelete v-if="currentUser?.role === 'admin'" size="small" :disabled="deleting === paper.id" title="从文献库删除" text="删除" @click="deletePaper(paper)" />
      </div>
    </article></template>
  </div>
</template>
<style scoped>
.library-page { display:grid; gap:22px; }
.library-search { display:flex; gap:16px; align-items:center; }
.library-search :deep(.library-wave-box) { margin:0 !important; flex:1; }
.library-search-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.search-icon-pig {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s linear;
}
.search-icon-pig svg {
  display: block;
}
.library-search-btn:hover .search-icon-pig {
  animation: hardPigSearchAnim 1s linear infinite;
}
@keyframes hardPigSearchAnim {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
}
.segmented { justify-self:start; }
.library-paper,.library-empty { padding:24px; border:1px solid var(--line); border-radius:14px; background:var(--panel); position: relative; }
.library-paper.clickable-seminar-card {
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.library-paper.clickable-seminar-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.07);
  transform: translateY(-1px);
}
.seminar-jump-pill {
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.seminar-jump-pill:hover {
  opacity: 0.85;
  transform: scale(1.05);
}
.paper-badges,.paper-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.paper-badges { font-size:12px; }
.library-paper h2 { font-size:21px; margin:14px 0 8px; }
.library-paper h2 a { color:var(--text); text-decoration:none; }
.library-paper .muted { font-size:12px; }
.abstract { margin:16px 0; font-size:14px; line-height:1.85; overflow-wrap:anywhere; }
.paper-badges .mono { margin-right:auto; }

@media (max-width: 768px) {
  .library-page { gap: 16px; }
  .library-search { flex-direction: column; gap: 10px; align-items: stretch; }
  .library-search .button { justify-content: center; }
  .segmented {
    display: flex;
    width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap;
    padding: 3px;
    gap: 4px;
  }
  .segmented::-webkit-scrollbar { display: none; }
  .segmented button { flex-shrink: 0; white-space: nowrap; }
  .library-paper { padding: 16px; border-radius: 12px; }
  .library-paper h2 { font-size: 17px; margin: 10px 0 6px; }
  .paper-badges { padding-right: 40px; }
  .paper-actions { gap: 8px; }
}
</style>
