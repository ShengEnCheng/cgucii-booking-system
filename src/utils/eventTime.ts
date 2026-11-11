// 日曆事件的時間格式轉換。
//
// 重要：FullCalendar 對「帶 +08:00 位移」的 ISO 字串會忽略位移、把牆上時間當成 UTC
// （實測 2026-11-12T09:00:00+08:00 會被解析成 09:00Z，畫面顯示 17:00），
// 因此傳給前端的事件時間一律正規化成 UTC ISO（結尾 Z）。
// 全天事件只給日期字串，交由 FullCalendar 以 allDay 處理。

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** 轉成 FullCalendar 能正確解析的 UTC ISO 字串；全天事件保留 YYYY-MM-DD。 */
export function toCalendarEventTime(value?: string | null): string {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  if (DATE_ONLY.test(raw)) return raw

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

/** 是否為全天事件（只有日期、沒有時間） */
export function isAllDayValue(value?: string | null): boolean {
  return Boolean(value && DATE_ONLY.test(String(value).trim()))
}
