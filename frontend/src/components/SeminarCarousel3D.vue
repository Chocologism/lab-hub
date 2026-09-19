<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { statusLabel } from '../utils/schedule'
import { renderLatex } from '../utils/latex'

const props = defineProps({
  items: {
    type: Array,
    required: true,
    default: () => []
  },
  nearestIndex: {
    type: Number,
    default: 0
  },
  targetIndex: {
    type: Number,
    default: -1
  },
  disableAutoReset: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select-seminar'])

// 浮点连续进度（0 到 items.length - 1）
const currentProgress = ref(props.nearestIndex || 0)
const currentIndex = computed(() => Math.max(0, Math.min(props.items.length - 1, Math.round(currentProgress.value))))

const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
function handleResize() {
  windowWidth.value = window.innerWidth
}

const isDragging = ref(false)
const hasMoved = ref(false)

let startX = 0
let startProgress = 0
let lastX = 0
let lastTime = 0
let velocity = 0
let animationFrameId = null
let idleTimer = null
let dragRafId = null
let pendingTargetProgress = null

// 5 秒无操作自动复位定时器
function startIdleTimer() {
  clearTimeout(idleTimer)
  // 若指定了不自动回位或已定位到目标卡片，彻底跳过自动复位
  if (props.disableAutoReset || props.targetIndex >= 0) {
    return
  }
  // 如果当前不是“最近一次/即将举行”（props.nearestIndex），5秒后自动旋转归位
  if (props.nearestIndex >= 0 && currentIndex.value !== props.nearestIndex) {
    idleTimer = setTimeout(() => {
      snapTo(props.nearestIndex, 650)
    }, 5000)
  }
}

function cancelIdleTimer() {
  clearTimeout(idleTimer)
}

// 平滑吸附动画 (Cubic-Bezier Spring Easing)
function snapTo(targetIndex, duration = 450) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  const max = Math.max(0, props.items.length - 1)
  const clampedTarget = Math.max(0, Math.min(max, targetIndex))
  const startVal = currentProgress.value
  const distance = clampedTarget - startVal
  const startTime = performance.now()

  // 若距离极小直接到位
  if (Math.abs(distance) < 0.001) {
    currentProgress.value = clampedTarget
    startIdleTimer()
    return
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3)
  }

  function tick(now) {
    const elapsed = now - startTime
    const t = Math.min(1, elapsed / duration)
    currentProgress.value = startVal + distance * easeOutCubic(t)

    if (t < 1) {
      animationFrameId = requestAnimationFrame(tick)
    } else {
      currentProgress.value = clampedTarget
      animationFrameId = null
      startIdleTimer()
    }
  }

  animationFrameId = requestAnimationFrame(tick)
}

// 鼠标 / 触摸按下
function onPointerDown(e) {
  cancelIdleTimer()
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  isDragging.value = true
  hasMoved.value = false
  startX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0
  startProgress = currentProgress.value
  lastX = startX
  lastTime = performance.now()
  velocity = 0

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

// 鼠标 / 触摸移动（1:1 高频丝滑跟手，RAF 节流确保对齐屏幕刷新率）
function onPointerMove(e) {
  if (!isDragging.value) return
  const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0
  const deltaX = clientX - startX

  if (Math.abs(deltaX) > 4) {
    hasMoved.value = true
  }

  const now = performance.now()
  const dt = now - lastTime
  if (dt > 0) {
    velocity = (clientX - lastX) / dt // px/ms
  }
  lastX = clientX
  lastTime = now

  const pixelsPerCard = 260
  let targetProgress = startProgress - deltaX / pixelsPerCard

  // 边缘阻尼弹性
  const min = 0
  const max = Math.max(0, props.items.length - 1)
  if (targetProgress < min) {
    targetProgress = min - Math.pow(min - targetProgress, 0.75) * 0.35
  } else if (targetProgress > max) {
    targetProgress = max + Math.pow(targetProgress - max, 0.75) * 0.35
  }

  pendingTargetProgress = targetProgress
  if (!dragRafId) {
    dragRafId = requestAnimationFrame(() => {
      if (pendingTargetProgress !== null) {
        currentProgress.value = pendingTargetProgress
      }
      dragRafId = null
    })
  }
}

// 鼠标 / 触摸释放（滑动停止时吸附至视觉最前方的卡片）
function onPointerUp() {
  if (!isDragging.value) return
  isDragging.value = false

  if (dragRafId) {
    cancelAnimationFrame(dragRafId)
    dragRafId = null
  }
  if (pendingTargetProgress !== null) {
    currentProgress.value = pendingTargetProgress
    pendingTargetProgress = null
  }

  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)

  // 结合微动量投影，吸附到离视觉最前方最近的整数索引
  const momentum = velocity * 60 / 260
  let projected = currentProgress.value - momentum
  const max = Math.max(0, props.items.length - 1)
  const targetIndex = Math.max(0, Math.min(max, Math.round(projected)))

  snapTo(targetIndex, 480)
}

let wheelSnapTimer = null

// 触控板双指横向滑动、妙控鼠标轻扫与滚轮横向滚动（连续角度旋转跟手 + 自动吸附）
function onWheel(e) {
  const isHorizontalIntent = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.05 || (e.shiftKey && Math.abs(e.deltaY) > 0)
  if (!isHorizontalIntent) {
    // 纵向滚动完全放行给网页，不拦截
    return
  }

  // 拦截横向手势，避免触发浏览器前进后退或横向晃动
  if (e.cancelable && typeof e.preventDefault === 'function') {
    e.preventDefault()
  }

  cancelIdleTimer()
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  const dx = e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY) ? e.deltaY : e.deltaX
  const pixelsPerCard = 240
  let target = currentProgress.value + dx / pixelsPerCard

  // 边缘阻尼弹性
  const min = 0
  const max = Math.max(0, props.items.length - 1)
  if (target < min) {
    target = min - Math.pow(min - target, 0.75) * 0.25
  } else if (target > max) {
    target = max + Math.pow(target - max, 0.75) * 0.25
  }

  currentProgress.value = target

  // 滑动停止后平滑吸附到最近卡片
  clearTimeout(wheelSnapTimer)
  wheelSnapTimer = setTimeout(() => {
    const clampedTarget = Math.max(0, Math.min(max, Math.round(currentProgress.value)))
    snapTo(clampedTarget, 360)
  }, 120)
}

// 点击卡片：侧面卡片点击直接旋转到最前方，当前卡片点击查看详情
function handleCardClick(idx, item) {
  if (hasMoved.value) return
  if (idx !== currentIndex.value) {
    snapTo(idx, 450)
  } else if (item) {
    emit('select-seminar', item)
  }
}

// 监听目标索引变化，平滑旋转对齐至最前方
watch(
  [() => props.targetIndex, () => props.items.length],
  ([idx, len]) => {
    if (idx >= 0 && idx < len) {
      snapTo(idx, 600)
    }
  },
  { flush: 'post' }
)

// 监听最近一次组会变化（仅在非目标定位模式下生效，避免覆盖目标卡片）
watch(() => props.nearestIndex, (val) => {
  if (props.targetIndex >= 0) return
  if (val >= 0 && val < props.items.length) {
    snapTo(val, 500)
  }
})

onMounted(() => {
  const initialIdx = (props.targetIndex >= 0 && props.targetIndex < props.items.length)
    ? props.targetIndex
    : (props.nearestIndex >= 0 && props.nearestIndex < props.items.length ? props.nearestIndex : 0)
  currentProgress.value = initialIdx
  startIdleTimer()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  cancelIdleTimer()
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  if (dragRafId) cancelAnimationFrame(dragRafId)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('resize', handleResize)
})

// 3D 柱面透视算法（还原 strange-eel-100 真实圆弧凸面旋转姿态与间距，彻底杜绝重叠与重绘闪烁）
function getCardStyle(idx) {
  const rel = idx - currentProgress.value
  const absRel = Math.abs(rel)

  // 超过可见范围的卡片彻底隐藏，保障全量渲染极端顺畅
  if (absRel > 3.2) {
    return { display: 'none' }
  }

  // 根据屏幕宽度自适应调整柱面半径与旋转角步长，确保卡片之间拥有清晰且不重叠的间隔（参考 strange-eel-100）
  const isMobile = windowWidth.value < 768
  const R = isMobile ? 680 : 920
  const angleStep = isMobile ? 26 : 24 // 角度步长 (度)
  const theta = rel * angleStep
  const rad = theta * Math.PI / 180

  const translateX = R * Math.sin(rad)
  const translateZ = R * (Math.cos(rad) - 1)
  const rotateY = theta

  const scale = 1 - Math.min(absRel * 0.06, 0.22)
  const opacity = Math.max(0.15, 1 - Math.min(absRel * 0.25, 0.85))
  const zIndex = Math.round(100 - absRel * 15)

  return {
    transform: `translate3d(${translateX.toFixed(2)}px, 0, ${translateZ.toFixed(2)}px) rotateY(${rotateY.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
    opacity: Number(opacity.toFixed(3)),
    zIndex,
    pointerEvents: absRel < 0.65 ? 'auto' : 'auto',
  }
}
</script>

<template>
  <div 
    class="strange-eel-carousel"
    tabindex="0"
    @mouseenter="cancelIdleTimer"
    @mouseleave="startIdleTimer"
    @pointerdown="onPointerDown"
    @wheel="onWheel"
  >
    <!-- 3D 圆柱透视舞台 -->
    <div class="carousel-stage">
      <div 
        v-for="(item, idx) in items" 
        :key="item.id"
        class="carousel-card-3d"
        :class="{ 
          'is-active': idx === currentIndex,
          'is-nearest': idx === nearestIndex,
          'is-target': idx === targetIndex,
          'is-side': idx !== currentIndex,
        }"
        :id="idx === currentIndex ? 'tour-seminars-card' : undefined"
        :style="getCardStyle(idx)"
        @click="handleCardClick(idx, item)"
      >
        <!-- 边缘光泽与高光层 (strange-eel-100 质感) -->
        <div class="card-glow-overlay"></div>
        <div class="card-border-glow"></div>

        <div class="card-inner">
          <!-- 顶部状态栏：排期时间与状态徽章 -->
          <div class="card-top-row">
            <div class="card-schedule-time mono">
              <AppIcon name="calendar" :size="13" />
              <span>{{ item.date }}</span>
              <span class="dot-sep">·</span>
              <AppIcon name="clock" :size="13" />
              <span>{{ item.time }}</span>
            </div>

            <div class="card-badges">
              <span v-if="idx === nearestIndex" class="nearest-badge">
                <span class="pulse-indicator"></span>
                <span>即将举行</span>
              </span>
              <span v-else-if="idx === targetIndex" class="nearest-badge target-seminar-badge">
                <span class="pulse-indicator cyan-pulse"></span>
                <span>目标日程</span>
              </span>
              <span v-else :class="['badge', item.status === 'completed' ? 'success' : statusLabel(item) === '待补纪要' ? 'amber' : 'cyan']">
                {{ statusLabel(item) }}
              </span>
            </div>
          </div>

          <!-- 组会主题 -->
          <h3 class="card-topic academic" :title="item.topic" v-html="renderLatex(item.topic)"></h3>

          <!-- 主讲人 -->
          <div class="card-speaker">
            <AppIcon name="user" :size="14" />
            <span>主讲：<strong>{{ item.presenter_name || '无主讲人（仅文献分享）' }}</strong></span>
          </div>

          <!-- arXiv 文献分享列表 -->
          <div class="card-sharing-box">
            <div class="sharing-header">
              <span class="sharing-title">arXiv 文献分享</span>
              <span class="sharing-count">{{ item.presentations?.length || 0 }} 篇</span>
            </div>
            <div v-if="item.presentations?.length" class="sharing-scroll">
              <div v-for="(p, i) in item.presentations" :key="i" class="sharing-item">
                <span class="sharing-name">{{ p.presenter_name }}</span>
                <span v-if="p.arxiv_id" class="sharing-arxiv mono">arXiv:{{ p.arxiv_id }}</span>
                <span v-else class="sharing-pending">待补充</span>
              </div>
            </div>
            <p v-else class="sharing-empty">本次未安排文献分享</p>
          </div>

          <!-- 底部操作按钮 -->
          <div class="card-action-row">
            <button 
              type="button" 
              class="view-agenda-btn" 
              :class="{ 'primary-btn': idx === currentIndex }"
              @click.stop="$emit('select-seminar', item)"
            >
              <span>查看议程详情</span>
              <AppIcon name="right" :size="14" />
            </button>
          </div>
        </div>
      </div>

      <!-- 空状态提示 -->
      <div v-if="!items.length" class="empty-carousel-state">
        <AppIcon name="calendar" :size="38" />
        <h3>暂无组会排期</h3>
        <p>组会日程发布后将自动在此以 3D 轮转透视展现</p>
      </div>
    </div>

    <!-- 底部控制与导航栏 -->
    <div v-if="items.length > 1" class="carousel-nav-bar">
      <button 
        type="button" 
        class="nav-step-btn" 
        :disabled="currentIndex === 0" 
        title="上一场组会"
        @click="snapTo(currentIndex - 1)"
      >
        <AppIcon name="left" :size="16" />
      </button>

      <div class="carousel-counter">
        <span class="current-num mono">{{ currentIndex + 1 }}</span>
        <span class="slash-num">/</span>
        <span class="total-num mono">{{ items.length }}</span>
      </div>

      <button 
        v-if="nearestIndex >= 0 && currentIndex !== nearestIndex" 
        type="button" 
        class="jump-nearest-btn" 
        title="快速回位到即将举行的组会"
        @click="snapTo(nearestIndex, 550)"
      >
        <span class="pulse-indicator"></span>
        <span>回位</span>
      </button>

      <button 
        type="button" 
        class="nav-step-btn" 
        :disabled="currentIndex === items.length - 1" 
        title="下一场组会"
        @click="snapTo(currentIndex + 1)"
      >
        <AppIcon name="right" :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.strange-eel-carousel {
  position: relative;
  width: 100%;
  padding: 24px 0 16px;
  perspective: 1200px;
  outline: none;
  user-select: none;
  overflow: hidden;
  touch-action: pan-y;
  isolation: isolate;
  contain: layout style paint;
  transform: translateZ(0);
}

.carousel-stage {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 480px;
  transform-style: preserve-3d;
  cursor: grab;
  will-change: transform;
}

.strange-eel-carousel:active .carousel-stage {
  cursor: grabbing;
}

.carousel-card-3d {
  position: absolute;
  width: min(86vw, 330px);
  height: 450px;
  border-radius: 20px;
  background: linear-gradient(155deg, rgba(18, 12, 36, 0.96) 0%, rgba(10, 6, 22, 0.99) 100%);
  border: 1px solid rgba(184, 155, 248, 0.18);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  overflow: hidden;
  transform-origin: center center;
  box-sizing: border-box;
  will-change: transform, opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform-style: flat;
}

.carousel-card-3d.is-active {
  border-color: var(--accent, #b89bf8);
  box-shadow: 
    0 24px 50px rgba(0, 0, 0, 0.65), 
    0 0 32px rgba(184, 155, 248, 0.25),
    inset 0 1px 1px rgba(255, 255, 255, 0.25);
}

.carousel-card-3d.is-side {
  cursor: pointer;
}

.carousel-card-3d.is-side:hover {
  border-color: rgba(184, 155, 248, 0.45);
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.6), 0 0 20px rgba(184, 155, 248, 0.2);
}

.card-glow-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 50% 0%, rgba(184, 155, 248, 0.15), transparent 60%);
  opacity: 0.8;
}

.card-inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 22px 24px;
  box-sizing: border-box;
}

.card-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.card-schedule-time {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--accent, #b89bf8);
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.dot-sep {
  opacity: 0.4;
  margin: 0 1px;
}

.card-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.nearest-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-ink, #070314);
  background: var(--accent, #b89bf8);
  padding: 3px 9px;
  border-radius: 9999px;
  box-shadow: 0 0 12px rgba(184, 155, 248, 0.45);
  white-space: nowrap;
  flex-shrink: 0;
}

.pulse-indicator {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #030712;
  animation: pulse-dot 1.8s infinite ease-in-out;
}

.target-seminar-badge {
  border: 1px solid rgba(56, 189, 248, 0.5);
  background: rgba(56, 189, 248, 0.15);
  color: var(--cyan, #38bdf8);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
}

.cyan-pulse {
  background: var(--cyan, #38bdf8);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.8);
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.5; }
}

.card-topic {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--text, #ffffff);
  margin: 0 0 10px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: 48px;
}

.card-speaker {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--soft, #d9e4e2);
  margin-bottom: 14px;
}

.card-speaker strong {
  color: var(--text, #ffffff);
}

.card-sharing-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(10, 6, 22, 0.55);
  border: 1px solid rgba(184, 155, 248, 0.12);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 16px;
  overflow: hidden;
}

.sharing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sharing-title {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--muted, rgba(255, 255, 255, 0.5));
}

.sharing-count {
  font-size: 10.5px;
  color: var(--accent, #b89bf8);
  background: rgba(184, 155, 248, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
}

.sharing-scroll {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  max-height: 96px;
  padding-right: 2px;
}

.sharing-item {
  font-size: 12px;
  line-height: 1.45;
  color: var(--soft, #e2e8f0);
  background: rgba(255, 255, 255, 0.03);
  padding: 6px 10px;
  border-radius: 8px;
  border-left: 2px solid var(--accent, #b89bf8);
}

.sharing-empty {
  font-size: 12px;
  color: var(--muted, rgba(255, 255, 255, 0.4));
  font-style: italic;
  margin: auto 0;
}

.card-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  color: var(--muted, rgba(255, 255, 255, 0.4));
  margin-bottom: 14px;
}

.meta-time, .meta-location {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-location {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-action-row {
  margin-top: auto;
}

.view-agenda-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 11px 16px;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 600;
  border: 1px solid rgba(184, 155, 248, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text, #ffffff);
  cursor: pointer;
  transition: all 0.25s ease;
}

.view-agenda-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--accent, #b89bf8);
  color: var(--accent, #b89bf8);
  transform: translateY(-1px);
}

.view-agenda-btn.primary-btn {
  background: var(--accent, #b89bf8);
  color: var(--accent-ink, #070314);
  border-color: var(--accent, #b89bf8);
  box-shadow: 0 4px 14px rgba(184, 155, 248, 0.35);
}

.view-agenda-btn.primary-btn:hover {
  background: #d8b4fe;
  border-color: #d8b4fe;
  box-shadow: 0 6px 20px rgba(184, 155, 248, 0.5);
}

.empty-carousel-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted, rgba(255, 255, 255, 0.5));
  text-align: center;
  padding: 60px 24px;
}

.empty-carousel-state h3 {
  color: var(--text, #ffffff);
  margin: 0;
  font-size: 18px;
}

.empty-carousel-state p {
  margin: 0;
  font-size: 13px;
}

/* 底部控制器与指示器 */
.carousel-nav-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-top: 14px;
}

.nav-step-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--panel, rgba(12, 10, 26, 0.85));
  border: 1px solid var(--line, rgba(184, 155, 248, 0.18));
  color: var(--text, #ffffff);
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-step-btn:hover:not(:disabled) {
  background: var(--raised, rgba(184, 155, 248, 0.15));
  border-color: var(--accent, #b89bf8);
  color: var(--accent, #b89bf8);
  transform: scale(1.08);
}

.nav-step-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.carousel-counter {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 5px 14px;
  border-radius: 9999px;
  background: var(--surface, rgba(12, 10, 26, 0.75));
  border: 1px solid var(--line, rgba(184, 155, 248, 0.16));
}

.current-num {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent, #b89bf8);
}

.slash-num {
  font-size: 12px;
  color: var(--muted, rgba(255, 255, 255, 0.4));
}

.total-num {
  font-size: 12px;
  color: var(--muted, rgba(255, 255, 255, 0.6));
}

.jump-nearest-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(184, 155, 248, 0.35);
  background: rgba(184, 155, 248, 0.14);
  color: var(--accent, #b89bf8);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.22s ease;
}

.jump-nearest-btn:hover {
  background: rgba(184, 155, 248, 0.22);
  border-color: var(--accent, #b89bf8);
  box-shadow: 0 0 12px rgba(184, 155, 248, 0.35);
}

@media (max-width: 680px) {
  .carousel-stage {
    height: 460px;
  }
  .carousel-card-3d {
    width: min(92vw, 320px);
    height: 430px;
  }
  .card-inner {
    padding: 18px 20px;
  }
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .carousel-card-3d {
  background: linear-gradient(155deg, rgba(22, 48, 58, 0.94) 0%, rgba(10, 30, 38, 0.98) 100%) !important;
  border-color: rgba(218, 238, 235, 0.16) !important;
}

[data-theme-style="vanta-fog"] .carousel-card-3d.is-active {
  border-color: var(--accent, #c5e6df) !important;
  box-shadow: 
    0 24px 50px rgba(0, 0, 0, 0.65), 
    0 0 32px rgba(197, 230, 223, 0.22),
    inset 0 1px 1px rgba(255, 255, 255, 0.25) !important;
}

[data-theme-style="vanta-fog"] .carousel-card-3d.is-side:hover {
  border-color: rgba(197, 230, 223, 0.5) !important;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.6), 0 0 20px rgba(197, 230, 223, 0.15) !important;
}

[data-theme-style="vanta-fog"] .card-glow-overlay {
  background: radial-gradient(circle at 50% 0%, rgba(197, 230, 223, 0.14), transparent 60%) !important;
}

[data-theme-style="vanta-fog"] .card-schedule-time {
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .nearest-badge {
  color: #0e2b31 !important;
  background: var(--accent, #c5e6df) !important;
  box-shadow: 0 0 10px rgba(197, 230, 223, 0.4) !important;
}

[data-theme-style="vanta-fog"] .pulse-indicator {
  background: #0e2b31 !important;
}

[data-theme-style="vanta-fog"] .card-sharing-box {
  background: rgba(9, 24, 31, 0.55) !important;
  border-color: rgba(218, 238, 235, 0.08) !important;
}

[data-theme-style="vanta-fog"] .sharing-count {
  color: var(--accent, #c5e6df) !important;
  background: rgba(197, 230, 223, 0.1) !important;
}

[data-theme-style="vanta-fog"] .sharing-item {
  border-left-color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .view-agenda-btn {
  border-color: rgba(218, 238, 235, 0.2) !important;
}

[data-theme-style="vanta-fog"] .view-agenda-btn:hover {
  border-color: var(--accent, #c5e6df) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .view-agenda-btn.primary-btn {
  background: var(--accent, #c5e6df) !important;
  color: #0e2b31 !important;
  border-color: var(--accent, #c5e6df) !important;
  box-shadow: 0 4px 14px rgba(197, 230, 223, 0.3) !important;
}

[data-theme-style="vanta-fog"] .view-agenda-btn.primary-btn:hover {
  background: #d8f1ec !important;
  border-color: #d8f1ec !important;
  box-shadow: 0 6px 20px rgba(197, 230, 223, 0.45) !important;
}

[data-theme-style="vanta-fog"] .nav-step-btn {
  background: rgba(22, 48, 58, 0.85) !important;
  border-color: rgba(218, 238, 235, 0.16) !important;
}

[data-theme-style="vanta-fog"] .nav-step-btn:hover:not(:disabled) {
  background: var(--raised, rgba(208, 231, 232, 0.18)) !important;
  border-color: var(--accent, #c5e6df) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .carousel-counter {
  background: rgba(14, 36, 44, 0.75) !important;
  border-color: rgba(218, 238, 235, 0.14) !important;
}

[data-theme-style="vanta-fog"] .current-num {
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .jump-nearest-btn {
  border-color: rgba(197, 230, 223, 0.35) !important;
  background: rgba(197, 230, 223, 0.12) !important;
  color: var(--accent, #c5e6df) !important;
}

[data-theme-style="vanta-fog"] .jump-nearest-btn:hover {
  background: rgba(197, 230, 223, 0.22) !important;
  border-color: var(--accent, #c5e6df) !important;
  box-shadow: 0 0 12px rgba(197, 230, 223, 0.3) !important;
}
</style>
