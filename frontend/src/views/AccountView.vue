<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { authApi, accountApi } from '../api/client'
import UserAvatar from '../components/UserAvatar.vue'
import { getMemberPresence, presenceNow } from '../composables/usePresence'
import LoadingState from '../components/LoadingState.vue'
import AppIcon from '../components/AppIcon.vue'
import BaseDialog from '../components/BaseDialog.vue'
import ThinHoundCheckbox from '../components/ThinHoundCheckbox.vue'
import { notify } from '../composables/feedback'
import { useThemeStyle } from '../composables/useThemeStyle'
import { useCustomFont } from '../composables/useCustomFont'
import { useAdminMode, applyViewMode } from '../composables/useAdminMode'
import {
  saveLocalBackground,
  getLocalBackgroundMeta,
  removeLocalBackground
} from '../utils/localBgStorage'
import {
  saveLocalFont,
  getLocalFontMeta,
  removeLocalFont,
  removeAllLocalFonts,
  copyLocalFont,
  getFontMode,
  setFontMode
} from '../utils/localFontStorage'
import { useTutorial } from '../composables/useTutorial'
import { useSiteConfig } from '../composables/useSiteConfig'
import { systemApi } from '../api/client'

const { openTutorial } = useTutorial()
const { siteConfig, updateLocalConfig } = useSiteConfig()

const systemConfig = reactive({
  lab_name: '',
  lab_short_name: 'LabOrbit',
  site_slogan: '',
  institution: '',
  default_location: '',
  ai_system_prompt: '',
})
const systemConfigLoading = ref(false)
const systemConfigSaving = ref(false)

async function loadSystemConfig() {
  systemConfigLoading.value = true
  try {
    const res = await systemApi.getSettings()
    if (res) {
      systemConfig.lab_name = res.lab_name || ''
      systemConfig.lab_short_name = res.lab_short_name || 'LabOrbit'
      systemConfig.site_slogan = res.site_slogan || ''
      systemConfig.institution = res.institution || ''
      systemConfig.default_location = res.default_location || ''
      systemConfig.ai_system_prompt = res.ai_system_prompt || ''
    }
  } catch (err) {
    console.warn('获取系统全站配置失败:', err)
  } finally {
    systemConfigLoading.value = false
  }
}

async function saveSystemConfig() {
  systemConfigSaving.value = true
  try {
    await systemApi.updateSettings(systemConfig)
    updateLocalConfig(systemConfig)
    notify('课题组全站配置已成功更新')
  } catch (err) {
    notify(err.message || '更新设置失败', 'error')
  } finally {
    systemConfigSaving.value = false
  }
}

const {
  currentColorScheme,
  currentBgType,
  colorSchemes,
  bgOptions,
  customColorScheme,
  customPresetTemplates,
  setColorScheme,
  setBgType,
  saveCustomColorScheme,
  deriveThemePalette,
  applyPreviewPaletteToDOM,
  applyThemeToDOM
} = useThemeStyle()

function handleColorSchemeSelect(scheme) {
  if (currentColorScheme.value === scheme.id) return
  setColorScheme(scheme.id)
  notify(`已切换为「${scheme.name}」配色`)
}

const showCustomThemeModal = ref(false)

const themeSnapshot = reactive({
  scheme: 'classic-cyan',
  customScheme: null,
  isSaved: false
})

const customThemeForm = reactive({
  name: customColorScheme.value?.name || '自定义配色',
  primaryColor: customColorScheme.value?.primaryColor || '#38bdf8',
  baseColor: customColorScheme.value?.baseColor || '#071326',
  panelColor: customColorScheme.value?.panelHex || '#0d203d',
  autoDerive: customColorScheme.value?.autoDerive !== false
})

function isValidHex(hex) {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim())
}

const previewPalette = computed(() => {
  return deriveThemePalette(
    isValidHex(customThemeForm.primaryColor) ? customThemeForm.primaryColor : '#38bdf8',
    isValidHex(customThemeForm.baseColor) ? customThemeForm.baseColor : '#071326',
    customThemeForm.autoDerive ? null : (isValidHex(customThemeForm.panelColor) ? customThemeForm.panelColor : null)
  )
})

function openCustomThemeModal() {
  themeSnapshot.scheme = currentColorScheme.value
  themeSnapshot.customScheme = customColorScheme.value ? { ...customColorScheme.value } : null
  themeSnapshot.isSaved = false

  customThemeForm.name = customColorScheme.value?.name || '自定义配色'
  customThemeForm.primaryColor = customColorScheme.value?.primaryColor || '#38bdf8'
  customThemeForm.baseColor = customColorScheme.value?.baseColor || '#071326'
  customThemeForm.panelColor = customColorScheme.value?.panelHex || '#0d203d'
  customThemeForm.autoDerive = customColorScheme.value?.autoDerive !== false
  showCustomThemeModal.value = true

  // 立即将当前预览配色广播应用到全局 DOM，实现边框、卡片、侧边栏全站同步预览
  if (previewPalette.value) {
    applyPreviewPaletteToDOM(previewPalette.value)
  }
}

function closeCustomThemeModal() {
  if (!themeSnapshot.isSaved) {
    // 未保存直接关闭，回滚至打开前的方案快照
    if (themeSnapshot.scheme === 'custom' && themeSnapshot.customScheme) {
      saveCustomColorScheme(themeSnapshot.customScheme)
    }
    applyThemeToDOM(themeSnapshot.scheme, currentBgType.value)
  }
  showCustomThemeModal.value = false
}

function applyPresetTemplate(tpl) {
  customThemeForm.name = tpl.name
  customThemeForm.primaryColor = tpl.primaryColor
  customThemeForm.baseColor = tpl.baseColor
  customThemeForm.panelColor = tpl.panelHex || '#0d203d'
  customThemeForm.autoDerive = true
}

// 弹窗打开期间，表单任意颜色变动或模板切换均实时同步全局 DOM 变量
watch(previewPalette, (newVal) => {
  if (showCustomThemeModal.value && newVal) {
    applyPreviewPaletteToDOM(newVal)
  }
})

const previewDialogStyle = computed(() => {
  if (!previewPalette.value) return {}
  const p = previewPalette.value
  return {
    '--panel-solid': p.panelHex,
    '--panel': p.panelColor,
    '--surface': p.surfaceColor,
    '--line': p.lineColor,
    '--accent': p.primaryColor,
    '--accent-strong': p.accentStrong,
    '--accent-ink': p.accentInk,
    '--focus': p.primaryColor,
    '--raised': p.raised,
    '--glass': p.glass,
    '--bg': p.baseColor,
    backgroundColor: `${p.panelHex} !important`,
    borderColor: `${p.lineColor} !important`,
    boxShadow: `0 28px 80px rgba(0, 0, 0, 0.7), 0 0 28px ${p.lineColor}`
  }
})

watch(() => customThemeForm.autoDerive, (val) => {
  if (!val && (!customThemeForm.panelColor || !isValidHex(customThemeForm.panelColor))) {
    customThemeForm.panelColor = previewPalette.value?.panelHex || '#0d203d'
  }
})

function handleSelectCustomScheme() {
  if (currentColorScheme.value === 'custom') {
    openCustomThemeModal()
    return
  }
  setColorScheme('custom')
  notify(`已切换为「${customColorScheme.value?.name || '自定义'}」配色`)
}

function handleSaveAndApplyCustomTheme() {
  const finalPrimary = customThemeForm.primaryColor.trim()
  const finalBase = customThemeForm.baseColor.trim()
  if (!isValidHex(finalPrimary) || !isValidHex(finalBase)) {
    notify('请输入有效的 16 进制颜色代码（如 #38bdf8）')
    return
  }
  if (!customThemeForm.autoDerive && !isValidHex(customThemeForm.panelColor.trim())) {
    notify('请输入有效的面板色 16 进制代码（如 #0d203d）')
    return
  }

  const ok = saveCustomColorScheme({
    name: customThemeForm.name.trim() || '自定义配色',
    primaryColor: finalPrimary,
    baseColor: finalBase,
    panelColor: customThemeForm.autoDerive ? null : customThemeForm.panelColor.trim(),
    panelHex: customThemeForm.autoDerive ? previewPalette.value.panelHex : customThemeForm.panelColor.trim(),
    autoDerive: customThemeForm.autoDerive
  })

  if (ok) {
    themeSnapshot.isSaved = true
    setColorScheme('custom')
    applyThemeToDOM('custom', currentBgType.value)
    notify(`自定义配色「${customThemeForm.name.trim() || '自定义配色'}」已保存并应用`)
    showCustomThemeModal.value = false
  } else {
    notify('保存配色方案失败')
  }
}

function handleResetCustomTheme() {
  const defaultTpl = customPresetTemplates?.[0]
  if (defaultTpl) {
    applyPresetTemplate(defaultTpl)
  }
}

function handleBgTypeSelect(bg) {
  if (currentBgType.value === bg.id) {
    if (bg.id === 'custom-local' && !localBgMeta.value) {
      triggerLocalFileInput()
    }
    return
  }
  setBgType(bg.id)
  notify(`已切换为「${bg.name}」背景`)
  if (bg.id === 'custom-local' && !localBgMeta.value) {
    triggerLocalFileInput()
  }
}

const localBgMeta = ref(null)
const localBgUploading = ref(false)
const localFileInputRef = ref(null)

async function loadLocalBgInfo() {
  localBgMeta.value = await getLocalBackgroundMeta()
}

function triggerLocalFileInput() {
  localFileInputRef.value?.click()
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
}

async function onLocalFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  localBgUploading.value = true
  try {
    const meta = await saveLocalBackground(file)
    localBgMeta.value = meta
    setBgType('custom-local')
    notify(`本地${meta.type === 'video' ? '视频' : '图片'}背景「${meta.name}」已加载`)
  } catch (err) {
    notify(err.message || '加载本地文件失败', 'error')
  } finally {
    localBgUploading.value = false
    if (e.target) e.target.value = ''
  }
}

async function onRemoveLocalBg() {
  if (!confirm('确定要清除已保存的本地背景媒体吗？')) return
  await removeLocalBackground()
  localBgMeta.value = null
  setBgType('clouds-static')
  notify('已清除本地背景，恢复为云山日光背景')
}

const {
  currentFontInfo,
  fontConfig,
  isFontLoading,
  clearCustomFont
} = useCustomFont()

const currentFontMode = ref(getFontMode())
const unifiedFontMeta = ref(null)
const enFontMeta = ref(null)
const zhFontMeta = ref(null)
const targetUploadSlot = ref('unified')
const localFontUploading = ref(false)
const localFontInputRef = ref(null)

const hasAnyCustomFont = computed(() => {
  if (currentFontMode.value === 'unified') {
    return Boolean(unifiedFontMeta.value)
  }
  return Boolean(enFontMeta.value || zhFontMeta.value)
})

async function loadLocalFontInfo() {
  currentFontMode.value = getFontMode()
  const [unified, en, zh] = await Promise.all([
    getLocalFontMeta('unified'),
    getLocalFontMeta('en'),
    getLocalFontMeta('zh')
  ])
  unifiedFontMeta.value = unified
  enFontMeta.value = en
  zhFontMeta.value = zh
}

function switchFontMode(mode) {
  setFontMode(mode)
  currentFontMode.value = mode
  notify(mode === 'split' ? '已切换为中英分离模式，可分别配置西文与中文字体' : '已切换为统一模式，中英文采用同一字体')
}

function triggerSlotUpload(slot = 'unified') {
  targetUploadSlot.value = slot
  localFontInputRef.value?.click()
}

async function onLocalFontSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  localFontUploading.value = true
  const slot = targetUploadSlot.value || 'unified'
  try {
    const meta = await saveLocalFont(file, slot)
    if (slot === 'unified') unifiedFontMeta.value = meta
    else if (slot === 'en') enFontMeta.value = meta
    else if (slot === 'zh') zhFontMeta.value = meta
    const slotName = slot === 'en' ? '英文字体' : (slot === 'zh' ? '中文字体' : '统一字体')
    notify(`本地${slotName}「${meta.name}」已载入并即刻生效`)
  } catch (err) {
    notify(err.message || '载入本地字体失败', 'error')
  } finally {
    localFontUploading.value = false
    if (e.target) e.target.value = ''
  }
}

async function onCopyFont(fromSlot, toSlot) {
  localFontUploading.value = true
  try {
    const ok = await copyLocalFont(fromSlot, toSlot)
    if (ok) {
      const meta = await getLocalFontMeta(toSlot)
      if (toSlot === 'en') enFontMeta.value = meta
      else if (toSlot === 'zh') zhFontMeta.value = meta
      else if (toSlot === 'unified') unifiedFontMeta.value = meta
      notify('已成功同步为相同字体文件！')
    }
  } catch (err) {
    notify(err.message || '同步字体失败', 'error')
  } finally {
    localFontUploading.value = false
  }
}

async function onRemoveSlotFont(slot) {
  await removeLocalFont(slot)
  if (slot === 'unified') unifiedFontMeta.value = null
  else if (slot === 'en') enFontMeta.value = null
  else if (slot === 'zh') zhFontMeta.value = null
  const slotName = slot === 'en' ? '英文字体' : (slot === 'zh' ? '中文字体' : '统一字体')
  notify(`已清除${slotName}，恢复系统默认`)
}

async function onRestoreAllDefaultFonts() {
  if (hasAnyCustomFont.value) {
    if (!confirm('确定要恢复系统默认字体方案并清除所有本地自定义字体吗？')) return
  }
  await removeAllLocalFonts()
  clearCustomFont()
  unifiedFontMeta.value = null
  enFontMeta.value = null
  zhFontMeta.value = null
  notify('已恢复为系统默认字体方案')
}

function getInitialUser() {
  try {
    const raw = localStorage.getItem('labhub_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const initialUser = getInitialUser()
const user = ref(initialUser), loading = ref(!initialUser), error = ref(''), busy = ref(false), members = ref([]), permissionBusy = ref(false)

const { currentMode: adminViewMode, isAdminMode, isUserMode, setAdminMode: saveAdminMode } = useAdminMode()

const isActualAdmin = computed(() => {
  return Boolean(user.value && (user.value.actual_role === 'admin' || user.value.role === 'admin' || user.value.is_admin_account))
})

const onlineCount = computed(() => {
  const _ = presenceNow.value
  if (!Array.isArray(members.value)) return 0
  return members.value.filter(m => getMemberPresence(m, presenceNow.value) === 'online').length
})

async function handleSwitchAdminMode(targetMode) {
  if (adminViewMode.value === targetMode) return
  saveAdminMode(targetMode)
  if (user.value) {
    user.value = applyViewMode({ ...user.value, role: 'admin' })
  }
  if (targetMode === 'admin') {
    if (members.value.length === 0) {
      try {
        const [mem, codes] = await Promise.all([authApi.getMembers(), authApi.getInviteCodes()])
        members.value = mem
        inviteCodes.value = codes
      } catch (e) {
        // ignore
      }
    }
    notify('已切换为管理模式')
  } else {
    notify('已切换为用户模式')
  }
}

const realName = ref(initialUser?.real_name || initialUser?.name || ''), nickname = ref(initialUser?.nickname || ''), email = ref(initialUser?.email || ''), identity = ref(initialUser?.identity || 'student'), currentPassword = ref(''), newPassword = ref(''), confirmPassword = ref('')
// 邀请码管理
const inviteCodes = ref([]), inviteCodeBusy = ref(false)
const newCode = ref(''), newNote = ref(''), newInviteRole = ref('student'), newInviteIdentity = ref('student')
function updated(data) {
  user.value = data
  try {
    localStorage.setItem('labhub_user', JSON.stringify(data))
  } catch {}
  window.dispatchEvent(new Event('account-updated'))
}
async function load() {
  error.value = ''
  if (!user.value) {
    loading.value = true
  }
  try {
    const data = await authApi.getMe()
    user.value = data
    try {
      localStorage.setItem('labhub_user', JSON.stringify(data))
    } catch {}
    realName.value = data.real_name || data.name || ''
    nickname.value = data.nickname || ''
    email.value = data.email || ''
    identity.value = data.identity || 'student'
    if (data.role === 'admin') {
      members.value = await authApi.getMembers()
      inviteCodes.value = await authApi.getInviteCodes()
      loadSystemConfig()
    }
  } catch(e) {
    error.value = e.message
    if (!user.value) {
      const token = localStorage.getItem('labhub_token')
      if (!token && !window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
  } finally {
    loading.value = false
  }
}
const updatingSeminarMemberId = ref(null)

async function toggleSeminarPermission(member) {
  if (member.role === 'admin') {
    notify('系统管理员默认拥有全部组会管理权限，无需单独配置', 'info')
    return
  }
  if (updatingSeminarMemberId.value === member.id) return

  const prevVal = Boolean(member.can_manage_seminars)
  const targetVal = !prevVal
  // 乐观更新：立刻在当前微任务中切换状态，使 SVG 描边动画毫无卡顿、一气呵成
  member.can_manage_seminars = targetVal
  updatingSeminarMemberId.value = member.id

  try {
    const updatedMember = await authApi.setSeminarPermission(member.id, targetVal)
    member.can_manage_seminars = Boolean(updatedMember.can_manage_seminars)
    notify('组会管理权限已更新')
  } catch(e) {
    // 异常时回滚
    member.can_manage_seminars = prevVal
    notify(e.message || '更新权限失败', 'error')
  } finally {
    updatingSeminarMemberId.value = null
  }
}
async function toggleAdminRole(member) {
  const willBeAdmin = member.role !== 'admin'
  const memberDisplayName = member.real_name || member.name || member.nickname
  const actionText = willBeAdmin ? `将 ${memberDisplayName} 设为系统管理员` : `取消 ${memberDisplayName} 的管理员权限`
  if (!confirm(`确定要${actionText}吗？`)) return
  permissionBusy.value = true
  try {
    const updatedMember = await authApi.setMemberRole(member.id, willBeAdmin ? 'admin' : 'student')
    member.role = updatedMember.role
    member.can_manage_seminars = updatedMember.can_manage_seminars
    notify(`已更新 ${memberDisplayName} 的权限`)
  } catch(e) {
    notify(e.message || '更新权限失败', 'error')
  } finally {
    permissionBusy.value = false
  }
}
async function toggleMemberIdentity(member) {
  const memberDisplayName = member.real_name || member.name || member.nickname
  const newIdentity = member.identity === 'teacher' ? 'student' : 'teacher'
  permissionBusy.value = true
  try {
    const updatedMember = await authApi.setMemberIdentity(member.id, newIdentity)
    member.identity = updatedMember.identity
    notify(`已将 ${memberDisplayName} 的身份设为「${updatedMember.identity === 'teacher' ? '导师' : '学生'}」`)
  } catch(e) {
    notify(e.message || '更新身份失败', 'error')
  } finally {
    permissionBusy.value = false
  }
}
async function saveProfile() { busy.value = true; error.value = ''; try { updated(await accountApi.profile({ real_name: realName.value, nickname: nickname.value })); notify('资料已保存') } catch(e) { error.value = e.message } finally { busy.value = false } }
async function saveCredentials() {
  if (newPassword.value !== confirmPassword.value) { error.value = '两次输入的新密码不一致'; return }
  busy.value = true; error.value = ''
  try {
    const data = await accountApi.credentials({ current_password: currentPassword.value, ...(email.value.trim().toLowerCase() !== user.value.email ? {email: email.value} : {}), ...(newPassword.value ? {new_password: newPassword.value} : {}) })
    localStorage.setItem('labhub_token', data.access_token); updated(data.user)
    currentPassword.value = ''; newPassword.value = ''; confirmPassword.value = ''; notify('账户已更新，其他登录会话已失效')
  } catch(e) { error.value = e.message } finally { busy.value = false }
}
function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const size = 256
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        if (file.size > 200 * 1024) return reject(new Error('头像文件大小不得超过 200 KB'))
        return resolve(file)
      }

      const minDim = Math.min(img.width, img.height)
      const sx = (img.width - minDim) / 2
      const sy = (img.height - minDim) / 2
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)

      canvas.toBlob((blob) => {
        if (!blob) {
          if (file.size > 200 * 1024) return reject(new Error('头像文件大小不得超过 200 KB'))
          return resolve(file)
        }
        if (blob.size > 200 * 1024) {
          return reject(new Error('头像文件压缩后仍超过 200 KB，请选用较小图片'))
        }
        const compressedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
        resolve(compressedFile)
      }, 'image/jpeg', 0.85)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      if (file.size > 200 * 1024) return reject(new Error('头像文件大小不得超过 200 KB'))
      resolve(file)
    }
    img.src = url
  })
}

async function uploadAvatar(event) {
  const file = event.target.files?.[0]; if (!file) return
  busy.value = true; error.value = ''
  try {
    const processedFile = await compressAvatar(file)
    if (processedFile.size > 200 * 1024) throw new Error('头像文件大小不得超过 200 KB')
    updated(await accountApi.avatar(processedFile))
    notify('头像已更新')
  } catch(e) {
    error.value = e.message
    notify(e.message, 'error')
  } finally {
    busy.value = false
    event.target.value = ''
  }
}

let memberPollTimer = null

onMounted(() => {
  load()
  loadLocalBgInfo()
  loadLocalFontInfo()

  memberPollTimer = setInterval(async () => {
    if (user.value?.role === 'admin' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      try {
        const mem = await authApi.getMembers()
        members.value = mem
      } catch (e) {
        // silent
      }
    }
  }, 30000)
})

onBeforeUnmount(() => {
  if (memberPollTimer) {
    clearInterval(memberPollTimer)
    memberPollTimer = null
  }
  if (showCustomThemeModal.value && !themeSnapshot.isSaved) {
    if (themeSnapshot.scheme === 'custom' && themeSnapshot.customScheme) {
      saveCustomColorScheme(themeSnapshot.customScheme)
    }
    applyThemeToDOM(themeSnapshot.scheme, currentBgType.value)
  }
})
async function createInviteCode() {
  const code = newCode.value.trim()
  if (!code) return
  inviteCodeBusy.value = true
  try {
    const created = await authApi.createInviteCode(code, newNote.value.trim(), newInviteRole.value, newInviteIdentity.value)
    inviteCodes.value.unshift(created)
    newCode.value = ''
    newNote.value = ''
    notify(`邀请码 ${created.code} 已创建`)
  } catch(e) {
    notify(e.message || '创建失败', 'error')
  } finally {
    inviteCodeBusy.value = false
  }
}
function inviteAssignmentLabel(invite) {
  const authority = invite.registration_role === 'admin' ? '管理员' : '普通用户'
  const academicIdentity = invite.registration_identity === 'teacher' ? '导师' : '学生'
  return `${authority} · ${academicIdentity}`
}
async function updateInviteAssignment(ic, changes) {
  inviteCodeBusy.value = true
  try {
    const updatedInvite = await authApi.updateInviteCode(
      ic.id,
      changes.registration_role || ic.registration_role,
      changes.registration_identity || ic.registration_identity,
    )
    Object.assign(ic, updatedInvite)
    notify(`邀请码 ${ic.code} 的注册身份已更新`)
  } catch(e) {
    notify(e.message || '更新失败', 'error')
  } finally {
    inviteCodeBusy.value = false
  }
}
async function toggleInviteCode(ic) {
  inviteCodeBusy.value = true
  try {
    const updated = await authApi.toggleInviteCode(ic.id)
    ic.is_active = updated.is_active
    notify(updated.is_active ? `邀请码 ${ic.code} 已启用` : `邀请码 ${ic.code} 已停用`)
  } catch(e) {
    notify(e.message || '操作失败', 'error')
  } finally {
    inviteCodeBusy.value = false
  }
}
async function deleteInviteCode(ic) {
  if (!confirm(`确定删除邀请码「${ic.code}」？此操作不可撤销。`)) return
  inviteCodeBusy.value = true
  try {
    await authApi.deleteInviteCode(ic.id)
    inviteCodes.value = inviteCodes.value.filter(c => c.id !== ic.id)
    notify(`邀请码 ${ic.code} 已删除`)
  } catch(e) {
    notify(e.message || '删除失败', 'error')
  } finally {
    inviteCodeBusy.value = false
  }
}
function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => notify(`已复制：${code}`)).catch(() => notify('复制失败', 'error'))
}

// 管理员手动创建成员账号
const showCreateMemberModal = ref(false)
const creatingMember = ref(false)
const createMemberForm = ref({
  name: '',
  nickname: '',
  email: '',
  password: '',
  identity: 'student',
  role: 'student',
  can_manage_seminars: false
})

function openCreateMemberModal() {
  createMemberForm.value = {
    name: '',
    nickname: '',
    email: '',
    password: '',
    identity: 'student',
    role: 'student',
    can_manage_seminars: false
  }
  showCreateMemberModal.value = true
}

async function handleCreateMember() {
  if (!createMemberForm.value.name.trim()) {
    notify('请填写真实姓名', 'error')
    return
  }
  if (!createMemberForm.value.email.trim() || !createMemberForm.value.email.includes('@')) {
    notify('请输入有效的邮箱地址', 'error')
    return
  }
  if (!createMemberForm.value.password || createMemberForm.value.password.length < 6) {
    notify('初始密码长度不得少于 6 位', 'error')
    return
  }

  creatingMember.value = true
  try {
    const newMember = await authApi.createMember({
      name: createMemberForm.value.name.trim(),
      nickname: createMemberForm.value.nickname.trim(),
      email: createMemberForm.value.email.trim().toLowerCase(),
      password: createMemberForm.value.password,
      identity: createMemberForm.value.identity,
      role: createMemberForm.value.role,
      can_manage_seminars: createMemberForm.value.role === 'admin' || createMemberForm.value.can_manage_seminars
    })
    members.value.push(newMember)
    showCreateMemberModal.value = false
    notify(`成员「${newMember.real_name || newMember.name}」已创建成功`)
  } catch (e) {
    notify(e.message || '创建成员失败', 'error')
  } finally {
    creatingMember.value = false
  }
}

async function deleteMember(member) {
  if (member.id === user.value.id) {
    notify('不能删除当前登录的管理员账号', 'error')
    return
  }
  const displayName = member.real_name || member.name || member.nickname || member.email
  if (!confirm(`确定彻底删除用户「${displayName}」(${member.email}) 吗？\n删除后该用户的账号凭证及个人配置将被清除，此操作不可撤销。`)) {
    return
  }
  permissionBusy.value = true
  try {
    await authApi.deleteMember(member.id)
    members.value = members.value.filter(m => m.id !== member.id)
    notify(`用户「${displayName}」已成功删除`)
  } catch (e) {
    notify(e.message || '删除用户失败', 'error')
  } finally {
    permissionBusy.value = false
  }
}

</script>
<style scoped>
.account-page {
  width: 100%;
  max-width: 900px;
  min-width: 0;
  box-sizing: border-box;
}

.account-section {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
  min-width: 0;
}

.member-section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.member-count-text {
  font-size: 12px;
}

.online-count-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 999px;
  font-weight: 500;
}

.presence-dot-inline {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  animation: presence-breathe 2.4s ease-in-out infinite;
  display: inline-block;
  flex-shrink: 0;
}

.member-presence-wrap {
  position: relative;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.member-avatar-chip {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--raised, rgba(255, 255, 255, 0.08));
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  user-select: none;
}

.presence-dot-corner {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  box-sizing: content-box;
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
  pointer-events: none;
}

.presence-dot-corner.online {
  background-color: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  animation: presence-breathe 2.4s ease-in-out infinite;
}

.presence-dot-corner.away {
  background-color: #f59e0b;
}

.presence-dot-corner.offline {
  background-color: #6b7280;
}

@keyframes presence-breathe {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

.members-perm-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  width: 100%;
  min-width: 0;
}

.member-perm-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.member-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
}

.member-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
  overflow-wrap: anywhere;
}

.member-email {
  font-size: 12px;
  color: var(--muted);
  overflow-wrap: anywhere;
  word-break: break-all;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
}

.perm-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--soft);
  cursor: pointer;
  white-space: nowrap;
}

.perm-checkbox-label input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}

.invite-code-list {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  margin-bottom: 16px;
  width: 100%;
  min-width: 0;
}

.invite-code-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.invite-code-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
}

.invite-code-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.03em;
  overflow-wrap: anywhere;
}

.invite-code-note {
  font-size: 12px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.invite-code-target {
  font-size: 12px;
  color: var(--accent);
  border-left: 1px solid var(--line);
  padding-left: 10px;
  overflow-wrap: anywhere;
}

.invite-code-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
}

.invite-choice {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(70px, 1fr));
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--raised);
  max-width: 100%;
  box-sizing: border-box;
}

.invite-choice button {
  min-height: 34px;
  padding: 6px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;
  transition: background .18s ease, color .18s ease, transform .18s ease;
}

.invite-choice button:hover:not(:disabled) {
  background: rgba(208,231,232,.12);
  color: var(--text);
}

.invite-choice button:active:not(:disabled) {
  transform: scale(.98);
}

.invite-choice button.is-active {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px rgba(208,231,232,.18);
  color: var(--text);
}

.invite-choice-new {
  flex: 1 1 160px;
  min-width: 0;
}

.invite-code-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
  width: 100%;
  min-width: 0;
}

.invite-code-inputs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
  min-width: 0;
}

.invite-code-inputs input {
  min-width: 0;
}

button.danger {
  color: var(--danger, #e53e3e) !important;
}

button.danger:hover {
  background: rgba(229,62,62,0.08) !important;
}

.account-shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 14px;
  width: 100%;
  min-width: 0;
}

.account-shortcut-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  text-decoration: none;
  color: var(--text);
  transition: all 0.22s ease;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.account-shortcut-card:hover {
  background: var(--raised);
  border-color: rgba(184, 155, 248, 0.35);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.shortcut-icon-box {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 18px;
  flex-shrink: 0;
}

.shortcut-icon-box.cyan {
  background: rgba(184, 155, 248, 0.14);
  color: var(--accent);
  border: 1px solid rgba(184, 155, 248, 0.25);
}

.shortcut-icon-box.amber {
  background: rgba(243, 216, 162, 0.12);
  color: var(--warning);
  border: 1px solid rgba(243, 216, 162, 0.25);
}

.shortcut-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.shortcut-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow-wrap: anywhere;
}

.shortcut-desc {
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.shortcut-arrow {
  color: var(--muted);
  font-size: 16px;
  transition: transform 0.2s ease, color 0.2s ease;
  flex-shrink: 0;
}

.account-shortcut-card:hover .shortcut-arrow {
  transform: translateX(3px);
  color: var(--accent);
}

/* 界面风格切换卡片 */
.theme-settings-section {
  margin-top: 20px;
  width: 100%;
  min-width: 0;
}

.theme-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  margin-top: 16px;
  width: 100%;
  min-width: 0;
}

.theme-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 18px 20px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.theme-card:hover {
  transform: translateY(-2px);
  border-color: rgba(184, 155, 248, 0.35);
  box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.4), 0 0 16px -4px rgba(184, 155, 248, 0.15);
}

[data-theme-style="vanta-fog"] .theme-card:hover {
  border-color: rgba(197, 230, 223, 0.35);
  box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.4), 0 0 16px -4px rgba(197, 230, 223, 0.15);
}

.theme-card.is-active {
  border-color: var(--accent);
  background: linear-gradient(135deg, rgba(184, 155, 248, 0.08) 0%, rgba(20, 16, 35, 0.6) 100%);
  box-shadow: 0 8px 28px -6px rgba(0, 0, 0, 0.5), 0 0 20px -4px var(--accent-glow, rgba(184, 155, 248, 0.3));
}

[data-theme-style="vanta-fog"] .theme-card.is-active {
  background: linear-gradient(135deg, rgba(197, 230, 223, 0.08) 0%, rgba(13, 37, 44, 0.6) 100%);
}

.theme-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
  width: 100%;
  min-width: 0;
}

.theme-card-title-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1 1 160px;
}

.theme-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.theme-subtitle {
  font-size: 12px;
  color: var(--accent);
  font-weight: 500;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.theme-active-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
  flex-shrink: 0;
}

.active-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: pulse-dot 2s infinite ease-in-out;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.theme-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  margin-top: auto;
  flex-wrap: wrap;
  width: 100%;
  min-width: 0;
}

.theme-palette-preview {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.32);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.65), inset 0 2px 4px rgba(0, 0, 0, 0.5);
  display: inline-block;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease;
  flex-shrink: 0;
}

.color-dot:hover {
  transform: scale(1.18);
  border-color: rgba(255, 255, 255, 0.7);
}

.theme-card-desc {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
  margin: 0 0 14px 0;
  flex-grow: 1;
}

.bg-card-hint {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.custom-card-actions .button {
  padding: 6px 12px;
  font-size: 13px;
}

/* 自定义界面配色弹窗 */
.custom-theme-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.custom-subheading {
  font-size: 13px;
  font-weight: 600;
  color: var(--soft);
  margin-bottom: 8px;
  letter-spacing: 0.02em;
}

.custom-templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}

.custom-tpl-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
}

.custom-tpl-btn:hover {
  border-color: var(--accent);
  background: var(--raised);
  transform: translateY(-1px);
}

.custom-tpl-btn.is-selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 0 12px -2px var(--accent);
  background: var(--raised);
}

.custom-tpl-preview {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.custom-tpl-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.custom-tpl-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.custom-form-and-preview-grid {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 720px) {
  .custom-form-and-preview-grid {
    grid-template-columns: 1fr;
  }
}

.custom-config-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.custom-input-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--soft);
}

.custom-name-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 13px;
  box-sizing: border-box;
}

.custom-name-input:focus,
.hex-text-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--raised);
}

.color-picker-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.color-picker-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.color-picker-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.color-picker-desc {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.4;
}

.color-input-combo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.native-color-picker {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  width: 44px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
}

.native-color-picker::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.native-color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 6px;
}

.hex-text-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  box-sizing: border-box;
}

.custom-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--soft);
  cursor: pointer;
  user-select: none;
  margin-top: 4px;
}

.custom-checkbox-row input[type="checkbox"] {
  cursor: pointer;
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}

.custom-preview-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-live-preview-box {
  padding: 18px;
  border-radius: 12px;
  border: 1px solid;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.preview-mockup-panel {
  width: 100%;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid;
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.4);
  box-sizing: border-box;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.preview-mockup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.preview-mockup-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.preview-mockup-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 100px;
  border: 1px solid;
}

.preview-mockup-desc {
  font-size: 12px;
  line-height: 1.5;
  margin: 0 0 14px 0;
}

.preview-mockup-elements {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.preview-mockup-btn-primary {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  cursor: default;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.preview-mockup-btn-secondary {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid;
  cursor: default;
}

.preview-mockup-subbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid;
}

.preview-subbox-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.custom-dialog-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  margin-top: 8px;
  flex-wrap: wrap;
}

.dialog-action-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.local-bg-control-box {
  margin-top: 20px;
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px dashed var(--line);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.local-bg-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.local-bg-icon {
  line-height: 1;
  margin-top: 2px;
  flex-shrink: 0;
}

/* chilly-sloth-36 vector floppy icon with hover animations */
.action_has {
  --sz: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(var(--sz) * 2.5);
  width: calc(var(--sz) * 2.5);
  padding: 0.4rem 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.16));
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted, #94a3b8);
  box-sizing: border-box;
  transition: border-color 0.25s ease, background 0.25s ease, color 0.25s ease, transform 0.2s ease;
}

.local-bg-header .local-bg-icon.action_has {
  --sz: 0.85rem;
  margin-top: 1px;
}

.local-bg-upload-zone .upload-icon.action_has {
  --sz: 1.15rem;
  margin-bottom: 2px;
}

.has_saved:hover,
.local-bg-header:hover .local-bg-icon.has_saved,
.local-bg-upload-zone:hover .upload-icon.has_saved {
  border-color: var(--accent, #b89bf8);
  color: var(--accent, #b89bf8);
  background: rgba(184, 155, 248, 0.08);
}

.has_saved:hover svg,
.local-bg-header:hover .local-bg-icon.has_saved svg,
.local-bg-upload-zone:hover .upload-icon.has_saved svg {
  color: var(--accent, #b89bf8);
}

.has_saved svg {
  overflow: visible;
  height: calc(var(--sz) * 1.5);
  width: calc(var(--sz) * 1.5);
  --ease: cubic-bezier(0.5, 0, 0.25, 1);
  --zoom-from: 1.5;
  --zoom-via: 0.85;
  --zoom-to: 1;
  --duration: 0.85s;
  transition: color 0.25s ease;
}

.has_saved:hover path[data-path="box"],
.local-bg-header:hover .local-bg-icon.has_saved path[data-path="box"],
.local-bg-upload-zone:hover .upload-icon.has_saved path[data-path="box"] {
  transition: all 0.3s var(--ease);
  animation: has-saved var(--duration) var(--ease) forwards;
  fill: rgba(184, 155, 248, 0.25);
}

.has_saved:hover path[data-path="line-top"],
.local-bg-header:hover .local-bg-icon.has_saved path[data-path="line-top"],
.local-bg-upload-zone:hover .upload-icon.has_saved path[data-path="line-top"] {
  animation: has-saved-line-top var(--duration) var(--ease) forwards;
}

.has_saved:hover path[data-path="line-bottom"],
.local-bg-header:hover .local-bg-icon.has_saved path[data-path="line-bottom"],
.local-bg-upload-zone:hover .upload-icon.has_saved path[data-path="line-bottom"] {
  animation: has-saved-line-bottom var(--duration) var(--ease) forwards,
    has-saved-line-bottom-2 calc(var(--duration) * 1) var(--ease)
      calc(var(--duration) * 0.75);
}

@keyframes has-saved-line-top {
  33.333% {
    transform: rotate(0deg) translate(1px, 2px) scale(var(--zoom-from));
    d: path("M 3 5 L 3 8 L 3 8");
  }
  66.666% {
    transform: rotate(20deg) translate(2px, -2px) scale(var(--zoom-via));
  }
  99.999% {
    transform: rotate(0deg) translate(0px, 0px) scale(var(--zoom-to));
  }
}

@keyframes has-saved-line-bottom {
  33.333% {
    transform: rotate(0deg) translate(1px, 2px) scale(var(--zoom-from));
    d: path("M 17 20 L 17 13 L 7 13 L 7 20");
  }
  66.666% {
    transform: rotate(20deg) translate(2px, -2px) scale(var(--zoom-via));
  }
  99.999% {
    transform: rotate(0deg) translate(0px, 0px) scale(var(--zoom-to));
  }
}

@keyframes has-saved-line-bottom-2 {
  from {
    d: path("M 17 21 L 17 21 L 7 21 L 7 21");
  }
  to {
    transform: rotate(0deg) translate(0px, 0px) scale(var(--zoom-to));
    d: path("M 17 20 L 17 13 L 7 13 L 7 20");
    fill: currentColor;
  }
}

@keyframes has-saved {
  33.333% {
    transform: rotate(0deg) translate(1px, 2px) scale(var(--zoom-from));
  }
  66.666% {
    transform: rotate(20deg) translate(2px, -2px) scale(var(--zoom-via));
  }
  99.999% {
    transform: rotate(0deg) translate(0px, 0px) scale(var(--zoom-to));
  }
}

.upload-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.local-bg-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.local-bg-title-wrap p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
}

.local-bg-status-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  flex-wrap: wrap;
}

.local-bg-meta-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
}

.local-bg-filename {
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.local-bg-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.local-bg-upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 22px 16px;
  border: 1px dashed rgba(255, 255, 255, 0.25);
  border-radius: 10px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
}

.local-bg-upload-zone:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--accent);
  transform: translateY(-1px);
}

.upload-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}



.upload-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.upload-tip {
  font-size: 11px;
}

.select-theme-btn {
  font-size: 12px;
  padding: 5px 14px;
  white-space: nowrap;
}

.font-cards-grid {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.font-section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.font-mode-segmented {
  display: inline-flex;
  padding: 3px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 9px;
  gap: 4px;
}

.font-mode-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 13px;
  font-size: 12px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
}

.font-mode-pill:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
}

.font-mode-pill.active {
  background: var(--raised, rgba(255, 255, 255, 0.12));
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.preview-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.font-preview-stage {
  margin-top: 4px;
  padding: 16px 20px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.font-preview-stage.is-custom {
  border-color: rgba(184, 155, 248, 0.35);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
}

[data-color-scheme="classic-cyan"] .font-preview-stage.is-custom {
  border-color: rgba(174, 222, 211, 0.35);
}

.font-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.font-preview-label {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.04em;
  font-weight: 500;
}

.font-preview-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.font-preview-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preview-tag {
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.04em;
  font-weight: 500;
}

.font-preview-line-title {
  font-size: 19px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
  font-family: var(--font);
}

.font-preview-line-en {
  font-size: 13.5px;
  color: var(--soft);
  line-height: 1.4;
  font-family: var(--font);
}

.font-preview-line-digits {
  font-size: 12px;
  color: var(--accent);
  margin-top: 1px;
  font-family: var(--font);
}

.split-font-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.split-font-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  gap: 14px;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.split-font-card.has-file {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
}

.split-font-card-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slot-badge-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.active-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #10b981;
  font-weight: 500;
}

.slot-fallback-hint {
  font-size: 11px;
}

.slot-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  word-break: break-all;
}

.slot-desc {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
  margin: 0;
}

.slot-info-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.slot-file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.slot-action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.slot-empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 22px 14px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.slot-empty-box:hover {
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.04);
}

.sync-hint-btn {
  margin-top: 6px;
  font-size: 11px;
  padding: 4px 9px;
}

.font-section-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.create-member-grid-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
  width: 100%;
  min-width: 0;
}

/* 移动端全面自适应 */
@media (max-width: 768px) {
  .account-page {
    width: 100%;
    max-width: 100%;
  }

  .account-section {
    padding: 16px 14px !important;
  }

  .section-title-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .section-title-row > div {
    width: 100%;
    flex-wrap: wrap;
    justify-content: space-between;
  }

  :deep(.form-row),
  .form-row,
  .create-member-grid-row {
    grid-template-columns: 1fr !important;
    gap: 12px;
  }

  .member-perm-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
  }

  .member-info {
    width: 100%;
    justify-content: flex-start;
  }

  .member-actions {
    width: 100%;
    justify-content: flex-start;
    gap: 8px;
  }

  .member-actions button {
    flex-grow: 1;
  }

  .invite-code-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
  }

  .invite-code-info {
    width: 100%;
  }

  .invite-code-actions {
    width: 100%;
    justify-content: flex-start;
    gap: 8px;
  }

  .invite-choice {
    width: 100%;
  }

  .invite-choice-new {
    min-width: 0;
    width: 100%;
  }

  .invite-code-inputs {
    flex-direction: column;
  }

  .invite-code-inputs input {
    width: 100%;
  }

  .theme-cards-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .theme-card {
    padding: 14px 14px;
  }

  .theme-card-footer {
    justify-content: space-between;
  }

  .select-theme-btn {
    flex-grow: 1;
    text-align: center;
  }

  .custom-card-actions {
    flex-grow: 1;
    justify-content: flex-end;
  }

  .custom-card-actions .button {
    flex-grow: 1;
    text-align: center;
  }

  .custom-dialog-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .custom-dialog-actions .dialog-action-right {
    width: 100%;
  }

  .custom-dialog-actions .dialog-action-right .button {
    flex: 1;
  }

  .account-shortcuts-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .account-shortcut-card {
    padding: 12px 14px;
  }

  :deep(.avatar-editor),
  .avatar-editor {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }

  .account-page > * {
    min-width: 0;
    max-width: 100%;
  }

  .form-actions button {
    width: 100%;
  }
}

/* ==========================================================================
   水波云雾风格还原 (Vanta Fog / Clouds Static)
   ========================================================================== */
[data-theme-style="vanta-fog"] .account-shortcut-card:hover {
  border-color: rgba(197, 230, 223, 0.35) !important;
}
[data-theme-style="vanta-fog"] .shortcut-icon-box.cyan {
  background: rgba(174, 222, 211, 0.12) !important;
  border: 1px solid rgba(174, 222, 211, 0.25) !important;
  color: var(--accent, #c5e6df) !important;
}

.admin-mode-status-banner {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(243, 216, 162, 0.1);
  border: 1px solid rgba(243, 216, 162, 0.25);
  color: var(--warning, #e6b85c);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  line-height: 1.5;
}
</style>
<template><div class="personal-page account-page"><header class="page-heading"><div><p class="eyebrow">YOUR ACCOUNT</p><h1>账户设置</h1></div></header><LoadingState v-if="loading" /><p v-if="error" class="error-banner" role="alert">{{ error }} <button v-if="!user" class="button secondary" @click="load">重试</button></p><template v-if="user && !loading">
<section class="panel account-section"><h2>头像设置</h2><div class="avatar-editor"><div class="account-avatar"><UserAvatar :user="user" /></div><label class="button secondary avatar-upload">上传头像<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传头像" :disabled="busy" @change="uploadAvatar" /></label><span class="muted">支持 PNG、JPEG 或 WebP，限制在 200 KB 以内（上传大图将自动压缩裁切）。</span></div></section>
<form class="panel account-section form-grid" @submit.prevent="saveProfile"><h2>个人资料</h2><div class="form-row"><label>姓名<input v-model="realName" maxlength="100" required autocomplete="name" /></label><label>昵称<input v-model="nickname" maxlength="50" placeholder="可选，用于页面显示" /></label><label>组内身份<input :value="identity === 'teacher' ? '导师 / PI' : '学生 / 组员'" disabled aria-label="组内身份由管理员设置" /></label></div><div class="form-actions"><button class="button primary" :disabled="busy">保存资料</button></div></form>
<form class="panel account-section form-grid" @submit.prevent="saveCredentials"><h2>邮箱与密码</h2><label>登录邮箱<input v-model="email" type="email" required autocomplete="email" maxlength="100" /></label><label>当前密码<input v-model="currentPassword" type="password" required autocomplete="current-password" /></label><div class="form-row"><label>新密码<input v-model="newPassword" type="password" minlength="8" autocomplete="new-password" placeholder="不修改密码时留空" /></label><label>确认新密码<input v-model="confirmPassword" type="password" :required="!!newPassword" autocomplete="new-password" /></label></div><p class="muted">新密码至少 8 个字符。修改邮箱或密码需要验证当前密码。</p><div class="form-actions"><button class="button primary" :disabled="busy">保存账户设置</button></div></form>
<section id="tour-appearance-settings" class="panel account-section theme-settings-section">
  <div class="section-title-row">
    <div>
      <h2>界面配色方案</h2>
    </div>
  </div>
  <div class="theme-cards-grid">
    <div
      v-for="scheme in colorSchemes"
      :key="scheme.id"
      class="theme-card"
      :class="{ 'is-active': currentColorScheme === scheme.id }"
      @click="handleColorSchemeSelect(scheme)"
      tabindex="0"
      role="button"
      :aria-pressed="currentColorScheme === scheme.id"
      @keydown.enter="handleColorSchemeSelect(scheme)"
      @keydown.space.prevent="handleColorSchemeSelect(scheme)"
    >
      <div class="theme-card-header">
        <div class="theme-card-title-group">
          <h3 class="theme-title">{{ scheme.name }}</h3>
          <p class="theme-subtitle">{{ scheme.subtitle }}</p>
        </div>
        <div class="theme-active-indicator" v-if="currentColorScheme === scheme.id">
          <span class="active-dot"></span> 当前生效
        </div>
      </div>
      <p class="theme-card-desc">{{ scheme.description }}</p>
      <div class="theme-card-footer">
        <div class="theme-palette-preview" title="配色基准色标：底色、主交互高亮、卡片暗调">
          <span
            v-for="(c, idx) in scheme.colors"
            :key="idx"
            class="color-dot"
            :style="{ backgroundColor: c }"
            :title="c"
          ></span>
        </div>
        <button
          type="button"
          class="button select-theme-btn"
          :class="currentColorScheme === scheme.id ? 'primary' : 'secondary'"
          @click.stop="handleColorSchemeSelect(scheme)"
        >
          {{ currentColorScheme === scheme.id ? '使用中' : '应用配色' }}
        </button>
      </div>
    </div>

    <!-- 自定义配色卡片 -->
    <div
      class="theme-card custom-theme-card"
      :class="{ 'is-active': currentColorScheme === 'custom' }"
      @click="handleSelectCustomScheme"
      tabindex="0"
      role="button"
      :aria-pressed="currentColorScheme === 'custom'"
      @keydown.enter="handleSelectCustomScheme"
      @keydown.space.prevent="handleSelectCustomScheme"
    >
      <div class="theme-card-header">
        <div class="theme-card-title-group">
          <h3 class="theme-title">{{ customColorScheme?.name || '自定义配色' }}</h3>
          <p class="theme-subtitle">个性化色调与暗色智能推导</p>
        </div>
        <div class="theme-active-indicator" v-if="currentColorScheme === 'custom'">
          <span class="active-dot"></span> 当前生效
        </div>
      </div>
      <p class="theme-card-desc">自主定制高亮强调色与背景深色，系统智能推导文字对比度与面板半透明质感。</p>
      <div class="theme-card-footer">
        <div class="theme-palette-preview" title="当前自定义主色、底色与面板色">
          <span
            class="color-dot"
            :style="{ backgroundColor: customColorScheme?.baseColor || '#071326' }"
            :title="customColorScheme?.baseColor"
          ></span>
          <span
            class="color-dot"
            :style="{ backgroundColor: customColorScheme?.primaryColor || '#38bdf8' }"
            :title="customColorScheme?.primaryColor"
          ></span>
          <span
            class="color-dot"
            :style="{ backgroundColor: customColorScheme?.panelHex || customColorScheme?.panelColor || '#0d203d' }"
            :title="customColorScheme?.panelHex || customColorScheme?.panelColor"
          ></span>
        </div>
        <div class="custom-card-actions">
          <button
            type="button"
            class="button secondary edit-theme-btn"
            @click.stop="openCustomThemeModal"
          >
            编辑
          </button>
          <button
            type="button"
            class="button select-theme-btn"
            :class="currentColorScheme === 'custom' ? 'primary' : 'secondary'"
            @click.stop="handleSelectCustomScheme"
          >
            {{ currentColorScheme === 'custom' ? '使用中' : '应用配色' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="panel account-section theme-settings-section">
  <div class="section-title-row">
    <div>
      <h2>界面背景效果</h2>
    </div>
  </div>
  <div class="theme-cards-grid">
    <div
      v-for="bg in bgOptions"
      :key="bg.id"
      class="theme-card"
      :class="{ 'is-active': currentBgType === bg.id }"
      @click="handleBgTypeSelect(bg)"
      tabindex="0"
      role="button"
      :aria-pressed="currentBgType === bg.id"
      @keydown.enter="handleBgTypeSelect(bg)"
      @keydown.space.prevent="handleBgTypeSelect(bg)"
    >
      <div class="theme-card-header">
        <div class="theme-card-title-group">
          <h3 class="theme-title">{{ bg.name }}</h3>
          <p class="theme-subtitle">{{ bg.subtitle }}</p>
        </div>
        <div class="theme-active-indicator" v-if="currentBgType === bg.id">
          <span class="active-dot"></span> 当前生效
        </div>
      </div>
      <p class="theme-card-desc">{{ bg.description }}</p>
      <div class="theme-card-footer">
        <div class="bg-card-hint muted" style="font-size: 11px;">
          <template v-if="bg.id === 'custom-local'">
            {{ localBgMeta ? `已载入: ${localBgMeta.name}` : '未选择本地文件' }}
          </template>
        </div>
        <button
          type="button"
          class="button select-theme-btn"
          :class="currentBgType === bg.id ? 'primary' : 'secondary'"
          @click.stop="handleBgTypeSelect(bg)"
        >
          {{ currentBgType === bg.id ? '使用中' : '应用背景' }}
        </button>
      </div>
    </div>
  </div>

  <!-- 本地背景管理面板 -->
  <div class="local-bg-control-box">
    <input
      ref="localFileInputRef"
      type="file"
      accept="image/*,video/*,.mov,.mp4,.webm,.m4v,.mkv"
      aria-label="选择本地背景图片或视频"
      style="display: none;"
      @change="onLocalFileSelected"
    />
    <div class="local-bg-header">
      <div class="action_has has_saved local-bg-icon" aria-hidden="true" title="本地持久化存储">
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" viewBox="0 0 24 24" stroke="currentColor" fill="none">
          <path d="m19,21H5c-1.1,0-2-.9-2-2V5c0-1.1.9-2,2-2h11l5,5v11c0,1.1-.9,2-2,2Z" stroke-linejoin="round" stroke-linecap="round" data-path="box"></path>
          <path d="M7 3L7 8L15 8" stroke-linejoin="round" stroke-linecap="round" data-path="line-top"></path>
          <path d="M17 20L17 13L7 13L7 20" stroke-linejoin="round" stroke-linecap="round" data-path="line-bottom"></path>
        </svg>
      </div>
      <div class="local-bg-title-wrap">
        <strong>本地图片 / 视频背景（纯前端本地持久化）</strong>
        <p class="muted">所选媒体仅存储于当前浏览器 IndexedDB 本地数据库</p>
      </div>
    </div>

    <div v-if="localBgMeta" class="local-bg-status-card">
      <div class="local-bg-meta-info">
        <span class="badge" :class="localBgMeta.type === 'video' ? 'cyan' : 'amber'">
          {{ localBgMeta.type === 'video' ? '本地视频' : '本地图片' }}
        </span>
        <span class="local-bg-filename mono" :title="localBgMeta.name">{{ localBgMeta.name }}</span>
        <span class="muted" style="font-size: 12px;">({{ formatFileSize(localBgMeta.size) }})</span>
      </div>
      <div class="local-bg-actions">
        <button
          type="button"
          class="button small secondary"
          :disabled="localBgUploading"
          @click="triggerLocalFileInput"
        >
          更换文件
        </button>
        <button
          type="button"
          class="button small danger"
          :disabled="localBgUploading"
          @click="onRemoveLocalBg"
        >
          清除
        </button>
      </div>
    </div>

    <div v-else class="local-bg-upload-zone" @click="triggerLocalFileInput">
      <div class="upload-zone-content">
        <div class="action_has has_saved upload-icon" aria-hidden="true">
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" viewBox="0 0 24 24" stroke="currentColor" fill="none">
            <path d="m19,21H5c-1.1,0-2-.9-2-2V5c0-1.1.9-2,2-2h11l5,5v11c0,1.1-.9,2-2,2Z" stroke-linejoin="round" stroke-linecap="round" data-path="box"></path>
            <path d="M7 3L7 8L15 8" stroke-linejoin="round" stroke-linecap="round" data-path="line-top"></path>
            <path d="M17 20L17 13L7 13L7 20" stroke-linejoin="round" stroke-linecap="round" data-path="line-bottom"></path>
          </svg>
        </div>
        <span class="upload-text">{{ localBgUploading ? '正在读取本地媒体...' : '点击选择本地图片或视频作为背景' }}</span>
        <span class="muted upload-tip">支持 MP4 / WebM / MOV 视频或 PNG / JPG / WebP 图片，自动适配满屏且静音循环播放</span>
      </div>
    </div>
  </div>
</section>

<section class="panel account-section theme-settings-section">
  <div class="section-title-row font-section-title-row">
    <div>
      <h2>界面字体方案</h2>
    </div>
    <!-- 统一模式 / 分离模式 切换 -->
    <div class="font-mode-segmented" role="tablist" aria-label="字体模式选择">
      <button
        type="button"
        class="font-mode-pill"
        :class="{ active: currentFontMode === 'unified' }"
        role="tab"
        :aria-selected="currentFontMode === 'unified'"
        @click="switchFontMode('unified')"
      >
        <AppIcon name="font" :size="13" />
        <span>统一模式（中英相同）</span>
      </button>
      <button
        type="button"
        class="font-mode-pill"
        :class="{ active: currentFontMode === 'split' }"
        role="tab"
        :aria-selected="currentFontMode === 'split'"
        @click="switchFontMode('split')"
      >
        <AppIcon name="translate" :size="13" />
        <span>分离模式（中英各异）</span>
      </button>
    </div>
  </div>

  <input
    ref="localFontInputRef"
    type="file"
    accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
    aria-label="选择本地字体文件"
    style="display: none;"
    @change="onLocalFontSelected"
  />

  <!-- 实时排版渲染预览面板 -->
  <div class="font-preview-stage" :class="{ 'is-custom': hasAnyCustomFont }">
    <div class="font-preview-header">
      <span class="font-preview-label">实时字体排版渲染预览（整站即刻生效）</span>
      <div class="preview-badges">
        <template v-if="currentFontMode === 'unified'">
          <span class="badge" :class="unifiedFontMeta ? 'cyan' : ''">
            {{ unifiedFontMeta ? `统一字体: ${unifiedFontMeta.name}` : '系统默认黑体' }}
          </span>
        </template>
        <template v-else>
          <span class="badge" :class="enFontMeta ? 'blue' : ''">
            {{ enFontMeta ? `西文: ${enFontMeta.name}` : '西文: 系统默认' }}
          </span>
          <span class="badge" :class="zhFontMeta ? 'amber' : ''">
            {{ zhFontMeta ? `中文: ${zhFontMeta.name}` : '中文: 系统默认' }}
          </span>
        </template>
      </div>
    </div>
    <div class="font-preview-body">
      <div class="font-preview-row">
        <span class="preview-tag muted">中文排版</span>
        <p class="font-preview-line-title">{{ siteConfig.labName }}</p>
      </div>
      <div class="font-preview-row">
        <span class="preview-tag muted">西文排版</span>
        <p class="font-preview-line-en">{{ siteConfig.siteSlogan || siteConfig.labShortName }}</p>
      </div>
      <div class="font-preview-row">
        <span class="preview-tag muted">科学数字与符号</span>
        <p class="font-preview-line-digits mono">0123456789 · Redshift z = 2.45 · Lambda-CDM Cosmology</p>
      </div>
    </div>
  </div>

  <!-- A. 统一模式视图 -->
  <div v-if="currentFontMode === 'unified'" class="theme-cards-grid font-cards-grid">
    <!-- 方案 1：系统现代黑体（默认方案） -->
    <div
      class="theme-card font-option-card"
      :class="{ 'is-active': !unifiedFontMeta }"
      @click="onRestoreAllDefaultFonts"
      tabindex="0"
      role="button"
      :aria-pressed="!unifiedFontMeta"
      @keydown.enter="onRestoreAllDefaultFonts"
      @keydown.space.prevent="onRestoreAllDefaultFonts"
    >
      <div class="theme-card-header">
        <div class="theme-card-title-group">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h3 class="theme-title">系统默认黑体</h3>
            <span class="badge">系统内置</span>
          </div>
          <p class="theme-subtitle">Inter · 苹方 · 微软雅黑</p>
        </div>
        <div class="theme-active-indicator" v-if="!unifiedFontMeta">
          <span class="active-dot"></span> 当前生效
        </div>
      </div>
      <p class="theme-card-desc">原生跨平台高品质无衬线字体栈，加载零延迟，兼容性最佳</p>
      <div class="theme-card-footer">
        <div class="bg-card-hint muted" style="font-size: 11px;">
          零额外开销 · 免下载
        </div>
        <button
          type="button"
          class="button select-theme-btn"
          :class="!unifiedFontMeta ? 'primary' : 'secondary'"
          @click.stop="onRestoreAllDefaultFonts"
        >
          {{ !unifiedFontMeta ? '使用中' : '恢复默认' }}
        </button>
      </div>
    </div>

    <!-- 方案 2：本地统一字体（中英相同） -->
    <div
      class="theme-card font-option-card"
      :class="{ 'is-active': !!unifiedFontMeta }"
      @click="triggerSlotUpload('unified')"
      tabindex="0"
      role="button"
      :aria-pressed="!!unifiedFontMeta"
      @keydown.enter="triggerSlotUpload('unified')"
      @keydown.space.prevent="triggerSlotUpload('unified')"
    >
      <div class="theme-card-header">
        <div class="theme-card-title-group">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h3 class="theme-title">本地统一字体</h3>
            <span class="badge amber">中英相同</span>
          </div>
          <p class="theme-subtitle">{{ unifiedFontMeta ? unifiedFontMeta.name : '未载入本地字体文件' }}</p>
        </div>
        <div class="theme-active-indicator" v-if="!!unifiedFontMeta">
          <span class="active-dot"></span> 当前生效
        </div>
      </div>
      <p class="theme-card-desc">纯本地存储（IndexedDB），中英文使用同一字体文件，支持 WOFF2 / WOFF / TTF / OTF。</p>
      <div class="theme-card-footer">
        <div class="bg-card-hint muted" style="font-size: 11px;">
          {{ unifiedFontMeta ? `${unifiedFontMeta.format.toUpperCase()} · ${formatFileSize(unifiedFontMeta.size)}` : '点击选择字体文件' }}
        </div>
        <div style="display: flex; gap: 6px;">
          <button
            type="button"
            class="button select-theme-btn"
            :class="!!unifiedFontMeta ? 'primary' : 'secondary'"
            @click.stop="triggerSlotUpload('unified')"
          >
            {{ !!unifiedFontMeta ? '更换字体' : '选择字体' }}
          </button>
          <button
            v-if="unifiedFontMeta"
            type="button"
            class="button small danger"
            @click.stop="onRemoveSlotFont('unified')"
          >
            清除
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- B. 分离模式视图（中英各异） -->
  <div v-else class="split-font-grid">
    <!-- 槽位 1：英文字体 / 西文字体 -->
    <div class="split-font-card" :class="{ 'has-file': !!enFontMeta }">
      <div class="split-font-card-header">
        <div class="slot-badge-wrap">
          <span class="badge blue">西文 / 数字字体</span>
          <span v-if="enFontMeta" class="active-pill"><span class="active-dot"></span>已生效</span>
          <span v-else class="muted slot-fallback-hint">使用系统默认 (Inter)</span>
        </div>
        <h3 class="slot-title">{{ enFontMeta ? enFontMeta.name : '未设置英文字体' }}</h3>
        <p class="slot-desc">渲染英文、数字、拉丁字符及物理公式常量符号</p>
      </div>

      <div v-if="enFontMeta" class="slot-info-box">
        <div class="slot-file-meta mono">
          <span class="badge">{{ enFontMeta.format.toUpperCase() }}</span>
          <span class="muted">{{ formatFileSize(enFontMeta.size) }}</span>
        </div>
        <div class="slot-action-row">
          <button type="button" class="button small secondary" :disabled="localFontUploading" @click="triggerSlotUpload('en')">
            更换英文字体
          </button>
          <button
            v-if="zhFontMeta && zhFontMeta.name !== enFontMeta.name"
            type="button"
            class="button small secondary ghost"
            title="将当前英文字体同时应用为中文字体"
            :disabled="localFontUploading"
            @click="onCopyFont('en', 'zh')"
          >
            中英共用此字体
          </button>
          <button type="button" class="button small danger" :disabled="localFontUploading" @click="onRemoveSlotFont('en')">
            清除
          </button>
        </div>
      </div>
      <div v-else class="slot-empty-box" @click="triggerSlotUpload('en')">
        <span class="upload-text">{{ localFontUploading ? '载入中…' : '点击选择西文/数字字体文件' }}</span>
        <span class="muted" style="font-size: 11px;">如 JetBrains Mono、Roboto、Inter、Fira Code 等</span>
        <button
          v-if="zhFontMeta"
          type="button"
          class="button small secondary ghost sync-hint-btn"
          @click.stop="onCopyFont('zh', 'en')"
        >
          采用已有中文字体（{{ zhFontMeta.name }}）
        </button>
      </div>
    </div>

    <!-- 槽位 2：中文字体 -->
    <div class="split-font-card" :class="{ 'has-file': !!zhFontMeta }">
      <div class="split-font-card-header">
        <div class="slot-badge-wrap">
          <span class="badge amber">中文字体</span>
          <span v-if="zhFontMeta" class="active-pill"><span class="active-dot"></span>已生效</span>
          <span v-else class="muted slot-fallback-hint">使用系统默认 (苹方/微软雅黑)</span>
        </div>
        <h3 class="slot-title">{{ zhFontMeta ? zhFontMeta.name : '未设置中文字体' }}</h3>
        <p class="slot-desc">渲染中文字符与全角标点</p>
      </div>

      <div v-if="zhFontMeta" class="slot-info-box">
        <div class="slot-file-meta mono">
          <span class="badge">{{ zhFontMeta.format.toUpperCase() }}</span>
          <span class="muted">{{ formatFileSize(zhFontMeta.size) }}</span>
        </div>
        <div class="slot-action-row">
          <button type="button" class="button small secondary" :disabled="localFontUploading" @click="triggerSlotUpload('zh')">
            更换中文字体
          </button>
          <button
            v-if="enFontMeta && enFontMeta.name !== zhFontMeta.name"
            type="button"
            class="button small secondary ghost"
            title="将当前中文字体同时应用为英文字体"
            :disabled="localFontUploading"
            @click="onCopyFont('zh', 'en')"
          >
            中英共用此字体
          </button>
          <button type="button" class="button small danger" :disabled="localFontUploading" @click="onRemoveSlotFont('zh')">
            清除
          </button>
        </div>
      </div>
      <div v-else class="slot-empty-box" @click="triggerSlotUpload('zh')">
        <span class="upload-text">{{ localFontUploading ? '载入中…' : '点击选择中文字体文件' }}</span>
        <span class="muted" style="font-size: 11px;">如 思源黑体、霞鹜文楷、得意黑、鸿蒙黑体等</span>
        <button
          v-if="enFontMeta"
          type="button"
          class="button small secondary ghost sync-hint-btn"
          @click.stop="onCopyFont('en', 'zh')"
        >
          采用已有英文字体（{{ enFontMeta.name }}）
        </button>
      </div>
    </div>
  </div>

  <div v-if="hasAnyCustomFont" class="font-section-footer">
    <button type="button" class="button small ghost" @click="onRestoreAllDefaultFonts">
      <AppIcon name="undo" :size="12" /> 恢复系统默认字体方案
    </button>
  </div>
</section>
<section class="panel account-section">
  <div class="section-title-row">
    <h2>常用快捷入口</h2>
    <span class="muted" style="font-size:12px;">快速前往文献收藏与反馈中心</span>
  </div>
  <div class="account-shortcuts-grid">
    <router-link to="/favorites" class="account-shortcut-card">
      <div class="shortcut-icon-box cyan"><AppIcon name="star" :size="18" /></div>
      <div class="shortcut-info">
        <strong class="shortcut-title">我的收藏</strong>
        <span class="shortcut-desc muted">查看与检索个人星标收藏的学术论文与文献</span>
      </div>
      <span class="shortcut-arrow">→</span>
    </router-link>
    <router-link :to="user.role === 'admin' ? '/admin/feedback' : '/feedback'" class="account-shortcut-card">
      <div class="shortcut-icon-box amber"><AppIcon name="mail" :size="18" /></div>
      <div class="shortcut-info">
        <strong class="shortcut-title">{{ user.role === 'admin' ? '反馈管理' : '问题与意见反馈' }}</strong>
        <span class="shortcut-desc muted">{{ user.role === 'admin' ? '查看并处理组员提交的系统使用反馈' : '向团组提交系统使用建议或遇到功能问题' }}</span>
      </div>
      <span class="shortcut-arrow">→</span>
    </router-link>
    <div class="account-shortcut-card" role="button" tabindex="0" @click="openTutorial({ role: user?.role, mandatory: false })">
      <div class="shortcut-icon-box" style="background: rgba(168, 85, 247, 0.15); color: #9333ea;"><AppIcon name="sparkles" :size="18" /></div>
      <div class="shortcut-info">
        <strong class="shortcut-title">新手功能导览教程</strong>
        <span class="shortcut-desc muted">回顾平台核心功能图文导引{{ user?.role === 'admin' ? '（含管理员专属管理功能）' : '' }}</span>
      </div>
      <span class="shortcut-arrow">→</span>
    </div>
  </div>
</section>

<section v-if="isActualAdmin" class="panel account-section theme-settings-section">
  <div class="section-title-row">
    <div>
      <h2>管理员视角模式</h2>
    </div>
    <div class="font-mode-segmented" role="tablist" aria-label="管理员视角模式选择">
      <button
        type="button"
        class="font-mode-pill"
        :class="{ active: adminViewMode === 'admin' }"
        role="tab"
        :aria-selected="adminViewMode === 'admin'"
        @click="handleSwitchAdminMode('admin')"
      >
        <AppIcon name="cpu" :size="13" />
        <span>管理模式</span>
      </button>
      <button
        type="button"
        class="font-mode-pill"
        :class="{ active: adminViewMode === 'user' }"
        role="tab"
        :aria-selected="adminViewMode === 'user'"
        @click="handleSwitchAdminMode('user')"
      >
        <AppIcon name="user" :size="13" />
        <span>用户模式</span>
      </button>
    </div>
  </div>
</section>
</template>

<!-- 成员管理（管理员专属） -->
<section v-if="user?.role === 'admin'" id="tour-member-management" class="panel account-section">
  <div class="section-title-row">
    <div>
      <h2>成员权限管理</h2>
      <span class="muted" style="font-size:12px;">管理组内成员身份与组会排期权限</span>
    </div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <button type="button" class="button small primary" @click="openCreateMemberModal">
        <AppIcon name="user-plus" :size="14" />新增成员
      </button>
      <span class="badge cyan">管理员功能</span>
    </div>
  </div>
  <div class="members-perm-list">
    <div v-for="member in members" :key="member.id" class="member-perm-card">
      <div class="member-info">
        <div class="member-presence-wrap">
          <div class="member-avatar-chip">
            <UserAvatar :user="member" />
          </div>
          <span :class="['presence-dot-corner', getMemberPresence(member)]"></span>
        </div>
        <span class="member-name" :title="member.nickname && member.nickname !== (member.real_name || member.name) ? '昵称: ' + member.nickname : undefined">{{ member.real_name || member.name || member.nickname }}</span>
        <span class="member-email mono">{{ member.email }}</span>
        <span :class="['badge', member.identity === 'teacher' ? 'amber' : '']">
          {{ member.identity === 'teacher' ? '导师' : '学生' }}
        </span>
        <span v-if="member.role === 'admin'" class="badge cyan">系统管理员</span>
      </div>
      <div class="member-actions">
        <button
          type="button"
          class="button small ghost"
          :disabled="permissionBusy"
          :title="member.identity === 'teacher' ? '切换为学生身份' : '切换为导师身份'"
          @click="toggleMemberIdentity(member)"
        >
          {{ member.identity === 'teacher' ? '设为学生' : '设为导师' }}
        </button>
        <button 
          type="button" 
          :class="['button small', member.role === 'admin' ? 'secondary' : 'ghost']"
          :disabled="permissionBusy || (member.id === user.id && members.filter(m => m.role === 'admin').length <= 1)"
          :title="member.role === 'admin' ? '取消管理员权限' : '提升为管理员'"
          @click="toggleAdminRole(member)"
        >
          {{ member.role === 'admin' ? '取消管理员' : '设为管理员' }}
        </button>
        <ThinHoundCheckbox
          :checked="member.role === 'admin' || member.can_manage_seminars"
          :disabled="member.role === 'admin'"
          :title="member.role === 'admin' ? '管理员默认拥有组会管理权限' : '允许新增和修改组会日程'"
          label-position="before"
          :size="26"
          @change="toggleSeminarPermission(member)"
        >
          组会管理
        </ThinHoundCheckbox>
        <button
          type="button"
          class="button small ghost danger"
          :disabled="permissionBusy || member.id === user.id"
          :title="member.id === user.id ? '不能删除自己的账号' : '删除该成员账号'"
          @click="deleteMember(member)"
        >
          <AppIcon name="trash" :size="14" />删除
        </button>
      </div>
    </div>
  </div>
</section>

<!-- 邀请码管理 -->
<section v-if="user?.role === 'admin'" id="tour-invite-codes" class="panel account-section">
  <div class="section-title-row">
    <h2>注册邀请码管理</h2>
    <span class="badge cyan">管理员功能</span>
  </div>

  <!-- 现有邀请码列表 -->
  <div class="invite-code-list">
    <div v-if="inviteCodes.length === 0" class="muted" style="padding: 12px 0;">暂无邀请码，请在下方创建。</div>
    <div v-for="ic in inviteCodes" :key="ic.id" class="invite-code-row">
      <div class="invite-code-info">
        <span class="invite-code-value mono">{{ ic.code }}</span>
        <span v-if="ic.note" class="invite-code-note muted">{{ ic.note }}</span>
        <span class="invite-code-target">{{ inviteAssignmentLabel(ic) }}</span>
        <span :class="['badge', ic.is_active ? 'green' : '']" style="font-size:11px;">{{ ic.is_active ? '激活' : '已停用' }}</span>
      </div>
      <div class="invite-code-actions">
        <div class="invite-choice" role="group" :aria-label="`${ic.code} 的权限类型`">
          <button type="button" :class="{ 'is-active': ic.registration_role === 'student' }" :aria-pressed="ic.registration_role === 'student'" :disabled="inviteCodeBusy" @click="updateInviteAssignment(ic, { registration_role: 'student' })">普通用户</button>
          <button type="button" :class="{ 'is-active': ic.registration_role === 'admin' }" :aria-pressed="ic.registration_role === 'admin'" :disabled="inviteCodeBusy" @click="updateInviteAssignment(ic, { registration_role: 'admin' })">管理员</button>
        </div>
        <div class="invite-choice" role="group" :aria-label="`${ic.code} 的学术身份`">
          <button type="button" :class="{ 'is-active': ic.registration_identity === 'student' }" :aria-pressed="ic.registration_identity === 'student'" :disabled="inviteCodeBusy" @click="updateInviteAssignment(ic, { registration_identity: 'student' })">学生</button>
          <button type="button" :class="{ 'is-active': ic.registration_identity === 'teacher' }" :aria-pressed="ic.registration_identity === 'teacher'" :disabled="inviteCodeBusy" @click="updateInviteAssignment(ic, { registration_identity: 'teacher' })">导师</button>
        </div>
        <button type="button" class="button small ghost" title="复制邀请码" @click="copyCode(ic.code)">复制</button>
        <button
          type="button"
          :class="['button small', ic.is_active ? 'secondary' : 'ghost']"
          :disabled="inviteCodeBusy"
          @click="toggleInviteCode(ic)"
        >{{ ic.is_active ? '停用' : '启用' }}</button>
        <button
          type="button"
          class="button small ghost danger"
          :disabled="inviteCodeBusy"
          @click="deleteInviteCode(ic)"
        >删除</button>
      </div>
    </div>
  </div>

  <!-- 创建新邀请码 -->
  <form class="invite-code-form" @submit.prevent="createInviteCode">
    <div class="invite-code-inputs">
      <input v-model="newCode" placeholder="邀请码（如 LAB-2026）" maxlength="100" required style="flex:1;" />
      <input v-model="newNote" placeholder="备注（可选）" maxlength="200" style="flex:1;" />
      <div class="invite-choice invite-choice-new" role="group" aria-label="新邀请码的权限类型">
        <button type="button" :class="{ 'is-active': newInviteRole === 'student' }" :aria-pressed="newInviteRole === 'student'" @click="newInviteRole = 'student'">普通用户</button>
        <button type="button" :class="{ 'is-active': newInviteRole === 'admin' }" :aria-pressed="newInviteRole === 'admin'" @click="newInviteRole = 'admin'">管理员</button>
      </div>
      <div class="invite-choice invite-choice-new" role="group" aria-label="新邀请码的学术身份">
        <button type="button" :class="{ 'is-active': newInviteIdentity === 'student' }" :aria-pressed="newInviteIdentity === 'student'" @click="newInviteIdentity = 'student'">学生</button>
        <button type="button" :class="{ 'is-active': newInviteIdentity === 'teacher' }" :aria-pressed="newInviteIdentity === 'teacher'" @click="newInviteIdentity = 'teacher'">导师</button>
      </div>
    </div>
    <button class="button primary small" :disabled="inviteCodeBusy || !newCode.trim()">创建邀请码</button>
  </form>
</section>

<!-- 课题组全站品牌与系统配置（管理员专属） -->
<section v-if="user?.role === 'admin'" id="tour-system-branding" class="panel account-section">
  <div class="section-title-row">
    <div>
      <h2>课题组品牌与系统配置</h2>
      <span class="muted" style="font-size:12px;">动态定制全站标题、缩写标识、标语与学术助理提示词</span>
    </div>
    <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #9333ea;">管理员专享</span>
  </div>

  <form @submit.prevent="saveSystemConfig" style="display: flex; flex-direction: column; gap: 16px; margin-top: 12px;">
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <span>课题组 / 团队全称 <strong style="color: #ef4444">*</strong></span>
        <input v-model="systemConfig.lab_name" required placeholder="如：智能感知与计算科学研究组" />
      </label>
      <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <span>英文缩写 / 标识 <strong style="color: #ef4444">*</strong></span>
        <input v-model="systemConfig.lab_short_name" required placeholder="如：LabOrbit / AISYS" />
      </label>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <span>全站副标题 / Slogan</span>
        <input v-model="systemConfig.site_slogan" placeholder="课题组内部科研协作与知识管理平台" />
      </label>
      <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <span>所属科研院所 / 高校</span>
        <input v-model="systemConfig.institution" placeholder="如：某某大学计算机系" />
      </label>
    </div>

    <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
      <span>默认组会研讨地点</span>
      <input v-model="systemConfig.default_location" placeholder="如：理科楼 302 / 腾讯会议" />
    </label>

    <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
      <span>AI 科研助理 System Prompt（系统提示词自定义）</span>
      <textarea v-model="systemConfig.ai_system_prompt" rows="3" placeholder="你是课题组的科研智能助手，精通文献研读与科学计算..." style="width:100%; border-radius: 8px; padding: 10px; font-family: inherit; font-size: 13px;"></textarea>
    </label>

    <div style="display: flex; justify-content: flex-end;">
      <button type="submit" class="button primary" :disabled="systemConfigSaving">
        <span v-if="systemConfigSaving">正在保存设置...</span>
        <span v-else>保存全站配置</span>
      </button>
    </div>
  </form>
</section>

<!-- 管理员手动创建成员弹窗 -->
<BaseDialog
  :open="showCreateMemberModal"
  title="手动创建组内成员账号"
  :busy="creatingMember"
  @close="showCreateMemberModal = false"
>
  <form class="create-member-modal-form" @submit.prevent="handleCreateMember">
    <p class="muted" style="font-size: 13px; margin-bottom: 16px; line-height: 1.6;">
      管理员可直接录入组内成员账号与初始密码。创建完成后，成员即可凭此邮箱与密码直接登录系统，无需额外注册邀请码。
    </p>

    <div class="form-row create-member-grid-row">
      <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <span>真实姓名 <strong style="color: var(--danger)">*</strong></span>
        <input v-model="createMemberForm.name" required placeholder="如 张三（用于组会主讲人辨认）" maxlength="100" />
      </label>
      <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <span>昵称（选填）</span>
        <input v-model="createMemberForm.nickname" placeholder="组内称呼或常用简称" maxlength="50" />
      </label>
    </div>

    <div class="form-row create-member-grid-row">
      <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <span>登录邮箱 <strong style="color: var(--danger)">*</strong></span>
        <input v-model="createMemberForm.email" type="email" required placeholder="如 name@univ.edu.cn" maxlength="100" />
      </label>
      <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <span>初始登录密码 <strong style="color: var(--danger)">*</strong></span>
        <input v-model="createMemberForm.password" type="password" required minlength="6" placeholder="至少 6 位密码" autocomplete="new-password" />
      </label>
    </div>

    <div class="form-row create-member-grid-row">
      <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <span>组内学术身份</span>
        <select v-model="createMemberForm.identity">
          <option value="student">学生 / 普通组员</option>
          <option value="teacher">导师 / PI</option>
        </select>
      </label>
      <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <span>权限角色</span>
        <select v-model="createMemberForm.role">
          <option value="student">普通用户</option>
          <option value="admin">系统管理员</option>
        </select>
      </label>
    </div>

    <div v-if="createMemberForm.role !== 'admin'" style="margin-top: 6px; margin-bottom: 18px;">
      <ThinHoundCheckbox
        v-model="createMemberForm.can_manage_seminars"
        label-position="after"
        :size="26"
      >
        授权管理组会排期（允许创建和修改组会日程）
      </ThinHoundCheckbox>
    </div>

    <div class="form-actions" style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--line); padding-top: 16px;">
      <button type="button" class="button secondary" :disabled="creatingMember" @click="showCreateMemberModal = false">
        取消
      </button>
      <button type="submit" class="button primary" :disabled="creatingMember">
        {{ creatingMember ? '正在创建…' : '立即创建成员' }}
      </button>
    </div>
  </form>
</BaseDialog>

<!-- 自定义界面配色弹窗 -->
<BaseDialog
  :open="showCustomThemeModal"
  title="自定义界面配色方案"
  :wide="true"
  :frame-style="previewDialogStyle"
  @close="closeCustomThemeModal"
>
  <div class="custom-theme-dialog-content">
    <p class="muted" style="font-size: 13px; margin-bottom: 16px; line-height: 1.6;">
      选择或输入心仪的主强调色与背景基底色，系统将自动计算前景色对比度、悬停高亮、边框微光及层叠面板半透明质感，确保全界面无障碍可读与视觉和谐。
    </p>

    <!-- 灵感预设模板快选 -->
    <div class="custom-templates-section">
      <div class="custom-subheading">灵感预设模板</div>
      <div class="custom-templates-grid">
        <button
          v-for="tpl in customPresetTemplates"
          :key="tpl.id"
          type="button"
          class="custom-tpl-btn"
          :class="{ 'is-selected': customThemeForm.primaryColor.toLowerCase() === tpl.primaryColor.toLowerCase() && customThemeForm.baseColor.toLowerCase() === tpl.baseColor.toLowerCase() }"
          @click="applyPresetTemplate(tpl)"
        >
          <div class="custom-tpl-preview">
            <span class="custom-tpl-dot" :style="{ backgroundColor: tpl.baseColor }"></span>
            <span class="custom-tpl-dot" :style="{ backgroundColor: tpl.primaryColor }"></span>
          </div>
          <span class="custom-tpl-name">{{ tpl.name }}</span>
        </button>
      </div>
    </div>

    <!-- 配色表单与实时预览两列布局 -->
    <div class="custom-form-and-preview-grid">
      <!-- 左列：参数配置 -->
      <div class="custom-config-col">
        <div class="custom-subheading">调色参数配置</div>

        <label class="custom-input-label">
          <span>方案名称</span>
          <input
            v-model="customThemeForm.name"
            type="text"
            maxlength="20"
            placeholder="例如：极光深蓝"
            class="custom-name-input"
          />
        </label>

        <div class="color-picker-item">
          <label class="color-picker-label">
            <span class="color-picker-title">主交互强调色（Primary Accent）</span>
            <span class="color-picker-desc">用于按钮高亮、选中态、状态圆点、边框微光</span>
          </label>
          <div class="color-input-combo">
            <input
              type="color"
              class="native-color-picker"
              :value="isValidHex(customThemeForm.primaryColor) ? customThemeForm.primaryColor : '#38bdf8'"
              @input="customThemeForm.primaryColor = $event.target.value"
            />
            <input
              type="text"
              class="hex-text-input"
              v-model="customThemeForm.primaryColor"
              placeholder="#38bdf8"
              maxlength="7"
            />
          </div>
        </div>

        <div class="color-picker-item">
          <label class="color-picker-label">
            <span class="color-picker-title">深色背景底色（Base Background）</span>
            <span class="color-picker-desc">全站最底层基底深色，建议使用低明度低饱和深色</span>
          </label>
          <div class="color-input-combo">
            <input
              type="color"
              class="native-color-picker"
              :value="isValidHex(customThemeForm.baseColor) ? customThemeForm.baseColor : '#071326'"
              @input="customThemeForm.baseColor = $event.target.value"
            />
            <input
              type="text"
              class="hex-text-input"
              v-model="customThemeForm.baseColor"
              placeholder="#071326"
              maxlength="7"
            />
          </div>
        </div>

        <label class="custom-checkbox-row">
          <input type="checkbox" v-model="customThemeForm.autoDerive" />
          <span>智能推导卡片面板与浮层表面色（推荐开启）</span>
        </label>

        <div v-if="!customThemeForm.autoDerive" class="color-picker-item" style="margin-top: 6px;">
          <label class="color-picker-label">
            <span class="color-picker-title">容器卡片表面色（Panel Surface）</span>
            <span class="color-picker-desc">用于卡片容器、导航顶栏、输入框背景</span>
          </label>
          <div class="color-input-combo">
            <input
              type="color"
              class="native-color-picker"
              :value="isValidHex(customThemeForm.panelColor) ? customThemeForm.panelColor : '#0d203d'"
              @input="customThemeForm.panelColor = $event.target.value"
            />
            <input
              type="text"
              class="hex-text-input"
              v-model="customThemeForm.panelColor"
              placeholder="#0d203d"
              maxlength="7"
            />
          </div>
        </div>
      </div>

      <!-- 右列：实时组件效果预览 -->
      <div class="custom-preview-col">
        <div class="custom-subheading">实时组件效果预览</div>
        <div
          class="custom-live-preview-box"
          :style="{
            backgroundColor: previewPalette.baseColor,
            borderColor: previewPalette.lineColor
          }"
        >
          <!-- 预览卡片 -->
          <div
            class="preview-mockup-panel"
            :style="{
              backgroundColor: previewPalette.panelColor,
              borderColor: previewPalette.lineColor
            }"
          >
            <div class="preview-mockup-header">
              <span
                class="preview-mockup-title"
                :style="{ color: '#f8fafc' }"
              >
                {{ customThemeForm.name || '自定义配色' }}
              </span>
              <span
                class="preview-mockup-badge"
                :style="{
                  backgroundColor: previewPalette.raised,
                  borderColor: previewPalette.lineColor,
                  color: previewPalette.primaryColor
                }"
              >
                实时演示
              </span>
            </div>

            <p class="preview-mockup-desc" :style="{ color: '#94a3b8' }">
              智能计算保证高亮元素上的文字具备极高对比度，面板半透明融合背景光影。
            </p>

            <div class="preview-mockup-elements">
              <button
                type="button"
                class="preview-mockup-btn-primary"
                :style="{
                  backgroundColor: previewPalette.primaryColor,
                  color: previewPalette.accentInk
                }"
              >
                主要操作
              </button>
              <button
                type="button"
                class="preview-mockup-btn-secondary"
                :style="{
                  backgroundColor: previewPalette.surfaceColor,
                  borderColor: previewPalette.lineColor,
                  color: previewPalette.primaryColor
                }"
              >
                次要按钮
              </button>
            </div>

            <div
              class="preview-mockup-subbox"
              :style="{
                backgroundColor: previewPalette.surfaceColor,
                borderColor: previewPalette.lineColor
              }"
            >
              <div
                class="preview-subbox-indicator"
                :style="{ backgroundColor: previewPalette.primaryColor }"
              ></div>
              <span :style="{ color: '#cbd5e1', fontSize: '12px' }">
                对比度优化反色：{{ previewPalette.accentInk }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 弹窗底部操作栏 -->
    <div class="custom-dialog-actions">
      <button
        type="button"
        class="button secondary"
        @click="handleResetCustomTheme"
      >
        恢复推荐默认
      </button>
      <div class="dialog-action-right">
        <button
          type="button"
          class="button secondary"
          @click="closeCustomThemeModal"
        >
          取消
        </button>
        <button
          type="button"
          class="button primary"
          @click="handleSaveAndApplyCustomTheme"
        >
          保存并应用
        </button>
      </div>
    </div>
  </div>
</BaseDialog>
</div></template>
