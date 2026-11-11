import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfigMeta } from '@/utils/appConfig'
import { findSpaceByNameOrId, spaceDisplayName, type AppConfig } from '@/utils/configSchema'
import {
  fetchRawCalendarEvents,
  getCalendarClient,
  getEffectiveCalendarId,
  type RawCalendarEvent,
} from '@/utils/googleCalendarService'
import { getEventSpaceId, getSpaceKeywords, isEventForSpace } from '@/utils/availabilityUtils'
import { FIELD_LIMITS, isValidDateString, taipeiMonthRange, todayInTaipei } from '@/config/bookingRules'
import { extractApplicant, sanitizeText } from '@/utils/sanitize'
import { spaces } from '@/data/spaces'

// 後台預約管理（受 middleware 的 Basic Auth 保護，這裡不再重複驗證帳密）。
//
// 資料來源仍是 Google Calendar：本端點只做「讀取 → 解析 → 篩選 → 匯出」與
// 單筆刪除，不寫入任何中繼資料。description 由 submit-booking 以固定格式寫入：
//   [SPACE:<id>]
//   申請者：…
//   電話：…
//   Email：…
//   參加人數：<n>人
//   申請單位：<單位> / <單位名稱>
//   用途：…
// 舊的人工事件沒有這些欄位，解析結果留空即可，不視為錯誤。

const MAX_RANGE_DAYS = 62
/** 台北是固定 UTC+8（無日光節約），用固定位移換算牆上時間，不依賴伺服器時區。 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** 後台表格／CSV 用的單筆預約（時間一律是台北時區牆上時間）。 */
export type AdminBooking = {
  eventId: string
  spaceId: string
  spaceName: string
  title: string
  applicant: string
  phone: string
  email: string
  /** 人數字串（已去掉「人」字）；舊資料可能是非數字文字，故不做 Number 轉型 */
  participants: string
  unit: string
  departmentName: string
  purpose: string
  /** 有時間的事件為 `YYYY-MM-DDTHH:mm`；全天事件為 `YYYY-MM-DD` */
  start: string
  end: string
  allDay: boolean
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

// ── 查詢參數 ──────────────────────────────────────────────────────────────

function pickQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/** 起訖日期（含頭尾）共幾天 */
function countDays(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00+08:00`).getTime()
  const endMs = new Date(`${end}T00:00:00+08:00`).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return Number.NaN
  return Math.floor((endMs - startMs) / DAY_MS) + 1
}

// ── description 解析 ─────────────────────────────────────────────────────

/** 我們自己寫入的中繼資料行（`用途` 可能是多行說明，需要支援續行）。 */
const METADATA_LABEL_PATTERN = /^\s*(申請者|電話|Email|參加人數|申請單位|用途)\s*[：:]\s*(.*)$/i

/**
 * 把 description 拆成 { 標籤: 內容 }。
 * 續行（沒有標籤開頭的行）會併回上一個欄位，避免多行的「用途」被截斷。
 */
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

/** 全天事件的 Google end 是「不含」的隔天，換算成含當日，避免表格多顯示一天。 */
function toInclusiveAllDayEnd(start: string, end: string): string {
  if (!DATE_ONLY.test(start) || !DATE_ONLY.test(end)) return end
  if (end <= start) return start
  return shiftDate(end, -1)
}

// ── 事件 → 預約 ──────────────────────────────────────────────────────────

type SpaceKeywordEntry = { space: (typeof spaces)[number]; keywords: string[] }

function parseBookingEvent(
  raw: RawCalendarEvent,
  appConfig: AppConfig,
  keywordMap: SpaceKeywordEntry[]
): AdminBooking {
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

  const title = sanitizeText(raw.summary || '無標題', 120)

  return {
    eventId: String(raw.id || ''),
    spaceId: String(knownSpaceId),
    spaceName: space ? spaceDisplayName(space, appConfig) : '',
    title,
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
function startSortKey(booking: AdminBooking): string {
  return booking.allDay ? `${booking.start}T00:00` : booking.start
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
 * 產生 CSV 內容。
 * 開頭務必帶 UTF-8 BOM（\uFEFF），否則 Excel 會用 ANSI 開啟而讓中文變亂碼；
 * 換行使用 CRLF，Excel 的相容性最好。
 */
function buildCsv(bookings: AdminBooking[]): string {
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

// ── GET：查詢／匯出 ───────────────────────────────────────────────────────

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const query = req.query as Record<string, string | string[] | undefined>

  const rawStart = sanitizeText(pickQueryValue(query.start), 10)
  const rawEnd = sanitizeText(pickQueryValue(query.end), 10)
  const keyword = sanitizeText(pickQueryValue(query.q), 80).toLowerCase()
  const spaceFilter = sanitizeText(pickQueryValue(query.spaceId), 80)
  const format = pickQueryValue(query.format).trim().toLowerCase()

  if ((rawStart && !isValidDateString(rawStart)) || (rawEnd && !isValidDateString(rawEnd))) {
    return res.status(400).json({ error: '日期格式不正確，請使用 YYYY-MM-DD' })
  }

  // 未給日期時預設台北時區的當月（不可用伺服器時區，Vercel 是 UTC）
  const defaultRange = taipeiMonthRange()
  const start = rawStart || defaultRange.start
  const end = rawEnd || defaultRange.end

  if (start > end) {
    return res.status(400).json({ error: '查詢區間不正確：開始日期不可晚於結束日期' })
  }

  const days = countDays(start, end)
  if (Number.isNaN(days) || days > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: `查詢範圍不可超過 ${MAX_RANGE_DAYS} 天` })
  }

  const { config: appConfig } = await readAppConfigMeta()
  const calendarId = await getEffectiveCalendarId(appConfig)

  const rawEvents = await fetchRawCalendarEvents({
    calendarId,
    timeMin: new Date(`${start}T00:00:00+08:00`).toISOString(),
    timeMax: new Date(`${end}T23:59:59+08:00`).toISOString(),
  })

  const keywordMap: SpaceKeywordEntry[] = spaces.map((space) => ({
    space,
    keywords: getSpaceKeywords(space.id, appConfig.spaceOverrides),
  }))

  // 場地篩選：允許傳 id 或名稱（含後台自訂名稱），一律收斂成 id 再比對
  const filteredSpaceId = spaceFilter
    ? findSpaceByNameOrId(spaceFilter, appConfig)?.id ?? spaceFilter
    : ''

  let bookings = rawEvents
    .map((raw) => parseBookingEvent(raw, appConfig, keywordMap))
    // 沒有時間的事件無法顯示也無法刪除判斷，直接略過
    .filter((booking) => booking.start !== '' && booking.eventId !== '')

  if (filteredSpaceId) {
    bookings = bookings.filter((booking) => booking.spaceId === filteredSpaceId)
  }

  if (keyword) {
    bookings = bookings.filter((booking) =>
      [booking.title, booking.applicant, booking.unit, booking.purpose].some((field) =>
        field.toLowerCase().includes(keyword)
      )
    )
  }

  bookings.sort((a, b) => {
    const keyA = startSortKey(a)
    const keyB = startSortKey(b)
    if (keyA !== keyB) return keyA < keyB ? -1 : 1
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return a.title.localeCompare(b.title, 'zh-Hant')
  })

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="bookings-${todayInTaipei()}.csv"`)
    return res.status(200).send(buildCsv(bookings))
  }

  return res.status(200).json(bookings)
}

// ── DELETE：取消單筆預約 ─────────────────────────────────────────────────

/**
 * Google 事件 id 本身是 base32hex（0-9、a-v），少數匯入事件可能帶 . _ @ - ~；
 * 這裡用偏寬鬆的白名單擋掉引號、角括號、空白等明顯異常的輸入即可。
 */
const EVENT_ID_PATTERN = /^[A-Za-z0-9._~@+-]{1,1024}$/

function readErrorStatus(error: any): number {
  const status = Number(error?.response?.status ?? error?.code ?? 0)
  return Number.isFinite(status) ? status : 0
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const query = req.query as Record<string, string | string[] | undefined>
  const eventId = pickQueryValue(query.eventId).trim()

  if (!eventId) {
    return res.status(400).json({ error: '缺少 eventId 參數' })
  }
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return res.status(400).json({ error: 'eventId 格式不正確' })
  }

  const { config: appConfig } = await readAppConfigMeta()
  const calendarId = await getEffectiveCalendarId(appConfig)

  try {
    const calendar = await getCalendarClient()
    await calendar.events.delete({ calendarId, eventId })
  } catch (error: any) {
    const status = readErrorStatus(error)
    if (status === 404 || status === 410) {
      return res.status(404).json({ error: '找不到這筆預約，可能已經被刪除' })
    }
    // 細節只留在 server log，對外回通用中文訊息
    console.error(`[admin/bookings] 刪除事件失敗 event=${eventId}:`, error)
    return res.status(500).json({ error: '取消預約失敗，請稍後再試' })
  }

  return res.status(200).json({ ok: true })
}

// ── 進入點 ────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    try {
      return await handleGet(req, res)
    } catch (error) {
      console.error('[admin/bookings] 查詢預約失敗:', error)
      return res.status(500).json({ error: '查詢預約失敗，請稍後再試' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      return await handleDelete(req, res)
    } catch (error) {
      console.error('[admin/bookings] 取消預約失敗:', error)
      return res.status(500).json({ error: '取消預約失敗，請稍後再試' })
    }
  }

  return res.status(405).json({ error: '不支援的請求方法' })
}
