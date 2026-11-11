// Google Calendar 存取層：認證快取、事件查詢、分散式鎖。

import { google } from 'googleapis'
import { JWT } from 'google-auth-library'
import { readAppConfig } from './appConfig'
import type { AppConfig } from './configSchema'

export interface GoogleCredentials {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
  auth_provider_x509_cert_url: string
  client_x509_cert_url: string
}

export interface RawCalendarEvent {
  id?: string | null
  summary?: string | null
  description?: string | null
  location?: string | null
  colorId?: string | null
  start?: { dateTime?: string | null; date?: string | null }
  end?: { dateTime?: string | null; date?: string | null }
  extendedProperties?: {
    private?: Record<string, string> | null
    shared?: Record<string, string> | null
  } | null
}

export const CALENDAR_READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
export const CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar'

/** 只取需要的欄位，避免下載 attendees / conferenceData 等用不到的資料。 */
const EVENT_FIELDS =
  'nextPageToken,items(id,summary,description,location,colorId,start,end,extendedProperties)'

/** 單次查詢最多翻幾頁（2500 筆/頁），避免被超大時間範圍拖垮。 */
const MAX_EVENT_PAGES = 4

export function parseGoogleCredentials(): GoogleCredentials {
  const envCreds = process.env.GOOGLE_CREDENTIALS
  if (!envCreds) {
    throw new Error('環境變數 GOOGLE_CREDENTIALS 未設定')
  }

  let credentials: GoogleCredentials
  try {
    credentials = JSON.parse(envCreds) as GoogleCredentials
  } catch (err: any) {
    throw new Error(`Google 憑證 JSON 解析失敗: ${err?.message || '未知錯誤'}`)
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google 憑證中缺少 client_email 或 private_key')
  }

  return credentials
}

const authCache = new Map<string, Promise<JWT>>()

export async function getGoogleAuth(
  scopes: string[] = [CALENDAR_WRITE_SCOPE]
): Promise<JWT> {
  const cacheKey = scopes.slice().sort().join(' ')
  const cached = authCache.get(cacheKey)
  if (cached) return cached

  const authPromise = (async () => {
    const credentials = parseGoogleCredentials()
    const privateKey = credentials.private_key.includes('\\n')
      ? credentials.private_key.replace(/\\n/g, '\n')
      : credentials.private_key

    const auth = new JWT({
      email: credentials.client_email,
      key: privateKey,
      scopes,
    })

    await auth.authorize()
    return auth
  })()

  authCache.set(cacheKey, authPromise)
  try {
    return await authPromise
  } catch (error) {
    authCache.delete(cacheKey)
    throw error
  }
}

/**
 * 決定要操作的日曆：後台設定優先，其次環境變數。
 * 傳入已讀好的 config 可省掉一次 KV / 檔案讀取。
 */
export async function getEffectiveCalendarId(config?: AppConfig): Promise<string> {
  const cfg = config ?? (await readAppConfig())
  if (cfg.googleCalendarId && cfg.googleCalendarId.trim()) {
    return cfg.googleCalendarId.trim()
  }

  const envId = process.env.CALENDAR_ID
  if (envId && envId.trim()) {
    return envId.trim()
  }

  throw new Error('Calendar ID 未設定（請於環境變數 CALENDAR_ID 或後台設定）')
}

export async function getCalendarClient(scopes?: string[]) {
  const auth = await getGoogleAuth(scopes)
  return google.calendar({ version: 'v3', auth })
}

export async function fetchRawCalendarEvents(options: {
  timeMin: string
  timeMax: string
  calendarId?: string
  scopes?: string[]
}): Promise<RawCalendarEvent[]> {
  const calendarId = options.calendarId || (await getEffectiveCalendarId())
  const calendar = await getCalendarClient(options.scopes || [CALENDAR_READ_SCOPE])

  const events: RawCalendarEvent[] = []
  let pageToken: string | undefined
  let pageCount = 0

  do {
    const response = await calendar.events.list({
      calendarId,
      timeMin: options.timeMin,
      timeMax: options.timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      fields: EVENT_FIELDS,
      pageToken,
    })
    events.push(...((response.data.items || []) as RawCalendarEvent[]))
    pageToken = response.data.nextPageToken || undefined
    pageCount += 1
  } while (pageToken && pageCount < MAX_EVENT_PAGES)

  if (pageToken) {
    console.warn(
      `[calendar] 事件超過 ${MAX_EVENT_PAGES} 頁（${events.length} 筆），已停止續抓，請確認查詢範圍是否過大`
    )
  }

  return events
}

export async function deleteCalendarEvent(calendarId: string, eventId: string): Promise<void> {
  const calendar = await getCalendarClient()
  await calendar.events.delete({ calendarId, eventId })
}

// ── 並發鎖 ────────────────────────────────────────────────────────────────
//
// 兩層防護：
// 1) 同實例記憶體鎖：先「同步」佔位（呼叫端必須在任何 await 之前呼叫），
//    修掉舊版 check → await → add 之間被插入的競態。
// 2) Vercel KV 鎖：以 token 標記擁有者，釋放時只刪自己的鎖，
//    避免 TTL 到期後誤刪下一個請求持有的鎖。

export class LockUnavailableError extends Error {
  constructor(message = '預約鎖服務暫時無法使用') {
    super(message)
    this.name = 'LockUnavailableError'
  }
}

const localLocks = new Map<string, string>()

/** 同步佔用本機鎖；回傳 false 表示同實例已有請求在處理。 */
export function reserveLocalLock(key: string, token: string): boolean {
  if (localLocks.has(key)) return false
  localLocks.set(key, token)
  return true
}

export function releaseLocalLock(key: string, token: string): void {
  if (localLocks.get(key) === token) {
    localLocks.delete(key)
  }
}

export function hasKvLockStore(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

/** 取得 KV 分散式鎖；未設定 KV 時回傳 true（僅靠本機鎖，適用單實例）。 */
export async function acquireKvLock(key: string, token: string, ttlSeconds = 60): Promise<boolean> {
  if (!hasKvLockStore()) return true

  try {
    const { kv } = await import('@vercel/kv')
    const result = await kv.set(`lock:${key}`, token, { nx: true, ex: ttlSeconds })
    return result === 'OK'
  } catch (error) {
    // 舊版在這裡 return true 直接放行，等於讓防重複預約失效；
    // 現在改成明確失敗，由呼叫端回 503 讓使用者重試。
    console.error('[lock] KV 取鎖失敗:', error)
    throw new LockUnavailableError()
  }
}

/** 只刪除自己持有的鎖（compare-and-delete）。 */
export async function releaseKvLock(key: string, token: string): Promise<void> {
  if (!hasKvLockStore()) return

  try {
    const { kv } = await import('@vercel/kv')
    const current = await kv.get<string>(`lock:${key}`)
    if (current === token) {
      await kv.del(`lock:${key}`)
    }
  } catch (error) {
    console.warn('[lock] KV 釋放鎖失敗:', error)
  }
}

export function createLockToken(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return `lock-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
