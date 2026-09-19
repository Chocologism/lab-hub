<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const canvasRef = ref(null)
let animationId = null
let resizeObserver = null

// Parallax tracking
let targetMouseX = 0
let targetMouseY = 0
let currentMouseX = 0
let currentMouseY = 0

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let width = (canvas.width = window.innerWidth)
  let height = (canvas.height = window.innerHeight)
  let dpr = window.devicePixelRatio || 1

  function resize() {
    if (!canvas) return
    width = window.innerWidth
    height = window.innerHeight
    dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(dpr, dpr)
  }
  resize()
  window.addEventListener('resize', resize, { passive: true })

  // Initialize stars in 3D coordinate space
  const STAR_COUNT = width < 768 ? 120 : 260
  const stars = []
  const colors = ['#ffffff', '#fdf4ff', '#e0e7ff', '#fed7aa', '#fbcfe8', '#cbd5e1', '#c7d2fe', '#fde68a']

  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: (Math.random() - 0.5) * width * 2,
      y: (Math.random() - 0.5) * height * 2,
      z: Math.random() * 900 + 100, // Depth (100 to 1000)
      baseSize: Math.random() * 1.6 + 0.6,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: Math.random() * 0.7 + 0.3,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      twinkleOffset: Math.random() * Math.PI * 2,
      depthFactor: Math.random() * 0.7 + 0.3,
    })
  }

  // Shooting stars
  const meteors = []
  function spawnMeteor() {
    if (prefersReducedMotion || meteors.length > 2) return
    const startX = Math.random() * width * 0.9 + width * 0.05
    const startY = Math.random() * height * 0.4
    const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.2
    const speed = Math.random() * 10 + 14
    meteors.push({
      x: startX,
      y: startY,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      length: Math.random() * 90 + 70,
      opacity: 1,
      life: 1,
      decay: Math.random() * 0.015 + 0.015,
    })
  }

  let meteorTimer = setInterval(spawnMeteor, 7000)

  // Mouse move listener
  function onMouseMove(e) {
    targetMouseX = (e.clientX - width / 2) * 0.05
    targetMouseY = (e.clientY - height / 2) * 0.05
  }
  window.addEventListener('mousemove', onMouseMove, { passive: true })

  // Animation Loop
  let time = 0
  function render() {
    if (document.hidden) {
      animationId = requestAnimationFrame(render)
      return
    }

    time += 0.016
    ctx.clearRect(0, 0, width, height)

    // Smooth camera lerp
    if (!prefersReducedMotion) {
      currentMouseX += (targetMouseX - currentMouseX) * 0.04
      currentMouseY += (targetMouseY - currentMouseY) * 0.04
    }

    const cx = width / 2
    const cy = height / 2
    const fov = 450

    // 1. Distant cosmic nebula clouds
    const grad1 = ctx.createRadialGradient(cx + currentMouseX * 0.5, cy + currentMouseY * 0.5, 50, cx, cy, width * 0.7)
    grad1.addColorStop(0, 'rgba(14, 43, 77, 0.22)')
    grad1.addColorStop(0.45, 'rgba(8, 26, 49, 0.12)')
    grad1.addColorStop(1, 'rgba(3, 7, 18, 0)')
    ctx.fillStyle = grad1
    ctx.fillRect(0, 0, width, height)

    const grad2 = ctx.createRadialGradient(cx * 1.4 - currentMouseX * 0.3, cy * 0.6 - currentMouseY * 0.3, 30, cx * 1.4, cy * 0.6, width * 0.45)
    grad2.addColorStop(0, 'rgba(56, 189, 248, 0.09)')
    grad2.addColorStop(0.6, 'rgba(14, 165, 233, 0.02)')
    grad2.addColorStop(1, 'transparent')
    ctx.fillStyle = grad2
    ctx.fillRect(0, 0, width, height)

    // 2. Render 3D Stars
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i]
      if (!prefersReducedMotion) {
        // Slow drifting star movement
        s.z -= 0.12
        if (s.z <= 20) s.z += 900
      }

      const k = fov / (fov + s.z)
      const px = cx + (s.x - currentMouseX * s.depthFactor * 40) * k
      const py = cy + (s.y - currentMouseY * s.depthFactor * 40) * k

      if (px < -20 || px > width + 20 || py < -20 || py > height + 20) continue

      const twinkle = prefersReducedMotion ? 1 : 0.7 + 0.3 * Math.sin(time * 2 + s.twinkleOffset)
      const radius = Math.max(0.4, s.baseSize * k * 1.4)
      const alpha = Math.min(1, Math.max(0.1, s.alpha * k * 1.8 * twinkle))

      ctx.beginPath()
      ctx.arc(px, py, radius, 0, Math.PI * 2)
      ctx.fillStyle = s.color
      ctx.globalAlpha = alpha
      ctx.fill()

      // Occasional faint diffraction cross for brightest near stars
      if (s.baseSize > 1.8 && k > 0.7 && !prefersReducedMotion) {
        ctx.strokeStyle = s.color
        ctx.lineWidth = 0.5
        ctx.globalAlpha = alpha * 0.4
        ctx.beginPath()
        ctx.moveTo(px - radius * 3, py)
        ctx.lineTo(px + radius * 3, py)
        ctx.moveTo(px, py - radius * 3)
        ctx.lineTo(px, py + radius * 3)
        ctx.stroke()
      }
    }

    // 3. Render Shooting Stars / Meteors
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]
      ctx.globalAlpha = m.opacity
      const trailGrad = ctx.createLinearGradient(m.x, m.y, m.x - m.dx * (m.length / 10), m.y - m.dy * (m.length / 10))
      trailGrad.addColorStop(0, '#ffffff')
      trailGrad.addColorStop(0.3, '#7dd3fc')
      trailGrad.addColorStop(1, 'transparent')

      ctx.strokeStyle = trailGrad
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(m.x, m.y)
      ctx.lineTo(m.x - m.dx * (m.length / 12), m.y - m.dy * (m.length / 12))
      ctx.stroke()

      m.x += m.dx
      m.y += m.dy
      m.opacity -= m.decay
      if (m.opacity <= 0 || m.x > width + 200 || m.y > height + 200) {
        meteors.splice(i, 1)
      }
    }

    ctx.globalAlpha = 1
    animationId = requestAnimationFrame(render)
  }

  animationId = requestAnimationFrame(render)

  onBeforeUnmount(() => {
    if (animationId) cancelAnimationFrame(animationId)
    if (meteorTimer) clearInterval(meteorTimer)
    window.removeEventListener('resize', resize)
    window.removeEventListener('mousemove', onMouseMove)
  })
})
</script>

<template>
  <div class="cosmic-canvas-container" aria-hidden="true">
    <canvas ref="canvasRef" class="cosmic-canvas" />
    <div class="cosmic-vignette" />
    <div class="cosmic-stars-grid" />
  </div>
</template>

<style scoped>
.cosmic-canvas-container {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  background: radial-gradient(ellipse 90% 70% at 50% -10%, #161224 0%, #0c0b14 52%, #07070a 100%);
}
.cosmic-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.cosmic-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, transparent 35%, rgba(6, 6, 9, 0.76) 100%);
}
.cosmic-stars-grid {
  position: absolute;
  inset: 0;
  background-image: 
    linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
  background-size: 80px 80px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 85%);
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 85%);
}
</style>
