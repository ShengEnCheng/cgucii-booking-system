import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfig } from '@/utils/appConfig'
import {
  fetchRawCalendarEvents,
  getColorHex,
  getEffectiveCalendarId,
} from '@/utils/googleCalendarService'
import { spaces } from '@/data/spaces'
import { getSpaceKeywords, isEventForSpace } from '@/utils/availabilityUtils'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // 讀取後台設定（正式環境自 Vercel KV 讀取，本機自 app-config.json）
    const appConfig = await readAppConfig()

    // 取得時間範圍（同時支援 start/end 與 timeMin/timeMax）
    const { start, end, timeMin: qTimeMin, timeMax: qTimeMax } = req.query as Record<
      string,
      string | string[] | undefined
    >
    const rawMin =
      (Array.isArray(qTimeMin) ? qTimeMin[0] : qTimeMin) ||
      (Array.isArray(start) ? start[0] : start)
    const rawMax =
      (Array.isArray(qTimeMax) ? qTimeMax[0] : qTimeMax) ||
      (Array.isArray(end) ? end[0] : end)

    const timeMin = rawMin
      ? new Date(rawMin).toISOString()
      : new Date(new Date().setDate(1)).toISOString()
    const timeMax = rawMax
      ? new Date(rawMax).toISOString()
      : new Date(
          new Date(new Date().setMonth(new Date().getMonth() + 1)).setDate(0)
        ).toISOString()

    // 決定 Calendar ID（後台自訂優先，回落至環境變數）
    const calendarId =
      (appConfig.googleCalendarId && appConfig.googleCalendarId.trim()) ||
      (await getEffectiveCalendarId())

    // 抓取日曆原始事件
    const rawEvents = await fetchRawCalendarEvents({
      calendarId,
      timeMin,
      timeMax,
    })

    // 轉換為前端標準事件物件
    let events = rawEvents.map((event) => ({
      id: event.id || '',
      title: event.summary || '無標題',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      color: getColorHex(event.colorId || undefined),
      description: event.description || '',
      location: event.location || '',
    }))

    // 套用過濾規則與別名篩選
    const filters = appConfig.eventFilters || {}
    const overrides = appConfig.spaceOverrides || {}
    const useGoogleColors =
      typeof appConfig.useGoogleColors === 'boolean' ? appConfig.useGoogleColors : true

    // 收集所有已知空間的所有關鍵字
    const allSpaceKeywords = spaces.flatMap((s) =>
      getSpaceKeywords(s.id, overrides)
    )

    const allow = Array.isArray(filters.allowKeywords)
      ? filters.allowKeywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean)
      : []
    const ignore = Array.isArray(filters.ignoreKeywords)
      ? filters.ignoreKeywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean)
      : []
    const spacesOnly = !!filters.spacesOnly

    events = events.filter((ev) => {
      const t = String(ev.title || '').toLowerCase()
      // 1. 若符合忽略關鍵字，排除
      if (ignore.some((k) => t.includes(k))) return false
      // 2. 若有設定允許關鍵字且符合，直接保留
      if (allow.length > 0 && allow.some((k) => t.includes(k))) return true
      // 3. 若開啟「僅顯示空間相關事件」，檢查是否匹配任何空間
      if (spacesOnly) {
        return allSpaceKeywords.some((k) => t.includes(k))
      }
      return true
    })

    // 若設定不沿用 Google 顏色，使用專案預設配色（C01番茄紅、C02香蕉黃等）
    if (!useGoogleColors) {
      const c01Keywords = getSpaceKeywords('3', overrides)
      const c02Keywords = getSpaceKeywords('4', overrides)
      events = events.map((ev) => {
        if (isEventForSpace(ev, c01Keywords)) {
          return { ...ev, color: '#D60000' }
        }
        if (isEventForSpace(ev, c02Keywords)) {
          return { ...ev, color: '#F6C026' }
        }
        return ev
      })
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')

    return res.status(200).json(events)
  } catch (error: any) {
    console.error('獲取行事曆事件失敗:', error)
    return res.status(500).json({
      error: '獲取行事曆事件失敗',
      details: error?.message || '未知錯誤',
      code: error?.code || '',
    })
  }
}
