import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const kvStore = new Map<string, number>()
const kvCalls = { incr: 0, expire: 0 }
let kvShouldFail = false

vi.mock('@vercel/kv', () => ({
  kv: {
    incr: async (key: string) => {
      kvCalls.incr += 1
      if (kvShouldFail) throw new Error('kv down')
      const next = (kvStore.get(key) || 0) + 1
      kvStore.set(key, next)
      return next
    },
    expire: async () => {
      kvCalls.expire += 1
      return 1
    },
  },
}))

async function importFresh() {
  vi.resetModules()
  return import('@/utils/rateLimit')
}

describe('consumeRateLimit（記憶體模式）', () => {
  beforeEach(async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    const mod = await importFresh()
    mod.resetRateLimits()
  })

  it('在額度內允許並標記 scope=memory', async () => {
    const { consumeRateLimit } = await importFresh()
    const first = await consumeRateLimit('k', 2, 60_000)
    const second = await consumeRateLimit('k', 2, 60_000)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(first.scope).toBe('memory')
  })

  it('超過額度後擋下並回報重試秒數', async () => {
    const { consumeRateLimit } = await importFresh()
    await consumeRateLimit('k', 1, 60_000)
    const blocked = await consumeRateLimit('k', 1, 60_000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('不同 key 互不影響', async () => {
    const { consumeRateLimit } = await importFresh()
    await consumeRateLimit('a', 1, 60_000)
    const other = await consumeRateLimit('b', 1, 60_000)
    expect(other.ok).toBe(true)
  })
})

describe('consumeRateLimit（KV 模式，多實例共享計數）', () => {
  beforeEach(() => {
    process.env.KV_REST_API_URL = 'https://example.upstash.io'
    process.env.KV_REST_API_TOKEN = 'token'
    kvStore.clear()
    kvCalls.incr = 0
    kvCalls.expire = 0
    kvShouldFail = false
  })

  afterEach(() => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
  })

  it('使用 KV 計數並標記 scope=kv', async () => {
    const { consumeRateLimit } = await importFresh()
    const result = await consumeRateLimit('kv-key', 5, 60_000)
    expect(result.ok).toBe(true)
    expect(result.scope).toBe('kv')
    expect(kvCalls.incr).toBe(1)
    // 只有第一個請求會設 TTL
    expect(kvCalls.expire).toBe(1)
  })

  it('跨實例共用同一份計數（模擬第二個實例）', async () => {
    const instanceA = await importFresh()
    await instanceA.consumeRateLimit('shared', 2, 60_000)
    await instanceA.consumeRateLimit('shared', 2, 60_000)

    const instanceB = await importFresh()
    const blocked = await instanceB.consumeRateLimit('shared', 2, 60_000)
    expect(blocked.ok).toBe(false)
  })

  it('KV 故障時退回記憶體限流，不讓服務中斷', async () => {
    kvShouldFail = true
    const { consumeRateLimit } = await importFresh()
    const result = await consumeRateLimit('fallback', 5, 60_000)
    expect(result.ok).toBe(true)
    expect(result.scope).toBe('memory')
  })
})
