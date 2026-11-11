import { describe, expect, it } from 'vitest'
import { readBundledConfig } from '@/utils/appConfig'

/**
 * Vercel 的 serverless bundle 只在「有 import」時才追蹤檔案；
 * 用 fs 讀 src/config/app-config.json 在正式環境會失敗，
 * 因此必須有「打包進 bundle 的設定」作為後備，否則場地停用狀態與自訂名稱會消失。
 */
describe('readBundledConfig（正式環境的設定後備）', () => {
  const config = readBundledConfig()

  it('保留 repo 中設定的停用場地', () => {
    expect(config.disabledSpaceIds.length).toBeGreaterThan(0)
    expect(config.disabledSpaceIds).toContain('1')
  })

  it('保留後台自訂的場地名稱', () => {
    expect(config.spaceOverrides['3']?.name).toBe('C01會議室')
    expect(config.spaceOverrides['4']?.name).toBe('C02會議室')
  })

  it('保留事件過濾設定且結構正確', () => {
    expect(typeof config.eventFilters.spacesOnly).toBe('boolean')
    expect(Array.isArray(config.eventFilters.ignoreKeywords)).toBe(true)
  })
})
