import { describe, expect, it } from 'vitest'
import { isAllDayValue, toCalendarEventTime } from '@/utils/eventTime'

describe('toCalendarEventTime', () => {
  it('把 +08:00 位移轉成 UTC（避免 FullCalendar 忽略位移多算 8 小時）', () => {
    expect(toCalendarEventTime('2026-11-12T09:00:00+08:00')).toBe('2026-11-12T01:00:00.000Z')
    expect(toCalendarEventTime('2026-11-12T17:00:00+08:00')).toBe('2026-11-12T09:00:00.000Z')
  })

  it('已經是 UTC 的值維持正確瞬間', () => {
    expect(toCalendarEventTime('2026-11-12T01:00:00.000Z')).toBe('2026-11-12T01:00:00.000Z')
  })

  it('全天事件的日期字串原樣保留', () => {
    expect(toCalendarEventTime('2026-11-12')).toBe('2026-11-12')
  })

  it('空值與非法值回傳空字串', () => {
    expect(toCalendarEventTime('')).toBe('')
    expect(toCalendarEventTime(null)).toBe('')
    expect(toCalendarEventTime('not-a-date')).toBe('')
  })

  it('跨日邊界仍正確（台北 00:30 屬於前一天 UTC）', () => {
    expect(toCalendarEventTime('2026-11-12T00:30:00+08:00')).toBe('2026-11-11T16:30:00.000Z')
  })
})

describe('isAllDayValue', () => {
  it('只有日期才算全天', () => {
    expect(isAllDayValue('2026-11-12')).toBe(true)
    expect(isAllDayValue('2026-11-12T09:00:00+08:00')).toBe(false)
    expect(isAllDayValue(null)).toBe(false)
  })
})
