import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getKvEnv, getKvSource, hasKv, kvDel, kvExpire, kvGet, kvGetJson, kvIncr, kvSet } from '@/utils/kv'

const fetchMock = vi.fn()

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }
}

describe('KV 環境變數支援', () => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  it('都沒有設定時回 null', () => {
    expect(getKvEnv()).toBeNull()
    expect(hasKv()).toBe(false)
    expect(getKvSource()).toBe('none')
  })

  it('支援 Vercel KV 命名', () => {
    process.env.KV_REST_API_URL = 'https://kv.example.com/'
    process.env.KV_REST_API_TOKEN = 't1'
    expect(getKvEnv()).toMatchObject({ url: 'https://kv.example.com', token: 't1', source: 'vercel-kv' })
  })

  it('支援 Upstash 命名（Vercel Marketplace 整合注入的變數）', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 't2'
    expect(getKvEnv()).toMatchObject({ url: 'https://upstash.example.com', token: 't2', source: 'upstash' })
    expect(getKvSource()).toBe('upstash')
  })

  it('兩種都存在時優先使用 Vercel KV 命名', () => {
    process.env.KV_REST_API_URL = 'https://kv.example.com'
    process.env.KV_REST_API_TOKEN = 't1'
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 't2'
    expect(getKvSource()).toBe('vercel-kv')
  })
})

describe('KV REST 指令', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    // 清掉前一個 describe 可能留下的 Upstash 變數，避免測試互相污染
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    process.env.KV_REST_API_URL = 'https://kv.example.com'
    process.env.KV_REST_API_TOKEN = 'secret-token'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
  })

  it('kvGet 帶 Bearer token 並回傳字串', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: 'hello' }))
    await expect(kvGet('my key')).resolves.toBe('hello')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://kv.example.com/get/my%20key')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token')
  })

  it('kvGet 不存在時回 null', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: null }))
    await expect(kvGet('missing')).resolves.toBeNull()
  })

  it('kvGetJson 解析 JSON 內容', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: JSON.stringify({ a: 1 }) }))
    await expect(kvGetJson<{ a: number }>('cfg')).resolves.toEqual({ a: 1 })
  })

  it('kvSet 物件會序列化，並可帶 NX / EX', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: 'OK' }))
    const ok = await kvSet('lock:k', { v: 1 }, { onlyIfAbsent: true, ttlSeconds: 60 })
    expect(ok).toBe(true)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://kv.example.com/set/lock%3Ak?NX=&EX=60')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"v":1}')
  })

  it('kvSet NX 條件不成立時回 false', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: null }))
    await expect(kvSet('lock:k', 'token', { onlyIfAbsent: true, ttlSeconds: 60 })).resolves.toBe(false)
  })

  it('kvDel / kvIncr / kvExpire 打到正確路徑', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: 1 }))
    await kvDel('a')
    await expect(kvIncr('b')).resolves.toBe(1)
    await kvExpire('c', 30)

    const urls = fetchMock.mock.calls.map((call) => call[0])
    expect(urls).toEqual([
      'https://kv.example.com/del/a',
      'https://kv.example.com/incr/b',
      'https://kv.example.com/expire/c/30',
    ])
  })

  it('HTTP 錯誤會拋出且訊息含狀態碼', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, false, 500))
    await expect(kvGet('x')).rejects.toThrow(/500/)
  })

  it('未設定環境變數時呼叫會拋錯（避免靜默失敗）', async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    await expect(kvGet('x')).rejects.toThrow('KV 未設定')
  })
})
