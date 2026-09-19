<script setup>
defineProps({
  label: {
    type: String,
    default: '推荐论文'
  }
})

defineEmits(['click'])
</script>

<template>
  <button type="button" class="btn-silent-lizard" @click="$emit('click', $event)">
    <span class="btn-text">{{ label }}</span>
    <div v-for="i in 6" :key="i" :class="`star-${i}`">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 784.11 815.53"
        class="star-svg"
      >
        <path
          class="star-path"
          d="M392.05 0c-20.9,210.08 -184.06,378.41 -392.05,407.78 207.96,29.37 371.12,197.68 392.05,407.74 20.93,-210.06 184.09,-378.37 392.05,-407.74 -207.98,-29.38 -371.16,-197.69 -392.06,-407.78z"
        />
      </svg>
    </div>
  </button>
</template>

<style scoped>
.btn-silent-lizard {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 24px;
  min-height: 46px;
  box-sizing: border-box;
  background: var(--accent, #b89bf8);
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-ink, #070314);
  border: 2px solid var(--accent, #b89bf8);
  border-radius: 12px;
  box-shadow: 0 0 14px rgba(184, 155, 248, 0.35);
  transition: all 0.3s ease-in-out;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}

.btn-text {
  position: relative;
  z-index: 1;
}

.star-svg {
  width: 100%;
  height: 100%;
}

.star-path {
  fill: #faf5ff;
}

.star-1 {
  position: absolute;
  top: 20%;
  left: 20%;
  width: 22px;
  height: auto;
  filter: drop-shadow(0 0 0 #fffdef);
  z-index: -1;
  pointer-events: none;
  transition: all 1s cubic-bezier(0.05, 0.83, 0.43, 0.96);
}

.star-2 {
  position: absolute;
  top: 45%;
  left: 45%;
  width: 14px;
  height: auto;
  filter: drop-shadow(0 0 0 #fffdef);
  z-index: -1;
  pointer-events: none;
  transition: all 1s cubic-bezier(0, 0.4, 0, 1.01);
}

.star-3 {
  position: absolute;
  top: 40%;
  left: 40%;
  width: 6px;
  height: auto;
  filter: drop-shadow(0 0 0 #fffdef);
  z-index: -1;
  pointer-events: none;
  transition: all 1s cubic-bezier(0, 0.4, 0, 1.01);
}

.star-4 {
  position: absolute;
  top: 20%;
  left: 40%;
  width: 8px;
  height: auto;
  filter: drop-shadow(0 0 0 #fffdef);
  z-index: -1;
  pointer-events: none;
  transition: all 0.8s cubic-bezier(0, 0.4, 0, 1.01);
}

.star-5 {
  position: absolute;
  top: 25%;
  left: 45%;
  width: 14px;
  height: auto;
  filter: drop-shadow(0 0 0 #fffdef);
  z-index: -1;
  pointer-events: none;
  transition: all 0.6s cubic-bezier(0, 0.4, 0, 1.01);
}

.star-6 {
  position: absolute;
  top: 5%;
  left: 50%;
  width: 6px;
  height: auto;
  filter: drop-shadow(0 0 0 #fffdef);
  z-index: -1;
  pointer-events: none;
  transition: all 0.8s ease;
}

.btn-silent-lizard:hover {
  background: rgba(184, 155, 248, 0.16);
  color: var(--accent, #b89bf8);
  border-color: var(--accent, #b89bf8);
  box-shadow: 0 0 24px rgba(184, 155, 248, 0.5);
  backdrop-filter: blur(8px);
}

.btn-silent-lizard:hover .star-1 {
  top: -65%;
  left: -20%;
  width: 22px;
  filter: drop-shadow(0 0 10px #b89bf8);
  z-index: 2;
}

.btn-silent-lizard:hover .star-2 {
  top: -20%;
  left: 10%;
  width: 14px;
  filter: drop-shadow(0 0 10px #b89bf8);
  z-index: 2;
}

.btn-silent-lizard:hover .star-3 {
  top: 60%;
  left: 18%;
  width: 6px;
  filter: drop-shadow(0 0 10px #b89bf8);
  z-index: 2;
}

.btn-silent-lizard:hover .star-4 {
  top: 35%;
  left: 85%;
  width: 8px;
  filter: drop-shadow(0 0 10px #b89bf8);
  z-index: 2;
}

.btn-silent-lizard:hover .star-5 {
  top: -20%;
  left: 95%;
  width: 14px;
  filter: drop-shadow(0 0 10px #b89bf8);
  z-index: 2;
}

.btn-silent-lizard:hover .star-6 {
  top: 65%;
  left: 70%;
  width: 6px;
  filter: drop-shadow(0 0 10px #b89bf8);
  z-index: 2;
}

.btn-silent-lizard:active {
  transform: scale(0.97);
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .btn-silent-lizard {
  background: var(--accent, #c5e6df) !important;
  color: #0e2b31 !important;
  border-color: var(--accent, #c5e6df) !important;
  box-shadow: 0 0 14px rgba(197, 230, 223, 0.3) !important;
}

[data-theme-style="vanta-fog"] .star-path {
  fill: #e8f9f5 !important;
}

[data-theme-style="vanta-fog"] .btn-silent-lizard:hover {
  background: rgba(197, 230, 223, 0.16) !important;
  color: var(--accent, #c5e6df) !important;
  border-color: var(--accent, #c5e6df) !important;
  box-shadow: 0 0 24px rgba(197, 230, 223, 0.5) !important;
}

[data-theme-style="vanta-fog"] .btn-silent-lizard:hover .star-1,
[data-theme-style="vanta-fog"] .btn-silent-lizard:hover .star-2,
[data-theme-style="vanta-fog"] .btn-silent-lizard:hover .star-3,
[data-theme-style="vanta-fog"] .btn-silent-lizard:hover .star-4,
[data-theme-style="vanta-fog"] .btn-silent-lizard:hover .star-5,
[data-theme-style="vanta-fog"] .btn-silent-lizard:hover .star-6 {
  filter: drop-shadow(0 0 10px #c5e6df) !important;
}
</style>
