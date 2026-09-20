<template>
  <main class="login-page">
    <div class="login-container">
      <!-- 外部团组品牌标题 -->
      <header class="login-brand-header">
        <div class="brand-badge-wrap">
          <a
            href="https://github.com/Chocologism/lab-orbit"
            target="_blank"
            rel="noopener noreferrer"
            class="brand-logo-emblem"
            title="访问 GitHub 开源仓库 (LabOrbit)"
            aria-label="访问 GitHub 开源仓库 (LabOrbit)"
          >
            <img src="/assets/LO_logo.svg" alt="LabOrbit Logo" class="brand-logo-img" />
          </a>
          <h1 class="brand-name">{{ siteConfig.labName }}</h1>
        </div>
        <p class="brand-subtitle">{{ siteConfig.siteSlogan || '文献、组会排期与研习资料高效协作' }}</p>
      </header>

      <!-- 模式切换开关（afraid-cougar-9 风格） -->
      <div class="card-switch">
        <div class="switch-wrapper">
          <button 
            type="button" 
            class="switch-side" 
            :class="{ active: !isRegister }" 
            @click="isRegister = false"
          >
            登录
          </button>
          <label class="switch">
            <input type="checkbox" class="toggle" v-model="isRegister" aria-label="切换登录与注册" />
            <span class="slider"></span>
          </label>
          <button 
            type="button" 
            class="switch-side" 
            :class="{ active: isRegister }" 
            @click="isRegister = true"
          >
            注册
          </button>
        </div>
      </div>

      <!-- 3D 翻转卡片核心（afraid-cougar-9 动效） -->
      <div class="flip-card">
        <div 
          class="flip-card__inner" 
          :class="{ 'is-flipped': isRegister, 'has-error': Boolean(errorMsg) }"
        >
          <!-- 正面：登录表单 -->
          <section class="flip-card__front">
            <h2 class="card-title">欢迎登录</h2>
            <p v-if="errorMsg && !isRegister" class="form-error">{{ errorMsg }}</p>

            <form class="auth-form" @submit.prevent="handleLogin">
              <WaveInput
                v-model="loginForm.email"
                label="电子邮箱"
                type="email"
                required
                autocomplete="username"
              />
              <WaveInput
                v-model="loginForm.password"
                label="密码"
                type="password"
                required
                autocomplete="current-password"
              />
              <button class="button button-primary submit-btn" :disabled="loading">
                {{ loading ? '验证中…' : '登录并继续' }}
              </button>
              <button
                v-if="isDemo"
                type="button"
                class="button button-secondary demo-direct-btn"
                @click="enterDemoMode"
              >
                🚀 免密一键体验 (进入演示工作台)
              </button>
            </form>
          </section>

          <!-- 背面：注册表单 -->
          <section class="flip-card__back">
            <h2 class="card-title">加入系统</h2>
            <p v-if="errorMsg && isRegister" class="form-error">{{ errorMsg }}</p>

            <form class="auth-form" @submit.prevent="handleRegister">
              <WaveInput
                v-model="regForm.name"
                label="真实姓名"
                required
                autocomplete="name"
              />
              <WaveInput
                v-model="regForm.nickname"
                label="昵称（选填，页面显示）"
                maxlength="50"
                autocomplete="nickname"
              />
              <WaveInput
                v-model="regForm.email"
                label="电子邮箱"
                type="email"
                required
                autocomplete="email"
                hint="请输入学术机构或常用个人邮箱"
              />
              <WaveInput
                v-model="regForm.password"
                label="设置密码"
                type="password"
                required
                autocomplete="new-password"
                hint="至少 6 位密码"
              />

              <!-- 密码安全等级评估（但不作强制） -->
              <div v-if="regForm.password" class="password-strength-box">
                <div class="strength-bar-track">
                  <div
                    class="strength-bar-fill"
                    :class="passwordScore.class"
                    :style="{ width: passwordScore.width }"
                  ></div>
                </div>
                <div class="strength-info-row">
                  <span class="strength-badge" :class="passwordScore.class">
                    安全等级：{{ passwordScore.label }}
                  </span>
                  <span class="strength-hint">{{ passwordScore.text }}</span>
                </div>
              </div>

              <WaveInput
                v-model="regForm.confirm_password"
                label="确认密码"
                type="password"
                required
                autocomplete="new-password"
                hint="请再次输入密码以确保一致"
              />
              <WaveInput
                v-model="regForm.invite_code"
                label="注册邀请码"
                required
                hint="请输入团队提供的注册邀请码"
              />
              <button class="button button-primary submit-btn" :disabled="loading">
                {{ loading ? '验证中…' : '注册并进入' }}
              </button>
            </form>
          </section>
        </div>
      </div>

    </div>
  </main>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '../api/client'
import WaveInput from '../components/WaveInput.vue'
import { useSiteConfig } from '../composables/useSiteConfig'
import { isDemoMode, initDemoAuth } from '../mock/isDemo'

const isDemo = computed(() => isDemoMode())

function enterDemoMode() {
  initDemoAuth()
  router.push('/')
}

const { siteConfig } = useSiteConfig()
const router = useRouter()
const route = useRoute()
const isRegister = ref(false)
const loading = ref(false)
const errorMsg = ref('')

const loginForm = ref({ email: '', password: '' })
const regForm = ref({ name: '', nickname: '', email: '', password: '', confirm_password: '', invite_code: '' })

// 密码安全等级评估（但不作强制，仅作提示指导）
const passwordScore = computed(() => {
  const pwd = regForm.value.password || ''
  if (!pwd) return { level: 0, label: '', class: '', width: '0%', text: '' }

  let score = 0
  if (pwd.length >= 6) score += 1
  if (pwd.length >= 8) score += 1
  if (pwd.length >= 12) score += 1
  if (/[0-9]/.test(pwd)) score += 1
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1

  if (score <= 2) {
    return {
      level: 1,
      label: '弱',
      class: 'weak',
      width: '25%',
      text: '强度偏低（建议混合大小写字母、数字及符号）'
    }
  } else if (score <= 3) {
    return {
      level: 2,
      label: '中等',
      class: 'medium',
      width: '50%',
      text: '强度适中（可添加大写字母或符号以增强）'
    }
  } else if (score <= 4) {
    return {
      level: 3,
      label: '良好',
      class: 'strong',
      width: '75%',
      text: '密码安全，防护强度较高'
    }
  } else {
    return {
      level: 4,
      label: '极强',
      class: 'very-strong',
      width: '100%',
      text: '密码复杂度优秀，安全性极高'
    }
  }
})

watch(isRegister, () => {
  errorMsg.value = ''
})

const remember = (data) => {
  localStorage.setItem('labhub_token', data.access_token)
  localStorage.setItem('labhub_user', JSON.stringify(data.user))
  localStorage.setItem('sidebar_collapsed', 'true')
}

const handleLogin = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await authApi.login(loginForm.value.email, loginForm.value.password)
    remember(data)
    router.push(route.query.redirect || '/')
  } catch (error) {
    errorMsg.value = error.message
  } finally {
    loading.value = false
  }
}

const handleRegister = async () => {
  if (regForm.value.password !== regForm.value.confirm_password) {
    errorMsg.value = '两次输入的密码不一致，请重新确认'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await authApi.register(
      regForm.value.name,
      regForm.value.nickname,
      regForm.value.email,
      regForm.value.password,
      regForm.value.invite_code
    )
    remember(data)
    router.push('/')
  } catch (error) {
    errorMsg.value = error.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  display: flex;
  min-height: 100dvh;
  justify-content: center;
  align-items: center;
  align-items: safe center;
  padding: 36px 16px;
  background: transparent;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
}

.login-container {
  position: relative;
  z-index: 10;
  width: min(100%, 420px);
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 1. 外部品牌标题 */
.login-brand-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 22px;
}

.brand-badge-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-bottom: 8px;
}

.brand-logo-emblem {
  width: 64px;
  height: 64px;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(187, 144, 252, 0.25) 0%, rgba(12, 10, 26, 0.88) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid rgba(187, 144, 252, 0.5);
  box-shadow: 0 0 28px rgba(192, 132, 252, 0.5), 0 4px 14px rgba(0, 0, 0, 0.5);
  flex-shrink: 0;
  padding: 8px;
  box-sizing: border-box;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.28s ease, border-color 0.28s ease;
}

.brand-logo-emblem:hover {
  transform: scale(1.08) rotate(5deg);
  border-color: rgba(220, 185, 255, 0.85);
  box-shadow: 0 0 36px rgba(192, 132, 252, 0.75), 0 6px 18px rgba(0, 0, 0, 0.6);
}

.brand-logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(187, 144, 252, 0.5));
}

.brand-name {
  font-size: 19px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.brand-subtitle {
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 0.01em;
}

/* 2. 切换开关（afraid-cougar-9 风格） */
.card-switch {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 24px;
}

.switch-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  padding: 6px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 9999px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.switch-side {
  background: transparent;
  border: 0;
  padding: 4px 6px;
  color: var(--muted);
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color 0.25s ease;
}

.switch-side:hover {
  color: var(--text);
}

.switch-side.active {
  color: var(--text);
  font-weight: 600;
}

.switch-side.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 6px;
  right: 6px;
  height: 2px;
  background: var(--accent);
  border-radius: 2px;
  box-shadow: 0 0 8px rgba(184, 155, 248, 0.6);
}

.switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
  cursor: pointer;
  margin: 0;
}

.switch input.toggle {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.slider {
  position: absolute;
  inset: 0;
  background-color: rgba(10, 6, 20, 0.85);
  border: 1.5px solid var(--line);
  border-radius: 9999px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
}

.slider::before {
  content: "";
  position: absolute;
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 2.5px;
  background: linear-gradient(135deg, var(--accent) 0%, #c084fc 100%);
  border-radius: 50%;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);
  transition: transform 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.toggle:checked + .slider {
  background-color: rgba(184, 155, 248, 0.18);
  border-color: var(--accent);
}

.toggle:checked + .slider::before {
  transform: translateX(23px);
  background: linear-gradient(135deg, #ffffff 0%, var(--accent) 100%);
  box-shadow: 0 0 10px rgba(184, 155, 248, 0.7);
}

/* 3. 3D 翻转卡片核心 (afraid-cougar-9) */
.flip-card {
  width: 100%;
  perspective: 1200px;
  -webkit-perspective: 1200px;
}

.flip-card__inner {
  position: relative;
  width: 100%;
  height: 380px;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
  transition: transform 0.75s cubic-bezier(0.4, 0.2, 0.2, 1), height 0.45s ease;
}

.flip-card__inner.is-flipped {
  transform: rotateY(180deg);
  -webkit-transform: rotateY(180deg);
  height: 860px;
}

.flip-card__inner.has-error {
  height: 425px;
}

.flip-card__inner.is-flipped.has-error {
  height: 910px;
}

.flip-card__front,
.flip-card__back {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 32px 32px 36px;
  border: 1px solid var(--line, rgba(184, 155, 248, 0.22));
  border-radius: 20px;
  background: var(--panel, rgba(12, 10, 26, 0.88));
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: 0 24px 60px -8px rgba(0, 0, 0, 0.75), 0 0 0 1px var(--raised, rgba(184, 155, 248, 0.08)) inset;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.flip-card__back {
  overflow: visible;
}

/* 兼容 Safari/WebKit：在翻转中途（0.35s）无缝切换 visibility 与 opacity，杜绝镜像重影与点击碰撞劫持 */
.flip-card__front {
  transform: rotateY(0deg) translateZ(1px);
  -webkit-transform: rotateY(0deg) translateZ(1px);
  pointer-events: auto;
  visibility: visible;
  opacity: 1;
  transition: visibility 0s linear 0s, opacity 0.25s ease;
}

.flip-card__back {
  transform: rotateY(180deg) translateZ(1px);
  -webkit-transform: rotateY(180deg) translateZ(1px);
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
  transition: visibility 0s linear 0.35s, opacity 0.25s ease;
}

.flip-card__inner.is-flipped .flip-card__front {
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
  transition: visibility 0s linear 0.35s, opacity 0.25s ease;
}

.flip-card__inner.is-flipped .flip-card__back {
  pointer-events: auto;
  visibility: visible;
  opacity: 1;
  transition: visibility 0s linear 0.35s, opacity 0.25s ease;
}

.card-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  margin-bottom: 6px;
  text-align: center;
}

.auth-form {
  display: grid;
  margin-top: 4px;
}

/* 密码强度指示器 */
.password-strength-box {
  margin: -2px 0 10px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.strength-bar-track {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.strength-bar-fill {
  height: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
  border-radius: 2px;
}

.strength-bar-fill.weak {
  background-color: #ef4444;
}

.strength-bar-fill.medium {
  background-color: #f59e0b;
}

.strength-bar-fill.strong {
  background-color: #10b981;
}

.strength-bar-fill.very-strong {
  background-color: #06b6d4;
}

.strength-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
}

.strength-badge {
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
}

.strength-badge.weak {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

.strength-badge.medium {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

.strength-badge.strong {
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
}

.strength-badge.very-strong {
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.12);
}

.strength-hint {
  color: var(--muted);
  font-size: 11px;
  text-align: right;
  flex: 1;
}

.submit-btn {
  width: 100%;
  margin-top: 18px;
  padding: 12px;
  font-size: 14px;
}

.form-error {
  margin: 6px 0 12px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 194, 196, 0.25);
  border-radius: 10px;
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 12.5px;
  text-align: center;
}

@media (max-width: 768px) {
  .login-page {
    padding: 24px 14px calc(30px + env(safe-area-inset-bottom, 0px));
    align-items: flex-start;
  }
  .login-container {
    width: 100%;
    margin-top: 36px;
  }
  .brand-name {
    font-size: 17px;
  }
  .brand-logo-emblem {
    width: 54px;
    height: 54px;
    padding: 6px;
  }
  .flip-card__front,
  .flip-card__back {
    padding: 24px 18px 28px;
    border-radius: 16px;
  }
  .flip-card__inner.is-flipped {
    height: 840px;
  }
  .flip-card__inner.is-flipped.has-error {
    height: 890px;
  }
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .brand-logo-emblem {
  background: radial-gradient(circle, rgba(197, 230, 223, 0.25) 0%, rgba(14, 38, 48, 0.85) 100%) !important;
  border: 1.5px solid rgba(197, 230, 223, 0.5) !important;
  box-shadow: 0 0 24px rgba(197, 230, 223, 0.5), 0 4px 14px rgba(0, 0, 0, 0.25) !important;
}

[data-theme-style="vanta-fog"] .switch-side.active::after {
  box-shadow: 0 0 8px rgba(197, 230, 223, 0.6) !important;
}

[data-theme-style="vanta-fog"] .slider {
  background-color: rgba(9, 32, 41, 0.85) !important;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4) !important;
}

[data-theme-style="vanta-fog"] .slider::before {
  background: linear-gradient(135deg, var(--accent) 0%, #a8dcd0 100%) !important;
}

[data-theme-style="vanta-fog"] .toggle:checked + .slider {
  background-color: rgba(197, 230, 223, 0.2) !important;
}

[data-theme-style="vanta-fog"] .toggle:checked + .slider::before {
  box-shadow: 0 0 10px rgba(197, 230, 223, 0.7) !important;
}

[data-theme-style="vanta-fog"] .flip-card__front,
[data-theme-style="vanta-fog"] .flip-card__back {
  border: 1px solid rgba(218, 238, 235, 0.22) !important;
  background: rgba(14, 38, 48, 0.78) !important;
  box-shadow: 0 20px 48px -8px rgba(3, 15, 21, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset !important;
}

.demo-direct-btn {
  margin-top: 10px;
  width: 100%;
  background: rgba(99, 102, 241, 0.15) !important;
  border: 1px solid rgba(99, 102, 241, 0.4) !important;
  color: #c7d2fe !important;
  font-weight: 600;
  transition: all 0.2s ease;
}

.demo-direct-btn:hover {
  background: rgba(99, 102, 241, 0.25) !important;
  border-color: rgba(99, 102, 241, 0.7) !important;
  color: #ffffff !important;
  transform: translateY(-1px);
}

[data-color-scheme="custom"] .brand-logo-emblem {
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 30%, transparent) 0%, rgba(12, 10, 26, 0.85) 100%) !important;
  border: 1.5px solid color-mix(in srgb, var(--accent) 55%, transparent) !important;
  box-shadow: 0 0 28px color-mix(in srgb, var(--accent) 45%, transparent), 0 4px 14px rgba(0, 0, 0, 0.5) !important;
}
</style>
