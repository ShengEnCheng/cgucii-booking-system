/**
 * 空間可用性檢查工具函數
 */

/**
 * 取得特定空間的所有已知別名與關鍵字（全小寫）
 * 支援雙向對應：
 * - 小會議室 ↔ C01 ↔ C01會議室
 * - 多功能會議室 ↔ C02 ↔ C02會議室 ↔ 中型C02會議室
 * - 創新發想基地 ↔ 發想基地
 * - 共創空間
 * - DEMO ROOM
 */
export function getSpaceKeywords(
  spaceIdOrName: string,
  overrides?: Record<string, { name?: string }>
): string[] {
  const raw = String(spaceIdOrName || '').trim()
  const lower = raw.toLowerCase()
  const keywords = new Set<string>()

  if (raw) {
    keywords.add(lower)
  }

  // 檢查 Space ID 3 或名稱包含 C01 / 小會議室
  const isSpace3 =
    raw === '3' ||
    lower.includes('小會議室') ||
    lower.includes('c01') ||
    lower === 'c01'

  // 檢查 Space ID 4 或名稱包含 C02 / 多功能會議室
  const isSpace4 =
    raw === '4' ||
    lower.includes('多功能會議室') ||
    lower.includes('c02') ||
    lower.includes('中型c02') ||
    lower === 'c02'

  // 檢查 Space ID 1 或名稱包含 創新發想基地
  const isSpace1 =
    raw === '1' ||
    lower.includes('創新發想基地') ||
    lower.includes('發想基地')

  // 檢查 Space ID 2 或名稱包含 共創空間
  const isSpace2 =
    raw === '2' ||
    lower.includes('共創空間')

  // 檢查 Space ID 5 或名稱包含 DEMO ROOM
  const isSpace5 =
    raw === '5' ||
    lower.includes('demo room') ||
    lower.includes('demoroom')

  if (isSpace3) {
    keywords.add('c01')
    keywords.add('c-01')
    keywords.add('c 01')
    keywords.add('c01會議室')
    keywords.add('小會議室')
    const ov = overrides?.['3']?.name
    if (ov) keywords.add(ov.toLowerCase())
  } else if (isSpace4) {
    keywords.add('c02')
    keywords.add('c-02')
    keywords.add('c 02')
    keywords.add('c02會議室')
    keywords.add('中型c02')
    keywords.add('中型c02會議室')
    keywords.add('多功能會議室')
    keywords.add('中型會議室')
    const ov = overrides?.['4']?.name
    if (ov) keywords.add(ov.toLowerCase())
  } else if (isSpace1) {
    keywords.add('創新發想基地')
    keywords.add('發想基地')
    keywords.add('創新基地')
    const ov = overrides?.['1']?.name
    if (ov) keywords.add(ov.toLowerCase())
  } else if (isSpace2) {
    keywords.add('共創空間')
    keywords.add('共創')
    const ov = overrides?.['2']?.name
    if (ov) keywords.add(ov.toLowerCase())
  } else if (isSpace5) {
    keywords.add('demo room')
    keywords.add('demoroom')
    keywords.add('展示室')
    keywords.add('展示空間')
    const ov = overrides?.['5']?.name
    if (ov) keywords.add(ov.toLowerCase())
  }

  // 加入 overrides 內可能設定的其他名稱
  if (overrides && overrides[raw]?.name) {
    keywords.add(overrides[raw].name!.toLowerCase())
  }

  return Array.from(keywords).filter(Boolean)
}

/**
 * 判斷事件是否與特定空間匹配
 * 支援傳入純字串（標題），或事件物件（同時比對 title/summary、location、description）
 */
export function isEventForSpace(eventOrTitle: any, spaceKeywords: string[]): boolean {
  if (!eventOrTitle || !spaceKeywords || spaceKeywords.length === 0) return false

  if (typeof eventOrTitle === 'string') {
    const lower = eventOrTitle.toLowerCase()
    return spaceKeywords.some((kw) => lower.includes(kw))
  }

  const title = String(
    eventOrTitle.title ||
    eventOrTitle.summary ||
    ''
  ).toLowerCase()

  const location = String(
    eventOrTitle.location ||
    eventOrTitle.extendedProps?.location ||
    ''
  ).toLowerCase()

  const description = String(
    eventOrTitle.description ||
    eventOrTitle.extendedProps?.description ||
    ''
  ).toLowerCase()

  return spaceKeywords.some((kw) => {
    // 1. 標題包含空間名稱或編號
    if (title.includes(kw)) return true
    // 2. 地點 (Location) 包含空間名稱或編號
    if (location.includes(kw)) return true
    // 3. 內文提及場地/地點關鍵字
    if (description.includes(kw)) {
      const locMatch = description.match(/(?:地點|場地|會議室|室|room)[\s:：]*([^\n\r]+)/i)
      if (locMatch && locMatch[1].toLowerCase().includes(kw)) return true
      if (description.includes(`[${kw}]`) || description.includes(`(${kw})`)) return true
    }
    return false
  })
}

/**
 * 將事件的時間字串或日期物件轉換為精確的 Date（台北時區）
 */
function parseEventDateTime(rawDateOrTime: any): Date {
  if (!rawDateOrTime) return new Date(NaN)
  if (rawDateOrTime instanceof Date) return rawDateOrTime

  if (typeof rawDateOrTime === 'string') {
    // 若為 YYYY-MM-DD 全天事件格式
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDateOrTime)) {
      return new Date(`${rawDateOrTime}T00:00:00+08:00`)
    }
    // 若無時區標註（無 Z 或 + 或 -），預設補上台北時區
    if (!rawDateOrTime.includes('Z') && !/[+-]\d{2}:?\d{2}$/.test(rawDateOrTime)) {
      return new Date(`${rawDateOrTime}+08:00`)
    }
    return new Date(rawDateOrTime)
  }

  // 若為 Google API 結構 { dateTime?: string, date?: string }
  if (typeof rawDateOrTime === 'object') {
    if (rawDateOrTime.dateTime) return parseEventDateTime(rawDateOrTime.dateTime)
    if (rawDateOrTime.date) return parseEventDateTime(rawDateOrTime.date)
  }

  return new Date(NaN)
}

/**
 * 檢查特定空間在特定時間段是否可用
 * @param events 所有事件列表（支援 FullCalendar 格式或 Google API 原始事件）
 * @param spaceName 空間名稱或 ID
 * @param date 日期 (YYYY-MM-DD)
 * @param startTime 開始時間 (HH:MM)
 * @param endTime 結束時間 (HH:MM)
 * @param overrides 後台自訂空間名稱覆寫
 * @returns 是否可用
 */
export function checkSpaceAvailability(
  events: any[],
  spaceName: string,
  date: string,
  startTime: string,
  endTime: string,
  overrides?: Record<string, { name?: string }>
): boolean {
  // 將輸入的時間轉換為 Date 對象（明確使用台北時區 +08:00，避免 server 以 UTC 解析）
  const startDateTime = new Date(`${date}T${startTime}:00+08:00`)
  const endDateTime = new Date(`${date}T${endTime}:00+08:00`)

  if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
    throw new Error('無效的日期或時間格式')
  }

  if (endDateTime <= startDateTime) {
    throw new Error('結束時間必須在開始時間之後')
  }

  // 取得該空間的所有別名關鍵字
  const keywords = getSpaceKeywords(spaceName, overrides)

  // 篩選出與指定空間（含別名、地點）相關的事件
  const spaceEvents = (events || []).filter((event) => {
    return isEventForSpace(event, keywords)
  })

  // 檢查是否有時間衝突：標準區間交集為 [startDateTime, endDateTime) 與 [eventStart, eventEnd)
  const hasConflict = spaceEvents.some((event) => {
    const eventStart = parseEventDateTime(event.start?.dateTime || event.start?.date || event.start)
    const eventEnd = parseEventDateTime(event.end?.dateTime || event.end?.date || event.end)

    if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) {
      return false
    }

    // 當前時段與現有事件是否有重疊
    return startDateTime < eventEnd && endDateTime > eventStart
  })

  return !hasConflict
}

/**
 * 獲取特定日期特定空間的可用時段
 */
export function getAvailableTimeSlots(
  events: any[],
  spaceName: string,
  date: string,
  timeSlots: string[],
  overrides?: Record<string, { name?: string }>
): { start: string; end: string; available: boolean }[] {
  const availableSlots = []
  for (let i = 0; i < timeSlots.length - 1; i++) {
    const start = timeSlots[i]
    const end = timeSlots[i + 1]
    const available = checkSpaceAvailability(
      events,
      spaceName,
      date,
      start,
      end,
      overrides
    )
    availableSlots.push({ start, end, available })
  }
  return availableSlots
}
