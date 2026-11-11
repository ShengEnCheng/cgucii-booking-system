import { describe, expect, it } from 'vitest'
import {
  findSpaceByNameOrId,
  normalizeAppConfig,
  resolveDisabledSpaceIds,
  spaceDisplayName,
} from '@/utils/configSchema'

describe('normalizeAppConfig', () => {
  it('預設值不包含任何被停用的場地（避免讀取失敗時場地消失）', () => {
    const config = normalizeAppConfig()
    expect(config.disabledSpaceIds).toEqual([])
    expect(config.disabledSpaceNames).toEqual([])
  })

  it('丟棄型別錯誤的 spaceOverrides，避免 toLowerCase 崩潰', () => {
    const config = normalizeAppConfig({
      spaceOverrides: { '3': { name: 123 as unknown as string }, '4': { name: 'C02' } },
    })
    expect(config.spaceOverrides['3']).toBeUndefined()
    expect(config.spaceOverrides['4']).toEqual({ name: 'C02' })
  })

  it('字串欄位會 trim 並截斷', () => {
    const config = normalizeAppConfig({ googleCalendarId: '  abc@group.calendar.google.com  ' })
    expect(config.googleCalendarId).toBe('abc@group.calendar.google.com')
  })

  it('非陣列的停用清單不會炸掉', () => {
    const config = normalizeAppConfig({ disabledSpaceIds: 'x' as unknown as string[] })
    expect(config.disabledSpaceIds).toEqual([])
  })
})

describe('resolveDisabledSpaceIds', () => {
  it('名稱停用會換算成 id', () => {
    const config = normalizeAppConfig({ disabledSpaceNames: ['小會議室'] })
    expect(resolveDisabledSpaceIds(config)).toContain('3')
  })

  it('自訂顯示名稱也能對應回 id', () => {
    const config = normalizeAppConfig({
      disabledSpaceNames: ['C01會議室'],
      spaceOverrides: { '3': { name: 'C01會議室' } },
    })
    expect(resolveDisabledSpaceIds(config)).toContain('3')
  })

  it('id 停用優先', () => {
    const config = normalizeAppConfig({ disabledSpaceIds: ['4'] })
    expect(resolveDisabledSpaceIds(config)).toEqual(['4'])
  })
})

describe('顯示名稱與查詢', () => {
  it('可用自訂名稱找回場地', () => {
    const config = normalizeAppConfig({ spaceOverrides: { '3': { name: 'C01會議室' } } })
    expect(findSpaceByNameOrId('C01會議室', config)?.id).toBe('3')
    expect(findSpaceByNameOrId('3', config)?.id).toBe('3')
    expect(findSpaceByNameOrId('不存在的場地', config)).toBeUndefined()
  })

  it('spaceDisplayName 套用覆寫', () => {
    const config = normalizeAppConfig({ spaceOverrides: { '3': { name: 'C01會議室' } } })
    expect(spaceDisplayName({ id: '3', name: '小會議室' }, config)).toBe('C01會議室')
  })
})
