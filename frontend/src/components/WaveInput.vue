<script>
export default {
  inheritAttrs: false
}
</script>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  type: { type: String, default: 'text' },
  required: { type: Boolean, default: false },
  autocomplete: { type: String, default: 'off' },
  maxlength: { type: [Number, String], default: undefined },
  hint: { type: String, default: '' },
  id: { type: String, default: undefined },
  name: { type: String, default: undefined },
  wrapperClass: { type: String, default: '' },
  clearable: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'clear'])

const isFocused = ref(false)

const textLabel = computed(() => props.label || props.placeholder || '')
const letters = computed(() => {
  return textLabel.value.split('').map((char, index) => ({
    char: char === ' ' ? '\u00A0' : char,
    delay: `${Math.min(index * 30, 450)}ms`
  }))
})
</script>

<template>
  <div 
    class="form-control" 
    :class="[
      wrapperClass,
      { 
        'is-focused': isFocused, 
        'has-value': Boolean(modelValue && modelValue.length > 0),
        'has-clear': clearable
      }
    ]"
  >
    <input
      :id="id"
      :name="name"
      :value="modelValue"
      :type="type"
      :required="required"
      :autocomplete="autocomplete"
      :maxlength="maxlength"
      v-bind="$attrs"
      @input="emit('update:modelValue', $event.target.value)"
      @focus="isFocused = true"
      @blur="isFocused = false"
    />
    <label v-if="letters.length" :for="id">
      <span
        v-for="(item, idx) in letters"
        :key="idx"
        :style="{ transitionDelay: item.delay }"
      >{{ item.char }}</span>
    </label>
    <button
      v-if="clearable && modelValue"
      type="button"
      class="wave-clear-btn"
      title="清空输入"
      @click="emit('update:modelValue', ''); emit('clear')"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
    <small v-if="hint" class="input-hint">{{ hint }}</small>
  </div>
</template>

<style scoped>
.form-control {
  position: relative;
  margin: 22px 0 12px;
  width: 100%;
}

.form-control input {
  position: relative;
  z-index: 2;
  background: transparent !important;
  background-color: transparent !important;
  border: 0 !important;
  border-bottom: 2px var(--line, rgba(255, 255, 255, 0.2)) solid !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  display: block;
  width: 100%;
  padding: 10px 0 !important;
  font-size: 15px;
  color: var(--text, #fff);
  box-sizing: border-box;
  font-family: inherit;
  transition: border-bottom-color 0.25s ease;
}

.form-control input::placeholder {
  color: var(--muted, rgba(255, 255, 255, 0.45));
  font-size: 14.5px;
}

.form-control input:focus,
.form-control input:valid,
.form-control.is-focused input,
.form-control.has-value input {
  outline: 0 !important;
  box-shadow: none !important;
  border-bottom-color: var(--accent) !important;
}

.form-control input:-webkit-autofill,
.form-control input:-webkit-autofill:hover, 
.form-control input:-webkit-autofill:focus {
  -webkit-text-fill-color: var(--text, #fff);
  -webkit-box-shadow: 0 0 0px 1000px var(--panel-solid, rgba(12, 10, 26, 0.95)) inset !important;
  transition: background-color 5000s ease-in-out 0s;
}

.form-control label {
  position: absolute;
  top: 10px;
  left: 0;
  z-index: 1;
  pointer-events: none !important;
  display: flex;
  white-space: pre;
}

.form-control label span {
  display: inline-block;
  font-size: 15px;
  min-width: 4px;
  color: var(--muted, rgba(255, 255, 255, 0.65));
  transition: 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  pointer-events: none !important;
}

.form-control input:focus + label span,
.form-control.is-focused label span,
.form-control.has-value label span,
.form-control input:-webkit-autofill + label span {
  color: var(--accent);
  transform: translateY(-26px);
  font-size: 12.5px;
  font-weight: 500;
}

.input-hint {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: var(--muted, rgba(255, 255, 255, 0.5));
  line-height: 1.4;
}

.wave-clear-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: 0;
  color: var(--muted, rgba(255, 255, 255, 0.45));
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.18s ease;
}

.form-control.has-clear input {
  padding-right: 28px !important;
}

.form-control input[type="search"]::-webkit-search-decoration,
.form-control input[type="search"]::-webkit-search-cancel-button,
.form-control input[type="search"]::-webkit-search-results-button,
.form-control input[type="search"]::-webkit-search-results-decoration {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}

.wave-clear-btn:hover {
  color: var(--text, #ffffff);
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .form-control input {
  border-bottom: 2px rgba(197, 230, 223, 0.28) solid !important;
}

[data-theme-style="vanta-fog"] .form-control input:-webkit-autofill,
[data-theme-style="vanta-fog"] .form-control input:-webkit-autofill:hover,
[data-theme-style="vanta-fog"] .form-control input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0px 1000px rgba(8, 16, 28, 0.95) inset !important;
}
</style>
