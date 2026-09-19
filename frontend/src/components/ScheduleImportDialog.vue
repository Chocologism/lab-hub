<script setup>
import { ref, watch } from 'vue'
import BaseDialog from './BaseDialog.vue'
import AppIcon from './AppIcon.vue'
import { seminarApi } from '../api/client'
import { notify } from '../composables/feedback'

const props = defineProps({
  open: Boolean,
  members: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'saved'])

const tab = ref('file') // 'file' | 'paste'
const rows = ref([])
const sheets = ref([])
const selectedSheet = ref('')
const currentFile = ref(null)
const pasteText = ref('')
const error = ref('')
const busy = ref(false)

watch(() => props.open, (newVal) => {
  if (newVal) {
    error.value = ''
    rows.value = []
    sheets.value = []
    selectedSheet.value = ''
    currentFile.value = null
    pasteText.value = ''
  }
})

async function onFileSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return
  currentFile.value = file
  await parseSelectedFile()
  event.target.value = ''
}

async function onSheetChanged() {
  if (!currentFile.value) return
  await parseSelectedFile(selectedSheet.value)
}

async function parseSelectedFile(sheetName = '') {
  if (!currentFile.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await seminarApi.parseImportFile(currentFile.value, sheetName)
    sheets.value = res.sheets || []
    selectedSheet.value = res.selected_sheet || ''
    rows.value = (res.rows || []).map(row => ({
      ...row,
      presentations: (row.presentations || []).map(p => ({ ...p }))
    }))
    if (!rows.value.length) {
      error.value = '未从所选工作表中识别到有效组会排期行。请检查表头是否包含“报告人/主讲人”和“日期”。'
    } else {
      notify(`成功解析 ${rows.value.length} 场组会排期`)
    }
  } catch (e) {
    error.value = e.message || '文件解析失败，请检查文件格式。'
  } finally {
    busy.value = false
  }
}

async function parsePastedText() {
  if (!pasteText.value.trim()) {
    error.value = '请先粘贴排期表格内容'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const res = await seminarApi.parseImportText(pasteText.value)
    rows.value = (res.rows || []).map(row => ({
      ...row,
      presentations: (row.presentations || []).map(p => ({ ...p }))
    }))
    if (!rows.value.length) {
      error.value = '未从粘贴文本中识别到有效排期行，请确认包含“报告人”、“日期”和“arxiv”列。'
    } else {
      notify(`成功解析 ${rows.value.length} 场组会排期`)
    }
  } catch (e) {
    error.value = e.message || '解析失败，请检查粘贴格式。'
  } finally {
    busy.value = false
  }
}

function removeRow(idx) {
  rows.value.splice(idx, 1)
}

function selectPresenter(row) {
  const u = props.members.find(m => m.id === row.presenter_id)
  if (u) {
    row.presenter_name = u.real_name || u.name
  }
}

function selectSharer(p) {
  const u = props.members.find(m => m.id === p.presenter_id)
  if (u) {
    p.presenter_name = u.real_name || u.name
  }
}

function addSharer(row) {
  if (!row.presentations) row.presentations = []
  row.presentations.push({ presenter_name: '', presenter_id: null, arxiv_id: '', slides_url: '' })
}

function removeSharer(row, pIdx) {
  row.presentations.splice(pIdx, 1)
}

async function save() {
  if (!rows.value.length) return
  busy.value = true
  error.value = ''
  try {
    await seminarApi.importSchedule(rows.value)
    notify(`成功导入 ${rows.value.length} 场组会排期！`)
    rows.value = []
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e.message || '批量导入失败，请核对排期信息。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDialog :open="open" title="导入组会排期" :wide="true" :busy="busy" @close="emit('close')">
    <div class="import-dialog-body">
      <div class="segmented tab-switch">
        <button :class="{ active: tab === 'file' }" type="button" @click="tab = 'file'">
          Excel / CSV 文件上传
        </button>
        <button :class="{ active: tab === 'paste' }" type="button" @click="tab = 'paste'">
          文本粘贴导入
        </button>
      </div>

      <!-- 文件上传模式 -->
      <section v-if="tab === 'file'" class="import-source-box">
        <p class="muted">
          支持上传 <strong>.xlsx</strong> 或 <strong>.csv</strong> 格式的排期文件。表格需包含列：<strong>报告人</strong>（主讲）、<strong>日期</strong>、<strong>arxiv</strong>（文献分享人，无分享人填 <code>～</code> 或留空，多人用逗号隔开）。多工作表文件可在下方选择对应 Sheet。
        </p>
        <div class="upload-bar">
          <label class="button secondary file-upload-btn">
            <AppIcon name="plus" />
            <span>{{ currentFile ? '重新选择文件' : '选择 Excel / CSV 文件' }}</span>
            <input type="file" accept=".xlsx,.xls,.csv,.tsv,text/csv" :disabled="busy" @change="onFileSelected" />
          </label>
          <span v-if="currentFile" class="current-file-name">{{ currentFile.name }}</span>

          <div v-if="sheets.length > 1" class="sheet-selector">
            <label>
              工作表 (Sheet):
              <select v-model="selectedSheet" :disabled="busy" @change="onSheetChanged">
                <option v-for="s in sheets" :key="s" :value="s">
                  {{ s }} {{ s === sheets[sheets.length - 1] ? '（最新学期）' : '' }}
                </option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <!-- 文本粘贴模式 -->
      <section v-else class="import-source-box">
        <p class="muted">
          支持直接粘贴制表符（Tab）或逗号分隔的排期文本。表格列需包含：<strong>报告人</strong>、<strong>日期</strong>、<strong>arxiv</strong>：
        </p>
        <textarea
          v-model="pasteText"
          class="paste-area"
          rows="6"
          placeholder="报告人	日期	arxiv&#10;张伟	9.9	～&#10;李娜	9.16	～&#10;王强	9.23	刘洋，陈明"
        />
        <div class="paste-actions">
          <button class="button secondary small" type="button" :disabled="busy || !pasteText.trim()" @click="parsePastedText">
            解析粘贴内容
          </button>
        </div>
      </section>

      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>

      <!-- 解析结果预览与校对表格 -->
      <div v-if="rows.length" class="import-preview-section">
        <div class="preview-header">
          <h3>识别到 {{ rows.length }} 场组会排期</h3>
          <p class="muted">未注册的成员支持直接导入（姓名有效），主讲人或分享人可在注册后随时关联账号。</p>
        </div>

        <div class="import-cards-list">
          <article v-for="(row, i) in rows" :key="i" class="import-card">
            <div class="import-card-top">
              <span class="badge cyan">第 {{ i + 1 }} 场</span>
              <button class="icon-button danger small" type="button" title="移除该场" @click="removeRow(i)">
                <AppIcon name="close" :size="14" />
              </button>
            </div>

            <div class="form-row">
              <label>
                日期
                <input v-model="row.date" type="date" required />
              </label>
              <label>
                时间
                <input v-model="row.time" type="time" required />
              </label>
            </div>

            <div class="form-row">
              <label>
                主讲人姓名
                <input v-model="row.presenter_name" placeholder="无主讲人可留空" />
              </label>
              <label>
                关联注册账号
                <select v-model="row.presenter_id" @change="selectPresenter(row)">
                  <option :value="null">未关联 / 外部成员（{{ row.presenter_name || '无' }}）</option>
                  <option v-for="u in members" :key="u.id" :value="u.id">
                    {{ u.real_name || u.name }} · {{ u.email }}
                  </option>
                </select>
              </label>
            </div>

            <!-- arXiv 分享人列表 -->
            <div class="sharers-box">
              <div class="sharers-box-header">
                <strong>arXiv 分享人（{{ row.presentations?.length || 0 }} 人）</strong>
                <button class="button ghost small" type="button" @click="addSharer(row)">
                  <AppIcon name="plus" :size="12" />添加分享人
                </button>
              </div>
              <div v-if="row.presentations?.length" class="sharers-grid">
                <div v-for="(p, pIdx) in row.presentations" :key="pIdx" class="sharer-chip-row">
                  <input v-model="p.presenter_name" placeholder="分享人姓名" class="sharer-name-input" />
                  <select v-model="p.presenter_id" class="sharer-account-select" @change="selectSharer(p)">
                    <option :value="null">未绑定账号</option>
                    <option v-for="u in members" :key="u.id" :value="u.id">
                      {{ u.real_name || u.name }}
                    </option>
                  </select>
                  <button class="icon-button small danger" type="button" title="移除" @click="removeSharer(row, pIdx)">
                    <AppIcon name="close" :size="12" />
                  </button>
                </div>
              </div>
              <p v-else class="muted small-note">本次组会暂无 arXiv 分享人</p>
            </div>

            <div class="form-row">
              <label>
                汇报主题
                <input v-model="row.topic" placeholder="工作汇报（待定）" />
              </label>
              <label>
                地点
                <input v-model="row.location" placeholder="待定" />
              </label>
            </div>
          </article>
        </div>
      </div>

      <div class="form-actions">
        <button class="button secondary" type="button" :disabled="busy" @click="emit('close')">
          取消
        </button>
        <button
          class="button primary"
          type="button"
          :disabled="busy || !rows.length"
          @click="save"
        >
          <AppIcon name="check" />
          {{ busy ? '导入中…' : `确认导入全部 ${rows.length} 场组会` }}
        </button>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.import-dialog-body {
  display: grid;
  gap: 16px;
}
.tab-switch {
  justify-self: start;
}
.import-source-box {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.upload-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.file-upload-btn {
  position: relative;
  cursor: pointer;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.file-upload-btn input[type="file"] {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.current-file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}
.sheet-selector {
  margin-left: auto;
  font-size: 13px;
  color: var(--muted);
}
.sheet-selector select {
  margin-left: 6px;
  padding: 6px 12px;
  border-radius: 6px;
}
.paste-area {
  width: 100%;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.5;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--text);
  resize: vertical;
}
.paste-actions {
  display: flex;
  justify-content: flex-end;
}
.import-preview-section {
  display: grid;
  gap: 12px;
  border-top: 1px solid var(--line);
  padding-top: 16px;
}
.preview-header h3 {
  font-size: 15px;
  margin: 0 0 4px;
}
.preview-header p {
  font-size: 12px;
  margin: 0;
}
.import-cards-list {
  display: grid;
  gap: 14px;
  max-height: 480px;
  overflow-y: auto;
  padding-right: 4px;
}
.import-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.import-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sharers-box {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  background: var(--panel);
  border: 1px dashed var(--line);
}
.sharers-box-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}
.sharers-grid {
  display: grid;
  gap: 8px;
}
.sharer-chip-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sharer-name-input {
  flex: 1;
  padding: 6px 8px;
  font-size: 12px;
}
.sharer-account-select {
  flex: 1.2;
  padding: 6px 8px;
  font-size: 12px;
}
.small-note {
  font-size: 11px;
  margin: 0;
}
</style>
