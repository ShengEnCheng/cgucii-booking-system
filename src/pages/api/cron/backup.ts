import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'crypto'
import { readAppConfigMeta } from '@/utils/appConfig'
import { spaceDisplayName, type AppConfig } from '@/utils/configSchema'
import {
  fetchRawCalendarEvents,
  getEffectiveCalendarId,
  type RawCalendarEvent,
} from '@/utils/googleCalendarService'
import { getEventSpaceId, getSpaceKeywords, isEventForSpace } from '@/utils/availabilityUtils'
import { FIELD_LIMITS, addDaysInTaipei, taipeiDayRange, todayInTaipei } from '@/config/bookingRules'
import { extractApplicant, sanitizeText } from '@/utils/sanitize'
import { hasKv, kvGetJson, kvSet } from '@/utils/kv'
import { spaces } from '@/data/spaces'

// 每日預約備份（Vercel Cron 呼叫）。
//
// 由 vercel.json 的 cron 設定觸發（UTC 18:00 = 台北時間 02:00，Hobby 方案僅支援每日）：
//   "crons": [{ "path": "/api/cron/backup", "schedule": "0 18 * * *" }]
//
// 為什麼不落地成檔案：Vercel 的檔案系統是唯讀且不跨實例，備份內容（含申請人
// 姓名、電話、Email）更不能 commit 進公開 repo。因此 CSV 只寫進 Vercel KV /
// Upstash（backup:latest + backup:index），並由受 Basic Auth 保護的
// /api/admin/backups 讀取。
//
// 授權：Vercel Cron 會帶 `Authorization: Bearer <CRON_SECRET>`。未設定
// CRON_SECRET 時一律拒絕（fail-closed），避免端點被任意觸發而產生大量
// Google API 呼叫；比對使用 timing-safe 比較，避免以時間差猜出 secret。
//
// CSV 欄位與 src/pages/api/admin/bookings.ts 的匯出完全相同（同一個資料來源、
// 同一份 description 格式）。該檔的解析與 CSV 函式沒有對外匯出，而本次任務
// 限定只能新增檔案，因此這裡刻意複製同一套邏輯；若日後調整欄位或解析規則，
// 兩邊必須一起改。

/** 備份範圍：含今天在內往回 62 天（與 admin/bookings 的查詢上限一致）。 */
export const BACKUP_RANGE_DAYS = 62

/** KV key：最新一份 CSV 內容（純字串，寫入時不經 JSON 序列化）。 */
export const BACKUP_LATEST_KEY = 'backup:latest'

/** KV key：備份索引，JSON 陣列（新的在前，最多 BACKUP_INDEX_LIMIT 筆）。 */
export const BACKUP_INDEX_KEY = 'backup:index'

export const BACKUP_INDEX_LIMIT = 30

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** 備份 CSV 的單筆預約（時間一律是台北時區牆上時間）。 */
export type BackupBooking = {
  eventId: string
  spaceId: string
  spaceName: string
  title: string
  applicant: string
  phone: string
  email: string
  participants: string
  unit: string
  departmentName: string
  purpose: string
  /** 有時間的事件為 `YYYY-MM-DDTHH:mm`；全天事件為 `YYYY-MM-DD` */
  start: string
  end: string
  allDay: boolean
}

/** 索引中的一筆備份紀錄：只有中繼資料，不含任何個資。 */
export type BackupIndexEntry = {
  /** 備份日期（台北時區 YYYY-MM-DD） */
  date: string
  /** CSV 的 UTF-8 位元組數 */
  bytes: number
  /** 該份 CSV 的預約筆數 */
  count: number
}

const CSV_HEADERS = [
  '開始時間',
  '結束時間',
  '場地',
  '申請人',
  '電話',
  'Email',
  '單位',
  '人數',
  '用途',
  '事件ID',
] as const

// ── description 解析（與 admin/bookings 一致）─────────────────────────────

/** 我們自己寫入的中繼資料行（`用途` 可能是多行說明，需要支援續行）。 */
const METADATA_LABEL_PATTERN = /^\s*(申請者|電話|Email|參加人數|申請單位|用途)\s*[：:]\s*(.*)$/i

function readDescriptionFields(description: string): Record<string, string> {
  const fields: Record<string, string> = {}
  let currentLabel = ''

  for (const line of String(description || '').split(/\r?\n/)) {
    const match = METADATA_LABEL_PATTERN.exec(line)
    if (match) {
      currentLabel = match[1].toLowerCase()
      fields[currentLabel] = match[2].trim()
      continue
    }
    const continuation = line.trim()
    if (currentLabel && continuation) {
      fields[currentLabel] = `${fields[currentLabel] || ''}\n${continuation}`.trim()
    }
  }

  return fields
}

/** 轉成台北時區牆上時間：`YYYY-MM-DDTHH:mm`；本來就只是日期則原樣回傳。 */
function toTaipeiWallClock(value: string | null | undefined): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (DATE_ONLY.test(text)) return text

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Date(parsed.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 16)
}

/** 日期字串加減天數（用 UTC 算，避免受伺服器時區影響） */
function shiftDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** 全天事件的 Google end 是「不含」的隔天，換算成含當日，避免 CSV 多一天。 */
function toInclusiveAllDayEnd(start: string, end: string): string {
  if (!DATE_ONLY.test(start) || !DATE_ONLY.test(end)) return end
  if (end <= start) return start
  return shiftDate(end, -1)
}

type SpaceKeywordEntry = { space: (typeof spaces)[number]; keywords: string[] }

function parseBookingEvent(
  raw: RawCalendarEvent,
  appConfig: AppConfig,
  keywordMap: SpaceKeywordEntry[]
): BackupBooking {
  const description = String(raw.description || '')
  const fields = readDescriptionFields(description)

  // 場地判定：結構化標記 [SPACE:<id>] 優先；舊事件才退回關鍵字比對
  const markerSpaceId = getEventSpaceId(raw) || ''
  const knownSpaceId =
    markerSpaceId || keywordMap.find((entry) => isEventForSpace(raw, entry.keywords))?.space.id || ''
  const space = knownSpaceId ? spaces.find((item) => item.id === String(knownSpaceId)) : undefined

  const allDay = Boolean(raw.start?.date) && !raw.start?.dateTime
  const start = toTaipeiWallClock(raw.start?.dateTime || raw.start?.date)
  const rawEnd = toTaipeiWallClock(raw.end?.dateTime || raw.end?.date)
  const end = allDay && start && rawEnd ? toInclusiveAllDayEnd(start, rawEnd) : rawEnd

  // 「申請單位：<單位> / <單位名稱>」以空白加斜線分隔，避免切壞本身含斜線的單位名
  const unitLine = sanitizeText(
    fields['申請單位'],
    FIELD_LIMITS.unit + FIELD_LIMITS.departmentName + 10
  )
  const unitParts = unitLine.split(/\s+\/\s+/)
  const unit = sanitizeText(unitParts[0], FIELD_LIMITS.unit)
  const departmentName = sanitizeText(unitParts.slice(1).join(' / '), FIELD_LIMITS.departmentName)

  return {
    eventId: String(raw.id || ''),
    spaceId: String(knownSpaceId),
    spaceName: space ? spaceDisplayName(space, appConfig) : '',
    title: sanitizeText(raw.summary || '無標題', 120),
    applicant: extractApplicant(description) || sanitizeText(fields['申請者'], FIELD_LIMITS.name),
    phone: sanitizeText(fields['電話'], FIELD_LIMITS.phone),
    email: sanitizeText(fields['email'], FIELD_LIMITS.email),
    participants: sanitizeText(fields['參加人數'], 20).replace(/人$/, '').trim(),
    unit,
    departmentName,
    purpose: sanitizeText(fields['用途'], FIELD_LIMITS.purpose),
    start,
    end,
    allDay,
  }
}

/** 排序鍵：全天事件視為當日 00:00，因此自然排在同一天有時間的事件前面。 */
function startSortKey(booking: BackupBooking): string {
  return booking.allDay ? `${booking.start}T00:00` : booking.start
}

/** 事件 → 預約（濾掉沒有時間或沒有 id 的事件，並依開始時間排序）。 */
export function parseBackupBookings(
  rawEvents: RawCalendarEvent[],
  appConfig: AppConfig
): BackupBooking[] {
  const keywordMap: SpaceKeywordEntry[] = spaces.map((space) => ({
    space,
    keywords: getSpaceKeywords(space.id, appConfig.spaceOverrides),
  }))

  return rawEvents
    .map((raw) => parseBookingEvent(raw, appConfig, keywordMap))
    .filter((booking) => booking.start !== '' && booking.eventId !== '')
    .sort((a, b) => {
      const keyA = startSortKey(a)
      const keyB = startSortKey(b)
      if (keyA !== keyB) return keyA < keyB ? -1 : 1
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return a.title.localeCompare(b.title, 'zh-Hant')
    })
}

// ── CSV ──────────────────────────────────────────────────────────────────

/** 逗號、雙引號、換行都要包起來，內部雙引號以兩個雙引號逃逸。 */
function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function formatCsvDateTime(value: string): string {
  return value ? value.replace('T', ' ') : ''
}

/**
 * 產生 CSV 內容（欄位與 admin/bookings 的匯出相同）。
 *
 * 開頭務必帶 UTF-8 BOM（\uFEFF），否則 Excel 會用 ANSI 開啟而讓中文變亂碼；
 * 換行使用 CRLF，Excel 的相容性最好。
 */
export function buildBackupCsv(bookings: BackupBooking[]): string {
  const rows: string[] = [CSV_HEADERS.map((header) => escapeCsvCell(header)).join(',')]

  for (const booking of bookings) {
    rows.push(
      [
        escapeCsvCell(formatCsvDateTime(booking.start)),
        escapeCsvCell(formatCsvDateTime(booking.end)),
        escapeCsvCell(booking.spaceName),
        escapeCsvCell(booking.applicant),
        escapeCsvCell(booking.phone),
        escapeCsvCell(booking.email),
        escapeCsvCell(booking.unit),
        escapeCsvCell(booking.participants),
        escapeCsvCell(booking.purpose),
        escapeCsvCell(booking.eventId),
      ].join(',')
    )
  }

  return `\uFEFF${rows.join('\r\n')}\r\n`
}

// ── 索引 ──────────────────────────────────────────────────────────────────

function isBackupIndexEntry(value: unknown): value is BackupIndexEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<BackupIndexEntry>
  return (
    typeof entry.date === 'string' &&
    DATE_ONLY.test(entry.date) &&
    typeof entry.bytes === 'number' &&
    typeof entry.count === 'number'
  )
}

/**
 * 合併索引：新的在前、同一天只留一筆（手動重跑不會灌爆索引）、最多 30 筆。
 * 讀進來的資料一律重新驗證，避免 KV 被寫壞後整個後台列表壞掉。
 */
export function mergeBackupIndex(
  existing: unknown,
  entry: BackupIndexEntry,
  limit = BACKUP_INDEX_LIMIT
): BackupIndexEntry[] {
  const previous = Array.isArray(existing) ? existing.filter(isBackupIndexEntry) : []
  const deduped = previous.filter((item) => item.date !== entry.date)

  return [entry, ...deduped]
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
    .slice(0, Math.max(1, limit))
}

// ── Cron 授權 ─────────────────────────────────────────────────────────────

function readBearerToken(req: NextApiRequest): string {
  const header = req.headers.authorization
  const value = Array.isArray(header) ? header[0] : header
  if (!value) return ''
  const match = /^Bearer\s+(.+)$/i.exec(String(value).trim())
  return match ? match[1].trim() : ''
}

/** 定時安全比較；長度不同時也先做一次比較，避免用回應時間推測 secret 長度。 */
function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) {
    timingSafeEqual(left, left)
    return false
  }
  return timingSafeEqual(left, right)
}

/**
 * 驗證 Vercel Cron 的 `Authorization: Bearer <CRON_SECRET>`。
 * 未設定 CRON_SECRET 時一律拒絕（fail-closed）。
 */
export function isCronAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const token = readBearerToken(req)
  if (!token) return false

  return constantTimeEqual(token, secret)
}

// ── 進入點 ────────────────────────────────────────────────────────────────

/** 取出要備份的日期區間（含頭尾共 BACKUP_RANGE_DAYS 天，台北時區）。 */
function backupRange(): { start: string; end: string; timeMin: string; timeMax: string } {
  const end = todayInTaipei()
  const start = addDaysInTaipei(end, -(BACKUP_RANGE_DAYS - 1))
  return {
    start,
    end,
    timeMin: taipeiDayRange(start).timeMin,
    timeMax: taipeiDayRange(end).timeMax,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  // Vercel Cron 以 GET 呼叫；保留 POST 方便維運用 curl 手動補跑（同樣要帶 token）
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: '不支援的請求方法' })
  }

  if (!isCronAuthorized(req)) {
    // 只記錄「失敗」這個事實，絕不記錄 token 或 secret 內容
    console.warn('[cron/backup] 授權失敗：CRON_SECRET 未設定或 Bearer token 不正確')
    return res.status(401).json({ ok: false, error: '未授權' })
  }

  if (!hasKv()) {
    // 沒有 KV 就沒有地方放備份；明確失敗，不要假裝成功
    console.error('[cron/backup] 未設定 Vercel KV / Upstash（KV_REST_API_* 或 UPSTASH_REDIS_REST_*）')
    return res.status(503).json({ ok: false, error: '備份儲存空間未設定' })
  }

  try {
    const { config: appConfig } = await readAppConfigMeta({ skipCache: true })
    const calendarId = await getEffectiveCalendarId(appConfig)
    const range = backupRange()

    const rawEvents = await fetchRawCalendarEvents({
      calendarId,
      timeMin: range.timeMin,
      timeMax: range.timeMax,
    })
    const bookings = parseBackupBookings(rawEvents, appConfig)
    const csv = buildBackupCsv(bookings)
    const bytes = Buffer.byteLength(csv, 'utf8')

    const entry: BackupIndexEntry = { date: range.end, bytes, count: bookings.length }
    const existing = await kvGetJson<BackupIndexEntry[]>(BACKUP_INDEX_KEY)

    // 先寫內容再寫索引：索引代表「已經產生好的備份」，寧可索引少一筆，
    // 也不要出現索引指向不存在的內容。
    await kvSet(BACKUP_LATEST_KEY, csv)
    await kvSet(BACKUP_INDEX_KEY, mergeBackupIndex(existing, entry))

    console.info(
      `[cron/backup] 備份完成 date=${entry.date} count=${entry.count} bytes=${bytes}（區間 ${range.start}~${range.end}）`
    )

    return res.status(200).json({ ok: true, date: entry.date, count: entry.count, bytes })
  } catch (error) {
    // 細節只留在 server log（可能含日曆 ID、Google 錯誤訊息）
    console.error('[cron/backup] 備份失敗:', error)
    return res.status(500).json({ ok: false, error: '備份失敗，請查看伺服器記錄' })
  }
}
