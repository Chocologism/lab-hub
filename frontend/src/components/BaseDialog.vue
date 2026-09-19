<script setup>
import { ref, watch, nextTick, onBeforeUnmount, getCurrentInstance } from 'vue'
import { gsap } from 'gsap'
import { reducedMotion } from '../composables/motion'
import AppIcon from './AppIcon.vue'
import { renderLatex } from '../utils/latex'
const props = defineProps({ open: Boolean, title: String, drawer: Boolean, busy: Boolean, wide: Boolean, frameStyle: [Object, String] })
const emit = defineEmits(['close'])
const dialog = ref(null), frame = ref(null)
const titleId = `dialog-title-${getCurrentInstance().uid}`
let previousFocus, animation
let isBackdropMouseDown = false

function close() { if (!props.busy) emit('close') }

function handleMouseDown(event) {
  // 只有当鼠标按下的初始目标为遮罩层（dialog 自身）时，才记录为遮罩层点击
  isBackdropMouseDown = (event.target === dialog.value)
}

function handleMouseUp(event) {
  if (event.target !== dialog.value) {
    isBackdropMouseDown = false
  }
}

function handleClick(event) {
  // 只有当按下（mousedown）和松开（mouseup/click）都在遮罩层自身时，才判定为主动点击遮罩关闭
  // 彻底避免用户在输入框内选中文本并向左拖拽超出弹窗边界时误触发关闭
  if (isBackdropMouseDown && event.target === dialog.value) {
    close()
  }
  isBackdropMouseDown = false
}

watch(() => props.open, async open => {
  await nextTick()
  if (!dialog.value) return
  animation?.kill()
  if (open) {
    previousFocus = document.activeElement
    if (!dialog.value.open) dialog.value.showModal()
    animation = gsap.fromTo(frame.value, { opacity: 0, x: props.drawer && !reducedMotion() ? 32 : 0, y: !props.drawer && !reducedMotion() ? 14 : 0 }, { opacity: 1, x: 0, y: 0, duration: reducedMotion() ? 0 : .32, ease: 'power3.out', onComplete: () => { if (frame.value) gsap.set(frame.value, { clearProps: 'transform' }) } })
  } else if (dialog.value.open) {
    animation = gsap.to(frame.value, { opacity: 0, x: props.drawer && !reducedMotion() ? 24 : 0, duration: reducedMotion() ? 0 : .18, onComplete: () => { dialog.value?.close(); if (previousFocus?.isConnected) previousFocus.focus() } })
  }
}, { immediate: true })
onBeforeUnmount(() => { animation?.kill(); dialog.value?.close(); if (previousFocus?.isConnected) previousFocus.focus() })
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      :class="['app-dialog', { 'is-drawer': drawer, 'is-wide': wide }]"
      :aria-labelledby="titleId"
      :aria-busy="busy"
      @cancel.prevent="close"
      @mousedown="handleMouseDown"
      @mouseup="handleMouseUp"
      @click="handleClick"
    >
      <section ref="frame" class="dialog-frame" :style="frameStyle">
        <header class="dialog-heading">
          <h2 :id="titleId" v-html="renderLatex(title)"></h2>
          <button class="icon-button" aria-label="关闭" :disabled="busy" @click="close">
            <AppIcon name="close" />
          </button>
        </header>
        <div class="dialog-content">
          <slot />
        </div>
      </section>
    </dialog>
  </Teleport>
</template>

<style scoped>
dialog:not([open]),
.app-dialog:not([open]) {
  display: none !important;
}
</style>
