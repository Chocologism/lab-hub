import { ref } from 'vue'

/**
 * 全局 AI 助手生成状态管理
 * 供 Navbar、MobileNavBar 等全局导航栏订阅，提供后台生成中状态提示
 */
export const isAiGeneratingGlobally = ref(false)
