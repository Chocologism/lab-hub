<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({ user: Object })
const hasError = ref(false)

const avatarUrl = computed(() => {
  const av = props.user?.avatar
  if (!av) return ''
  return av
})

watch(() => props.user?.avatar, () => {
  hasError.value = false
})

function handleError() {
  hasError.value = true
}
</script>

<template>
  <img 
    v-if="avatarUrl && !hasError" 
    class="user-avatar-image" 
    :src="avatarUrl" 
    alt="用户头像" 
    loading="lazy" 
    @error="handleError" 
  />
  <span v-else>{{ (user?.nickname || user?.real_name || user?.name || '?').slice(0, 1) }}</span>
</template>

<style scoped>
.user-avatar-image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}
</style>
