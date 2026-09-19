<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Renderer, Program, Mesh, Color, Triangle } from 'ogl'
import * as THREE from 'three'
import FOG from 'vanta/dist/vanta.fog.min'
import { currentThemeStyle, currentBgType } from '../composables/useThemeStyle'
import { getLocalBackground } from '../utils/localBgStorage'

const route = useRoute()
const containerRef = ref(null)
const isLogin = computed(() => route.path === '/login')
const localMedia = ref(null)

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform bool uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform bool uTransparent;
uniform float uLightMode;

varying vec2 vUv;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);

  vec2 gv = fract(uv) - 0.5; 
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);
      
      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;

      float star = Star(gv - offset - pad, flareSize);
      vec3 color = base;

      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      star *= twinkle;
      
      col += star * size * color;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = ((vUv * uResolution.xy - focalPx) / uResolution.y) * 1.35;

  vec2 mouseNorm = uMouse - vec2(0.5);
  
  if (uAutoCenterRepulsion > 0.0) {
    vec2 centerUV = vec2(0.0, 0.0);
    float centerDist = length(uv - centerUV);
    vec2 repulsion = normalize(uv - centerUV) * (uAutoCenterRepulsion / (centerDist + 0.1));
    uv += repulsion * 0.05;
  } else if (uMouseRepulsion) {
    vec2 mousePosUV = ((uMouse * uResolution.xy - focalPx) / uResolution.y) * 1.35;
    vec2 delta = uv - mousePosUV;
    float mouseDist = max(length(delta), 0.0001);
    float influence = smoothstep(0.48, 0.02, mouseDist);
    vec2 repulsion = (delta / mouseDist) * (uRepulsionStrength / (mouseDist + 0.08)) * influence;
    uv += repulsion * 0.055 * uMouseActiveFactor;
  } else {
    vec2 mouseOffset = mouseNorm * 0.1 * uMouseActiveFactor;
    uv += mouseOffset;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;

  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uLightMode > 0.5) {
    float energy = max(max(col.r, col.g), col.b);
    float coverage = clamp(smoothstep(0.0, 0.42, energy) * 0.92, 0.0, 0.92);
    vec3 ink = clamp(col * 0.48, 0.0, 0.82);
    gl_FragColor = vec4(mix(vec3(1.0), ink, coverage), 1.0);
  } else if (uTransparent) {
    float alpha = length(col);
    alpha = smoothstep(0.0, 0.3, alpha);
    alpha = min(alpha, 1.0);
    gl_FragColor = vec4(col, alpha);
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
}
`

// 默认参数配置（来自 React Bits Galaxy 预设）
// 登录界面速度翻倍：speed: 0.6, starSpeed: 0.4；站内普通界面：speed: 0.3, starSpeed: 0.2
let targetSpeed = 0.3
let targetStarSpeed = 0.2
let currentSpeed = 0.3
let currentStarSpeed = 0.2

const updateSpeedTargets = (path) => {
  if (path === '/login') {
    targetSpeed = 0.6
    targetStarSpeed = 0.4
  } else {
    targetSpeed = 0.3
    targetStarSpeed = 0.2
  }
}

watch(() => route.path, (newPath) => {
  updateSpeedTargets(newPath)
}, { immediate: true })

let renderer = null
let program = null
let mesh = null
let animateId = null
let resizeObserver = null

let targetMousePos = { x: 0.5, y: 0.5 }
let smoothMousePos = { x: 0.5, y: 0.5 }
let targetMouseActive = 0.0
let smoothMouseActive = 0.0

let accumulatedTime = 0
let accumulatedStarTime = 0
let lastTimestamp = 0

function handleMouseMove(e) {
  const w = window.innerWidth || 1
  const h = window.innerHeight || 1
  targetMousePos.x = e.clientX / w
  targetMousePos.y = 1.0 - (e.clientY / h)
  targetMouseActive = 1.0
}

function handleMouseLeave() {
  targetMouseActive = 0.0
}

function handleTouchMove(e) {
  if (e.touches && e.touches.length > 0) {
    const t = e.touches[0]
    const w = window.innerWidth || 1
    const h = window.innerHeight || 1
    targetMousePos.x = t.clientX / w
    targetMousePos.y = 1.0 - (t.clientY / h)
    targetMouseActive = 1.0
  }
}

function handleTouchEnd() {
  targetMouseActive = 0.0
}

function resize() {
  if (!containerRef.value || !renderer) return
  const ctn = containerRef.value
  const w = ctn.offsetWidth || window.innerWidth
  const h = ctn.offsetHeight || window.innerHeight
  renderer.setSize(w, h)
  if (program && program.uniforms && program.uniforms.uResolution) {
    const gl = renderer.gl
    program.uniforms.uResolution.value[0] = gl.canvas.width
    program.uniforms.uResolution.value[1] = gl.canvas.height
    program.uniforms.uResolution.value[2] = gl.canvas.width / (gl.canvas.height || 1)
  }
}

function update(now) {
  animateId = requestAnimationFrame(update)
  if (!lastTimestamp) lastTimestamp = now
  const dt = Math.min((now - lastTimestamp) / 1000, 0.1)
  lastTimestamp = now

  // 速度渐变平滑插值，避免路由切换瞬间跳帧
  currentSpeed += (targetSpeed - currentSpeed) * 0.05
  currentStarSpeed += (targetStarSpeed - currentStarSpeed) * 0.05

  accumulatedTime += dt * currentSpeed
  accumulatedStarTime += dt * (currentStarSpeed * currentSpeed) / 10.0

  // 鼠标排斥即时跟手与丝滑阻尼
  const posLerp = 0.22
  smoothMousePos.x += (targetMousePos.x - smoothMousePos.x) * posLerp
  smoothMousePos.y += (targetMousePos.y - smoothMousePos.y) * posLerp

  // 移入即刻激活，移出/停止时平滑回落
  const activeLerp = targetMouseActive > smoothMouseActive ? 0.35 : 0.05
  smoothMouseActive += (targetMouseActive - smoothMouseActive) * activeLerp

  if (program && program.uniforms) {
    program.uniforms.uTime.value = accumulatedTime
    program.uniforms.uStarSpeed.value = accumulatedStarTime
    program.uniforms.uSpeed.value = 1.0 // 速度已累计在 accumulatedTime 和 accumulatedStarTime 中
    program.uniforms.uMouse.value[0] = smoothMousePos.x
    program.uniforms.uMouse.value[1] = smoothMousePos.y
    program.uniforms.uMouseActiveFactor.value = smoothMouseActive
  }

  if (renderer && mesh) {
    renderer.render({ scene: mesh })
    const glCvs = renderer?.gl?.canvas
    if (glCvs && !glCvs.classList.contains('is-rendered')) {
      glCvs.classList.add('is-rendered')
    }
  }
}

function initGalaxy() {
  if (!containerRef.value) return
  destroyGalaxy()
  const ctn = containerRef.value

  // 初始化速度
  updateSpeedTargets(route.path)
  currentSpeed = targetSpeed
  currentStarSpeed = targetStarSpeed

  // 创建 OGL 渲染器
  renderer = new Renderer({
    dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    alpha: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false
  })
  const gl = renderer.gl
  gl.clearColor(0.012, 0.008, 0.039, 1.0)
  gl.clear(gl.COLOR_BUFFER_BIT)

  const geometry = new Triangle(gl)
  program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uResolution: {
        value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / (gl.canvas.height || 1))
      },
      uFocal: { value: new Float32Array([0.5, 0.5]) },
      uRotation: { value: new Float32Array([1.0, 0.0]) },
      uStarSpeed: { value: 0.0 },
      uDensity: { value: 2.5 },
      uHueShift: { value: 180.0 },
      uSpeed: { value: 1.0 },
      uMouse: {
        value: new Float32Array([0.5, 0.5])
      },
      uGlowIntensity: { value: 0.32 },
      uSaturation: { value: 0.2 },
      uMouseRepulsion: { value: true },
      uTwinkleIntensity: { value: 0.7 },
      uRotationSpeed: { value: 0.05 },
      uRepulsionStrength: { value: 0.22 },
      uMouseActiveFactor: { value: 0.0 },
      uAutoCenterRepulsion: { value: 0.0 },
      uTransparent: { value: false },
      uLightMode: { value: 0.0 }
    }
  })

  mesh = new Mesh(gl, { geometry, program })

  ctn.appendChild(gl.canvas)
  resize()

  // 立即执行首帧渲染并点亮，彻底消除等待首个 RAF 期间的 WebGL 空缓冲灰底闪烁
  try {
    renderer.render({ scene: mesh })
    gl.canvas.classList.add('is-rendered')
  } catch (e) {}

  // 监听尺寸变化与窗口事件
  window.addEventListener('resize', resize, { passive: true })
  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(ctn)
  }

  // 全局捕获鼠标与触控（使前景卡片上的滑动同样可与宇宙星空发生引力排斥）
  window.addEventListener('mousemove', handleMouseMove, { passive: true })
  window.addEventListener('mouseout', handleMouseLeave, { passive: true })
  window.addEventListener('touchmove', handleTouchMove, { passive: true })
  window.addEventListener('touchend', handleTouchEnd, { passive: true })

  lastTimestamp = performance.now()
  animateId = requestAnimationFrame(update)
}

function destroyGalaxy() {
  if (animateId) {
    cancelAnimationFrame(animateId)
    animateId = null
  }
  window.removeEventListener('resize', resize)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseout', handleMouseLeave)
  window.removeEventListener('touchmove', handleTouchMove)
  window.removeEventListener('touchend', handleTouchEnd)

  if (renderer) {
    try {
      const gl = renderer.gl
      if (gl?.canvas && gl.canvas.parentNode) {
        gl.canvas.parentNode.removeChild(gl.canvas)
      }
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch (err) {
      console.warn('Galaxy context cleanup warning:', err)
    }
    renderer = null
  }
  program = null
  mesh = null
  lastTimestamp = 0
  if (containerRef.value) {
    containerRef.value.innerHTML = ''
  }
}

// ==========================================
// 2. Vanta Fog Engine (Three.js / Vanta)
// ==========================================
let vantaEffect = null

function initVantaFog() {
  if (!containerRef.value) return
  destroyVantaFog()

  const customThree = {
    ...THREE,
    WebGLRenderer: class extends THREE.WebGLRenderer {
      constructor(params = {}) {
        super({ ...params, preserveDrawingBuffer: true })
        try {
          this.setClearColor(0x081f28, 1.0)
        } catch (e) {}
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.THREE = customThree
  }

  const markVantaRendered = () => {
    if (containerRef.value) {
      const cvs = containerRef.value.querySelector('canvas')
      if (cvs && !cvs.classList.contains('is-rendered')) {
        cvs.classList.add('is-rendered')
      }
    }
  }

  const fogFn = typeof FOG === 'function' ? FOG : (FOG?.default?.default || FOG?.default || window.VANTA?.FOG)
  if (fogFn && containerRef.value) {
    try {
      vantaEffect = fogFn({
        el: containerRef.value,
        THREE: customThree,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 2.0,
        scaleMobile: 4.0,
        backgroundAlpha: 1.0,
        backgroundColor: 0x081f28,
        highlightColor: 0xc5e6df, // 团组标志性浅青高光 (#c5e6df)
        midtoneColor: 0x164e63,   // 宇宙星云深青 (#164e63)
        lowlightColor: 0x071e27,  // 团组深邃暗青底色 (#071e27)
        baseColor: 0x05161c,      // 极夜黑蓝底色 (#05161c)
        blurFactor: 0.55,
        speed: route.path === '/login' ? 2.0 : 0.4,
        zoom: 1.0,
        forceAnimate: true,
        onUpdate: markVantaRendered
      })
      // 立即触发首帧渲染并点亮，彻底消除首屏暗色空档
      if (vantaEffect?.renderer && vantaEffect?.scene && vantaEffect?.camera) {
        try {
          vantaEffect.renderer.render(vantaEffect.scene, vantaEffect.camera)
        } catch (e) {}
      }
      markVantaRendered()
    } catch (err) {
      console.warn('Vanta Fog initialization failed:', err)
    }
  }
}

function destroyVantaFog() {
  if (vantaEffect && typeof vantaEffect.destroy === 'function') {
    try {
      vantaEffect.destroy()
    } catch (e) {
      console.warn('Vanta Fog destroy warning:', e)
    }
    vantaEffect = null
  }
  if (containerRef.value) {
    containerRef.value.innerHTML = ''
  }
}

// ==========================================
// 3. 统一调度与生命周期
// ==========================================
async function refreshLocalMedia() {
  const result = await getLocalBackground()
  if (!result) {
    if (localMedia.value?.url) {
      try {
        URL.revokeObjectURL(localMedia.value.url)
      } catch (e) {}
    }
    localMedia.value = null
    return
  }

  // 守卫：如果已载入相同的本地媒体，立即释放新生成的 objectURL 并保持原引用，避免触发 Vue 重新挂载与死循环
  if (
    localMedia.value &&
    localMedia.value.name === result.name &&
    localMedia.value.size === result.size &&
    localMedia.value.type === result.type
  ) {
    try {
      URL.revokeObjectURL(result.url)
    } catch (e) {}
    return
  }

  if (localMedia.value?.url) {
    try {
      URL.revokeObjectURL(localMedia.value.url)
    } catch (e) {}
  }
  localMedia.value = result
}

function handleLocalBgChanged() {
  if (currentBgType.value === 'custom-local') {
    refreshLocalMedia()
  }
}

function startAtmosphere(bgType) {
  if (!containerRef.value) return
  if (bgType === 'clouds-static') {
    destroyGalaxy()
    destroyVantaFog()
    if (containerRef.value) {
      containerRef.value.innerHTML = ''
    }
  } else if (bgType === 'vanta-fog') {
    destroyGalaxy()
    initVantaFog()
  } else if (bgType === 'galaxy') {
    destroyVantaFog()
    initGalaxy()
  } else if (bgType === 'custom-local') {
    destroyGalaxy()
    destroyVantaFog()
    if (containerRef.value) {
      containerRef.value.innerHTML = ''
    }
    refreshLocalMedia()
  }
}

function stopAtmosphere() {
  destroyGalaxy()
  destroyVantaFog()
  if (localMedia.value?.url) {
    try {
      URL.revokeObjectURL(localMedia.value.url)
    } catch (e) {}
    localMedia.value = null
  }
}

watch(currentBgType, (newBg) => {
  startAtmosphere(newBg)
})

watch(() => route.path, (newPath) => {
  if (currentBgType.value === 'vanta-fog') {
    if (vantaEffect && typeof vantaEffect.setOptions === 'function') {
      vantaEffect.setOptions({
        speed: newPath === '/login' ? 2.0 : 0.4
      })
    }
  } else if (currentBgType.value === 'galaxy') {
    updateSpeedTargets(newPath)
  }
})

function onMediaLoaded() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('atmosphere-media-ready'))
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('local-bg-changed', handleLocalBgChanged)
  }
  startAtmosphere(currentBgType.value)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('local-bg-changed', handleLocalBgChanged)
  }
  stopAtmosphere()
})
</script>

<template>
  <div class="forecast-atmosphere" aria-hidden="true">
    <!-- 本地自定义图片/视频背景（纯本地加载，绝不上云） -->
    <template v-if="currentBgType === 'custom-local' && localMedia">
      <video
        v-if="localMedia.type === 'video'"
        :src="localMedia.url"
        class="custom-bg-media"
        autoplay
        loop
        muted
        playsinline
        disablepictureinpicture
        @loadeddata="onMediaLoaded"
      ></video>
      <img
        v-else
        :src="localMedia.url"
        class="custom-bg-media"
        alt=""
        decoding="async"
        @load="onMediaLoaded"
      />
    </template>
    <div
      v-show="currentBgType === 'galaxy' || currentBgType === 'vanta-fog'"
      ref="containerRef"
      class="galaxy-atmosphere-canvas vanta-atmosphere-canvas atmosphere-canvas"
    ></div>
    <div class="atmosphere-shade" :class="{ 'is-login': isLogin }"></div>
  </div>
</template>

<style scoped>
.galaxy-atmosphere-canvas,
.vanta-atmosphere-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.galaxy-atmosphere-canvas :deep(canvas),
.vanta-atmosphere-canvas :deep(canvas) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.galaxy-atmosphere-canvas :deep(canvas:not(.is-rendered)),
.vanta-atmosphere-canvas :deep(canvas:not(.is-rendered)) {
  opacity: 0;
}

.atmosphere-shade.is-login {
  opacity: 0;
}
</style>
