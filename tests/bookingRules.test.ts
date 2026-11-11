import { describe, expect, it } from 'vitest'
import {
  generateEndTimeOptions,
  generateTimeOptions,
  isValidDateString,
  taipeiDayRange,
  todayInTaipei,
  validateBookingWindow,
} from '@/config/bookingRules'

const now = new Date('2026-11-11T10:00:00+08:00')

describe('isValidDateString', () => {
  it('擋掉不存在的日期（JS 會自動進位）', () => {
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('2026-04-31')).toBe(false)
    expect(isValidDateString('2026-13-01')).toBe(false)
  })

  it('接受合法日期與閏年', () => {
    expect(isValidDateString('2026-02-28')).toBe(true)
    expect(isValidDateString('2028-02-29')).toBe(true)
  })
})

describe('validateBookingWindow', () => {
  const base = { date: '2026-12-01', startTime: '10:00', endTime: '12:00' }

  it('合法時段通過', () => {
    const result = validateBookingWindow(base, { now })
    expect(result.ok).toBe(true)
  })

  it('超出營業時間會被擋下', () => {
    expect(validateBookingWindow({ ...base, startTime: '07:00' }, { now }).ok).toBe(false)
    expect(validateBookingWindow({ ...base, endTime: '23:00' }, { now }).ok).toBe(false)
  })

  it('時長限制（30 分鐘可、15 分鐘不可）', () => {
    expect(
      validateBookingWindow({ date: '2026-12-01', startTime: '10:00', endTime: '10:30' }, { now }).ok
    ).toBe(true)
    expect(
      validateBookingWindow({ date: '2026-12-01', startTime: '10:00', endTime: '10:15' }, { now }).ok
    ).toBe(false)
    expect(
      validateBookingWindow({ date: '2026-12-01', startTime: '09:00', endTime: '15:00' }, { now }).ok
    ).toBe(false)
  })

  it('不可預約過去', () => {
    const later = new Date('2026-12-01T13:00:00+08:00')
    expect(validateBookingWindow(base, { now: later }).ok).toBe(false)
  })

  it('不可超過可預約天數', () => {
    expect(
      validateBookingWindow({ date: '2027-06-01', startTime: '10:00', endTime: '11:00' }, { now }).ok
    ).toBe(false)
  })

  it('結束時間必須晚於開始時間', () => {
    expect(
      validateBookingWindow({ date: '2026-12-01', startTime: '12:00', endTime: '10:00' }, { now }).ok
    ).toBe(false)
  })
})

describe('時間選項', () => {
  it('依營業時間與 30 分鐘粒度產生', () => {
    const options = generateTimeOptions()
    expect(options[0]).toBe('08:00')
    expect(options).toContain('09:30')
    expect(options).toContain('11:30')
    expect(options[options.length - 1]).toBe('21:30')
    expect(options).toHaveLength(28)
  })

  it('結束時間一定晚於開始時間且不超過打烊', () => {
    expect(generateEndTimeOptions('21:00')).toEqual(['21:30', '22:00'])
    expect(generateEndTimeOptions('21:30')).toEqual(['22:00'])
  })
})

describe('台北時區工具', () => {
  it('todayInTaipei 不受裝置時區影響', () => {
    expect(todayInTaipei(new Date('2026-03-01T00:30:00+08:00'))).toBe('2026-03-01')
  })

  it('taipeiDayRange 產生當日邊界', () => {
    const range = taipeiDayRange('2026-12-01')
    expect(range.timeMin).toBe('2026-11-30T16:00:00.000Z')
    expect(range.timeMax).toBe('2026-12-01T15:59:59.000Z')
  })
})
