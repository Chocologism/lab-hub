<script setup>
import { computed, onMounted, ref } from 'vue'
import { authApi } from '../api/client'
const props = defineProps({ modelValue: { type: Object, required: true } })
const emit = defineEmits(['update:modelValue'])
const members = ref([]), search = ref(''), loading = ref(false), error = ref('')
let currentId
try { currentId = JSON.parse(localStorage.getItem('laborbit_user') || localStorage.getItem('labhub_user') || '{}').id } catch {}
const filtered = computed(() => members.value.filter(u => u.id !== currentId && `${u.name} ${u.email}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())))
function setMode(visibility) { emit('update:modelValue', { visibility, recipient_ids: [] }) }
function toggle(id, checked) { emit('update:modelValue', { ...props.modelValue, recipient_ids: checked ? [...new Set([...props.modelValue.recipient_ids, id])] : props.modelValue.recipient_ids.filter(value => value !== id) }) }
async function load() {
  loading.value = true; error.value = ''
  try { members.value = await authApi.getMembers() }
  catch (e) { error.value = e.message }
  finally { loading.value = false }
}
onMounted(load)
</script>
<template>
  <fieldset class="audience"><legend>推荐范围</legend><div class="audience-modes"><button type="button" :aria-pressed="modelValue.visibility === 'public'" :class="['button small', modelValue.visibility === 'public' ? 'primary' : 'secondary']" @click="setMode('public')">公开推荐</button><button type="button" :aria-pressed="modelValue.visibility === 'direct'" :class="['button small', modelValue.visibility === 'direct' ? 'primary' : 'secondary']" @click="setMode('direct')">定向推荐</button></div>
    <p v-if="modelValue.visibility === 'public'" class="audience-note">发布到公共推荐流，全组成员可见。</p>
    <template v-else><p class="audience-note">只有你和所选接收人能看到此条推荐。可选择一位或多位注册成员。</p><input v-model="search" type="search" placeholder="按姓名或邮箱查找成员" aria-label="查找接收人" /><p v-if="loading" role="status">正在读取成员…</p><p v-else-if="error" class="inline-error">{{ error }} <button class="button small secondary" type="button" @click="load">重试成员列表</button></p><div v-else class="member-list"><label v-for="member in filtered" :key="member.id"><input type="checkbox" :checked="modelValue.recipient_ids.includes(member.id)" @change="toggle(member.id, $event.target.checked)" /><span>{{ member.name }}<small>{{ member.email }}</small></span></label><p v-if="!filtered.length" class="audience-note">没有匹配的其他成员。</p></div><p class="audience-note" role="status">已选择 {{ modelValue.recipient_ids.length }} 人{{ !modelValue.recipient_ids.length ? '，请选择接收人后发布。' : '' }}</p></template>
  </fieldset>
</template>
<style scoped>.audience { border:1px solid var(--line); border-radius:10px; padding:14px; display:grid; gap:12px; min-width:0; }.audience legend { float:none; width:auto; min-width:max-content; white-space:nowrap !important; padding:0 8px; font-size:13px; font-weight:500; color:var(--text); }.audience-modes { display:flex; gap:8px; }.audience-note { color:var(--muted); font-size:12px; line-height:1.7; margin:0; }.member-list { max-height:210px; overflow:auto; display:grid; gap:6px; }.member-list label { display:flex; align-items:center; gap:10px; padding:8px; border-radius:7px; cursor:pointer; font-size:13px; }.member-list label:hover { background:rgba(197,230,223,.04); }.member-list input { width:16px; height:16px; padding:0; flex-shrink:0; }.member-list small { display:block; color:var(--muted); font-size:11px; margin-top:3px; }.inline-error { color:var(--danger); font-size:12px; }</style>
