import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfig } from '@/utils/appConfig'
import {
  checkSpaceAvailability,
  getSpaceKeywords,
  isEventForSpace,
} from '@/utils/availabilityUtils'
import {
  acquireKvLock,
  fetchRawCalendarEvents,
  getCalendarClient,
  getEffectiveCalendarId,
  releaseKvLock,
} from '@/utils/googleCalendarService'
import { spaces } from '@/data/spaces'

// 同進程記憶體鎖（防止同實例並發）
const _bookingLocks = new Set<string>()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      name,
      phone,
      email,
      participants,
      date,
      startTime,
      endTime,
      unit,
      department,
      departmentName,
      spaceName,
      colorId,
      purpose,
    } = req.body

    if (!spaceName || !date || !startTime || !endTime) {
      return res.status(400).json({ error: '缺少必要預約資訊' })
    }

    const appConfig = await readAppConfig()

    // ── 1. 禁用場地檢查 ──────────────────────────────────────────────────
    const disabledNames = new Set((appConfig.disabledSpaceNames || []).map(String))
    const disabledIds = new Set((appConfig.disabledSpaceIds || []).map(String))

    const matchedSpace = spaces.find((s) => {
      if (s.name === spaceName) return true
      const ov = appConfig.spaceOverrides?.[s.id]?.name
      if (ov && ov === spaceName) return true
      return false
    })

    if (disabledNames.has(spaceName)) {
      return res.status(403).json({ error: '此空間暫停預約' })
    }
    if (matchedSpace && (disabledIds.has(matchedSpace.id) || disabledNames.has(matchedSpace.name))) {
      return res.status(403).json({ error: '此空間暫停預約' })
    }

    // ── 2. Calendar ID 解析 ─────────────────────────────────────────────
    const calendarId =
      (appConfig.googleCalendarId && appConfig.googleCalendarId.trim()) ||
      (await getEffectiveCalendarId())

    const calendar = await getCalendarClient(['https://www.googleapis.com/auth/calendar'])

    // ── 3. 並發鎖（同時支援同進程記憶體鎖與 Vercel KV 分散式鎖）────────
    const lockKey = `${spaceName}|${date}`
    if (_bookingLocks.has(lockKey)) {
      return res.status(429).json({ error: '系統正在處理此場地的預約，請稍候數秒後再送出' })
    }
    const kvLocked = await acquireKvLock(lockKey, 15)
    if (!kvLocked) {
      return res.status(429).json({ error: '系統正在處理此場地的預約，請稍候數秒後再送出' })
    }
    _bookingLocks.add(lockKey)

    try {
      // ── 4. 插入前可用性查核（Pre-check）────────────────────────────────
      const startOfDay = new Date(`${date}T00:00:00+08:00`).toISOString()
      const endOfDay = new Date(`${date}T23:59:59+08:00`).toISOString()

      const rawEvents = await fetchRawCalendarEvents({
        calendarId,
        timeMin: startOfDay,
        timeMax: endOfDay,
      })

      const isAvailable = checkSpaceAvailability(
        rawEvents,
        spaceName,
        date,
        startTime,
        endTime,
        appConfig.spaceOverrides
      )

      if (!isAvailable) {
        return res.status(409).json({ error: '選擇的時段已被預約，請選擇其他時段' })
      }

      // ── 5. 建立 Google Calendar 事件 ────────────────────────────────────
      const departmentDisplay = department || unit || ''
      const eventBody = {
        summary: `${spaceName} - ${departmentDisplay}${departmentName ? ` - ${departmentName}` : ''}`,
        location: spaceName,
        description: [
          `申請者：${name || '無'}`,
          `電話：${phone || '無'}`,
          `Email：${email || '無'}`,
          participants ? `參加人數：${participants}人` : '',
          `申請單位：${departmentDisplay}${departmentName ? ` / ${departmentName}` : ''}`,
          purpose ? `用途：${purpose}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        start: { dateTime: `${date}T${startTime}:00`, timeZone: 'Asia/Taipei' },
        end: { dateTime: `${date}T${endTime}:00`, timeZone: 'Asia/Taipei' },
        colorId: colorId || (matchedSpace ? matchedSpace.colorId : undefined),
      }

      const inserted = await calendar.events.insert({ calendarId, requestBody: eventBody })
      const newEventId = inserted.data.id

      // ── 6. 插入後衝突驗證（Post-check，針對並發 Race Condition）─────────
      const verifyMin = new Date(`${date}T${startTime}:00+08:00`).toISOString()
      const verifyMax = new Date(`${date}T${endTime}:00+08:00`).toISOString()
      const verifyList = await calendar.events.list({
        calendarId,
        timeMin: verifyMin,
        timeMax: verifyMax,
        singleEvents: true,
      })

      const kws = getSpaceKeywords(spaceName, appConfig.spaceOverrides)
      const conflicts = (verifyList.data.items || []).filter((ev) => {
        if (ev.id === newEventId) return false // 排除自己
        return isEventForSpace(ev, kws)
      })

      if (conflicts.length > 0) {
        // 若偵測到並發衝突，主動刪除剛剛建立的事件，保護日曆不被重複佔用
        try {
          if (newEventId) {
            await calendar.events.delete({ calendarId, eventId: newEventId })
          }
        } catch {}
        return res.status(409).json({
          error: '選擇的時段已被預約（另一位使用者同時送出），請選擇其他時段',
        })
      }

      return res.status(200).json({ message: '預約成功', eventId: newEventId })
    } finally {
      _bookingLocks.delete(lockKey)
      await releaseKvLock(lockKey)
    }
  } catch (error: any) {
    console.error('預約失敗:', error)
    return res.status(500).json({
      error: '預約失敗',
      details: error?.message || '未知錯誤',
    })
  }
}
