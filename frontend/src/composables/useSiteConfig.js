import { ref, reactive } from 'vue'
import { systemApi } from '../api/client'

const siteConfig = reactive({
  initialized: null, // null = 未知/检测中, true = 已初始化, false = 未初始化
  userCount: 0,
  labName: '科研协作平台',
  labShortName: 'LabHub',
  siteSlogan: '课题组科研协作与知识管理平台',
  siteTitle: 'Lab-Hub',
  institution: '',
  defaultLocation: '研讨室 / 腾讯会议',
  loaded: false,
})

let fetchPromise = null

export function useSiteConfig() {
  async function fetchSiteStatus(force = false) {
    if (fetchPromise && !force) return fetchPromise

    fetchPromise = (async () => {
      try {
        const data = await systemApi.getStatus()
        if (data) {
          siteConfig.initialized = !!data.initialized
          siteConfig.userCount = typeof data.user_count === 'number' ? data.user_count : 0
          if (data.lab_name) siteConfig.labName = data.lab_name
          if (data.lab_short_name) siteConfig.labShortName = data.lab_short_name
          if (data.site_slogan) siteConfig.siteSlogan = data.site_slogan
          if (data.site_title) siteConfig.siteTitle = data.site_title
          if (data.institution) siteConfig.institution = data.institution
          if (data.default_location) siteConfig.defaultLocation = data.default_location
          siteConfig.loaded = true

          // 同步网页标题
          if (typeof document !== 'undefined') {
            document.title = `${siteConfig.labName} | ${siteConfig.siteSlogan || '科研协作平台'}`
          }
        }
      } catch (err) {
        console.warn('获取系统站点配置状态失败:', err)
        // 若网络故障但已有缓存，则不打断
        if (siteConfig.initialized === null) {
          siteConfig.initialized = true
        }
      } finally {
        fetchPromise = null
      }
      return siteConfig
    })()

    return fetchPromise
  }

  function updateLocalConfig(newSettings) {
    if (newSettings.lab_name) siteConfig.labName = newSettings.lab_name
    if (newSettings.lab_short_name) siteConfig.labShortName = newSettings.lab_short_name
    if (newSettings.site_slogan) siteConfig.siteSlogan = newSettings.site_slogan
    if (newSettings.site_title) siteConfig.siteTitle = newSettings.site_title
    if (newSettings.institution !== undefined) siteConfig.institution = newSettings.institution
    if (newSettings.default_location !== undefined) siteConfig.defaultLocation = newSettings.default_location
    if (typeof document !== 'undefined') {
      document.title = `${siteConfig.labName} | ${siteConfig.siteSlogan || '科研协作平台'}`
    }
  }

  return {
    siteConfig,
    fetchSiteStatus,
    updateLocalConfig,
  }
}
