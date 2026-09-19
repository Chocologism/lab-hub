<script setup>
import { computed } from 'vue'
import { renderLatex } from '../utils/latex'

const props = defineProps({
  text: {
    type: String,
    default: ''
  },
  inline: {
    type: Boolean,
    default: true
  }
})

const html = computed(() => renderLatex(props.text))
</script>

<template>
  <component :is="inline ? 'span' : 'div'" class="latex-content" v-html="html" />
</template>
