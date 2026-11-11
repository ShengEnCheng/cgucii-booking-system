import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfig } from '@/utils/appConfig'
import {
  buildDisabledIdSet,
  findSpaceByNameOrId,
  spaceDisplayName,
} from '@/utils/configSchema'
import { checkSpaceAvailability } from '@/utils/availabilityUtils'
import { fetchRawCalendarEvents, getEffectiveCalendarId } from '@/utils/googleCalendarService'
import { taipeiDayRange, validateBookingWindow } from '@/config/bookingRules'
import { sanitizeText } from '@/utils/sanitize'
import { consumeRateLimit, getClientIp } from '@/utils/rateLimit'

// 公開端點：預約表單選好時段後即時確認是否可用。

const CACHE_TTL_MS = 10_000
const availabilityCache = new Map<string, { available: boolean; expiresAt: number }>()

type AvailabilityResponse = {
  available: boolean
  reason?: 'past' | 'disabled' | 'invalid' | 'busy'
  checkedAt: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('Cache-Control', 'private, no-store')

  const limit = consumeRateLimit(
    `availability:${getClientIp(req)}`,
    30,
    60 * 1000
  )
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds))
    return res.status(429).json({ error: '查詢過於頻繁，請稍後再試' })
  }

  const { spaceId, spaceName, date, startTime, endTime } = req.query as Record<string, string>
  const spaceRef = sanitizeText(spaceId || spaceName, 80)

  if (!spaceRef || !date || !startTime || !endTime) {
    return res.status(400).json({
      error: '缺少必要參數 spaceId/date/startTime/endTime',
    })
  }

  const windowResult = validateBookingWindow(
    { date, startTime, endTime },
    { allowPast: true }
  )
  if (!windowResult.ok) {
    return res.status(400).json({ error: windowResult.error })
  }

  try {
    const appConfig = await readAppConfig()
    const matchedSpace = findSpaceByNameOrId(spaceRef, appConfig)
    if (!matchedSpace) {
      return res.status(400).json({ error: '無效的查詢空間' })
    }

    if (buildDisabledIdSet(appConfig).has(String(matchedSpace.id))) {
      const payload: AvailabilityResponse = {
        available: false,
        reason: 'disabled',
        checkedAt: new Date().toISOString(),
      }
      return res.status(200).json(payload)
    }

    if (windowResult.start.getTime() < Date.now()) {
      const payload: AvailabilityResponse = {
        available: false,
        reason: 'past',
        checkedAt: new Date().toISOString(),
      }
      return res.status(200).json(payload)
    }

    const cacheKey = `${matchedSpace.id}|${date}|${startTime}-${endTime}`
    const cached = availabilityCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      const payload: AvailabilityResponse = {
        available: cached.available,
        reason: cached.available ? undefined : 'busy',
        checkedAt: new Date().toISOString(),
      }
      return res.status(200).json(payload)
    }

    // 直接在伺服器端查日曆，不再透過內部 HTTP 呼叫自己
    const { timeMin, timeMax } = taipeiDayRange(date)
    const calendarId = await getEffectiveCalendarId(appConfig)
    const rawEvents = await fetchRawCalendarEvents({ calendarId, timeMin, timeMax })

    const available = checkSpaceAvailability(
      rawEvents,
      spaceDisplayName(matchedSpace, appConfig),
      date,
      startTime,
      endTime,
      appConfig.spaceOverrides,
      matchedSpace.id
    )

    availabilityCache.set(cacheKey, {
      available,
      expiresAt: Date.now() + CACHE_TTL_MS,
    })

    const payload: AvailabilityResponse = {
      available,
      reason: available ? undefined : 'busy',
      checkedAt: new Date().toISOString(),
    }
    return res.status(200).json(payload)
  } catch (error: any) {
    console.error('[check-availability] 查詢失敗:', error)
    // 讓前端知道「無法確認」而不是「已被預約」
    return res.status(503).json({ error: '暫時無法確認時段狀態，請稍後再試' })
  }
}
