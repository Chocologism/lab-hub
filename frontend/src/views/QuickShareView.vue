<script setup>
import { paperLabel, paperSource, paperRead, paperReadLabel } from '../utils/papers'
import { renderLatex } from '../utils/latex'
import { renderMarkdown } from '../utils/markdown'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { arxivApi, authApi } from '../api/client'
import AppIcon from '../components/AppIcon.vue'
import LoadingState from '../components/LoadingState.vue'
import RecommendationAudience from '../components/RecommendationAudience.vue'
import SmartMothButton from '../components/SmartMothButton.vue'
import WaveInput from '../components/WaveInput.vue'
import SpottyHorseButton from '../components/SpottyHorseButton.vue'
import { useSiteConfig } from '../composables/useSiteConfig'

const { siteConfig } = useSiteConfig()
const route = useRoute()
const isLoggedIn = ref(false), checking = ref(true), loginEmail = ref(''), loginPw = ref(''), loggingIn = ref(false)
const loading = ref(false), errorMsg = ref(''), loginError = ref(''), submitError = ref(''), preview = ref(null), comment = ref(''), submitting = ref(false), success = ref(false)
const manualInput = ref(typeof route.query.url_or_id === 'string' ? route.query.url_or_id : '')
const audience = ref({ visibility: 'public', recipient_ids: [] })
const validAudience = computed(() => audience.value.visibility === 'public' || audience.value.recipient_ids.length > 0)
async function fetchPaper() {
  if (!isLoggedIn.value || !manualInput.value.trim()) return
  loading.value = true; errorMsg.value = ''; submitError.value = ''; preview.value = null
  try { preview.value = await arxivApi.preview(manualInput.value.trim()) }
  catch (error) { if (error.status === 401) isLoggedIn.value = false; else errorMsg.value = error.message }
  finally { loading.value = false }
}
onMounted(async () => {
  try {
    if (localStorage.getItem('labhub_token')) {
      const user = await authApi.getMe(); localStorage.setItem('labhub_user', JSON.stringify(user)); isLoggedIn.value = true
    }
  } catch { isLoggedIn.value = false }
  finally { checking.value = false }
  if (isLoggedIn.value && manualInput.value) await fetchPaper()
})
async function handleQuickLogin() {
  loggingIn.value = true; loginError.value = ''
  try {
    const data = await authApi.login(loginEmail.value, loginPw.value)
    localStorage.setItem('labhub_token', data.access_token); localStorage.setItem('labhub_user', JSON.stringify(data.user))
    isLoggedIn.value = true; loginPw.value = ''; await fetchPaper()
  } catch (error) { loginError.value = `登录失败：${error.message}` }
  finally { loggingIn.value = false }
}
async function submitShare() {
  if (!preview.value || !validAudience.value) return
  submitting.value = true; submitError.value = ''
  try { await arxivApi.recommend({ ...preview.value, ...audience.value, recommend_comment: comment.value, is_pinned: false }); success.value = true }
  catch (error) { if (error.status === 401) isLoggedIn.value = false; else submitError.value = error.message }
  finally { submitting.value = false }
}
</script>
<template>
  <main class="share-page"><section class="share-card"><div class="share-top"><span>{{ siteConfig.labShortName || 'LabOrbit' }}</span><p>文献快速分享</p></div><h1>把这篇论文加入讨论</h1><p class="subtitle">粘贴论文链接，核对元数据，再选择公开或定向推荐。</p>
    <LoadingState v-if="checking" message="正在检查登录状态" />
    <form v-else-if="!isLoggedIn" class="share-form" @submit.prevent="handleQuickLogin"><p class="form-note">登录后继续，已带入的论文链接会保留。</p><label>电子邮箱<input v-model="loginEmail" type="email" required autocomplete="username" /></label><label>密码<input v-model="loginPw" type="password" required autocomplete="current-password" /></label><p v-if="loginError" class="form-error" role="alert">{{ loginError }}</p><button class="button primary" :disabled="loggingIn">{{ loggingIn ? '验证中' : '登录并继续' }}</button></form>
    <div v-else-if="success" class="share-success"><AppIcon name="check" :size="30" /><h2>{{ audience.visibility === 'direct' ? '定向推荐已发送' : '已发布到公共推荐流' }}</h2><p>{{ audience.visibility === 'direct' ? '只有你和所选接收人可见。' : '全组成员现在可以查看这条推荐。' }}</p><router-link to="/arxiv" class="button secondary">返回推荐流</router-link></div>
    <template v-else>
      <form class="share-form quick-fetch-form" @submit.prevent="fetchPaper">
        <div class="fetch-input-row">
          <WaveInput
            v-model="manualInput"
            label="arXiv:2609.04305 或论文链接"
            wrapper-class="quick-wave-input"
            @keydown.enter.prevent="fetchPaper"
          />
          <SpottyHorseButton
            :loading="loading"
            :disabled="loading || submitting || !manualInput.trim()"
          />
        </div>
        <p v-if="errorMsg" class="form-error" role="alert">{{ errorMsg }}</p>
      </form>
      <form v-if="preview" class="share-form" @submit.prevent="submitShare"><div class="paper-preview"><span>{{ paperLabel(preview) }}</span><h2 v-html="renderLatex(preview.title)"></h2><p>{{ preview.authors.slice(0, 3).join(', ') }}</p><p v-html="renderLatex(preview.abstract)"></p></div><label>推荐理由或研读重点（支持 Markdown 与 LaTeX 公式，可选）<textarea v-model="comment" rows="3" placeholder="输入研读重点或推荐理由，支持 Markdown（如 **加粗**、- 列表）与 LaTeX 公式…" /></label><div v-if="comment && comment.trim()" class="recommend-preview"><span class="preview-tag">实时预览：</span><div class="preview-content markdown-content" v-html="renderMarkdown(comment)"></div></div><RecommendationAudience v-model="audience" /><p v-if="submitError" class="form-error" role="alert">{{ submitError }}</p><div class="share-actions"><router-link to="/arxiv" class="button ghost">返回</router-link><SmartMothButton :disabled="submitting || !validAudience" :loading="submitting" :label="submitting ? '发布中…' : (audience.visibility === 'direct' ? '发送定向推荐' : '发布到公共推荐流')" type="submit" /></div></form></template>
  </section></main>
</template>

<style scoped>
.quick-fetch-form { margin-top: 24px; }
.fetch-input-row { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; }
.fetch-input-row :deep(.form-control) { margin: 10px 0 6px !important; }
@media (max-width: 520px) { .fetch-input-row { grid-template-columns: 1fr; } }
.share-page { display: grid; min-height: 100dvh; place-items: center; padding: 24px; background: radial-gradient(circle at top right, #193c44, transparent 38%), var(--bg); }.share-card { width: min(100%, 570px); padding: 28px; border: 1px solid var(--line); border-radius: 15px; background: var(--panel); }.share-top { display: flex; align-items: center; justify-content: space-between; }.share-top span { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; letter-spacing: .12em; }.share-top p, .subtitle { margin: 0; color: var(--muted); font-size: 12px; }.share-card h1 { margin: 24px 0 7px; font-size: 26px; letter-spacing: -.035em; }.share-form { display: grid; gap: 13px; margin-top: 24px; }.form-note, .form-error { margin: 0; font-size: 13px; }.form-note { color: var(--muted); }.form-error { color: var(--danger); }.paper-preview { padding: 15px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }.paper-preview span { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }.paper-preview h2 { margin: 9px 0 7px; font-family: var(--font); font-size: 18px; line-height: 1.45; }.paper-preview p { margin: 5px 0; color: var(--muted); font-size: 12px; line-height: 1.6; }.paper-preview p:last-child { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }.share-form label { display: grid; gap: 6px; color: var(--soft); font-size: 12px; }.share-actions { display: flex; justify-content: flex-end; gap: 8px; }.share-success { display: grid; justify-items: center; gap: 9px; padding: 55px 10px; color: var(--accent); text-align: center; }.share-success h2 { margin: 0; color: var(--text); font-size: 19px; }.share-success p { margin: 0; color: var(--muted); font-size: 13px; }.share-loading { padding: 35px 0; }
.recommend-preview {
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 8%, var(--bg));
  border-left: 3px solid var(--accent);
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.5;
}
.preview-tag {
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
  margin-bottom: 4px;
  display: block;
}
</style>
