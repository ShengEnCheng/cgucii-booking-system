import { describe, expect, it } from 'vitest'
import {
  buildSpaceMarker,
  checkSpaceAvailability,
  getEventSpaceId,
  getSpaceKeywords,
  isEventForSpace,
} from '@/utils/availabilityUtils'

const taipei = (value: string) => `${value}+08:00`

describe('getSpaceKeywords', () => {
  it('包含歷史別名與自訂名稱', () => {
    const keywords = getSpaceKeywords('3', { '3': { name: 'C01會議室' } })
    expect(keywords).toContain('c01')
    expect(keywords).toContain('小會議室')
    expect(keywords).toContain('c01會議室')
  })

  it('可用顯示名稱反查場地', () => {
    const keywords = getSpaceKeywords('C02會議室', { '4': { name: 'C02會議室' } })
    expect(keywords).toContain('c02')
  })
})

describe('isEventForSpace', () => {
  const kw3 = getSpaceKeywords('3')
  const kw4 = getSpaceKeywords('4')

  it('結構化標記優先於標題關鍵字', () => {
    const event = {
      summary: 'C02會議室 - 育成廠商',
      description: `${buildSpaceMarker('3')}\n申請者：王小明`,
    }
    expect(getEventSpaceId(event)).toBe('3')
    // 標記說是 3 號場地，即使標題寫 C02 也不算 4 號場地
    expect(isEventForSpace(event, kw3, '3')).toBe(true)
    expect(isEventForSpace(event, kw4, '4')).toBe(false)
  })

  it('純數字 id 不可當子字串比對（C01 不應被認成 1 號場地）', () => {
    const kw1 = getSpaceKeywords('1')
    const kw2 = getSpaceKeywords('2')
    const event = { summary: 'C01會議室 - 育成廠商 - 海力克', location: '' }
    expect(isEventForSpace(event, kw1, '1')).toBe(false)
    expect(isEventForSpace(event, kw2, '2')).toBe(false)
    // 正確應該認成 3 號場地
    expect(isEventForSpace(event, kw3, '3')).toBe(true)
  })

  it('舊事件（無標記）用標題與地點比對', () => {
    expect(isEventForSpace({ summary: 'C01會議室 - 月會' }, kw3, '3')).toBe(true)
    expect(isEventForSpace({ summary: '月會', location: 'C02會議室' }, kw4, '4')).toBe(true)
    expect(isEventForSpace({ summary: '月會', location: 'C02會議室' }, kw3, '3')).toBe(false)
  })

  it('不能用「用途」欄位毒化其他場地的可用性', () => {
    const poisoned = {
      summary: 'C01會議室 - 育成廠商',
      description: `${buildSpaceMarker('3')}\n用途：C02會議室 週年慶`,
    }
    expect(isEventForSpace(poisoned, kw4, '4')).toBe(false)
  })

  it('舊事件若在「地點」行描述仍可比對', () => {
    const legacy = { summary: '內部會議', description: '地點：C02會議室 3F' }
    expect(isEventForSpace(legacy, kw4, '4')).toBe(true)
  })
})

describe('checkSpaceAvailability', () => {
  const events = [
    {
      summary: 'C01會議室 - 育成廠商',
      start: { dateTime: taipei('2026-12-01T10:00:00') },
      end: { dateTime: taipei('2026-12-01T11:00:00') },
    },
  ]

  it('重疊時段視為不可用', () => {
    expect(
      checkSpaceAvailability(events, '小會議室', '2026-12-01', '10:00', '11:00', undefined, '3')
    ).toBe(false)
    expect(
      checkSpaceAvailability(events, '小會議室', '2026-12-01', '10:30', '11:30', undefined, '3')
    ).toBe(false)
  })

  it('相鄰時段不算衝突', () => {
    expect(
      checkSpaceAvailability(events, '小會議室', '2026-12-01', '11:00', '12:00', undefined, '3')
    ).toBe(true)
    expect(
      checkSpaceAvailability(events, '小會議室', '2026-12-01', '09:00', '10:00', undefined, '3')
    ).toBe(true)
  })

  it('其他場地的預約不影響本場地', () => {
    expect(
      checkSpaceAvailability(events, '多功能會議室', '2026-12-01', '10:00', '11:00', undefined, '4')
    ).toBe(true)
  })

  it('結束時間早於開始時間會拋錯', () => {
    expect(() =>
      checkSpaceAvailability([], '小會議室', '2026-12-01', '11:00', '10:00', undefined, '3')
    ).toThrow()
  })
})
