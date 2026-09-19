import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSiteConfig } from './useSiteConfig'
import { systemApi } from '../api/client'

vi.mock('../api/client', () => ({
  systemApi: {
    getStatus: vi.fn(),
  },
}))

describe('useSiteConfig Composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provides default fallback configuration values', () => {
    const { siteConfig } = useSiteConfig()
    expect(siteConfig.labName).toBeDefined()
    expect(siteConfig.labShortName).toBeDefined()
    expect(siteConfig.siteSlogan).toBeDefined()
    expect(siteConfig.defaultLocation).toBeDefined()
  })

  it('fetches site status and updates reactive state accordingly', async () => {
    systemApi.getStatus.mockResolvedValueOnce({
      initialized: true,
      user_count: 5,
      lab_name: '量子信息与计算实验室',
      lab_short_name: 'QICLab',
      site_slogan: '连接物理与代码的桥梁',
      site_title: 'QICLab-Hub',
      institution: '中国科学技术大学',
      default_location: '理化大楼 1801',
    })

    const { siteConfig, fetchSiteStatus } = useSiteConfig()
    await fetchSiteStatus(true)

    expect(siteConfig.initialized).toBe(true)
    expect(siteConfig.userCount).toBe(5)
    expect(siteConfig.labName).toBe('量子信息与计算实验室')
    expect(siteConfig.labShortName).toBe('QICLab')
    expect(siteConfig.siteSlogan).toBe('连接物理与代码的桥梁')
    expect(siteConfig.institution).toBe('中国科学技术大学')
    expect(siteConfig.defaultLocation).toBe('理化大楼 1801')
    expect(siteConfig.loaded).toBe(true)
  })

  it('allows manual updating of local config dynamically', () => {
    const { siteConfig, updateLocalConfig } = useSiteConfig()
    updateLocalConfig({
      lab_name: '天文与空间科学实验室',
      lab_short_name: 'ASTROLAB',
      site_slogan: '探索星辰大海',
    })

    expect(siteConfig.labName).toBe('天文与空间科学实验室')
    expect(siteConfig.labShortName).toBe('ASTROLAB')
    expect(siteConfig.siteSlogan).toBe('探索星辰大海')
  })

  it('handles network error gracefully without crashing', async () => {
    systemApi.getStatus.mockRejectedValueOnce(new Error('Network error'))

    const { siteConfig, fetchSiteStatus } = useSiteConfig()
    await fetchSiteStatus(true)
    // Should not throw, should retain safe state
    expect(siteConfig.labName).toBeTruthy()
  })
})
