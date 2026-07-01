import type { NextApiRequest, NextApiResponse } from 'next'
import { checkSpaceAvailability } from '@/utils/availabilityUtils'

// 公開端點：預約表單即時檢查時段是否可用，一般使用者/廠商填表單時會用到，
// 不能加密碼保護（先前誤放在 /api/admin/ 底下，導致公開預約頁被擋）。
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { spaceName, date, startTime, endTime } = req.query as Record<string, string>
  if (!spaceName || !date || !startTime || !endTime) {
    return res.status(400).json({ error: '缺少必要參數 spaceName/date/startTime/endTime' })
  }
  try {
    const startISO = `${date}T00:00:00+08:00`
    const endISO = `${date}T23:59:59+08:00`
    const base = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
    const r = await fetch(`${base}/api/calendar-events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&t=${Date.now()}`)
    if (!r.ok) {
      return res.status(500).json({ error: '取得事件失敗' })
    }
    const events = await r.json()
    const available = checkSpaceAvailability(events, spaceName, date, startTime, endTime)
    return res.status(200).json({ available })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || '未知錯誤' })
  }
}
