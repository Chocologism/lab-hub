<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { seminarApi } from '../api/client'
import AppIcon from './AppIcon.vue'
import BaseDialog from './BaseDialog.vue'
import { notify } from '../composables/feedback'

const rows = ref([])
const open = ref(false)
const chosen = ref(null)
const topic = ref('')
const abstract = ref('')
const arxivId = ref('')
const busy = ref(false)
const error = ref('')
let timer

async function refresh() {
  try {
    const list = await seminarApi.reminders()
    rows.value = Array.isArray(list) ? list : []
  } catch {
    rows.value = []
  }
}

function select(row) {
  chosen.value = row
  topic.value = row.topic || ''
  abstract.value = ''
  arxivId.value = ''
  error.value = ''
}

async function saveAbstract() {
  busy.value = true
  error.value = ''
  try {
    await seminarApi.abstract(chosen.value.seminar_id, abstract.value, topic.value.trim())
    chosen.value = null
    await refresh()
    window.dispatchEvent(new Event('seminar-updated'))
    notify('主讲摘要与标题已提交')
    if (!rows.value.length) open.value = false
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function saveArxiv() {
  if (!arxivId.value.trim()) {
    error.value = '请填写 arXiv 论文编号或链接'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await seminarApi.submitPresentationArxiv(chosen.value.seminar_id, {
      presentation_id: chosen.value.presentation_id,
      position: chosen.value.position,
      arxiv_id: arxivId.value.trim()
    })
    chosen.value = null
    await refresh()
    window.dispatchEvent(new Event('seminar-updated'))
    notify('arXiv 链接已提交，文献已自动收录')
    if (!rows.value.length) open.value = false
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

function visible() {
  if (!document.hidden) refresh()
}

onMounted(() => {
  refresh()
  timer = setInterval(visible, 60000)
  document.addEventListener('visibilitychange', visible)
  window.addEventListener('seminar-updated', refresh)
})

onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', visible)
  window.removeEventListener('seminar-updated', refresh)
})
</script>

<template>
  <button v-if="rows.length" class="reminder-nudge button secondary" @click="open = true" title="查看组会临近待办">
    <AppIcon name="clock" />
    <span>{{ rows.length }} 项待办提醒</span>
  </button>

  <BaseDialog :open="open" title="组会临近待办提醒" :busy="busy" @close="open = false; chosen = null">
    <div v-if="chosen" class="reminder-form-box">
      <!-- 摘要与标题表单 -->
      <form v-if="chosen.type === 'abstract'" class="form-grid" @submit.prevent="saveAbstract">
        <div class="reminder-dialog-header">
          <span class="badge amber">主讲摘要与标题补充</span>
          <h3>{{ chosen.topic }}</h3>
          <p class="muted">{{ chosen.date }} · {{ chosen.time }}（主讲人：{{ chosen.presenter_name }}）</p>
        </div>
        <label>
          汇报标题 / 主题 *
          <input v-model="topic" required maxlength="300" placeholder="请输入汇报标题（支持 LaTeX 公式）" />
        </label>
        <label>
          主讲摘要
          <textarea v-model="abstract" rows="8" maxlength="20000" required placeholder="请简要介绍本次组会汇报的研究背景、主要进展与讨论重点，供组内成员提前预习……" />
        </label>
        <p v-if="error" class="error-banner">{{ error }}</p>
        <div class="form-actions">
          <button type="button" class="button secondary" :disabled="busy" @click="chosen = null">返回列表</button>
          <button class="button primary" :disabled="busy || !abstract.trim() || !topic.trim()">提交摘要与标题</button>
        </div>
      </form>

      <!-- arXiv 表单 -->
      <form v-else class="form-grid" @submit.prevent="saveArxiv">
        <div class="reminder-dialog-header">
          <span class="badge cyan">arXiv 文献链接补充</span>
          <h3>{{ chosen.topic }}</h3>
          <p class="muted">{{ chosen.date }} · {{ chosen.time }}（分享人：{{ chosen.presenter_name }}）</p>
        </div>
        <label>
          arXiv 编号或链接
          <input v-model="arxivId" required placeholder="例如：2403.12345 或 https://arxiv.org/abs/2403.12345" />
        </label>
        <small class="muted">提交后系统将自动抓取该论文元数据，并同步收录至团组文献库与组会议程中。</small>
        <p v-if="error" class="error-banner">{{ error }}</p>
        <div class="form-actions">
          <button type="button" class="button secondary" :disabled="busy" @click="chosen = null">返回列表</button>
          <button class="button primary" :disabled="busy || !arxivId.trim()">提交文献链接</button>
        </div>
      </form>
    </div>

    <!-- 列表展示 -->
    <div v-else class="reminder-list">
      <p class="muted reminder-intro">组会已临近，请在组会召开前完善以下内容：</p>
      <article v-for="row in rows" :key="row.id" class="reminder-card">
        <div class="reminder-card-main">
          <div class="reminder-card-meta">
            <span :class="['badge', row.type === 'abstract' ? 'amber' : 'cyan']">
              {{ row.type === 'abstract' ? '【主讲摘要】' : '【arXiv文献】' }}
            </span>
            <span class="mono">{{ row.date }} · {{ row.time }}</span>
          </div>
          <h4>{{ row.topic }}</h4>
          <p class="reminder-msg">{{ row.message }}</p>
        </div>
        <button class="button secondary small" @click="select(row)">
          {{ row.type === 'abstract' ? '填写摘要' : '填写 arXiv' }}
        </button>
      </article>
      <p v-if="!rows.length" class="muted">当前暂无待处理的组会提醒。</p>
    </div>
  </BaseDialog>
</template>

<style scoped>
.reminder-nudge {
  border-color: rgba(245, 158, 11, 0.4);
  color: var(--warning);
  background: rgba(245, 158, 11, 0.08);
}
.reminder-nudge:hover {
  background: rgba(245, 158, 11, 0.15);
  border-color: var(--warning);
}
.reminder-intro {
  font-size: 13px;
  margin-bottom: 12px;
}
.reminder-list {
  display: grid;
  gap: 12px;
}
.reminder-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.reminder-card-main {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.reminder-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.reminder-card h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}
.reminder-msg {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}
.reminder-dialog-header {
  display: grid;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}
.reminder-dialog-header h3 {
  font-size: 16px;
  margin: 0;
}
</style>
