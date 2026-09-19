<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BaseDialog from './BaseDialog.vue'
import { personalApi } from '../api/client'
import { notify } from '../composables/feedback'
const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const route = useRoute(), title = ref(''), content = ref(''), error = ref(''), busy = ref(false)
watch(() => props.open, open => { if (open) error.value = '' })
async function submit() {
  busy.value = true; error.value = ''
  try {
    await personalApi.submitFeedback({ title: title.value, content: content.value, page: route.path })
    title.value = ''; content.value = ''; emit('close'); window.dispatchEvent(new Event('feedback-updated')); notify('反馈已提交，可在我的反馈查看处理回复')
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
</script>
<template><BaseDialog :open="open" title="问题反馈" :busy="busy" @close="emit('close')"><form class="form-grid" @submit.prevent="submit"><p class="muted">描述遇到的问题或改进建议。仅你和管理员可查看，处理回复将显示在“我的反馈”。</p><label>标题<input v-model="title" required maxlength="150" placeholder="简要描述问题" /></label><label>问题描述<textarea v-model="content" required maxlength="5000" rows="6" placeholder="发生在哪个页面？进行了哪些操作？期望的结果是什么？" /></label><p v-if="error" class="error-banner" role="alert">{{ error }}</p><div class="form-actions"><button type="button" class="button secondary" :disabled="busy" @click="emit('close')">取消</button><button class="button primary" :disabled="busy || !title.trim() || !content.trim()">{{ busy ? '提交中…' : '提交反馈' }}</button></div></form></BaseDialog></template>
