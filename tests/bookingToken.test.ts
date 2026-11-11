import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildCancelUrl,
  createCancelToken,
  resolveOrigin,
  verifyCancelToken,
} from '@/utils/bookingToken'

const SECRET = 'test-secret-key-at-least-16-chars'

describe('取消 token 簽章', () => {
  beforeEach(() => {
    process.env.BOOKING_TOKEN_SECRET = SECRET
  })

  afterEach(() => {
    delete process.env.BOOKING_TOKEN_SECRET
  })

  it('簽發後可驗證回原始內容', () => {
    const token = createCancelToken('event-123', '3')
    const payload = verifyCancelToken(token)
    expect(payload?.eventId).toBe('event-123')
    expect(payload?.spaceId).toBe('3')
    expect(payload?.expiresAt).toBeGreaterThan(Date.now())
  })

  it('有效期限為 30 天', () => {
    const now = 1_700_000_000_000
    const token = createCancelToken('e1', '3', now)
    const payload = verifyCancelToken(token, now + 29 * 24 * 60 * 60 * 1000)
    expect(payload).not.toBeNull()
    expect(verifyCancelToken(token, now + 31 * 24 * 60 * 60 * 1000)).toBeNull()
  })

  it('內容被竄改會驗證失敗', () => {
    const token = createCancelToken('event-123', '3')
    const [body, signature] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({ eventId: 'other-event', spaceId: '3', expiresAt: Date.now() + 10000 })
    ).toString('base64url')
    expect(verifyCancelToken(`${forged}.${signature}`)).toBeNull()
    expect(verifyCancelToken(`${body}.${signature}x`)).toBeNull()
  })

  it('換了簽章金鑰就失效', () => {
    const token = createCancelToken('event-123', '3')
    process.env.BOOKING_TOKEN_SECRET = 'a-completely-different-secret'
    expect(verifyCancelToken(token)).toBeNull()
  })

  it('格式錯誤或空值回傳 null', () => {
    expect(verifyCancelToken('')).toBeNull()
    expect(verifyCancelToken('no-signature')).toBeNull()
    expect(verifyCancelToken(undefined)).toBeNull()
  })
})

describe('取消連結組裝', () => {
  it('由 forwarded headers 推導 origin', () => {
    expect(
      resolveOrigin({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'booking.example.edu' })
    ).toBe('https://booking.example.edu')
    expect(resolveOrigin({ host: 'localhost:3000' })).toBe('https://localhost:3000')
    expect(resolveOrigin({})).toBe('')
  })

  it('buildCancelUrl 會處理結尾斜線與編碼', () => {
    expect(buildCancelUrl('https://x.edu/', 'a.b')).toBe('https://x.edu/cancel?token=a.b')
    expect(buildCancelUrl('', 'a b')).toBe('/cancel?token=a%20b')
  })
})
