<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTutorial } from '../composables/useTutorial'
import AppIcon from './AppIcon.vue'

const route = useRoute()
const router = useRouter()

const {
  showTutorial,
  currentStepIndex,
  currentSubStepIndex,
  currentStep,
  currentSubStep,
  currentSubStepList,
  steps,
  totalFlatSteps,
  currentFlatStepIndex,
  flatProgressPercent,
  isMandatory,
  isFirstStep,
  isLastStep,
  progressPercent,
  nextStep,
  prevStep,
  nextSubStep,
  prevSubStep,
  jumpToStep,
  finishTutorial,
  skipTutorial,
} = useTutorial()

const isMinimized = ref(false)
const cardRef = ref(null)
const cardRect = ref({ width: 380, height: 240 })
const targetRect = ref(null)
const targetElement = ref(null)

// 判断当前是否已位于指引的目标功能页面
const isOnTargetRoute = computed(() => {
  const targetRoute = currentSubStep.value?.targetRoute || currentStep.value?.targetRoute
  if (!targetRoute) return true
  if (route.fullPath === targetRoute || route.path === targetRoute) return true

  const [targetPath, queryString] = targetRoute.split('?')
  if (route.path !== targetPath) return false
  if (!queryString) return true

  const searchParams = new URLSearchParams(queryString)
  for (const [k, v] of searchParams.entries()) {
    if (String(route.query[k] || '') !== String(v || '')) {
      return false
    }
  }
  return true
})

// 计算镂空区域坐标与尺寸（适度内边距与圆角）
const spotlightRect = computed(() => {
  if (!targetRect.value) return null
  const padding = 8
  const x = Math.max(0, targetRect.value.left - padding)
  const y = Math.max(0, targetRect.value.top - padding)
  const width = targetRect.value.width + padding * 2
  const height = targetRect.value.height + padding * 2
  const radius = Math.min(14, Math.min(width, height) / 4)
  return { x, y, width, height, radius }
})

// 卡片鼠标自由拖拽交互状态
const dragOffset = ref({ x: 0, y: 0 })
const isDragging = ref(false)
let dragStartPointer = { x: 0, y: 0 }
let dragStartOffset = { x: 0, y: 0 }

function startDrag(e) {
  // 仅响应鼠标左键或触控/压感笔
  if (e.button !== undefined && e.button !== 0) return
  // 若用户点击的是按键、输入框、链接或步骤圆点，不启动拖拽以保障正常点击交互
  if (e.target && e.target.closest && e.target.closest('button, a, input, select, textarea, .dot-item')) return

  isDragging.value = true
  dragStartPointer = { x: e.clientX, y: e.clientY }
  dragStartOffset = { ...dragOffset.value }

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)

  if (typeof document !== 'undefined') {
    document.body.style.userSelect = 'none'
  }
}

function onPointerMove(e) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStartPointer.x
  const dy = e.clientY - dragStartPointer.y
  dragOffset.value = {
    x: dragStartOffset.x + dx,
    y: dragStartOffset.y + dy
  }
}

function endDrag() {
  if (!isDragging.value) return
  isDragging.value = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  if (typeof document !== 'undefined') {
    document.body.style.userSelect = ''
  }
}

function resetDragOffset() {
  dragOffset.value = { x: 0, y: 0 }
}

// 动态计算卡片位置：结合锚点自适应与鼠标自由拖拽，并进行全屏幕边界安全夹紧
const cardPosition = computed(() => {
  if (typeof window === 'undefined') return { top: '50%', left: '50%' }
  
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight
  const cardW = Math.min(cardRect.value.width || 420, viewportW - 32)
  const cardH = Math.min(cardRect.value.height || 310, viewportH - 32)
  
  let baseTop = 0
  let baseLeft = 0

  // 若未找到目标元素，卡片居中展示
  if (!spotlightRect.value) {
    baseTop = Math.max(20, (viewportH - cardH) / 2)
    baseLeft = Math.max(16, (viewportW - cardW) / 2)
  } else {
    const sr = spotlightRect.value
    const gap = 16
    const safeMargin = 16
    const minComfortableH = 290 // 保证卡片有充足高度完整呈现标题、说明、指引及底栏按键

    // 计算各方向剩余可用空间（排除安全边距与间隙）
    const spaceRight = viewportW - (sr.x + sr.width) - gap - safeMargin
    const spaceLeft = sr.x - gap - safeMargin
    const spaceBottom = viewportH - (sr.y + sr.height) - gap - safeMargin
    const spaceTop = sr.y - gap - safeMargin

    const preferredPlacement = currentSubStep.value?.placement || 'auto'

    // 决定放置在哪个方向：优先考虑空间足够容纳卡片的方向
    let chosenSide = 'bottom'

    if (preferredPlacement === 'right' && spaceRight >= cardW) {
      chosenSide = 'right'
    } else if (preferredPlacement === 'bottom' && spaceBottom >= minComfortableH) {
      chosenSide = 'bottom'
    } else if (preferredPlacement === 'top' && spaceTop >= minComfortableH) {
      chosenSide = 'top'
    } else if (preferredPlacement === 'left' && spaceLeft >= cardW) {
      chosenSide = 'left'
    } else {
      // 自动选择空间充裕且不会造成挤压的方向
      if (spaceBottom >= minComfortableH) {
        chosenSide = 'bottom'
      } else if (spaceTop >= minComfortableH) {
        chosenSide = 'top'
      } else if (spaceRight >= cardW) {
        chosenSide = 'right'
      } else if (spaceLeft >= cardW) {
        chosenSide = 'left'
      } else {
        // 空间均受限时，选择垂直方向剩余空间更大的一侧
        chosenSide = spaceBottom >= spaceTop ? 'bottom' : 'top'
      }
    }

    if (chosenSide === 'right') {
      baseLeft = sr.x + sr.width + gap
      baseTop = sr.y + (sr.height - cardH) / 2
      baseTop = Math.max(safeMargin, Math.min(viewportH - cardH - safeMargin, baseTop))
    } else if (chosenSide === 'left') {
      baseLeft = Math.max(safeMargin, sr.x - cardW - gap)
      baseTop = sr.y + (sr.height - cardH) / 2
      baseTop = Math.max(safeMargin, Math.min(viewportH - cardH - safeMargin, baseTop))
    } else if (chosenSide === 'bottom') {
      baseTop = sr.y + sr.height + gap
      if (baseTop + cardH > viewportH - safeMargin) {
        baseTop = Math.max(safeMargin, viewportH - cardH - safeMargin)
      }
      baseLeft = sr.x + (sr.width - cardW) / 2
      baseLeft = Math.max(safeMargin, Math.min(viewportW - cardW - safeMargin, baseLeft))
    } else {
      // 'top'
      baseTop = Math.max(safeMargin, sr.y - cardH - gap)
      baseLeft = sr.x + (sr.width - cardW) / 2
      baseLeft = Math.max(safeMargin, Math.min(viewportW - cardW - safeMargin, baseLeft))
    }
  }

  // 叠加上用户鼠标拖拽的位移量，并限制在屏幕安全视口内，杜绝拖拽脱离屏幕
  const finalTop = baseTop + dragOffset.value.y
  const finalLeft = baseLeft + dragOffset.value.x
  const screenPadding = 8

  const clampTop = Math.max(screenPadding, Math.min(viewportH - cardH - screenPadding, finalTop))
  const clampLeft = Math.max(screenPadding, Math.min(viewportW - cardW - screenPadding, finalLeft))

  return {
    top: `${Math.round(clampTop)}px`,
    left: `${Math.round(clampLeft)}px`,
    width: `${cardW}px`
  }
})

// 定位目标 DOM 元素并平滑滚动聚焦
let findTargetTimer = null

function updateTargetPosition() {
  if (typeof document === 'undefined') return
  const sub = currentSubStep.value
  if (!sub) {
    targetRect.value = null
    targetElement.value = null
    return
  }

  const targetId = sub.targetId
  const targetSelector = sub.targetSelector

  let el = null
  if (targetId) {
    el = document.getElementById(targetId)
  }
  if (!el && targetSelector) {
    try {
      el = document.querySelector(targetSelector)
    } catch {}
  }

  if (el) {
    targetElement.value = el
    const r = el.getBoundingClientRect()
    targetRect.value = {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height
    }

    // 动态测量卡片最新尺寸
    if (cardRef.value) {
      const cr = cardRef.value.getBoundingClientRect()
      if (cr.width && cr.height) {
        cardRect.value = { width: cr.width, height: cr.height }
      }
    }
  } else {
    targetRect.value = null
    targetElement.value = null
  }
}

function scrollToAndHighlightTarget() {
  if (typeof document === 'undefined') return
  if (findTargetTimer) clearTimeout(findTargetTimer)

  nextTick(() => {
    updateTargetPosition()
    if (targetElement.value) {
      targetElement.value.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(updateTargetPosition, 280)
    } else {
      let attempts = 0
      const retry = () => {
        attempts++
        updateTargetPosition()
        if (targetElement.value) {
          targetElement.value.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setTimeout(updateTargetPosition, 250)
        } else if (attempts < 10) {
          findTargetTimer = setTimeout(retry, 100)
        }
      }
      findTargetTimer = setTimeout(retry, 80)
    }
  })
}

// 强制当前页面与教程步骤严格对齐（无论通过点击、下一步、上一步或跳转）
function enforceTargetRoute() {
  if (!showTutorial.value) return
  const sub = currentSubStep.value
  const targetRoute = sub?.targetRoute || currentStep.value?.targetRoute
  if (!targetRoute) return

  const targetPath = targetRoute.split('?')[0]
  const targetQuery = {}
  if (targetRoute.includes('?')) {
    const searchParams = new URLSearchParams(targetRoute.split('?')[1])
    for (const [k, v] of searchParams.entries()) {
      targetQuery[k] = v
    }
  }

  const pathMatches = route.path === targetPath
  const queryMatches = Object.keys(targetQuery).every(k => String(route.query[k] || '') === String(targetQuery[k] || ''))

  if (!pathMatches || !queryMatches) {
    router.replace(targetRoute).catch(() => {})
  }
}

// 监听步骤变化及路由变化触发聚光、强制页面对齐，并自动复位拖拽偏移量
watch([() => currentStepIndex.value, () => currentSubStepIndex.value], () => {
  resetDragOffset()
  if (showTutorial.value) {
    enforceTargetRoute()
    scrollToAndHighlightTarget()
  }
}, { immediate: true })

watch(() => showTutorial.value, (active) => {
  if (active) {
    enforceTargetRoute()
    scrollToAndHighlightTarget()
  }
})

watch(() => route.fullPath, () => {
  if (showTutorial.value) {
    enforceTargetRoute()
    scrollToAndHighlightTarget()
  }
})

// 监听窗口滚动与尺寸变化
function onWindowActivity() {
  if (showTutorial.value) {
    requestAnimationFrame(updateTargetPosition)
  }
}

// 目标元素点击处理：仅在明确要求用户点击高亮区域的步骤下推进
function handleTargetHoleClick(event) {
  if (event) {
    event.stopPropagation()
    event.preventDefault()
  }
  const sub = currentSubStep.value
  if (!sub) return

  // 对于无需点击高亮区域即可进入下一步的步骤：
  // 屏蔽点击事件，即使用户点击高亮区域也无事发生，只有点击卡片中的【下一步】按钮才可以继续
  if (!sub.requiresClick) {
    return
  }

  if (targetElement.value) {
    try {
      targetElement.value.click()
    } catch {}
  }

  nextSubStep()
  enforceTargetRoute()
}

// 卡片主操作按钮点击
function handlePrimaryAction() {
  if (isLastStep.value) {
    finishTutorial()
  } else {
    if (currentSubStep.value?.requiresClick && targetElement.value) {
      try { targetElement.value.click() } catch {}
    }
    nextSubStep()
    enforceTargetRoute()
  }
}

// 卡片上一步按钮点击
function handlePrevAction() {
  if (isFirstStep.value) return
  prevSubStep()
  enforceTargetRoute()
}

// 键盘快捷键响应
function handleKeydown(e) {
  if (!showTutorial.value) return
  if (e.key === 'ArrowRight' || e.key === 'Enter') {
    // 对于需要点击操作的教程步骤，不提供键盘按键跳过，必须由用户在页面中点击高亮区域推进
    if (currentSubStep.value?.requiresClick) {
      return
    }
    handlePrimaryAction()
  } else if (e.key === 'ArrowLeft') {
    handlePrevAction()
  } else if (e.key === 'Escape') {
    if (!isMandatory.value) {
      finishTutorial()
    } else {
      isMinimized.value = !isMinimized.value
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', onWindowActivity, { passive: true })
  window.addEventListener('scroll', onWindowActivity, { passive: true, capture: true })
  if (showTutorial.value) {
    scrollToAndHighlightTarget()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', onWindowActivity)
  window.removeEventListener('scroll', onWindowActivity, { capture: true })
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  if (typeof document !== 'undefined') {
    document.body.style.userSelect = ''
  }
  if (findTargetTimer) clearTimeout(findTargetTimer)
})
</script>

<template>
  <Transition name="tutorial-fade">
    <div 
      v-if="showTutorial" 
      class="tutorial-overlay tutorial-tour-container" 
      :class="{ 'is-mandatory': isMandatory, 'is-minimized': isMinimized }"
    >
      <!-- 最小化时的浮动快捷胶囊 -->
      <div 
        v-if="isMinimized" 
        class="tour-minimized-pill" 
        role="button" 
        tabindex="0"
        title="点击展开新手实景互动导览"
        @click="isMinimized = false"
      >
        <span class="pulsing-badge-dot"></span>
        <AppIcon :name="currentStep.isAdmin ? 'shield' : 'sparkles'" class="pill-icon" />
        <span class="pill-title">实景导览中：{{ currentSubStep?.title || currentStep.title }}</span>
        <span class="pill-expand-hint">点击展开</span>
      </div>

      <!-- 展开时的全屏遮罩与聚光灯效果 -->
      <template v-else>
        <!-- 4块物理非重叠遮罩面板：彻底杜绝高亮目标区域被滤镜灰度污染 -->
        <div v-if="spotlightRect" class="tour-backdrop-quad" aria-hidden="true">
          <!-- 上方遮罩 -->
          <div
            class="tour-backdrop-block tour-backdrop-tint tour-backdrop-top"
            :style="{
              top: '0px',
              left: '0px',
              width: '100vw',
              height: `${spotlightRect.y}px`
            }"
          ></div>
          <!-- 下方遮罩 -->
          <div
            class="tour-backdrop-block tour-backdrop-tint tour-backdrop-bottom"
            :style="{
              top: `${spotlightRect.y + spotlightRect.height}px`,
              left: '0px',
              width: '100vw',
              height: `calc(100vh - ${spotlightRect.y + spotlightRect.height}px)`
            }"
          ></div>
          <!-- 左侧遮罩 -->
          <div
            class="tour-backdrop-block tour-backdrop-tint tour-backdrop-left"
            :style="{
              top: `${spotlightRect.y}px`,
              left: '0px',
              width: `${spotlightRect.x}px`,
              height: `${spotlightRect.height}px`
            }"
          ></div>
          <!-- 右侧遮罩 -->
          <div
            class="tour-backdrop-block tour-backdrop-tint tour-backdrop-right"
            :style="{
              top: `${spotlightRect.y}px`,
              left: `${spotlightRect.x + spotlightRect.width}px`,
              width: `calc(100vw - ${spotlightRect.x + spotlightRect.width}px)`,
              height: `${spotlightRect.height}px`
            }"
          ></div>
        </div>
        <!-- 无聚焦目标时的全屏遮罩 -->
        <div v-else class="tour-backdrop-block tour-backdrop-tint tour-backdrop-full" aria-hidden="true"></div>

        <!-- 辅助 SVG 结构（保持规范与兼容） -->
        <svg class="tour-backdrop-svg sr-only" aria-hidden="true">
          <defs>
            <mask id="tour-spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="#ffffff" />
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" class="tour-backdrop-tint" mask="url(#tour-spotlight-mask)" />
        </svg>

        <!-- 高亮区域外周呼吸发光环（边界高亮，内部完全透明透光） -->
        <div
          v-if="spotlightRect"
          class="tour-spotlight-ring"
          :style="{
            left: `${spotlightRect.x}px`,
            top: `${spotlightRect.y}px`,
            width: `${spotlightRect.width}px`,
            height: `${spotlightRect.height}px`,
            borderRadius: `${spotlightRect.radius}px`
          }"
        >
          <div class="tour-spotlight-pulse"></div>
        </div>

        <!-- 目标区域交互代理层：仅在明确要求点击时穿透推进，无需点击时屏蔽防护（即使用户点击也无事发生） -->
        <div
          v-if="spotlightRect"
          class="tour-target-click-proxy"
          :class="{ 
            'is-clickable': currentSubStep?.requiresClick, 
            'is-inert': !currentSubStep?.requiresClick 
          }"
          :title="currentSubStep?.requiresClick ? (currentSubStep?.actionPrompt || '请在页面中点击高亮区域') : ''"
          :style="{
            left: `${spotlightRect.x}px`,
            top: `${spotlightRect.y}px`,
            width: `${spotlightRect.width}px`,
            height: `${spotlightRect.height}px`,
            borderRadius: `${spotlightRect.radius}px`
          }"
          @click.stop.prevent="handleTargetHoleClick"
        ></div>

        <!-- 随目标位置动态吸附且支持鼠标自由拖拽的精简提示卡片 -->
        <div 
          ref="cardRef" 
          class="tutorial-card tour-floating-card" 
          :class="{ 'is-dragging': isDragging, 'has-dragged': dragOffset.x !== 0 || dragOffset.y !== 0 }"
          :style="cardPosition"
          @click.stop
        >
          <!-- 顶部状态与控制栏 (极简单行排版，无拥挤换行) -->
          <div 
            class="tutorial-top-bar"
            title="双击可恢复默认位置"
            @pointerdown="startDrag"
            @dblclick="resetDragOffset"
          >
            <div class="tutorial-step-badge" :class="{ 'admin-badge': currentStep.isAdmin }">
              <AppIcon :name="currentStep.isAdmin ? 'shield' : 'sparkles'" :size="12" class="badge-icon" />
              <span class="badge-tag-text">{{ currentStep.tag }}</span>
              <span class="substep-badge-tag">
                {{ currentSubStepList.length > 1 ? `${currentSubStepIndex + 1}/${currentSubStepList.length}` : `${currentStepIndex + 1}/${steps.length}` }}
              </span>
            </div>

            <div class="top-bar-right-controls" @pointerdown.stop>
              <!-- 跳过新手引导快捷文字按键（精简为“跳过”） -->
              <button
                type="button"
                class="skip-tour-text-btn"
                title="随时跳过新手引导"
                @click="skipTutorial"
              >
                跳过
              </button>

              <!-- 最小化卡片按钮 -->
              <button 
                type="button" 
                class="control-icon-btn" 
                title="收起导览" 
                aria-label="收起导览" 
                @click="isMinimized = true"
              >
                <AppIcon name="minus" :size="13" class="control-icon" />
              </button>

              <!-- 非强制教程时允许随时关闭 -->
              <button 
                v-if="!isMandatory" 
                type="button" 
                class="close-button control-icon-btn" 
                aria-label="关闭教程" 
                title="关闭导览"
                @click="finishTutorial"
              >
                <AppIcon name="x" :size="13" class="close-icon" />
              </button>
            </div>
          </div>

          <!-- 进度条 -->
          <div class="progress-track">
            <div 
              class="progress-fill" 
              :class="{ 'admin-fill': currentStep.isAdmin }"
              :style="{ width: `${flatProgressPercent}%` }"
            ></div>
          </div>

          <!-- 仅在非目标路由过渡时呈现极简轻量提示，避免与主体标题双重冗余 -->
          <div 
            v-if="!isOnTargetRoute" 
            class="tour-status-banner banner-nav-guide"
          >
            <div class="status-indicator">
              <span class="status-pulsing-dot"></span>
              <span class="status-text">
                正在前往目标页面…
              </span>
            </div>
          </div>

          <!-- 主体内容卡片（精简去冗余） -->
          <div class="tutorial-body tour-card-body">
            <div class="icon-stage" :class="{ 'admin-stage': currentStep.isAdmin }">
              <AppIcon :name="currentStep.icon || 'info'" class="stage-icon" />
            </div>

            <div class="content-stage">
              <h2 class="step-title">{{ currentSubStep?.title || currentStep.title }}</h2>
              <p v-if="currentSubStep?.subtitle" class="step-subtitle">{{ currentSubStep.subtitle }}</p>
              
              <div class="step-description">
                {{ currentSubStep?.description || currentStep.description }}
              </div>

              <!-- 互动操作指引盒 -->
              <div v-if="currentSubStep?.actionPrompt || currentSubStep?.purposeNote" class="tour-action-guide-box">
                <div v-if="currentSubStep.purposeNote" class="guide-purpose-row">
                  <span class="guide-label">功能定位：</span>
                  <span class="guide-text">{{ currentSubStep.purposeNote }}</span>
                </div>
                <div v-if="currentSubStep.actionPrompt" class="guide-action-row">
                  <span class="guide-label">操作指引：</span>
                  <span class="guide-text highlight-action">{{ currentSubStep.actionPrompt }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 辅助清单结构（保持兼容） -->
          <div v-if="!currentSubStep?.actionPrompt && currentStep.keyHighlights && currentStep.keyHighlights.length" class="tour-highlights-box">
            <div class="highlights-box-title">
              <AppIcon name="eye" :size="14" />
              <span>本模块关键要点：</span>
            </div>
            <ul class="highlights-list">
              <li v-for="(hl, hIdx) in currentStep.keyHighlights" :key="hIdx" class="highlight-item">
                <span class="hl-check-icon">✓</span>
                <span class="hl-text">{{ hl }}</span>
              </li>
            </ul>
          </div>

          <!-- 步骤小圆点快速定位 -->
          <div class="dots-nav">
            <button
              v-for="(s, idx) in steps"
              :key="s.id"
              type="button"
              class="dot-item"
              :class="{ active: idx === currentStepIndex, 'admin-dot': s.isAdmin }"
              :aria-label="`跳转到第 ${idx + 1} 步: ${s.title}`"
              @click="jumpToStep(idx)"
            ></button>
          </div>

          <!-- 底部主控操作栏 -->
          <div class="tutorial-footer tour-card-footer">
            <div class="footer-left-actions">
              <button
                type="button"
                class="btn-skip-tour button ghost small"
                title="跳过新手引导并标记为已完成"
                @click="skipTutorial"
              >
                跳过
              </button>
            </div>

            <div class="nav-button-group">
              <button 
                v-if="!isFirstStep"
                type="button" 
                class="button secondary btn-step-prev" 
                @click="handlePrevAction"
              >
                上一步
              </button>

              <!-- 对于需要点击操作的教程步骤，不提供下一步按钮，改为页面点击引导提示 -->
              <div
                v-if="currentSubStep?.requiresClick"
                class="tour-click-require-indicator"
                title="请在页面中点击高亮区域以继续"
              >
                <span class="click-pulse-dot"></span>
                <span class="click-indicator-text">请在页面中点击高亮区域</span>
              </div>

              <!-- 仅在无需强制点击的步骤中提供【下一步】按钮 -->
              <button 
                v-else
                type="button" 
                class="button primary btn-step-next"
                :class="{ 
                  'btn-navigate-target': !isOnTargetRoute, 
                  'btn-ready-next': isOnTargetRoute,
                  'admin-btn-primary': currentStep.isAdmin 
                }"
                @click="handlePrimaryAction"
              >
                <template v-if="isLastStep">
                  <span>完成引导</span>
                  <AppIcon name="check" :size="16" />
                </template>
                <template v-else>
                  <span>下一步</span>
                  <AppIcon name="right" :size="16" />
                </template>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
/* 全屏半透明遮罩容器 */
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
}

/* 4块物理非重叠灰度遮罩面板：只对高亮之外的区域应用灰度与暗色滤镜 */
.tour-backdrop-block,
.tour-backdrop-tint {
  position: fixed;
  background: rgba(8, 12, 24, 0.72);
  backdrop-filter: grayscale(85%) brightness(0.62);
  -webkit-backdrop-filter: grayscale(85%) brightness(0.62);
  pointer-events: auto;
  cursor: default;
  z-index: 10;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.tour-backdrop-full {
  inset: 0;
  width: 100vw;
  height: 100vh;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* 高亮区域聚光呼吸发光环 */
.tour-spotlight-ring {
  position: fixed;
  z-index: 20;
  pointer-events: none;
  border: 2px solid #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.25), 0 0 28px rgba(56, 189, 248, 0.6), inset 0 0 10px rgba(56, 189, 248, 0.15);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  animation: spotlightBreathe 2.4s ease-in-out infinite;
}

@keyframes spotlightBreathe {
  0%, 100% {
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.22), 0 0 20px rgba(56, 189, 248, 0.5), inset 0 0 8px rgba(56, 189, 248, 0.15);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(56, 189, 248, 0.35), 0 0 36px rgba(56, 189, 248, 0.8), inset 0 0 16px rgba(56, 189, 248, 0.25);
  }
}

/* 目标区域真实交互代理层 */
.tour-target-click-proxy {
  position: fixed;
  z-index: 25;
  pointer-events: auto;
  background: transparent;
}

.tour-target-click-proxy.is-clickable {
  cursor: pointer;
}

.tour-target-click-proxy.is-inert {
  cursor: default;
}

/* 随目标动态定位的浮动提示卡片 (高对比度深色高质感面板，支持自由拖拽) */
.tour-floating-card {
  position: fixed;
  z-index: 40;
  pointer-events: auto;
  background: #0f172a !important;
  color: #ffffff !important;
  border: 2px solid #38bdf8 !important;
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(56, 189, 248, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-width: 440px;
  min-width: 340px;
  min-height: 280px;
  max-height: calc(100vh - 32px);
  touch-action: none;
  transition: top 0.24s cubic-bezier(0.16, 1, 0.3, 1), left 0.24s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease, box-shadow 0.2s ease;
}

.tour-floating-card.is-dragging {
  transition: none !important;
  box-shadow: 0 32px 75px rgba(0, 0, 0, 0.98), 0 0 50px rgba(56, 189, 248, 0.55) !important;
  cursor: grabbing !important;
  user-select: none !important;
}

/* 最小化药丸胶囊 */
.tour-minimized-pill {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 99999;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-radius: 9999px;
  background: #0f172a;
  border: 2px solid #38bdf8;
  color: #ffffff;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.4);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tour-minimized-pill:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7), 0 0 28px rgba(56, 189, 248, 0.6);
}

.pulsing-badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 10px #38bdf8;
  animation: badgeBlink 1.5s infinite;
}

@keyframes badgeBlink {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

.pill-icon {
  color: #38bdf8;
}

.pill-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pill-expand-hint {
  font-size: 12px;
  color: #38bdf8;
  font-weight: 500;
}

/* 顶部状态与控制栏（极简单行排版，无拥挤换行，支持鼠标拖动） */
.tutorial-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(15, 23, 42, 0.96);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  cursor: grab;
  user-select: none;
  flex-wrap: nowrap;
}

.tutorial-top-bar:active,
.is-dragging .tutorial-top-bar {
  cursor: grabbing;
}

.tutorial-step-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.tutorial-step-badge.admin-badge {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

.badge-tag-text {
  white-space: nowrap;
}

.substep-badge-tag {
  background: rgba(255, 255, 255, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  color: #ffffff;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.top-bar-right-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  white-space: nowrap;
}

.skip-tour-text-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.skip-tour-text-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.control-icon-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.control-icon-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

/* 进度条 */
.progress-track {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0ea5e9, #38bdf8);
  box-shadow: 0 0 8px #38bdf8;
  transition: width 0.3s ease;
}

.progress-fill.admin-fill {
  background: linear-gradient(90deg, #d97706, #fbbf24);
  box-shadow: 0 0 8px #fbbf24;
}

/* 状态横幅（支持鼠标拖动） */
.tour-status-banner {
  padding: 6px 16px;
  font-size: 11px;
  background: rgba(56, 189, 248, 0.08);
  border-bottom: 1px solid rgba(56, 189, 248, 0.15);
  cursor: grab;
  user-select: none;
}

.tour-status-banner:active,
.is-dragging .tour-status-banner {
  cursor: grabbing;
}

.tour-status-banner.banner-nav-guide {
  background: rgba(245, 158, 11, 0.1);
  border-bottom-color: rgba(245, 158, 11, 0.2);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-pulsing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
}

.status-pulsing-dot.dot-ready {
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.status-text {
  color: #e2e8f0;
}

/* 主体内容 */
.tour-card-body {
  padding: 16px 18px;
  display: flex;
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 140px;
}

.icon-stage {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #38bdf8;
}

.icon-stage.admin-stage {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.35);
  color: #fbbf24;
}

.stage-icon {
  width: 20px;
  height: 20px;
}

.content-stage {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 2px;
  color: #ffffff;
  line-height: 1.35;
}

.step-subtitle {
  font-size: 11px;
  color: #94a3b8;
  margin: 0 0 6px;
  line-height: 1.35;
}

.step-description {
  font-size: 12px;
  line-height: 1.55;
  color: #cbd5e1;
  margin-bottom: 8px;
}

/* 互动操作与目的指引框 */
.tour-action-guide-box {
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 8px;
  padding: 8px 10px;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.guide-purpose-row,
.guide-action-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 11px;
  line-height: 1.45;
}

.guide-label {
  font-weight: 600;
  color: #94a3b8;
  flex-shrink: 0;
}

.guide-text {
  color: #e2e8f0;
}

.highlight-action {
  color: #38bdf8;
  font-weight: 600;
}

/* 辅助清单 */
.tour-highlights-box {
  margin: 0 16px 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.highlights-box-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 4px;
}

.highlights-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.highlight-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #cbd5e1;
}

.hl-check-icon {
  color: #10b981;
  font-weight: 700;
  font-size: 11px;
}

/* 小圆点快速导航 */
.dots-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 0 8px;
  flex-shrink: 0;
}

.dot-item {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dot-item.active {
  width: 16px;
  background: #38bdf8;
  box-shadow: 0 0 6px #38bdf8;
}

.dot-item.admin-dot.active {
  background: #fbbf24;
  box-shadow: 0 0 6px #fbbf24;
}

/* 底部操作按钮 */
.tour-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(15, 23, 42, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  box-sizing: border-box;
}

.footer-left-actions {
  flex-shrink: 0;
}

.btn-skip-tour {
  color: #94a3b8 !important;
  font-size: 11px;
  padding: 4px 6px;
  white-space: nowrap;
}

.btn-skip-tour:hover {
  color: #ffffff !important;
}

.nav-button-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  white-space: nowrap;
}

.btn-step-prev {
  white-space: nowrap;
  flex-shrink: 0;
  padding: 6px 12px;
  font-size: 12px;
}

.btn-step-next {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 6px 14px;
  background: #0284c7 !important;
  color: #ffffff !important;
  border: 1px solid #38bdf8 !important;
}

.btn-step-next:hover {
  background: #0369a1 !important;
}

.admin-btn-primary {
  background: #d97706 !important;
  border-color: #fbbf24 !important;
}

/* 需要点击操作时的交互指示标签（替代下一步按钮） */
.tour-click-require-indicator {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px dashed rgba(56, 189, 248, 0.5);
  color: #38bdf8;
  font-size: 12px;
  font-weight: 600;
  user-select: none;
  animation: pulseIndicator 2.2s infinite ease-in-out;
}

@keyframes pulseIndicator {
  0%, 100% {
    border-color: rgba(56, 189, 248, 0.4);
    background: rgba(56, 189, 248, 0.12);
  }
  50% {
    border-color: rgba(56, 189, 248, 0.9);
    background: rgba(56, 189, 248, 0.22);
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);
  }
}

.click-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 8px #38bdf8;
  animation: badgeBlink 1.4s infinite;
  flex-shrink: 0;
}

.click-indicator-text {
  letter-spacing: 0.02em;
}

/* 动画过渡 */
.tutorial-fade-enter-active,
.tutorial-fade-leave-active {
  transition: opacity 0.25s ease;
}

.tutorial-fade-enter-from,
.tutorial-fade-leave-to {
  opacity: 0;
}
</style>
