// 極簡固定視窗限流。
//
// 沒有外部服務時的權衡：計數存在單一 serverless 實例的記憶體中，屬於
// 「盡力而為」的防護（能擋掉單一來源的暴量請求與誤觸重送），不是嚴格的
// 全域限流。若之後接了 Redis，可把 consumeRateLimit 換成 KV 計數即可，
// 呼叫端不需要改。

import type { NextApiRequest } from 'next'

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 20_000

function purgeExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  if (buckets.size > MAX_BUCKETS) purgeExpired(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return {
      ok: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    }
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  return {
    ok: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

/** 測試用：清空所有計數 */
export function resetRateLimits(): void {
  buckets.clear()
}

export function getClientIp(req: NextApiRequest): string {
  const header = req.headers['x-forwarded-for']
  const forwarded = Array.isArray(header) ? header[0] : header
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
  return req.socket?.remoteAddress || 'unknown'
}
