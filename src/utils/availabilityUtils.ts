/**
 * 空間可用性檢查工具函數。
 *
 * 兩個原則：
 * 1. 場地識別優先採用「結構化標記」：我們自己建立的事件會在 description 寫入
 *    `[SPACE:<id>]`，之後一律以它為準，不再靠標題模糊比對。
 * 2. 舊事件（人工在 Google 日曆上建立的）沒有標記，仍保留標題／地點／內文的
 *    關鍵字比對，但會先剔除我們自己寫入的中繼資料行（申請者、電話、Email、
 *    用途…），避免使用者把其他場地名稱塞進「用途」就毒化該場地的可用性。
 */

import { spaces } from '@/data/spaces'
import {
  findSpaceByNameOrId,
  spaceDisplayName,
  type AppConfig,
} from './configSchema'

export const SPACE_MARKER_PATTERN = /\[SPACE:([^\]]{1,20})\]/

/** 產生寫入 description 的場地標記 */
export function buildSpaceMarker(spaceId: string): string {
  return `[SPACE:${spaceId}]`
}

/** 從事件取出結構化場地 id（沒有標記則回傳 null） */
export function getEventSpaceId(event: any): string | null {
  if (!event || typeof event !== 'object') return null

  const privateProps =
    event.extendedProperties?.private || event.extendedProps?.extendedProperties?.private
  if (privateProps && typeof privateProps === 'object') {
    const value = (privateProps as Record<string, unknown>).spaceId
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  const description = String(event.description || event.extendedProps?.description || '')
  const match = SPACE_MARKER_PATTERN.exec(description)
  return match ? match[1].trim() : null
}

/** 場地的所有已知別名（全小寫） */
export function getSpaceKeywords(
  spaceIdOrName: string,
  overrides?: AppConfig['spaceOverrides']
): string[] {
  const raw = String(spaceIdOrName || '').trim()
  if (!raw) return []

  const config = { spaceOverrides: overrides || {} }
  const space = findSpaceByNameOrId(raw, config)
  const keywords = new Set<string>([raw.toLowerCase()])

  if (space) {
    keywords.add(space.id)
    keywords.add(space.name.toLowerCase())
    keywords.add(spaceDisplayName(space, config).toLowerCase())
    const override = overrides?.[space.id]?.name
    if (override) keywords.add(override.toLowerCase())
  }

  // 歷史上的稱呼（人工事件常見寫法）
  const aliases: Record<string, string[]> = {
    '1': ['創新發想基地', '發想基地', '創新基地'],
    '2': ['共創空間', '共創'],
    '3': ['c01', 'c-01', 'c 01', 'c01會議室', '小會議室'],
    '4': ['c02', 'c-02', 'c 02', 'c02會議室', '多功能會議室', '中型c02', '中型c02會議室', '中型會議室'],
    '5': ['demo room', 'demoroom', '展示室', '展示空間'],
  }
  if (space) {
    for (const alias of aliases[space.id] || []) {
      keywords.add(alias)
    }
  }

  return Array.from(keywords).filter(Boolean)
}

/** 剔除我們自己寫入的中繼資料行，只留下可能描述地點的內容。 */
function stripBookingMetadata(description: string): string {
  return description
    .split(/\r?\n/)
    .filter((line) => !/^\s*(申請者|電話|Email|參加人數|申請單位|用途)\s*[：:]/i.test(line))
    .join('\n')
    .toLowerCase()
}

/**
 * 判斷事件是否屬於某個空間。
 * @param spaceId 有提供時，帶標記的事件一律以標記為準（權威判斷）。
 */
export function isEventForSpace(
  eventOrTitle: any,
  spaceKeywords: string[],
  spaceId?: string
): boolean {
  if (!eventOrTitle) return false
  if (!spaceKeywords || spaceKeywords.length === 0) return false

  if (typeof eventOrTitle === 'string') {
    const lower = eventOrTitle.toLowerCase()
    return spaceKeywords.some((keyword) => lower.includes(keyword))
  }

  // 1. 結構化標記優先
  const markerId = getEventSpaceId(eventOrTitle)
  if (markerId) {
    return spaceId ? markerId === String(spaceId) : spaceKeywords.some((k) => k === markerId)
  }

  const title = String(eventOrTitle.title || eventOrTitle.summary || '').toLowerCase()
  const location = String(
    eventOrTitle.location || eventOrTitle.extendedProps?.location || ''
  ).toLowerCase()

  // 2. 標題與地點
  if (spaceKeywords.some((keyword) => title.includes(keyword))) return true
  if (spaceKeywords.some((keyword) => location.includes(keyword))) return true

  // 3. 內文（先剔除我們自己的中繼資料，避免「用途」欄位被拿來毒化其他場地）
  const description = stripBookingMetadata(
    String(eventOrTitle.description || eventOrTitle.extendedProps?.description || '')
  )
  if (!description) return false

  const locationLine = description.match(/(?:地點|場地|會議室|室|room)[\s:：]*([^\n\r]+)/i)
  if (locationLine && spaceKeywords.some((keyword) => locationLine[1].includes(keyword))) {
    return true
  }

  return spaceKeywords.some(
    (keyword) => description.includes(`[${keyword}]`) || description.includes(`(${keyword})`)
  )
}

/** 將事件時間轉成 Date（明確處理台北時區與全天事件） */
function parseEventDateTime(rawDateOrTime: any): Date {
  if (!rawDateOrTime) return new Date(NaN)
  if (rawDateOrTime instanceof Date) return rawDateOrTime

  if (typeof rawDateOrTime === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDateOrTime)) {
      return new Date(`${rawDateOrTime}T00:00:00+08:00`)
    }
    if (
      !rawDateOrTime.includes('Z') &&
      !/[+-]\d{2}:?\d{2}$/.test(rawDateOrTime)
    ) {
      return new Date(`${rawDateOrTime}+08:00`)
    }
    return new Date(rawDateOrTime)
  }

  if (typeof rawDateOrTime === 'object') {
    if (rawDateOrTime.dateTime) return parseEventDateTime(rawDateOrTime.dateTime)
    if (rawDateOrTime.date) return parseEventDateTime(rawDateOrTime.date)
  }

  return new Date(NaN)
}

/**
 * 檢查特定空間在特定時段是否可用。
 */
export function checkSpaceAvailability(
  events: any[],
  spaceName: string,
  date: string,
  startTime: string,
  endTime: string,
  overrides?: AppConfig['spaceOverrides'],
  spaceId?: string
): boolean {
  const startDateTime = new Date(`${date}T${startTime}:00+08:00`)
  const endDateTime = new Date(`${date}T${endTime}:00+08:00`)

  if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
    throw new Error('無效的日期或時間格式')
  }
  if (endDateTime <= startDateTime) {
    throw new Error('結束時間必須在開始時間之後')
  }

  const keywords = getSpaceKeywords(spaceName, overrides)
  const resolvedSpaceId = spaceId || findSpaceByNameOrId(spaceName, { spaceOverrides: overrides || {} })?.id

  return !(events || []).some((event) => {
    if (!isEventForSpace(event, keywords, resolvedSpaceId)) return false

    const eventStart = parseEventDateTime(event.start?.dateTime || event.start?.date || event.start)
    const eventEnd = parseEventDateTime(event.end?.dateTime || event.end?.date || event.end)
    if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) return false

    return startDateTime < eventEnd && endDateTime > eventStart
  })
}

/** 取得某日某空間的可用時段（以傳入的時段陣列切成連續區間） */
export function getAvailableTimeSlots(
  events: any[],
  spaceName: string,
  date: string,
  timeSlots: string[],
  overrides?: AppConfig['spaceOverrides'],
  spaceId?: string
): { start: string; end: string; available: boolean }[] {
  const slots: { start: string; end: string; available: boolean }[] = []
  for (let i = 0; i < timeSlots.length - 1; i += 1) {
    const start = timeSlots[i]
    const end = timeSlots[i + 1]
    slots.push({
      start,
      end,
      available: checkSpaceAvailability(events, spaceName, date, start, end, overrides, spaceId),
    })
  }
  return slots
}
