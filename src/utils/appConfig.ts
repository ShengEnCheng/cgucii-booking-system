// 後台設定的讀寫（server-only）。
//
// 正式環境（Vercel）使用 Vercel KV；本機開發沒有 KV 時退回讀寫
// src/config/app-config.json。這裡只處理 IO，型別與正規化在 configSchema.ts，
// 讓 client 端可以安全地匯入設定型別與判斷邏輯。

import {
  DEFAULT_APP_CONFIG,
  normalizeAppConfig,
  type AppConfig,
} from './configSchema'

export { DEFAULT_APP_CONFIG, normalizeAppConfig }
export type { AppConfig }

const KV_KEY = 'app-config'
const CONFIG_FILE = ['src', 'config', 'app-config.json']
const CACHE_TTL_MS = 10_000

type CachedConfig = {
  config: AppConfig
  expiresAt: number
}

let cache: CachedConfig | null = null
let lastReadDegraded = false
let lastReadSource: ConfigSource = 'default'

export type ConfigSource = 'kv' | 'file' | 'default'

export function hasKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

export function invalidateAppConfigCache(): void {
  cache = null
}

/** 最近一次讀取是否為「讀不到、回落預設值」。用來讓健康檢查與公開設定回報 degraded。 */
export function wasConfigDegraded(): boolean {
  return lastReadDegraded
}

export function getConfigSource(): ConfigSource {
  return lastReadSource
}

async function readFromKv(): Promise<AppConfig> {
  const { kv } = await import('@vercel/kv')
  const stored = await kv.get<Partial<AppConfig>>(KV_KEY)
  return normalizeAppConfig(stored)
}

async function readFromFile(): Promise<AppConfig> {
  const fs = await import('fs')
  const path = await import('path')
  const filePath = path.join(process.cwd(), ...CONFIG_FILE)
  const content = fs.readFileSync(filePath, 'utf8')
  return normalizeAppConfig(JSON.parse(content))
}

export type AppConfigReadResult = {
  config: AppConfig
  degraded: boolean
  source: ConfigSource
}

/**
 * 讀取設定（含 10 秒 in-process 快取）。
 *
 * 注意：讀取失敗時仍會回傳安全的預設值（不會讓網站整個掛掉），但會把
 * degraded 標記起來，讓 /api/public-config 與健康檢查能明確告警，
 * 而不是像舊版一樣靜默地把場地停用、把日曆 ID 清空。
 */
export async function readAppConfigMeta(options: { skipCache?: boolean } = {}): Promise<AppConfigReadResult> {
  const now = Date.now()
  if (!options.skipCache && cache && cache.expiresAt > now) {
    return { config: cache.config, degraded: lastReadDegraded, source: lastReadSource }
  }

  try {
    const config = hasKv() ? await readFromKv() : await readFromFile()
    cache = { config, expiresAt: now + CACHE_TTL_MS }
    lastReadDegraded = false
    lastReadSource = hasKv() ? 'kv' : 'file'
    return { config, degraded: false, source: lastReadSource }
  } catch (error) {
    console.error('[appConfig] 讀取設定失敗，暫用安全預設值:', error)
    lastReadDegraded = true
    lastReadSource = 'default'
    return { config: normalizeAppConfig(DEFAULT_APP_CONFIG), degraded: true, source: 'default' }
  }
}

export async function readAppConfig(): Promise<AppConfig> {
  const { config } = await readAppConfigMeta()
  return config
}

/** 寫入設定：一律先正規化，避免把非法結構存進去造成所有 API 崩潰。 */
export async function writeAppConfig(config: AppConfig): Promise<AppConfig> {
  const normalized = normalizeAppConfig(config)

  if (hasKv()) {
    const { kv } = await import('@vercel/kv')
    await kv.set(KV_KEY, normalized)
  } else {
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.join(process.cwd(), ...CONFIG_FILE)
    fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8')
  }

  cache = { config: normalized, expiresAt: Date.now() + CACHE_TTL_MS }
  lastReadDegraded = false
  lastReadSource = hasKv() ? 'kv' : 'file'
  return normalized
}
