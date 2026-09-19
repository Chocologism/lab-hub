<script setup>
import { paperLabel, paperSource, paperRead, paperReadLabel } from '../utils/papers'
import { renderLatex } from '../utils/latex'
import { computed, onMounted, ref } from 'vue'
import FavoriteButton from '../components/FavoriteButton.vue'
import LoadingState from '../components/LoadingState.vue'
import AttachmentLink from '../components/AttachmentLink.vue'
import { useFavorites } from '../composables/favorites'
import { resourceApi } from '../api/client'
import WaveInput from '../components/WaveInput.vue'
import { compareTitle } from '../utils/titleSort'

const { entries, error, load } = useFavorites()
const query = ref(''), kind = ref('all'), loading = ref(true)
const customCategories = ref([])

function normalizeUrl(url) {
  if (!url) return ''
  url = url.trim()
  if (url.startsWith('/') || /^https?:\/\//i.test(url)) {
    return url
  }
  return 'https://' + url
}

function getResourceLinks(item) {
  if (!item) return []
  if (item.category === '网站') {
    let siteUrl = item.download_url || item.tutorial_url || item.github_url || ''
    if (!siteUrl && item.title && (item.title.includes('http://') || item.title.includes('https://') || item.title.includes('.org') || item.title.includes('.com') || item.title.includes('.cn') || item.title.includes('.net') || item.title.includes('.edu'))) {
      siteUrl = item.title
    }
    const finalUrl = normalizeUrl(siteUrl)
    return finalUrl ? [{ url: finalUrl, label: '跳转' }] : []
  }
  return [
    { url: item.tutorial_url, label: '讲义' },
    { url: item.exercise_url, label: '习题' },
    { url: item.github_url, label: '代码' },
    { url: item.download_url, label: '下载' }
  ].filter(link => Boolean(link.url && link.url !== '#'))
}

const categoryOptions = computed(() => {
  const standard = [
    { id: 'all', name: '全部' },
    { id: 'paper', name: '文献' },
    { id: '教材', name: '教材' },
    { id: '工具', name: '工具' },
    { id: '网站', name: '网站' },
  ]
  const baseIds = new Set(['all', 'paper', '教材', '工具', '网站'])
  const extras = new Set()
  customCategories.value.forEach(cat => {
    if (cat && !baseIds.has(cat)) extras.add(cat)
  })
  entries.value.forEach(e => {
    if (e.kind === 'book' && e.item?.category && !baseIds.has(e.item.category)) {
      extras.add(e.item.category)
    }
  })
  const dynamicList = Array.from(extras).map(cat => ({ id: cat, name: cat }))
  return [...standard, ...dynamicList]
})

const shown = computed(() => {
  const filtered = entries.value.filter(e => {
    if (kind.value !== 'all') {
      if (kind.value === 'paper') {
        if (e.kind !== 'paper') return false
      } else {
        if (e.kind !== 'book' || (e.item?.category || '教材') !== kind.value) return false
      }
    }
    const q = query.value.trim().toLowerCase()
    if (!q) return true
    const authors = Array.isArray(e.item?.authors) ? e.item.authors.join(' ') : (e.item?.authors || '')
    return `${e.item?.title || ''} ${authors} ${e.item?.arxiv_id || ''} ${e.item?.category || ''}`.toLowerCase().includes(q)
  })

  // 按标题首字母/首字排序
  return [...filtered].sort((a, b) => compareTitle(a.item?.title, b.item?.title))
})

async function refresh() {
  loading.value = true
  try {
    await Promise.all([
      load(true),
      resourceApi.getCategories().then(res => {
        if (Array.isArray(res)) customCategories.value = res.map(c => typeof c === 'string' ? c : c.name)
      }).catch(() => {})
    ])
  } catch {} finally {
    loading.value = false
  }
}

onMounted(refresh)
const date = value => new Date(`${value}Z`).toLocaleDateString('zh-CN')
</script>

<template>
  <div class="personal-page">
    <header class="page-heading">
      <div>
        <p class="eyebrow">PERSONAL COLLECTION</p>
        <h1>我的收藏</h1>
      </div>
    </header>

    <div class="collection-tools">
      <div class="segmented category-segmented" aria-label="收藏分类">
        <button 
          v-for="option in categoryOptions" 
          :key="option.id" 
          :class="{ active: kind === option.id }" 
          :aria-pressed="kind === option.id" 
          @click="kind = option.id"
        >
          {{ option.name }}
        </button>
      </div>
      <WaveInput 
        id="favorites-query"
        v-model="query" 
        type="search" 
        label="搜索标题、作者或编号…" 
        wrapper-class="favorites-wave-box"
        clearable
        @clear="query = ''"
      />
    </div>

    <LoadingState v-if="loading" message="正在读取收藏" />
    <div v-else-if="error" class="error-banner">{{ error }} <button class="button secondary" @click="refresh">重试</button></div>
    <template v-else>
      <p class="muted">{{ shown.length }} 项收藏 · 仅自己可见</p>
      <div v-if="!shown.length" class="panel collection-empty">
        <h2>{{ entries.length ? '该分类下没有匹配的收藏' : '收藏从一颗星开始' }}</h2>
        <p>在文献或教材资料卡片右上角点击星号，即可保存到这里。</p>
        <div class="empty-actions">
          <router-link class="button secondary" to="/arxiv">浏览文献推荐</router-link>
          <router-link class="button secondary" to="/resources">浏览资料整合</router-link>
        </div>
      </div>
      <div class="collection-grid">
        <article v-for="entry in shown" :key="`${entry.kind}:${entry.target}`" class="panel collection-card">
          <FavoriteButton :kind="entry.kind" :target="entry.target" class="card-star" />
          <div class="collection-meta">
            <span :class="['badge', entry.kind === 'paper' ? 'cyan' : 'amber']">
              {{ entry.kind === 'paper' ? '文献' : (entry.item?.category || '资料') }}
            </span>
            <span>{{ entry.item?.primary_category || (entry.kind === 'paper' ? 'arXiv' : '') }}</span>
          </div>
          <h2 v-html="renderLatex(entry.item?.title)"></h2>
          <p class="muted">{{ Array.isArray(entry.item?.authors) ? entry.item.authors.join(' · ') : entry.item?.authors }}</p>
          <p class="collection-description" v-html="renderLatex(entry.item?.abstract || entry.item?.description || '暂无简介')"></p>
          <div class="collection-links" v-if="entry.kind === 'paper'">
            <a class="button small secondary" :href="paperRead(entry.item)" target="_blank" rel="noreferrer">{{ paperReadLabel(entry.item) }}</a>
            <a :href="paperSource(entry.item)" target="_blank" rel="noreferrer">{{ paperLabel(entry.item) }}</a>
          </div>
          <div class="collection-links" v-else>
            <AttachmentLink
              v-for="(link, idx) in getResourceLinks(entry.item)"
              :key="idx"
              :url="link.url"
              :label="link.label"
            />
            <router-link to="/resources">查看资料详情 →</router-link>
          </div>
          <small class="muted">收藏于 {{ date(entry.saved_at) }}</small>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.collection-tools {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin: 12px 0 20px;
}

.collection-tools :deep(.favorites-wave-box) {
  margin: 12px 0 2px !important;
  flex: 0 1 340px;
  min-width: 240px;
  max-width: 380px;
}

.collection-tools :deep(.favorites-wave-box input) {
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box;
}

.category-segmented {
  overflow-x: auto;
  max-width: 100%;
  padding-bottom: 2px;
}
.empty-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 14px;
}

@media (max-width: 768px) {
  .collection-tools,
  :deep(.collection-tools) {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
    margin: 8px 0 16px;
  }
  .category-segmented {
    width: 100%;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap;
  }
  .category-segmented::-webkit-scrollbar {
    display: none;
  }
  .category-segmented button {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .collection-tools :deep(.favorites-wave-box) {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 16px 0 4px !important;
  }
  .collection-tools :deep(.favorites-wave-box input) {
    width: 100% !important;
    max-width: none !important;
  }
  .empty-actions {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
