// 預約規則的單一來源：前端時間選項、後端驗證、日曆顯示範圍都從這裡取值，
// 避免「表單能選 02:00，但日曆只畫 08:00–22:00」這種前後不一致。

export const BUSINESS_HOURS = {
  open: '08:00',
  close: '22:00',
} as const

export const BOOKING_RULES = {
  /** 時間選項的粒度（分鐘） */
  slotMinutes: 60,
  /** 單筆預約最短時長（分鐘） */
  minDurationMinutes: 60,
  /** 單筆預約最長時長（分鐘） */
  maxDurationMinutes: 240,
  /** 最多可提前幾天預約 */
  maxDaysAhead: 90,
} as const

export const FIELD_LIMITS = {
  name: 50,
  phone: 30,
  email: 120,
  unit: 40,
  departmentName: 100,
  purpose: 500,
} as const

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const PHONE_PATTERN = /^[0-9+\-()#\s]{6,30}$/

export function timeToMinutes(value: string): number | null {
  const match = TIME_PATTERN.exec(String(value || ''))
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/**
 * 是否為真實存在的日期。
 * 注意：`new Date('2026-02-30…')` 會自動進位成 3/2 而不是 Invalid Date，
 * 因此不能只靠 Number.isNaN 檢查，必須回讀比對。
 */
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/** 產生時間下拉選項（依 BUSINESS_HOURS 與 slotMinutes） */
export function generateTimeOptions(): string[] {
  const open = timeToMinutes(BUSINESS_HOURS.open) ?? 8 * 60
  const close = timeToMinutes(BUSINESS_HOURS.close) ?? 22 * 60
  const options: string[] = []
  for (let minutes = open; minutes < close; minutes += BOOKING_RULES.slotMinutes) {
    options.push(minutesToTime(minutes))
  }
  return options
}

/** 結束時間選項：必須晚於開始時間，且可選到打烊時間本身（含） */
export function generateEndTimeOptions(startTime: string): string[] {
  const start = timeToMinutes(startTime)
  if (start === null) return generateTimeOptions()

  const open = timeToMinutes(BUSINESS_HOURS.open) ?? 8 * 60
  const close = timeToMinutes(BUSINESS_HOURS.close) ?? 22 * 60
  const options: string[] = []
  for (let minutes = open; minutes <= close; minutes += BOOKING_RULES.slotMinutes) {
    if (minutes > start) options.push(minutesToTime(minutes))
  }
  return options
}

/** 取台北時區的今天（YYYY-MM-DD） */
export function todayInTaipei(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(now)
}

/** 台北時區某日的 YYYY-MM-DD 加上 n 天 */
export function addDaysInTaipei(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T00:00:00+08:00`)
  base.setUTCDate(base.getUTCDate() + days)
  return todayInTaipei(base)
}

export type BookingWindowInput = {
  date: string
  startTime: string
  endTime: string
}

export type ValidationResult = { ok: true; start: Date; end: Date } | { ok: false; error: string }

/**
 * 預約時段的完整驗證（格式 → 真實日期 → 營業時間 → 時長 → 過去時間 → 可預約天數）。
 * 前端即時檢查與後端送出都呼叫同一支，確保規則一致。
 */
export function validateBookingWindow(
  input: BookingWindowInput,
  options: { allowPast?: boolean; now?: Date } = {}
): ValidationResult {
  const { date, startTime, endTime } = input

  if (!isValidDateString(date)) {
    return { ok: false, error: '日期格式不正確或不是有效日期' }
  }
  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)
  if (startMinutes === null || endMinutes === null) {
    return { ok: false, error: '時間格式不正確' }
  }
  if (endMinutes <= startMinutes) {
    return { ok: false, error: '結束時間必須晚於開始時間' }
  }

  const open = timeToMinutes(BUSINESS_HOURS.open) ?? 0
  const close = timeToMinutes(BUSINESS_HOURS.close) ?? 24 * 60
  if (startMinutes < open || endMinutes > close) {
    return {
      ok: false,
      error: `可預約時段為每日 ${BUSINESS_HOURS.open}–${BUSINESS_HOURS.close}`,
    }
  }

  const duration = endMinutes - startMinutes
  if (duration < BOOKING_RULES.minDurationMinutes) {
    return { ok: false, error: `每次預約至少 ${BOOKING_RULES.minDurationMinutes} 分鐘` }
  }
  if (duration > BOOKING_RULES.maxDurationMinutes) {
    return {
      ok: false,
      error: `單次預約不得超過 ${BOOKING_RULES.maxDurationMinutes / 60} 小時`,
    }
  }

  const start = new Date(`${date}T${startTime}:00+08:00`)
  const end = new Date(`${date}T${endTime}:00+08:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: '預約時間不正確' }
  }

  const now = options.now ?? new Date()
  if (!options.allowPast && start.getTime() < now.getTime()) {
    return { ok: false, error: '不可預約過去的時間' }
  }

  const today = todayInTaipei(now)
  const latest = addDaysInTaipei(today, BOOKING_RULES.maxDaysAhead)
  if (date > latest) {
    return { ok: false, error: `最多只能預約 ${BOOKING_RULES.maxDaysAhead} 天內的時段` }
  }

  return { ok: true, start, end }
}

/** 台北時區某日的起訖 ISO 字串（避免用伺服器時區算月界） */
export function taipeiDayRange(date: string): { timeMin: string; timeMax: string } {
  return {
    timeMin: new Date(`${date}T00:00:00+08:00`).toISOString(),
    timeMax: new Date(`${date}T23:59:59+08:00`).toISOString(),
  }
}

/** 台北時區當月第一天與最後一天（YYYY-MM-DD） */
export function taipeiMonthRange(now: Date = new Date()): { start: string; end: string } {
  const today = todayInTaipei(now)
  const [year, month] = today.split('-').map(Number)
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start: first, end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` }
}
