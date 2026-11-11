import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfigMeta } from '@/utils/appConfig'
import { buildDisabledIdSet, spaceDisplayName, type AppConfig } from '@/utils/configSchema'
import {
  fetchRawCalendarEvents,
  getEffectiveCalendarId,
  type RawCalendarEvent,
} from '@/utils/googleCalendarService'
import { getEventSpaceId, getSpaceKeywords, isEventForSpace } from '@/utils/availabilityUtils'
import {
  BUSINESS_HOURS,
  isValidDateString,
  taipeiMonthRange,
  timeToMinutes,
} from '@/config/bookingRules'
import { sanitizeText } from '@/utils/sanitize'
import { spaces } from '@/data/spaces'

// 後台「使用率報表」（受 middleware 的 Basic Auth 保護，這裡不再重複驗證帳密）。
//
// 資料來源仍是 Google Calendar：本端點只做「讀取 → 解析 → 彙總」，不寫入任何資料，
// 也不回傳個資（不使用 description 內的姓名／電話／Email）。
//
// 統計口徑（重要，改動前請先讀完，避免口徑前後不一致）：
// 1. 事件歸屬期間一律以「台北時區的開始日期」判定：只有開始日落在 [start, end]
//    內的事件才計入。跨月／跨日事件不會被拆到兩個期間，避免同一筆預約重複計算。
//    （Google 的 timeMin/timeMax 會連「跨入本期」的事件一起回傳，這裡要再篩一次。）
// 2. 有時間的事件：時長 = 實際 end - start。跨日事件（例：22:00–隔日 02:00）以
//    實際 4 小時計，不切成兩天；結束時間缺漏或早於開始時間時以 0 小時計，不中斷報表。
// 3. 全天事件：Google 的 end.date 是「不含」的隔天（11/12 → 11/13 代表 1 天），
//    先換算成天數，再用「每日營業時長 × 天數」計算。場地被佔用整天，但營業時間
//    只有 open–close；若直接乘 24 小時，單日全天活動的使用率會變成 170%，失去意義。
// 4. 營業時數 = 期間天數 × (close - open) 小時（BUSINESS_HOURS 現為 08:00–22:00
//    ＝每日 14 小時）。週末與假日也計入，因為系統本來就沒有限制只能平日預約。
// 5. 使用率 = 已預約時數 / 期間營業時數，不設上限：若有人直接在日曆上建立重疊或
//    營業時間外的事件，數值可能大於 1；前端長條圖自行截斷為 100%。
// 6. 場地判定與 /api/admin/bookings 一致：`[SPACE:<id>]` 標記優先，舊的人工事件
//    才退回關鍵字比對（標記指向已移除的場地時視為未歸屬）。判定不出場地的舊事件
//    （例：整棟消毒、中心活動）仍計入 summary 與時段／星期／月份分佈，但不列入
//    bySpace，因此 sum(bySpace.bookings) 可能小於 summary.totalBookings。
// 7. 所有日期邊界都用台北固定 UTC+8 換算，不依賴伺服器時區（Vercel 是 UTC）。

/** 單次查詢區間上限（含頭尾）。三個月足以做季度檢視，也避免一次抓爆日曆。 */
const MAX_RANGE_DAYS = 92
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// ── 回應型別 ──────────────────────────────────────────────────────────────
//
// 注意：admin.tsx 刻意「不」從這裡匯入型別（本檔依賴 server-only 的 googleapis，
// 被前端 import 會把整套 Google SDK 打進瀏覽器 bundle），前端另有一份等價宣告。

export type ReportSummary = {
  totalBookings: number
  /** 已預約總時數（小時，四捨五入到 0.1） */
  totalHours: number
  /** 平均每筆時長（小時，四捨五入到 0.1）；沒有預約時為 0 */
  avgHours: number
  /** 最忙的星期（0=週日）；整段期間沒有預約時為 null */
  busiestWeekday: { weekday: number; count: number } | null
  /** 預約數最多的場地；沒有可歸屬場地的預約時為 null */
  busiestSpace: { spaceId: string; spaceName: string; bookings: number; hours: number } | null
}

export type SpaceUsageRow = {
  spaceId: string
  spaceName: string
  bookings: number
  /** 該場地已預約時數（小時，四捨五入到 0.1） */
  hours: number
  /** 已預約時數 / 期間營業時數（0–1 的比值，未設上限，四捨五入到小數 4 位） */
  utilizationRate: number
  /** 場地目前是否被停用（停用場地仍列出，方便對照歷史使用率） */
  disabled: boolean
}

export type HourBucket = { hour: number; count: number }

export type WeekdayUsageRow = { weekday: number; count: number; hours: number }

export type MonthUsageRow = { month: string; bookings: number; hours: number }

export type UsageReport = {
  summary: ReportSummary
  bySpace: SpaceUsageRow[]
  /** 起點整點落在營業時間內的分佈（08:00–21:00），固定 14 筆，沒有預約的時段 count 為 0 */
  byHour: HourBucket[]
  /** 固定 7 筆，索引 0=週日…6=週六 */
  byWeekday: WeekdayUsageRow[]
  /** 僅在區間跨越兩個月以上時才有內容，否則為空陣列 */
  byMonth: MonthUsageRow[]
}

// ── 時間與日期工具（台北固定 UTC+8） ──────────────────────────────────────

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

/** 日期字串加減天數（用 UTC 算，避免受伺服器時區影響） */
function shiftDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** 每日營業時長（小時）；設定異常時回 0，讓使用率維持 0 而不是 NaN / Infinity */
function businessHoursPerDay(): number {
  const open = timeToMinutes(BUSINESS_HOURS.open)
  const close = timeToMinutes(BUSINESS_HOURS.close)
  if (open === null || close === null || close <= open) return 0
  return (close - open) / 60
}

/** 熱門時段的整點桶：營業時間內的每個整點（現為 8–21，21:00 是最晚的開始時間） */
function buildHourBuckets(): number[] {
  const openMinutes = timeToMinutes(BUSINESS_HOURS.open) ?? 8 * 60
  const closeMinutes = timeToMinutes(BUSINESS_HOURS.close) ?? 22 * 60
  const buckets: number[] = []
  for (let hour = Math.floor(openMinutes / 60); hour < Math.ceil(closeMinutes / 60); hour += 1) {
    buckets.push(hour)
  }
  return buckets
}

const HOUR_BUCKETS = buildHourBuckets()

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

type TaipeiPoint = { date: string; hour: number; weekday: number; month: string }

/**
 * 把毫秒時間換算成台北牆上時間的各項欄位。
 * 台北是固定 UTC+8（無日光節約），時間軸往前推 8 小時後讀 UTC 欄位即可，
 * 完全不依賴伺服器時區（Vercel 為 UTC）。
 */
function toTaipeiPoint(ms: number): TaipeiPoint {
  const wall = new Date(ms + TAIPEI_OFFSET_MS)
  const date = wall.toISOString().slice(0, 10)
  return {
    date,
    hour: wall.getUTCHours(),
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
    month: date.slice(0, 7),
  }
}

/** 事件開始時間（毫秒）＋是否為全天事件；沒有可用時間資訊時回 null */
function parseEventStart(raw: RawCalendarEvent): { ms: number; allDay: boolean } | null {
  const dateTime = String(raw.start?.dateTime ?? '').trim()
  if (dateTime) {
    const ms = new Date(dateTime).getTime()
    return Number.isNaN(ms) ? null : { ms, allDay: false }
  }

  const date = String(raw.start?.date ?? '').trim()
  if (DATE_ONLY.test(date)) {
    const ms = new Date(`${date}T00:00:00+08:00`).getTime()
    return Number.isNaN(ms) ? null : { ms, allDay: true }
  }

  return null
}

/** 事件結束時間（毫秒）；沒有可用時間資訊時回 null */
function parseEventEndMs(raw: RawCalendarEvent): number | null {
  const dateTime = String(raw.end?.dateTime ?? '').trim()
  if (dateTime) {
    const ms = new Date(dateTime).getTime()
    return Number.isNaN(ms) ? null : ms
  }

  const date = String(raw.end?.date ?? '').trim()
  if (DATE_ONLY.test(date)) {
    const ms = new Date(`${date}T00:00:00+08:00`).getTime()
    return Number.isNaN(ms) ? null : ms
  }

  return null
}

// ── 事件 → 統計用的單筆紀錄 ──────────────────────────────────────────────

type SpaceKeywordEntry = { space: (typeof spaces)[number]; keywords: string[] }

type ParsedEvent = {
  /** 判定出的場地 id；判定不出來時為空字串（未歸屬） */
  spaceId: string
  /** 台北時區的開始日期 YYYY-MM-DD */
  date: string
  /** 台北時區的開始整點 0–23（全天事件為 0，但不會列入時段分佈） */
  hour: number
  /** 0=週日 */
  weekday: number
  /** YYYY-MM */
  month: string
  /** 事件時長（小時，尚未四捨五入） */
  hours: number
  allDay: boolean
}

/** 事件時長（小時）：有時間的事件用實際 start/end，全天事件用「每日營業時長 × 天數」。 */
function eventDurationHours(
  raw: RawCalendarEvent,
  startMs: number,
  allDay: boolean,
  hoursPerDay: number
): number {
  const endMs = parseEventEndMs(raw)

  if (allDay) {
    // Google 全天事件的 end.date 是「不含」的隔天：11/12 → 11/13 代表 1 天
    const days = endMs === null ? 1 : Math.round((endMs - startMs) / DAY_MS)
    return Math.max(1, days) * hoursPerDay
  }

  // 結束時間缺漏或早於開始時間：保留這筆「預約數」，時長以 0 計，不讓報表整批失敗
  if (endMs === null) return 0
  return Math.max(0, (endMs - startMs) / HOUR_MS)
}

function parseReportEvent(
  raw: RawCalendarEvent,
  keywordEntries: SpaceKeywordEntry[],
  hoursPerDay: number
): ParsedEvent | null {
  const start = parseEventStart(raw)
  if (!start) return null

  // 場地判定與 /api/admin/bookings 一致：結構化標記優先，舊的人工事件才退回關鍵字比對。
  // 標記指向不存在的場地（例：場地已從設定移除）時視為未歸屬，不再退回關鍵字，
  // 免得把別的場地的事件算進來。
  const markerSpaceId = (getEventSpaceId(raw) || '').trim()
  const markerSpace = markerSpaceId
    ? spaces.find((space) => space.id === markerSpaceId)
    : undefined
  const knownSpaceId =
    markerSpace?.id ||
    keywordEntries.find((entry) => isEventForSpace(raw, entry.keywords))?.space.id ||
    ''

  const point = toTaipeiPoint(start.ms)

  return {
    spaceId: knownSpaceId,
    date: point.date,
    hour: point.hour,
    weekday: point.weekday,
    month: point.month,
    hours: eventDurationHours(raw, start.ms, start.allDay, hoursPerDay),
    allDay: start.allDay,
  }
}

// ── 彙總 ──────────────────────────────────────────────────────────────────

/** 期間涵蓋的月份清單（YYYY-MM，含頭尾） */
function listMonths(start: string, end: string): string[] {
  const [startYear, startMonth] = start.split('-').map(Number)
  const [endYear, endMonth] = end.split('-').map(Number)
  if (!startYear || !startMonth || !endYear || !endMonth) return []

  const months: string[] = []
  let year = startYear
  let month = startMonth
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

/** 彙總用：筆數 ＋ 時數（時數保留未四捨五入的原始值，最後才取到 0.1） */
type Tally = { count: number; hours: number }

function emptyTally(): Tally {
  return { count: 0, hours: 0 }
}

function buildReport(
  events: ParsedEvent[],
  appConfig: AppConfig,
  start: string,
  end: string,
  days: number,
  hoursPerDay: number
): UsageReport {
  const disabledIds = buildDisabledIdSet(appConfig)
  const availableHours = days * hoursPerDay

  const spaceStats = new Map<string, Tally>()
  const hourCounts = new Map<number, number>()
  const weekdayStats: Tally[] = Array.from({ length: 7 }, emptyTally)
  const monthStats = new Map<string, Tally>()

  let totalHours = 0

  for (const event of events) {
    totalHours += event.hours

    if (event.spaceId) {
      const stat = spaceStats.get(event.spaceId) ?? emptyTally()
      stat.count += 1
      stat.hours += event.hours
      spaceStats.set(event.spaceId, stat)
    }

    // 全天事件沒有「開始整點」，不列入熱門時段分佈（但仍計入星期／月份分佈）
    if (!event.allDay && HOUR_BUCKETS.includes(event.hour)) {
      hourCounts.set(event.hour, (hourCounts.get(event.hour) ?? 0) + 1)
    }

    const weekdayStat = weekdayStats[event.weekday]
    if (weekdayStat) {
      weekdayStat.count += 1
      weekdayStat.hours += event.hours
    }

    const monthStat = monthStats.get(event.month) ?? emptyTally()
    monthStat.count += 1
    monthStat.hours += event.hours
    monthStats.set(event.month, monthStat)
  }

  // 每個已註冊場地都列一列（含停用場地與 0 筆預約的場地），前端表格才不會跳動
  const bySpace: SpaceUsageRow[] = spaces.map((space) => {
    const stat = spaceStats.get(space.id) ?? emptyTally()
    return {
      spaceId: space.id,
      spaceName: spaceDisplayName(space, appConfig),
      bookings: stat.count,
      hours: roundTo(stat.hours, 1),
      utilizationRate: availableHours > 0 ? roundTo(stat.hours / availableHours, 4) : 0,
      disabled: disabledIds.has(space.id),
    }
  })

  const byHour: HourBucket[] = HOUR_BUCKETS.map((hour) => ({
    hour,
    count: hourCounts.get(hour) ?? 0,
  }))

  const byWeekday: WeekdayUsageRow[] = weekdayStats.map((stat, weekday) => ({
    weekday,
    count: stat.count,
    hours: roundTo(stat.hours, 1),
  }))

  const months = listMonths(start, end)
  const byMonth: MonthUsageRow[] =
    months.length > 1
      ? months.map((month) => {
          const stat = monthStats.get(month) ?? emptyTally()
          return { month, bookings: stat.count, hours: roundTo(stat.hours, 1) }
        })
      : []

  // 最忙星期：先比預約數，再比時數；仍相同時保留較靠前的星期（週日 → 週六），確保結果穩定
  let busiestWeekday: ReportSummary['busiestWeekday'] = null
  let bestWeekdayCount = 0
  let bestWeekdayHours = 0
  for (const row of byWeekday) {
    if (row.count === 0) continue
    if (row.count > bestWeekdayCount || (row.count === bestWeekdayCount && row.hours > bestWeekdayHours)) {
      busiestWeekday = { weekday: row.weekday, count: row.count }
      bestWeekdayCount = row.count
      bestWeekdayHours = row.hours
    }
  }

  // 最忙場地：以預約數為主，時數為輔，最後依場地順序
  let busiestSpace: ReportSummary['busiestSpace'] = null
  let bestSpaceBookings = 0
  let bestSpaceHours = 0
  for (const row of bySpace) {
    if (row.bookings === 0) continue
    if (
      row.bookings > bestSpaceBookings ||
      (row.bookings === bestSpaceBookings && row.hours > bestSpaceHours)
    ) {
      busiestSpace = {
        spaceId: row.spaceId,
        spaceName: row.spaceName,
        bookings: row.bookings,
        hours: row.hours,
      }
      bestSpaceBookings = row.bookings
      bestSpaceHours = row.hours
    }
  }

  const summary: ReportSummary = {
    totalBookings: events.length,
    totalHours: roundTo(totalHours, 1),
    avgHours: events.length > 0 ? roundTo(totalHours / events.length, 1) : 0,
    busiestWeekday,
    busiestSpace,
  }

  return { summary, bySpace, byHour, byWeekday, byMonth }
}

// ── GET：產生報表 ─────────────────────────────────────────────────────────

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const query = req.query as Record<string, string | string[] | undefined>

  const rawStart = sanitizeText(pickQueryValue(query.start), 10)
  const rawEnd = sanitizeText(pickQueryValue(query.end), 10)

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
  if (!Number.isFinite(days) || days <= 0) {
    return res.status(400).json({ error: '查詢區間不正確，請確認起訖日期' })
  }
  if (days > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: `查詢範圍不可超過 ${MAX_RANGE_DAYS} 天` })
  }

  const { config: appConfig } = await readAppConfigMeta()
  const calendarId = await getEffectiveCalendarId(appConfig)
  const hoursPerDay = businessHoursPerDay()

  const rawEvents = await fetchRawCalendarEvents({
    calendarId,
    timeMin: new Date(`${start}T00:00:00+08:00`).toISOString(),
    // 取到 end 隔日 00:00（不含），避免漏掉 23:59:59 之後才開始的事件
    timeMax: new Date(`${shiftDate(end, 1)}T00:00:00+08:00`).toISOString(),
  })

  const keywordEntries: SpaceKeywordEntry[] = spaces.map((space) => ({
    space,
    keywords: getSpaceKeywords(space.id, appConfig.spaceOverrides),
  }))

  const events = rawEvents
    .map((raw) => parseReportEvent(raw, keywordEntries, hoursPerDay))
    .filter((event): event is ParsedEvent => event !== null)
    // 只統計「開始日」落在查詢區間內的事件：Google 會連跨入本期的事件一起回傳，
    // 那些屬於前一個期間，重複計算會讓兩個月的報表都失真
    .filter((event) => event.date >= start && event.date <= end)

  const report = buildReport(events, appConfig, start, end, days, hoursPerDay)
  return res.status(200).json(report)
}

// ── 進入點 ────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    return res.status(405).json({ error: '不支援的請求方法' })
  }

  try {
    return await handleGet(req, res)
  } catch (error) {
    // 細節只留在 server log，對外回通用中文訊息（不洩漏憑證 / 日曆 ID 等內部資訊）
    console.error('[admin/reports] 產生使用率報表失敗:', error)
    return res.status(500).json({ error: '產生報表失敗，請稍後再試' })
  }
}
