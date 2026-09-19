<script setup>
import { ref } from 'vue'
const emit = defineEmits(['prepared'])
const expanded = ref(false)
const doi = ref(''), url = ref(''), title = ref(''), journal = ref(''), authors = ref(''), abstract = ref(''), pdf = ref(''), date = ref(''), error = ref('')
function prepare() {
  error.value = ''
  if (!doi.value.trim() && !url.value.trim()) { error.value = '请提供 DOI 或期刊论文链接'; return }
  emit('prepared', { arxiv_id: doi.value.trim(), source_url: url.value.trim(), title: title.value.trim(), journal: journal.value.trim(), authors: authors.value.split(/[;；\n]/).map(a => a.trim()).filter(Boolean), abstract: abstract.value.trim(), pdf_url: pdf.value.trim() || null, published_date: date.value || null })
  expanded.value = false
}
</script>
<template><div class="journal-entry"><button class="button small secondary" type="button" @click="expanded = !expanded">{{ expanded ? '收起手动录入' : '手动录入期刊论文' }}</button><form v-if="expanded" class="form-grid" @submit.prevent="prepare"><p class="muted">支持没有 arXiv 版本的期刊论文。DOI 与期刊链接至少填写一项；没有公开 PDF 时保留期刊原文入口。</p><div class="form-row"><label>DOI<input v-model="doi" placeholder="10.1038/…" /></label><label>期刊论文链接<input v-model="url" type="url" placeholder="https://…" /></label></div><label>论文标题<input v-model="title" required maxlength="300" /></label><div class="form-row"><label>期刊名称<input v-model="journal" required maxlength="300" /></label><label>发表日期<input v-model="date" type="date" /></label></div><label>作者（用分号分隔）<input v-model="authors" required placeholder="作者一；作者二" /></label><label>摘要（可选）<textarea v-model="abstract" rows="4" /></label><label>公开 PDF 链接（可选）<input v-model="pdf" type="url" /></label><p v-if="error" class="error-banner">{{ error }}</p><button class="button secondary">核对并选择推荐范围</button></form></div></template>
