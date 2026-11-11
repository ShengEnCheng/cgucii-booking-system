import { describe, expect, it } from 'vitest'
import { taipeiMonthRange } from '@/config/bookingRules'
import {
  fetchRawCalendarEvents,
  getCalendarClient,
  getGoogleAuth,
  getEffectiveCalendarId,
} from '@/utils/googleCalendarService'
import { getKvEnv, kvDel, kvExpire, kvGet, kvIncr, kvSet } from '@/utils/kv'

const hasCredentials = Boolean(process.env.GOOGLE_CREDENTIALS)
const rawCalendarId = process.env.CALENDAR_ID
const hasUsableCalendarId = Boolean(rawCalendarId && !rawCalendarId.startsWith('REPLACE_'))
const testCalendarId = process.env.INTEGRATION_TEST_CALENDAR_ID
const hasKv = getKvEnv() !== null

function isoForTestDay(): { timeMin: string; timeMax: string; date: string } {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return {
    timeMin: `${y}-${m}-${d}T02:00:00+08:00`,
    timeMax: `${y}-${m}-${d}T04:00:00+08:00`,
    date: `${y}-${m}-${d}`,
  }
}

describe.runIf(hasCredentials)('Google 憑證', () => {
  it('可以用服務帳戶換到 access token', async () => {
    const auth = await getGoogleAuth()
    const token = await auth.getAccessToken()
    expect(token.token).toBeTruthy()
    // google-auth-library 取得 token 後會把到期時間寫在 credentials.expiry_date
    expect(typeof auth.credentials.expiry_date).toBe('number')
    expect(auth.credentials.expiry_date).toBeGreaterThan(Date.now())
  })
})

describe.runIf(hasCredentials && hasUsableCalendarId)('Google Calendar 整合（唯讀）', () => {
  it('讀取當月事件並符合預期結構', async () => {
    const calendarId = await getEffectiveCalendarId()
    const range = taipeiMonthRange()

    const events = await fetchRawCalendarEvents({
      calendarId,
      timeMin: new Date(`${range.start}T00:00:00+08:00`).toISOString(),
      timeMax: new Date(`${range.end}T23:59:59+08:00`).toISOString(),
    })

    expect(Array.isArray(events)).toBe(true)
    // 真實日曆可能當月沒有活動，因此只驗證結構
    for (const event of events.slice(0, 5)) {
      expect(typeof event.id).toBe('string')
      const start = event.start?.dateTime || event.start?.date
      const end = event.end?.dateTime || event.end?.date
      expect(start).toBeTruthy()
      expect(end).toBeTruthy()
      expect(new Date(start as string).getTime()).toBeLessThan(new Date(end as string).getTime())
    }
  })
})

describe.runIf(hasCredentials && Boolean(testCalendarId))('Google Calendar 整合（讀寫，需專用測試日曆）', () => {
  it('建立事件 → 讀得到 → 刪除', async () => {
    const calendarId = testCalendarId as string
    const calendar = await getCalendarClient()
    const slot = isoForTestDay()

    const created = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: '[integration-test] 自動化測試，請忽略',
        description: '[SPACE:3]\n申請者：integration-test',
        start: { dateTime: slot.timeMin, timeZone: 'Asia/Taipei' },
        end: { dateTime: slot.timeMax, timeZone: 'Asia/Taipei' },
      },
    })

    const eventId = created.data.id
    expect(eventId).toBeTruthy()

    try {
      const events = await fetchRawCalendarEvents({
        calendarId,
        timeMin: slot.timeMin,
        timeMax: slot.timeMax,
      })
      expect(events.some((event) => event.id === eventId)).toBe(true)
    } finally {
      await calendar.events
        .delete({ calendarId, eventId: eventId as string })
        .catch(() => undefined)
    }
  })
})

describe.runIf(hasKv)('Redis（Upstash）整合', () => {
  const prefix = `integration-test:${Date.now()}`

  it('SET NX 語意正確（分散式鎖的基礎）', async () => {
    const key = `${prefix}:lock`
    expect(await kvSet(key, 'a', { onlyIfAbsent: true, ttlSeconds: 30 })).toBe(true)
    // 第二次取鎖必須失敗
    expect(await kvSet(key, 'b', { onlyIfAbsent: true, ttlSeconds: 30 })).toBe(false)
    expect(await kvGet(key)).toBe('a')

    // 釋放後可再取得
    await kvDel(key)
    expect(await kvSet(key, 'c', { onlyIfAbsent: true, ttlSeconds: 30 })).toBe(true)
    await kvDel(key)
  })

  it('INCR 與 EXPIRE 可用（限流計數）', async () => {
    const key = `${prefix}:counter`
    expect(await kvIncr(key)).toBe(1)
    expect(await kvIncr(key)).toBe(2)
    await kvExpire(key, 30)
    expect(await kvGet(key)).toBe('2')
    await kvDel(key)
  })

  it('物件會以 JSON 存取（後台設定）', async () => {
    const key = `${prefix}:json`
    await kvSet(key, { disabledSpaceIds: ['1'], hideDisabled: true })
    const raw = await kvGet(key)
    expect(JSON.parse(raw as string)).toEqual({ disabledSpaceIds: ['1'], hideDisabled: true })
    await kvDel(key)
  })
})
