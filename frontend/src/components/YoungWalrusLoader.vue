<script setup>
defineProps({
  size: {
    type: Number,
    default: 0.22
  }
})
</script>

<template>
  <div class="walrus-wrap" :style="{ width: `${100 * size}px`, height: `${100 * size}px` }">
    <div class="walrus-loader" :style="{ transform: `scale(${size})` }">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <defs>
          <mask id="walrus-clipping">
            <polygon points="0,0 100,0 100,100 0,100" fill="black"></polygon>
            <polygon points="25,25 75,25 50,75" fill="white"></polygon>
            <polygon points="50,25 75,75 25,75" fill="white"></polygon>
            <polygon points="35,35 65,35 50,65" fill="white"></polygon>
            <polygon points="35,35 65,35 50,65" fill="white"></polygon>
            <polygon points="35,35 65,35 50,65" fill="white"></polygon>
            <polygon points="35,35 65,35 50,65" fill="white"></polygon>
          </mask>
        </defs>
      </svg>
      <div class="box"></div>
    </div>
  </div>
</template>

<style scoped>
.walrus-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  overflow: visible;
}

.walrus-loader {
  --color-one: #7dd3fc;
  --color-two: #0284c7;
  --color-three: rgba(125, 211, 252, 0.6);
  --color-four: rgba(2, 132, 199, 0.6);
  --color-five: rgba(125, 211, 252, 0.3);
  --time-animation: 2s;
  width: 100px;
  height: 100px;
  position: absolute;
  border-radius: 50%;
  transform-origin: center center;
  box-shadow:
    0 0 25px 0 var(--color-three),
    0 10px 30px 0 var(--color-four);
  animation: colorize calc(var(--time-animation) * 3) ease-in-out infinite;
  pointer-events: none;
}

.walrus-loader::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border-top: solid 1px var(--color-one);
  border-bottom: solid 1px var(--color-two);
  background: linear-gradient(180deg, var(--color-five), var(--color-four));
  box-shadow:
    inset 0 10px 10px 0 var(--color-three),
    inset 0 -10px 10px 0 var(--color-four);
}

.walrus-loader .box {
  width: 100px;
  height: 100px;
  background: linear-gradient(
    180deg,
    var(--color-one) 30%,
    var(--color-two) 70%
  );
  mask: url(#walrus-clipping);
  -webkit-mask: url(#walrus-clipping);
}

.walrus-loader svg {
  position: absolute;
  top: 0;
  left: 0;
}

.walrus-loader svg #walrus-clipping {
  filter: contrast(15);
  animation: roundness calc(var(--time-animation) / 2) linear infinite;
}

.walrus-loader svg #walrus-clipping polygon {
  filter: blur(7px);
}

.walrus-loader svg #walrus-clipping polygon:nth-child(1) {
  transform-origin: 75% 25%;
  transform: rotate(90deg);
}

.walrus-loader svg #walrus-clipping polygon:nth-child(2) {
  transform-origin: 50% 50%;
  animation: rotation var(--time-animation) linear infinite reverse;
}

.walrus-loader svg #walrus-clipping polygon:nth-child(3) {
  transform-origin: 50% 60%;
  animation: rotation var(--time-animation) linear infinite;
  animation-delay: calc(var(--time-animation) / -3);
}

.walrus-loader svg #walrus-clipping polygon:nth-child(4) {
  transform-origin: 40% 40%;
  animation: rotation var(--time-animation) linear infinite reverse;
}

.walrus-loader svg #walrus-clipping polygon:nth-child(5) {
  transform-origin: 40% 40%;
  animation: rotation var(--time-animation) linear infinite reverse;
  animation-delay: calc(var(--time-animation) / -2);
}

.walrus-loader svg #walrus-clipping polygon:nth-child(6) {
  transform-origin: 60% 40%;
  animation: rotation var(--time-animation) linear infinite;
}

.walrus-loader svg #walrus-clipping polygon:nth-child(7) {
  transform-origin: 60% 40%;
  animation: rotation var(--time-animation) linear infinite;
  animation-delay: calc(var(--time-animation) / -1.5);
}

@keyframes rotation {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes roundness {
  0% { filter: contrast(15); }
  20% { filter: contrast(3); }
  40% { filter: contrast(3); }
  60% { filter: contrast(15); }
  100% { filter: contrast(15); }
}

@keyframes colorize {
  0% { filter: hue-rotate(0deg); }
  20% { filter: hue-rotate(-30deg); }
  40% { filter: hue-rotate(-60deg); }
  60% { filter: hue-rotate(-90deg); }
  80% { filter: hue-rotate(-45deg); }
  100% { filter: hue-rotate(0deg); }
}
</style>
