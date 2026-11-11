// 公開端點的限流。
//
// 有設定 Vercel KV（正式環境）時使用 KV 的原子 INCR 做固定視窗計數，
// 多個 serverless 實例共享同一份計數；沒有 KV 時退回單實例記憶體計數
//（本機開發、或 KV 暫時故障時的保底，只在單一實例內有效）。

import type { NextApiRequest } from 'next'
import { hasKv, kvExpire, kvIncr } from './kv'

type MemoryBucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, MemoryBucket>()
const MAX_BUCKETS = 20_000

export type RateLimitScope = 'kv' | 'memory'

export type RateLimitResult = {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
  scope: RateLimitScope
}

function consumeMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey)
    }
  }

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return {
      ok: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      scope: 'memory',
    }
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      scope: 'memory',
    }
  }

  existing.count += 1
  return {
    ok: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    scope: 'memory',
  }
}

/**
 * 消耗一次額度。key 建議帶上端點名稱與用戶端 IP。
 * 固定視窗：key 內含 windowIndex，時間到自然換算新 key，不需清理。
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (hasKv()) {
    try {
      const windowIndex = Math.floor(Date.now() / windowMs)
      const kvKey = `ratelimit:${key}:${windowIndex}`

      const count = await kvIncr(kvKey)
      if (count === 1) {
        // 第一個請求才設 TTL，避免每次都延長
        await kvExpire(kvKey, Math.ceil(windowMs / 1000) + 1)
      }

      const resetAt = (windowIndex + 1) * windowMs
      return {
        ok: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
        scope: 'kv',
      }
    } catch (error) {
      // KV 故障不能讓整個站不能用，退回單實例限流並留下告警
      console.error('[rateLimit] KV 計數失敗，改用記憶體限流:', error)
    }
  }

  return consumeMemory(key, limit, windowMs)
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
