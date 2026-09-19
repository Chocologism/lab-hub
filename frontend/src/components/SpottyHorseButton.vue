<script setup>
import YoungWalrusLoader from './YoungWalrusLoader.vue'

defineProps({
  label: {
    type: String,
    default: '解析文献'
  },
  loading: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

defineEmits(['click'])
</script>

<template>
  <button
    type="submit"
    class="btn-spotty"
    :disabled="disabled || loading"
    :class="{ 'is-loading': loading, 'is-disabled': disabled }"
    @click="$emit('click', $event)"
  >
    <span class="btn-content">
      <YoungWalrusLoader v-if="loading" :size="0.22" />
      <strong class="btn-label">{{ loading ? '解析中…' : label }}</strong>
    </span>

    <div class="container-stars">
      <div class="stars"></div>
    </div>

    <div class="glow-container">
      <div class="circle-glow"></div>
      <div class="circle-glow"></div>
    </div>
  </button>
</template>

<style scoped>
.btn-spotty {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  height: 48px;
  padding: 0 26px;
  background-size: 300% 300%;
  cursor: pointer;
  backdrop-filter: blur(1rem);
  -webkit-backdrop-filter: blur(1rem);
  border-radius: 12px;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  animation: gradient_301 5s ease infinite;
  border: double 3px transparent;
  background-image: linear-gradient(#142930, #142930),
    linear-gradient(
      137.48deg,
      #ffdb3b 10%,
      #fe53bb 45%,
      #8f51ea 67%,
      #00d4ff 87%
    );
  background-origin: border-box;
  background-clip: content-box, border-box;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  white-space: nowrap;
  user-select: none;
  flex-shrink: 0;
}

.btn-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-label {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 1px;
  color: #ffffff;
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
}

.container-stars {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  transition: 0.5s;
  backdrop-filter: blur(1rem);
  -webkit-backdrop-filter: blur(1rem);
  border-radius: 10px;
}

.glow-container {
  position: absolute;
  display: flex;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.circle-glow {
  width: 100%;
  height: 30px;
  filter: blur(1.5rem);
  animation: pulse_3011 4s infinite;
  z-index: -1;
}

.circle-glow:nth-of-type(1) {
  background: rgba(254, 83, 186, 0.64);
}

.circle-glow:nth-of-type(2) {
  background: rgba(0, 212, 255, 0.7);
}

.btn-spotty:hover:not(:disabled) .container-stars {
  z-index: 1;
  background-color: rgba(20, 41, 48, 0.85);
}

.btn-spotty:hover:not(:disabled) {
  transform: scale(1.04);
  box-shadow: 0 6px 24px rgba(0, 212, 255, 0.35);
}

.btn-spotty:active:not(:disabled) {
  border: double 3px #00d4ff;
  background-origin: border-box;
  background-clip: content-box, border-box;
  animation: none;
  transform: scale(0.98);
}

.btn-spotty:active:not(:disabled) .circle-glow {
  background: #00d4ff;
}

.btn-spotty:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  filter: grayscale(0.5);
  animation-play-state: paused;
}

.stars {
  position: relative;
  background: transparent;
  width: 120rem;
  height: 120rem;
}

.stars::after {
  content: "";
  position: absolute;
  top: -10rem;
  left: -50rem;
  width: 100%;
  height: 100%;
  animation: animStarRotate 90s linear infinite;
  background-image: radial-gradient(#ffffff 1px, transparent 1%);
  background-size: 40px 40px;
}

.stars::before {
  content: "";
  position: absolute;
  top: 0;
  left: -50%;
  width: 170%;
  height: 500%;
  animation: animStar 60s linear infinite;
  background-image: radial-gradient(#ffffff 1px, transparent 1%);
  background-size: 40px 40px;
  opacity: 0.5;
}

@keyframes animStar {
  from { transform: translateY(0); }
  to { transform: translateY(-80rem); }
}

@keyframes animStarRotate {
  from { transform: rotate(360deg); }
  to { transform: rotate(0); }
}

@keyframes gradient_301 {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes pulse_3011 {
  0% {
    transform: scale(0.75);
    box-shadow: 0 0 0 0 rgba(0, 0, 0, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 10px rgba(0, 0, 0, 0);
  }
  100% {
    transform: scale(0.75);
    box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
  }
}
</style>
