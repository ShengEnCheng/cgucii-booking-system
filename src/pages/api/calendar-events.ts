import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfigMeta } from '@/utils/appConfig'
import { resolveDisabledSpaceIds } from '@/utils/configSchema'
import { fetchRawCalendarEvents, getEffectiveCalendarId } from '@/utils/googleCalendarService'
import { getEventSpaceId, getSpaceKeywords, isEventForSpace } from '@/utils/availabilityUtils'
import { getAccentColor, getColorHex } from '@/data/colors'
import { taipeiMonthRange } from '@/config/bookingRules'
import { extractApplicant, sanitizeText } from '@/utils/sanitize'
import { consumeRateLimit, getClientIp } from '@/utils/rateLimit'
import { spaces } from '@/data/spaces'

const MAX_RANGE_DAYS = 62
const MAX_RANGE_MS = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000

type PublicEvent = {
  id: string
  title: string
  start: string
  end: string
  color: string
  location: string
  /** 只回傳脫敏後的申請人顯示名稱，絕不回傳完整 description（含電話／Email） */
  applicant: string
  spaceId: string | null
}

function parseRangeValue(value: string | undefined): Date | null {
  if (!value) return null
  // 只給日期時，視為台北時區當日 00:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+08:00`)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const limit = consumeRateLimit(`events:${getClientIp(req)}`, 60, 60 * 1000)
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds))
    return res.status(429).json({ error: '查詢過於頻繁，請稍後再試' })
  }

  try {
    const { config: appConfig } = await readAppConfigMeta()

    const query = req.query as Record<string, string | string[] | undefined>
    const pick = (key: string): string | undefined => {
      const value = query[key]
      return Array.isArray(value) ? value[0] : value
    }

    const parsedMin = parseRangeValue(pick('start') || pick('timeMin'))
    const parsedMax = parseRangeValue(pick('end') || pick('timeMax'))

    const rawMinParam = pick('start') || pick('timeMin')
    const rawMaxParam = pick('end') || pick('timeMax')
    if ((rawMinParam && !parsedMin) || (rawMaxParam && !parsedMax)) {
      return res.status(400).json({ error: '日期範圍格式不正確' })
    }

    // 預設範圍：台北時區的「當月」（不可用伺服器時區，Vercel 是 UTC）
    const defaultRange = taipeiMonthRange()
    const timeMin = parsedMin
      ? parsedMin.toISOString()
      : new Date(`${defaultRange.start}T00:00:00+08:00`).toISOString()
    const timeMax = parsedMax
      ? parsedMax.toISOString()
      : new Date(`${defaultRange.end}T23:59:59+08:00`).toISOString()

    if (new Date(timeMax).getTime() - new Date(timeMin).getTime() > MAX_RANGE_MS) {
      return res.status(400).json({
        error: `查詢範圍不可超過 ${MAX_RANGE_DAYS} 天`,
      })
    }
    if (new Date(timeMax) <= new Date(timeMin)) {
      return res.status(400).json({ error: '日期範圍不正確' })
    }

    const calendarId = await getEffectiveCalendarId(appConfig)
    const rawEvents = await fetchRawCalendarEvents({ calendarId, timeMin, timeMax })

    const filters = appConfig.eventFilters || {}
    const useGoogleColors = appConfig.useGoogleColors !== false
    const disabledSpaceIds = new Set(resolveDisabledSpaceIds(appConfig))

    const allow = (filters.allowKeywords || []).map((k) => k.toLowerCase())
    const ignore = (filters.ignoreKeywords || []).map((k) => k.toLowerCase())
    const spacesOnly = filters.spacesOnly !== false

    // 場地關鍵字 → 用來推斷事件屬於哪個場地（顏色／別名篩選）
    const spaceKeywordMap = spaces.map((space) => ({
      space,
      keywords: getSpaceKeywords(space.id, appConfig.spaceOverrides),
    }))

    const events: PublicEvent[] = []

    for (const raw of rawEvents) {
      const title = sanitizeText(raw.summary || '無標題', 120)
      const lowerTitle = title.toLowerCase()

      if (ignore.some((keyword) => lowerTitle.includes(keyword))) continue

      const markerSpaceId = getEventSpaceId(raw)
      const knownSpaceId =
        markerSpaceId ||
        spaceKeywordMap.find(({ keywords }) => isEventForSpace(raw, keywords))?.space.id ||
        null

      const allowedByKeyword = allow.some((keyword) => lowerTitle.includes(keyword))
      if (!allowedByKeyword) {
        if (spacesOnly && !knownSpaceId) continue
      }

      const space = knownSpaceId ? spaces.find((s) => s.id === knownSpaceId) : undefined
      const color = !useGoogleColors && space
        ? getAccentColor(space.colorId)
        : getColorHex(raw.colorId)

      events.push({
        id: raw.id || '',
        title,
        start: raw.start?.dateTime || raw.start?.date || '',
        end: raw.end?.dateTime || raw.end?.date || '',
        color: disabledSpaceIds.has(String(knownSpaceId)) && !useGoogleColors
          ? '#94a3b8'
          : color,
        location: sanitizeText(raw.location, 120),
        applicant: extractApplicant(raw.description),
        spaceId: knownSpaceId,
      })
    }

    res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40')
    return res.status(200).json(events)
  } catch (error: any) {
    console.error('[calendar-events] 取得事件失敗:', error)
    return res.status(500).json({ error: '取得行事曆事件失敗，請稍後再試' })
  }
}
