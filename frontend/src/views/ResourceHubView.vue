<template>
  <main class="resource-shell">
    <section class="resource-heading">
      <div>
        <p class="eyebrow">资料整合</p>
        <h1>资料整合</h1>
      </div>
      <button type="button" class="mighty-moose-btn" @click="openCreate">
        <span class="mighty-moose-text">添加资料</span>
        <span class="mighty-moose-icon">
          <AppIcon name="plus" :size="16" />
        </span>
      </button>
    </section>

    <!-- 分类与检索栏 -->
    <section id="tour-resources-category-bar" class="category-bar">
      <div class="category-buttons">
        <button 
          :class="{ active: selectedCategory === '全部' }" 
          @click="selectedCategory = '全部'; loadBooks()"
        >
          全部
        </button>
        <div 
          v-for="cat in categoryList" 
          :key="cat.name" 
          class="category-tag-wrapper"
        >
          <button 
            :class="{ active: selectedCategory === cat.name }" 
            @click="selectedCategory = cat.name; loadBooks()"
          >
            {{ cat.name }}
          </button>
          <button 
            v-if="currentUser?.role === 'admin' && !cat.is_default" 
            class="category-del-btn" 
            title="删除分类" 
            @click.stop="handleDeleteCategory(cat.name)"
          >
            ×
          </button>
        </div>

        <!-- 管理员添加分类按钮 -->
        <button 
          v-if="currentUser?.role === 'admin'" 
          class="category-add-trigger" 
          title="新增分类" 
          @click="showAddCategoryDialog = true"
        >
          + 分类
        </button>
      </div>

      <div class="category-tools">
        <div class="segmented resource-sort-segmented" role="group" aria-label="资料排序方式">
          <button 
            type="button" 
            :class="{ active: sortBy === 'title' }" 
            title="默认：按标题首字母 / 首字顺序排列"
            @click="sortBy = 'title'"
          >
            首字母排序
          </button>
          <button 
            type="button" 
            :class="{ active: sortBy === 'favorites' }" 
            title="按全站收藏量排序（已收藏项仍靠前）"
            @click="sortBy = 'favorites'"
          >
            收藏量排序
          </button>
        </div>

        <WaveInput 
          v-model="search" 
          type="search" 
          label="搜索资料名称、作者或详细说明…" 
          wrapper-class="resource-wave-box"
          clearable
          @clear="queueSearch"
          @input="queueSearch" 
        />
      </div>
    </section>

    <LoadingState v-if="loading" label="正在整理资料" />
    <section v-else-if="!sortedBooks.length" class="empty-state">
      <h2>这个分类还没有资料</h2>
      <p class="muted">点击右上角「添加资料」分享给组内成员</p>
    </section>

    <!-- 资料卡片矩阵 -->
    <section v-else id="tour-resources-book-grid" class="book-grid">
      <article 
        v-for="book in sortedBooks" 
        :key="book.id" 
        :id="'book-card-' + book.id"
        class="book-card"
        :class="{ 
          'is-flipped': activeBookId === book.id, 
          'is-website': book.category === '网站',
          'has-cover': hasCover(book),
          'is-highlighted': highlightedBookId === book.id
        }"
        @click="handleCardClick(book)"
      >
        <!-- 背景层：若具有封面图片，全卡片背景展示该图片并带磨砂、模糊与暗化遮罩以突出文字标题 -->
        <div v-if="hasCover(book)" class="book-card-backdrop" aria-hidden="true">
          <div 
            class="book-card-backdrop-img" 
            :style="{ backgroundImage: `url(${book.cover_url})` }"
          ></div>
          <div class="book-card-backdrop-overlay"></div>
        </div>

        <!-- 默认展示正面：封面视觉与标题 -->
        <div class="book-front-visual">
          <div class="card-badges-row">
            <span class="category-badge">{{ book.category }}</span>
          </div>
          <FavoriteButton 
            kind="book" 
            :target="String(book.id)" 
            :count="Number(book.favorite_count || 0)" 
            variant="tag" 
            class="card-fav-tag" 
            @toggle="handleToggleBookFavorite(book, $event)" 
          />

          <div class="book-cover-center">
            <div class="book-cover-icon">
              <img 
                v-if="hasCover(book)" 
                :src="book.cover_url" 
                :alt="`${book.title} 封面`" 
                class="book-img"
              />
              <span v-else class="book-custom-icon">
                <AppIcon :name="categoryIconName(book.category)" :size="32" />
              </span>
            </div>
            <h2 class="book-front-title">{{ book.title }}</h2>
            <p v-if="book.authors" class="book-front-author">{{ book.authors }}</p>
          </div>
        </div>

        <!-- 悬停/点击从底部沿 X 轴翻起的详情层 (selfish-owl-57) -->
        <div class="card__content" @click="handleCardClick(book)">
          <div class="card__header">
            <div class="card-badges-row">
              <span class="category-badge-small">{{ book.category }}</span>
            </div>
            <div class="card-header-actions" @click.stop>
              <button 
                v-if="activeBookId === book.id" 
                type="button" 
                class="mobile-flip-back-btn" 
                title="翻回正面" 
                aria-label="翻回正面"
                @click.stop="activeBookId = null"
              >
                <AppIcon name="close" :size="12" />
              </button>
              <FavoriteButton 
                kind="book" 
                :target="String(book.id)" 
                :count="Number(book.favorite_count || 0)" 
                variant="tag" 
                class="card-fav-tag" 
                @toggle="handleToggleBookFavorite(book, $event)" 
              />
            </div>
          </div>

          <h2 class="card__title">{{ book.title }}</h2>
          <p v-if="book.authors" class="card__author">{{ book.authors }}</p>
          <p class="card__description">{{ book.description || '暂无详细说明' }}</p>

          <div class="card__footer">
            <div class="resource-links" @click.stop>
              <!-- 网站类目专属翻转后左下角访问链接 -->
              <a 
                v-if="book.category === '网站' && getWebsiteUrl(book)" 
                :href="getWebsiteUrl(book)" 
                target="_blank" 
                rel="noreferrer" 
                class="resource-jump-link"
                @click.stop
              >
                访问 ↗
              </a>
              <a 
                v-if="book.tutorial_url && book.category !== '网站'" 
                :href="book.tutorial_url" 
                target="_blank" 
                rel="noreferrer" 
                class="resource-jump-link" 
                @click.stop
              >
                {{ book.category === '工具' ? '指南 ↗' : '讲义 ↗' }}
              </a>
              <a 
                v-if="book.exercise_url" 
                :href="book.exercise_url" 
                target="_blank" 
                rel="noreferrer" 
                class="resource-jump-link"
                @click.stop
              >
                习题 ↗
              </a>
              <a 
                v-if="book.github_url" 
                :href="book.github_url" 
                target="_blank" 
                rel="noreferrer" 
                class="resource-jump-link"
                @click.stop
              >
                代码 ↗
              </a>
              <AttachmentLink 
                v-if="book.download_url && isPdf(book.download_url)" 
                :url="book.download_url" 
                label="打开 PDF" 
              />
            </div>

            <div class="card-admin-actions" @click.stop>
              <KindBobcatEdit 
                v-if="canEditBook(book)" 
                size="small" 
                title="编辑资料" 
                text="编辑" 
                @click="openEdit(book)" 
              />
              <SmartEmuDelete 
                v-if="canDeleteBook(book)" 
                size="small" 
                title="移除资料" 
                text="删除" 
                @click="handleDelete(book)" 
              />
            </div>
          </div>
        </div>
      </article>
    </section>

    <!-- 添加/编辑资料对话框 -->
    <BaseDialog 
      :open="showModal" 
      :busy="saving || uploading" 
      :title="editingId ? '编辑资料' : '添加资料'" 
      @close="showModal = false"
    >
      <form class="book-form" @submit.prevent="handleSave">
        <!-- 步骤 1：前置选择添加类型/分类 -->
        <div class="category-selector-row">
          <span class="field-label">资料类型 *</span>
          <div class="category-pill-group">
            <label 
              v-for="cat in categoryList" 
              :key="cat.name" 
              :class="['category-pill', { active: form.category === cat.name }]"
            >
              <input 
                v-model="form.category" 
                type="radio" 
                :value="cat.name" 
              />
              {{ cat.name }}
            </label>
          </div>
        </div>

        <label>
          名称 *
          <input v-model="form.title" required placeholder="如：天体物理导论 / Astropy / NASA ADS" />
        </label>

        <!-- 只有添加教材时才必须填写作者 -->
        <label v-if="form.category === '教材'">
          作者 *
          <input v-model="form.authors" required placeholder="如：Bradley W. Carroll" />
        </label>
        <label v-else>
          作者 / 维护机构（选填）
          <input v-model="form.authors" placeholder="如开发团队或机构名称" />
        </label>

        <label>
          详细说明
          <textarea v-model="form.description" rows="3" placeholder="简要介绍该资料的用途或推荐理由" />
        </label>

        <!-- 外链矩阵：讲义、习题、代码 -->
        <div class="links-matrix-section">
          <p class="section-hint">外链矩阵（留空则卡片上不展示该按钮）：</p>
          <div class="link-inputs-grid">
            <label>
              讲义 / 在线文档链接
              <input v-model="form.tutorial_url" type="url" placeholder="https://..." />
            </label>
            <label>
              习题解答链接
              <input v-model="form.exercise_url" type="url" placeholder="https://..." />
            </label>
            <label>
              GitHub / 代码仓库链接
              <input v-model="form.github_url" type="url" placeholder="https://github.com/..." />
            </label>
          </div>
        </div>

        <FileField 
          v-model="form.cover_url" 
          label="封面图片（可选）" 
          image-only 
          @busy="uploading = $event" 
        />
        
        <FileField 
          v-model="form.download_url" 
          :label="form.category === '网站' ? '网站网址或文件 (可选)' : '资料 PDF / 下载链接 (可选)'" 
          @busy="uploading = $event" 
        />

        <div class="dialog-actions">
          <button type="button" class="button button-quiet" @click="showModal = false">取消</button>
          <button class="button button-primary" :disabled="saving || uploading">保存资料</button>
        </div>
      </form>
    </BaseDialog>

    <!-- 管理员新增分类对话框 -->
    <BaseDialog 
      :open="showAddCategoryDialog" 
      title="新增资料分类" 
      :busy="categorySaving" 
      @close="showAddCategoryDialog = false"
    >
      <form class="book-form" @submit.prevent="handleAddCategory">
        <label>
          分类名称 *
          <input 
            v-model="newCategoryName" 
            required 
            maxlength="20" 
            placeholder="例如：综述 / 数据库 / 巡天任务" 
          />
        </label>
        <div class="dialog-actions">
          <button type="button" class="button button-quiet" @click="showAddCategoryDialog = false">取消</button>
          <button class="button button-primary" :disabled="categorySaving || !newCategoryName.trim()">添加分类</button>
        </div>
      </form>
    </BaseDialog>

  </main>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { resourceApi, authApi } from '../api/client'
import { useFavorites } from '../composables/favorites'
import FavoriteButton from '../components/FavoriteButton.vue'
import FileField from '../components/FileField.vue'
import AttachmentLink from '../components/AttachmentLink.vue'
import AppIcon from '../components/AppIcon.vue'
import BaseDialog from '../components/BaseDialog.vue'
import LoadingState from '../components/LoadingState.vue'
import WaveInput from '../components/WaveInput.vue'
import SmartEmuDelete from '../components/SmartEmuDelete.vue'
import KindBobcatEdit from '../components/KindBobcatEdit.vue'
import { confirmAction, notify } from '../composables/feedback'
import { compareTitle } from '../utils/titleSort'

const route = useRoute()
const { load: loadFavorites, saved: isFavorite } = useFavorites()

const categoryList = ref([
  { name: '教材', is_default: true },
  { name: '工具', is_default: true },
  { name: '网站', is_default: true },
])
const selectedCategory = ref('全部')
const search = ref('')
const books = ref([])
const loading = ref(false)
const activeBookId = ref(null)
const sortBy = ref('title') // 'title' | 'favorites'
const highlightedBookId = ref(null)

function canDeleteBook(b) {
  return b.created_by_id === currentUser.value?.id || currentUser.value?.role === 'admin'
}

function canEditBook(b) {
  return b.created_by_id === currentUser.value?.id || currentUser.value?.role === 'admin'
}

const sortedBooks = computed(() => {
  if (!books.value || !books.value.length) return []
  return [...books.value].sort((a, b) => {
    // 1. 收藏的默认依然靠前显示 (当前用户收藏的项目优先置顶)
    const aFav = isFavorite('book', String(a.id)) ? 1 : 0
    const bFav = isFavorite('book', String(b.id)) ? 1 : 0
    if (aFav !== bFav) return bFav - aFav

    // 2. 组内排序规则
    if (sortBy.value === 'favorites') {
      const aCount = Number(a.favorite_count || 0)
      const bCount = Number(b.favorite_count || 0)
      if (bCount !== aCount) return bCount - aCount
      // 收藏量相同时回退到标题首字母排序
      return compareTitle(a.title, b.title)
    }

    // 默认：按标题首字母/首字排序
    return compareTitle(a.title, b.title)
  })
})

function normalizeUrl(url) {
  if (!url) return ''
  url = url.trim()
  if (url.startsWith('/') || /^https?:\/\//i.test(url)) {
    return url
  }
  return 'https://' + url
}

function getWebsiteUrl(book) {
  if (!book) return ''
  let url = book.download_url || book.tutorial_url || book.github_url || ''
  if (!url && book.title && (book.title.includes('http://') || book.title.includes('https://') || book.title.includes('.org') || book.title.includes('.com') || book.title.includes('.cn') || book.title.includes('.net') || book.title.includes('.edu'))) {
    url = book.title
  }
  if (!url) return ''
  return normalizeUrl(url)
}

function getFirstLink(book) {
  if (!book) return ''
  // 1. 若为「网站」类型，优先进入该网站
  if (book.category === '网站') {
    const siteUrl = getWebsiteUrl(book)
    if (siteUrl) return siteUrl
  }
  // 2. 对应书籍/资料卡片：若填写了“资料PDF/下载链接（可选）”，点击卡片优先跳转该链接
  if (book.download_url && book.download_url.trim()) {
    return normalizeUrl(book.download_url)
  }
  // 3. 其次按备用顺位查找可用链接：讲义 -> 习题 -> 代码
  if (book.tutorial_url && book.tutorial_url.trim()) {
    return normalizeUrl(book.tutorial_url)
  }
  if (book.exercise_url && book.exercise_url.trim()) {
    return normalizeUrl(book.exercise_url)
  }
  if (book.github_url && book.github_url.trim()) {
    return normalizeUrl(book.github_url)
  }
  // 4. 兜底网站网址识别
  const fallbackSite = getWebsiteUrl(book)
  if (fallbackSite) return fallbackSite
  return ''
}

function handleCardClick(book) {
  // 如果用户正在选中文本（如复制作者或简介），则不触发跳转
  if (window.getSelection && window.getSelection().toString().trim().length > 0) {
    return
  }
  if (isSystemTutorial(book)) {
    openTutorialDetail(book)
    return
  }
  const link = getFirstLink(book)
  if (link) {
    window.open(link, '_blank', 'noopener,noreferrer')
  } else {
    activeBookId.value = (activeBookId.value === book.id ? null : book.id)
    notify('该资料暂未收录可用跳转链接', 'info')
  }
}

function handleToggleBookFavorite(book, isSaved) {
  if (!book) return
  if (isSaved) {
    book.favorite_count = (Number(book.favorite_count) || 0) + 1
  } else {
    book.favorite_count = Math.max(0, (Number(book.favorite_count) || 0) - 1)
  }
}

const showModal = ref(false)
const saving = ref(false)
const uploading = ref(false)
const editingId = ref(null)
const currentUser = ref(null)

const showAddCategoryDialog = ref(false)
const newCategoryName = ref('')
const categorySaving = ref(false)

const form = ref({
  title: '',
  authors: '',
  category: '教材',
  description: '',
  cover_url: '',
  tutorial_url: '',
  exercise_url: '',
  github_url: '',
  download_url: '',
})

let timer

const isPdf = (url) => {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.endsWith('.pdf') || lower.startsWith('/api/files/')
}

const hasCover = (b) => {
  if (!b || !b.cover_url) return false
  const url = b.cover_url.trim()
  return Boolean(url && !url.includes('unsplash.com'))
}

const categoryIconName = (cat) => {
  if (cat === '网站') return 'globe'
  if (cat === '工具') return 'gear'
  return 'book'
}

const loadCategories = async () => {
  try {
    const res = await resourceApi.getCategories()
    if (Array.isArray(res) && res.length) {
      categoryList.value = res.map(cat => {
        if (typeof cat === 'string') {
          return { name: cat, is_default: ['教材', '工具', '网站'].includes(cat) }
        }
        return {
          id: cat.id,
          name: cat.name,
          is_default: Boolean(cat.is_default)
        }
      })
    }
  } catch {}
}

function checkAndApplyHighlight() {
  const highlightKey = route.query.highlight
  if (!highlightKey) return
  const key = String(highlightKey).toLowerCase()
  const target = sortedBooks.value.find(b =>
    String(b.id) === key ||
    b.title?.toLowerCase().includes(key)
  )
  if (target) {
    highlightedBookId.value = target.id
    nextTick(() => {
      const el = document.getElementById(`book-card-${target.id}`) || document.querySelector('.book-card.is-highlighted')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }
}

const loadBooks = async () => {
  loading.value = true
  try {
    const fetched = await resourceApi.getBooks(selectedCategory.value, search.value)
    books.value = Array.isArray(fetched) ? [...fetched] : []
    checkAndApplyHighlight()
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    loading.value = false
  }
}

const queueSearch = () => {
  clearTimeout(timer)
  timer = setTimeout(loadBooks, 250)
}

onMounted(async () => {
  loadFavorites().catch(() => {})
  if (route.query.category) {
    selectedCategory.value = String(route.query.category)
  }
  await Promise.all([loadCategories(), loadBooks()])
  try {
    currentUser.value = await authApi.getMe()
  } catch {}
})

watch(
  () => route.query,
  async (newQuery) => {
    if (newQuery.category && newQuery.category !== selectedCategory.value) {
      selectedCategory.value = String(newQuery.category)
      await loadBooks()
    } else if (newQuery.highlight) {
      checkAndApplyHighlight()
    }
  },
  { deep: true }
)

const openCreate = () => {
  editingId.value = null
  form.value = {
    title: '',
    authors: '',
    category: selectedCategory.value !== '全部' ? selectedCategory.value : '教材',
    description: '',
    cover_url: '',
    tutorial_url: '',
    exercise_url: '',
    github_url: '',
    download_url: '',
  }
  showModal.value = true
}

const openEdit = (b) => {
  editingId.value = b.id
  form.value = {
    title: b.title || '',
    authors: b.authors || '',
    category: b.category || '教材',
    description: b.description || '',
    cover_url: b.cover_url || '',
    tutorial_url: b.tutorial_url || '',
    exercise_url: b.exercise_url || '',
    github_url: b.github_url || '',
    download_url: b.download_url || '',
  }
  showModal.value = true
}

const handleSave = async () => {
  if (form.value.category === '教材' && !form.value.authors.trim()) {
    notify('添加教材时必须填写作者', 'error')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await resourceApi.updateBook(editingId.value, form.value)
    } else {
      await resourceApi.createBook(form.value)
    }
    showModal.value = false
    editingId.value = null
    await loadBooks()
    notify('资料已成功保存', 'success')
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    saving.value = false
  }
}

const handleDelete = async (b) => {
  if (await confirmAction(`移除「${b.title}」？`, { title: '移除资料', confirmLabel: '移除', danger: true })) {
    await resourceApi.deleteBook(b.id)
    await loadBooks()
    notify('资料已移除', 'success')
  }
}

const handleAddCategory = async () => {
  const name = newCategoryName.value.trim()
  if (!name) return
  categorySaving.value = true
  try {
    await resourceApi.createCategory(name)
    newCategoryName.value = ''
    showAddCategoryDialog.value = false
    await loadCategories()
    notify(`分类「${name}」已添加`, 'success')
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    categorySaving.value = false
  }
}

const handleDeleteCategory = async (name) => {
  if (await confirmAction(`确定删除自定义分类「${name}」？已添加的相关资料将保留。`, { title: '删除分类', confirmLabel: '删除', danger: true })) {
    try {
      await resourceApi.deleteCategory(name)
      if (selectedCategory.value === name) {
        selectedCategory.value = '全部'
      }
      await loadCategories()
      await loadBooks()
      notify(`分类「${name}」已删除`, 'success')
    } catch (e) {
      notify(e.message, 'error')
    }
  }
}
</script>

<style scoped>
.resource-shell {
  max-width: 1180px;
  margin: auto;
  padding: 42px 28px 100px;
}

.resource-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.category-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  column-gap: 20px;
  row-gap: 40px;
  margin: 28px 0 24px;
  flex-wrap: wrap;
}

.category-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.category-tag-wrapper {
  display: inline-flex;
  align-items: center;
  position: relative;
}

.category-buttons button {
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 9999px;
  background: var(--panel);
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
}

.category-buttons button:hover {
  color: var(--text);
  border-color: var(--accent);
}

.category-buttons button.active {
  background: var(--accent);
  color: #0b1e25;
  border-color: var(--accent);
  font-weight: 600;
}

.category-del-btn {
  padding: 2px 6px !important;
  margin-left: 2px;
  font-size: 14px !important;
  line-height: 1;
  color: var(--danger) !important;
  opacity: 0.6;
}

.category-del-btn:hover {
  opacity: 1;
}

.category-add-trigger {
  border-style: dashed !important;
  color: var(--accent) !important;
}

.category-bar :deep(.resource-wave-box) {
  margin: 14px 0 2px !important;
  min-width: 260px;
}

.category-tools {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.resource-sort-segmented {
  display: inline-flex;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 9999px;
  padding: 3px;
  margin-bottom: 2px;
  flex-shrink: 0;
}

.resource-sort-segmented button {
  padding: 6px 13px;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}

.resource-sort-segmented button:hover {
  color: var(--text);
}

.resource-sort-segmented button.active {
  background: var(--accent);
  color: #0b1e25;
  font-weight: 600;
}

[data-theme-style="vanta-fog"] .resource-sort-segmented button.active {
  background: var(--accent);
  color: #081f28;
  font-weight: 600;
}



.book-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}

.book-card {
  position: relative;
  min-height: 280px;
  height: 290px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
  perspective: 1000px;
  transform-style: preserve-3d;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  cursor: pointer;
}

.book-card:hover,
.book-card.is-flipped {
  transform: scale(1.03);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25), 0 0 20px var(--raised);
  border-color: var(--accent);
}

/* 具有封面图片的卡片磨砂暗化背景层 */
.book-card.has-cover {
  border-color: var(--line);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.book-card.has-cover:hover,
.book-card.has-cover.is-flipped {
  border-color: var(--accent);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5), 0 0 24px var(--raised);
}

.book-card-backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
}

.book-card-backdrop-img {
  position: absolute;
  inset: -16px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(8px) saturate(1.15) brightness(0.48);
  transform: scale(1.06);
  transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.book-card:hover .book-card-backdrop-img,
.book-card.is-flipped .book-card-backdrop-img {
  transform: scale(1.12);
}

.book-card-backdrop-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.42) 0%,
    rgba(0, 0, 0, 0.65) 50%,
    rgba(0, 0, 0, 0.88) 100%
  );
}

.book-card.has-cover .book-cover-icon {
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
  background: var(--panel, rgba(12, 10, 26, 0.85));
}

.book-card.has-cover .book-front-title {
  font-size: 16.5px;
  font-weight: 600;
  color: #ffffff;
  line-height: 1.4;
  text-shadow: 
    0 1px 3px rgba(0, 0, 0, 0.95),
    0 2px 8px rgba(0, 0, 0, 0.95),
    0 4px 18px rgba(0, 0, 0, 0.75);
  max-width: 240px;
}

.book-card.has-cover .book-front-author {
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(230, 246, 248, 0.92);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
  max-width: 220px;
  margin-top: 4px;
}

.book-card.has-cover .book-front-visual .category-badge {
  background: var(--surface);
  border-color: var(--line);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.book-card.has-cover .book-front-visual .card-fav-tag:not(.is-saved) {
  background: var(--surface);
  border-color: var(--line);
}

.book-front-visual .card-fav-tag {
  position: absolute !important;
  top: 14px !important;
  right: 14px !important;
  left: auto !important;
  bottom: auto !important;
  z-index: 2;
}

.card-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mobile-flip-back-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mobile-flip-back-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.book-front-visual {
  width: 100%;
  height: 100%;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.book-front-visual .category-badge {
  position: absolute;
  top: 14px;
  left: 14px;
  right: auto;
  color: var(--soft);
  font-size: 11.5px;
  line-height: 1.4;
  font-weight: 500;
  white-space: nowrap;
  background: var(--surface);
  padding: 3px 10px;
  border-radius: 9999px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--line);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  z-index: 2;
}

.book-cover-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.book-cover-icon {
  width: 68px;
  height: 68px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.book-cover-icon .book-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-emoji-icon {
  font-size: 32px;
}

.book-front-title {
  font-size: 16.5px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  max-width: 240px;
}

.book-front-author {
  font-size: 12.5px;
  color: var(--muted);
  margin: 0;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 220px;
}

.book-card:hover .book-cover-center,
.book-card.is-flipped .book-cover-center {
  transform: scale(0);
  opacity: 0;
}

/* 核心 3D 翻转内容层 (selfish-owl-57) */
.card__content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  padding: 18px 20px;
  box-sizing: border-box;
  background: var(--panel-solid, rgba(12, 10, 26, 0.96));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  transform: rotateX(-90deg);
  transform-origin: bottom;
  backface-visibility: hidden;
  will-change: transform;
  transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  z-index: 5;
  cursor: pointer;
  border-radius: 15px;
  overflow: hidden;
}

.book-card:hover .card__content,
.book-card.is-flipped .card__content {
  transform: rotateX(0deg);
}

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.category-badge-small {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--raised);
  color: var(--accent);
  border: 1px solid var(--line);
  white-space: nowrap;
}

.card__title {
  font-size: 15.5px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 3px 0;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.card__author {
  font-size: 12px;
  color: var(--accent);
  margin: 0 0 6px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.card__description {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
  margin: 0 0 10px 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  flex: 1;
}

.card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.resource-links {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
}

.resource-jump-link {
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition: opacity 0.15s;
}

.resource-jump-link:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.card-admin-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

/* 对话框与表单 */
.book-form {
  display: grid;
  gap: 14px;
}

.category-selector-row {
  display: grid;
  gap: 8px;
}

.field-label {
  font-size: 12.5px;
  color: var(--soft);
  font-weight: 600;
}

.category-pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.category-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: 9999px;
  font-size: 12.5px;
  cursor: pointer;
  background: var(--surface);
  color: var(--muted);
  transition: all 0.15s;
}

.category-pill input {
  display: none;
}

.category-pill.active {
  background: var(--accent);
  color: var(--accent-ink, #0b1e25);
  border-color: var(--accent);
  font-weight: 600;
}

.book-form label {
  display: grid;
  gap: 6px;
  color: var(--soft);
  font-size: 12.5px;
  font-weight: 500;
}

.links-matrix-section {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  display: grid;
  gap: 10px;
}

.section-hint {
  font-size: 11.5px;
  color: var(--muted);
  margin: 0;
}

.link-inputs-grid {
  display: grid;
  gap: 10px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

/* 系统内置教程徽章与自定义图标 */
.card-badges-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.book-front-visual .card-badges-row {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
}

.book-front-visual .card-badges-row .category-badge {
  position: static;
}

.system-badge {
  color: var(--accent);
  font-size: 11px;
  line-height: 1.4;
  font-weight: 600;
  white-space: nowrap;
  background: var(--raised);
  padding: 3px 8px;
  border-radius: 9999px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--line);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.system-badge-small {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--raised);
  color: var(--accent);
  border: 1px solid var(--line);
  white-space: nowrap;
}

.book-custom-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--accent);
}

button.resource-jump-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  line-height: inherit;
}

/* 卡片跳转高亮呼吸动效 */
.book-card.is-highlighted {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 3px var(--line), 0 12px 32px var(--raised) !important;
  animation: card-highlight-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes card-highlight-pulse {
  0%, 100% {
    box-shadow: 0 0 0 3px var(--line), 0 12px 32px var(--raised);
    border-color: var(--accent);
  }
  50% {
    box-shadow: 0 0 0 6px var(--line), 0 16px 40px var(--raised);
    border-color: #ffffff;
  }
}


@media (max-width: 960px) {
  .book-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .resource-heading .button {
    display: none !important;
  }
  .category-add-trigger,
  .category-del-btn {
    display: none !important;
  }
  .category-bar {
    row-gap: 36px;
    margin: 18px 0 20px;
  }
  .category-buttons {
    display: flex;
    width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap;
    padding-bottom: 4px;
    gap: 6px;
  }
  .category-buttons::-webkit-scrollbar {
    display: none;
  }
  .category-buttons button {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .category-tools {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .resource-sort-segmented {
    width: 100%;
    display: flex;
    justify-content: stretch;
    box-sizing: border-box;
  }
  .resource-sort-segmented button {
    flex: 1;
    text-align: center;
  }
  .category-bar :deep(.resource-wave-box) {
    width: 100%;
    min-width: 100%;
    margin: 14px 0 4px !important;
  }
  .book-grid {
    grid-template-columns: 1fr;
  }
}

/* mighty-moose-66 按钮动效方案 (From Uiverse.io by andrew-demchenk0) */
.mighty-moose-btn {
  position: relative;
  width: 132px;
  height: 38px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--accent);
  background-color: var(--accent);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 10px var(--line);
  user-select: none;
  padding: 0;
  box-sizing: border-box;
  flex-shrink: 0;
}
.mighty-moose-btn,
.mighty-moose-btn .mighty-moose-icon,
.mighty-moose-btn .mighty-moose-text {
  transition: all 0.3s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.mighty-moose-btn .mighty-moose-text {
  transform: translateX(18px);
  color: var(--accent-ink);
  font-weight: 600;
  font-size: 13.5px;
  white-space: nowrap;
}
.mighty-moose-btn .mighty-moose-icon {
  position: absolute;
  transform: translateX(94px);
  height: 100%;
  width: 38px;
  background-color: rgba(0, 0, 0, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-ink);
}
.mighty-moose-btn:hover {
  background-color: var(--accent-strong);
  border-color: var(--accent-strong);
  box-shadow: 0 4px 16px var(--raised);
}
.mighty-moose-btn:hover .mighty-moose-text {
  color: transparent;
  opacity: 0;
}
.mighty-moose-btn:hover .mighty-moose-icon {
  width: 100%;
  transform: translateX(0);
  background-color: var(--accent-strong);
  color: var(--accent-ink);
}
.mighty-moose-btn:active {
  transform: scale(0.96);
  background-color: var(--accent);
  border-color: var(--accent);
}
.mighty-moose-btn:active .mighty-moose-icon {
  background-color: var(--accent);
  color: var(--accent-ink);
}
</style>
