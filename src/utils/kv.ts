// Redis（Vercel KV / Upstash）存取層。
//
// 只用 Upstash REST API（HTTP + Bearer token），直接支援兩種環境變數命名：
//   - Vercel KV 相容：KV_REST_API_URL / KV_REST_API_TOKEN
//   - Upstash 原生：  UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// 這樣不論從 Vercel Marketplace 接 Upstash、或沿用舊 KV 變數都能運作，
// 也不必再依賴已棄用的 @vercel/kv 套件。

type KvEnv = {
  url: string
  token: string
  source: 'vercel-kv' | 'upstash'
}

const REQUEST_TIMEOUT_MS = 5000

export function getKvEnv(): KvEnv | null {
  const kvUrl = process.env.KV_REST_API_URL
  const kvToken = process.env.KV_REST_API_TOKEN
  if (kvUrl && kvToken) {
    return { url: kvUrl.replace(/\/+$/, ''), token: kvToken, source: 'vercel-kv' }
  }

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (upstashUrl && upstashToken) {
    return { url: upstashUrl.replace(/\/+$/, ''), token: upstashToken, source: 'upstash' }
  }

  return null
}

export function hasKv(): boolean {
  return getKvEnv() !== null
}

export type KvSource = KvEnv['source'] | 'none'

export function getKvSource(): KvSource {
  return getKvEnv()?.source ?? 'none'
}

class KvHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'KvHttpError'
    this.status = status
  }
}

async function kvRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const env = getKvEnv()
  if (!env) throw new Error('KV 未設定')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${env.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.token}`,
        ...(init.headers || {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new KvHttpError(response.status, `KV ${path} 失敗: ${response.status} ${detail.slice(0, 200)}`)
    }

    const payload = (await response.json()) as { result?: unknown; error?: string }
    if (payload?.error) throw new Error(`KV 指令失敗: ${payload.error}`)
    return payload?.result ?? null
  } finally {
    clearTimeout(timer)
  }
}

/** 讀取字串值（不存在回 null） */
export async function kvGet(key: string): Promise<string | null> {
  const result = await kvRequest(`/get/${encodeURIComponent(key)}`)
  return typeof result === 'string' ? result : result === null ? null : String(result)
}

/** 讀取 JSON 值（解析失敗回 null） */
export async function kvGetJson<T>(key: string): Promise<T | null> {
  const raw = await kvGet(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * 寫入值。物件會自動序列化成 JSON（與舊 @vercel/kv 的行為一致）。
 * @param ttlSeconds 設定過期秒數
 * @param onlyIfAbsent 只在 key 不存在時寫入（SET NX，用於分散式鎖）
 */
export async function kvSet(
  key: string,
  value: unknown,
  options: { ttlSeconds?: number; onlyIfAbsent?: boolean } = {}
): Promise<boolean> {
  const body = typeof value === 'string' ? value : JSON.stringify(value)
  const params = new URLSearchParams()
  if (options.onlyIfAbsent) params.set('NX', '')
  if (options.ttlSeconds) params.set('EX', String(options.ttlSeconds))
  const query = params.toString() ? `?${params.toString()}` : ''

  const result = await kvRequest(`/set/${encodeURIComponent(key)}${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  })

  // NX 條件不成立時 Upstash 回傳 null
  if (options.onlyIfAbsent) return result === 'OK'
  return result === 'OK'
}

export async function kvDel(key: string): Promise<void> {
  await kvRequest(`/del/${encodeURIComponent(key)}`, { method: 'POST' })
}

export async function kvIncr(key: string): Promise<number> {
  const result = await kvRequest(`/incr/${encodeURIComponent(key)}`, { method: 'POST' })
  return Number(result) || 0
}

export async function kvExpire(key: string, ttlSeconds: number): Promise<void> {
  await kvRequest(`/expire/${encodeURIComponent(key)}/${ttlSeconds}`, { method: 'POST' })
}
