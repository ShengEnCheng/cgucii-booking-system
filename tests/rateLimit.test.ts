import { beforeEach, describe, expect, it } from 'vitest'
import { consumeRateLimit, resetRateLimits } from '@/utils/rateLimit'

describe('consumeRateLimit', () => {
  beforeEach(() => resetRateLimits())

  it('在額度內允許', () => {
    expect(consumeRateLimit('k', 2, 60_000).ok).toBe(true)
    expect(consumeRateLimit('k', 2, 60_000).ok).toBe(true)
  })

  it('超過額度後擋下並回報重試秒數', () => {
    consumeRateLimit('k', 1, 60_000)
    const blocked = consumeRateLimit('k', 1, 60_000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('不同 key 互不影響', () => {
    consumeRateLimit('a', 1, 60_000)
    expect(consumeRateLimit('b', 1, 60_000).ok).toBe(true)
  })
})
