import { google } from 'googleapis'
import { JWT } from 'google-auth-library'
import { readAppConfig } from './appConfig'

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
}

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

export async function getGoogleAuth(scopes: string[] = ['https://www.googleapis.com/auth/calendar']): Promise<JWT> {
  const credentials = parseGoogleCredentials()
  let privateKey = credentials.private_key
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n')
  }

  const auth = new JWT({
    email: credentials.client_email,
    key: privateKey,
    scopes,
  })

  await auth.authorize()
  return auth
}

export async function getEffectiveCalendarId(): Promise<string> {
  const cfg = await readAppConfig()
  if (cfg.googleCalendarId && typeof cfg.googleCalendarId === 'string' && cfg.googleCalendarId.trim()) {
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
  const calendar = await getCalendarClient(
    options.scopes || ['https://www.googleapis.com/auth/calendar.readonly']
  )

  const response = await calendar.events.list({
    calendarId,
    timeMin: options.timeMin,
    timeMax: options.timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
  })

  return (response.data.items || []) as RawCalendarEvent[]
}

// Google Calendar 顏色 ID 對應十六進位代碼
export function getColorHex(colorId: string | undefined): string {
  const colorMap: Record<string, string> = {
    '1': '#7986CB', // 薰衣草
    '2': '#33B679', // 鼠尾草
    '3': '#8E24AA', // 葡萄
    '4': '#E67C73', // 紅
    '5': '#F6C026', // 香蕉
    '6': '#F5511D', // 南瓜
    '7': '#039BE5', // 孔雀
    '8': '#616161', // 石墨
    '9': '#3F51B5', // 藍莓
    '10': '#0B8043', // 羅勒
    '11': '#D60000', // 番茄
    '12': '#E91E63', // 火烈鳥
    '13': '#F57F17', // 芒果
    '14': '#7CB342', // 鱷梨
    '15': '#1DE9B6', // 薄荷
    '16': '#FF1744', // 櫻桃
    '17': '#D500F9', // 葡萄柚
    '18': '#FFD600', // 香蕉
    '19': '#00C853', // 羅勒
    '20': '#FF3D00', // 番茄
    '21': '#304FFE', // 藍莓
    '22': '#00BFA5', // 薄荷
    '23': '#FF1744', // 櫻桃
    '24': '#D500F9', // 葡萄柚
  }
  return colorMap[colorId || '1'] || '#7986CB'
}

// Vercel KV 分散式鎖（若無 KV 則靜態回傳 true）
export async function acquireKvLock(lockKey: string, ttlSeconds = 15): Promise<boolean> {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import('@vercel/kv')
      const res = await kv.set(`lock:${lockKey}`, 'locked', { nx: true, ex: ttlSeconds })
      return res === 'OK'
    } catch (e) {
      console.warn('KV lock acquire failed, continuing:', e)
      return true
    }
  }
  return true
}

export async function releaseKvLock(lockKey: string): Promise<void> {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import('@vercel/kv')
      await kv.del(`lock:${lockKey}`)
    } catch (e) {
      console.warn('KV lock release failed:', e)
    }
  }
}
