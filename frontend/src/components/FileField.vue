<script setup>
import { ref } from 'vue'
import { fileApi, resourceApi } from '../api/client'
import { notify } from '../composables/feedback'
import WaveInput from './WaveInput.vue'

const props = defineProps({ modelValue: String, label: { type: String, default: 'Slides' }, poster: Boolean, pdfOnly: Boolean, imageOnly: Boolean })
const emit = defineEmits(['update:modelValue', 'busy'])
const busy = ref(false)
async function upload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (props.pdfOnly && !/\.pdf$/i.test(file.name)) { notify('请选择 PDF 文件', 'error'); event.target.value = ''; return }
  if (props.imageOnly && !file.type.startsWith('image/')) { notify('请选择图片文件', 'error'); event.target.value = ''; return }
  if (file.size > 15 * 1024 * 1024) { notify('附件不得超过 15 MB', 'error'); return }
  busy.value = true; emit('busy', true)
  try { const result = await (props.pdfOnly ? resourceApi.uploadPdf(file) : fileApi.upload(file)); emit('update:modelValue', result.url); notify(`${file.name} 已上传`) }
  catch (error) { notify(error.message, 'error') }
  finally { busy.value = false; emit('busy', false); event.target.value = '' }
}
</script>
<template>
  <div class="file-field">
    <WaveInput
      :model-value="modelValue"
      :label="`${label} 链接`"
      placeholder="https://… 或上传附件"
      clearable
      @update:model-value="emit('update:modelValue', $event)"
    />
    <label class="upload-control">{{ busy ? '正在上传…' : pdfOnly ? '上传 PDF（最大 15 MB）' : '上传附件（最大 15 MB）' }}<input type="file" :disabled="busy" :accept="pdfOnly ? '.pdf,application/pdf' : poster ? '.pdf,.png,.jpg,.jpeg,.webp' : '.pdf,.ppt,.pptx'" @change="upload" /></label>
  </div>
</template>
<style scoped>.file-field { display:grid; gap:4px; }.upload-control { color:var(--muted); font-size:12px; }.upload-control input { padding:6px; font-size:12px; }</style>
