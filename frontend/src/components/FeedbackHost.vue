<script setup>
import { feedback, dismissToast, answerConfirmation } from '../composables/feedback'
import BaseDialog from './BaseDialog.vue'
import AppIcon from './AppIcon.vue'
</script>
<template>
  <Teleport to="body"><div class="toast-stack" aria-live="polite"><TransitionGroup name="toast"><div v-for="toast in feedback.toasts" :key="toast.id" :class="['toast-message', toast.type]" :role="toast.type === 'error' ? 'alert' : 'status'"><AppIcon :name="toast.type === 'error' ? 'warning' : 'check'" /><span>{{ toast.message }}</span><button class="icon-button" aria-label="关闭提示" @click="dismissToast(toast.id)"><AppIcon name="close" :size="16" /></button></div></TransitionGroup></div></Teleport>
  <BaseDialog :open="!!feedback.confirmation" :title="feedback.confirmation?.title" @close="answerConfirmation(false)"><template v-if="feedback.confirmation"><p class="muted leading-relaxed">{{ feedback.confirmation.message }}</p><div class="form-actions"><button class="button secondary" @click="answerConfirmation(false)">取消</button><button :class="['button', feedback.confirmation.danger ? 'danger' : 'primary']" @click="answerConfirmation(true)">{{ feedback.confirmation.confirmLabel }}</button></div></template></BaseDialog>
</template>
