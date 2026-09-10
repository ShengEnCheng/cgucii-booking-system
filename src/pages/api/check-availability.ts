import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfig } from '@/utils/appConfig'
import { checkSpaceAvailability } from '@/utils/availabilityUtils'
import { fetchRawCalendarEvents } from '@/utils/googleCalendarService'

// 公開端點：預約表單即時檢查時段是否可用，使用者填表單時即時呼叫
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { spaceName, date, startTime, endTime } = req.query as Record<string, string>
  if (!spaceName || !date || !startTime || !endTime) {
    return res.status(400).json({ error: '缺少必要參數 spaceName/date/startTime/endTime' })
  }

  try {
    const appConfig = await readAppConfig()

    // 直接查詢當天的 Google Calendar 事件，不再發動自我循環 HTTP fetch
    const timeMin = new Date(`${date}T00:00:00+08:00`).toISOString()
    const timeMax = new Date(`${date}T23:59:59+08:00`).toISOString()

    const rawEvents = await fetchRawCalendarEvents({
      timeMin,
      timeMax,
    })

    const available = checkSpaceAvailability(
      rawEvents,
      spaceName,
      date,
      startTime,
      endTime,
      appConfig.spaceOverrides
    )

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return res.status(200).json({ available })
  } catch (e: any) {
    console.error('查詢可用性失敗:', e)
    return res.status(500).json({ error: e?.message || '未知錯誤' })
  }
}
