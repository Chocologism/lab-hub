<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { fileApi } from '../api/client'
const props = defineProps({ url: String, label: { type: String, default: '打开 Slides' }, poster: Boolean })
const objectUrl = ref(''), isImage = ref(false), error = ref('')
const remoteFailed = ref(false)
const remotePoster = computed(() => props.poster && /^https?:\/\//i.test(props.url || '') && !/\.pdf(?:[?#]|$)/i.test(props.url) && !remoteFailed.value)
let generation = 0
function clear() { if (objectUrl.value) URL.revokeObjectURL(objectUrl.value); objectUrl.value = '' }
watch(() => props.url, async url => {
  const current = ++generation; clear(); error.value = ''; isImage.value = false; remoteFailed.value = false
  if (!url?.startsWith('/api/files/')) return
  try {
    const blob = await fileApi.read(url)
    if (current !== generation) return
    objectUrl.value = URL.createObjectURL(blob); isImage.value = blob.type.startsWith('image/')
  } catch (e) { if (current === generation) error.value = e.message }
}, { immediate: true })
onBeforeUnmount(() => { generation++; clear() })
const external = () => /^https?:\/\//i.test(props.url || '')
</script>
<template>
  <div v-if="url" class="attachment-link"><img v-if="poster && isImage && objectUrl" :src="objectUrl" alt="报告海报" /><img v-if="remotePoster" :src="url" alt="报告海报" loading="lazy" referrerpolicy="no-referrer" @error="remoteFailed = true" /><p v-if="error" class="error-banner">{{ error }}</p><a v-else-if="objectUrl || external()" :href="objectUrl || url" target="_blank" rel="noopener noreferrer">{{ label }} ↗</a><span v-else class="muted">正在读取附件…</span></div>
</template>
<style scoped>.attachment-link img { display:block; max-width:100%; max-height:520px; object-fit:contain; margin:12px 0; border-radius:8px; }.attachment-link a { font-size:13px; }</style>
