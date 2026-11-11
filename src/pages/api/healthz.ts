import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfigMeta, type ConfigSource } from '@/utils/appConfig'
import { fetchRawCalendarEvents } from '@/utils/googleCalendarService'
import { taipeiDayRange, todayInTaipei } from '@/config/bookingRules'
import { consumeRateLimit, getClientIp } from '@/utils/rateLimit'

// 公開的健康檢查端點（給外部 uptime 監控用）。
//
// 與 /api/admin/calendar-health 的差別：
//   - 這支是「公開」的，回應只包含狀態碼與布林值／數字，不得有任何機密
//     （日曆 ID、service account、錯誤訊息一律不出去，細節只寫 server log）。
//   - 每次請求都真的打一次 Google Calendar（讀今天台北時區的事件），
//     確認憑證能換到 token、日曆讀得到，而不只是「process 還活著」。
//   - 任何一項失敗（憑證壞掉、日曆讀不到、設定讀取 degraded）都回 503，
//     讓監控可以直接以 HTTP 狀態碼判斷，不必解析 JSON。
//
// 判定條件：ok = 日曆探測成功 && 設定沒有 degraded。

/** 每個 IP 每分鐘最多 20 次（監控通常 30 分鐘一次，正常用量遠低於此）。 */
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000

export type HealthzCalendarState = 'ok' | 'error'

export type HealthzResponse = {
  ok: boolean
  configSource: ConfigSource
  configDegraded: boolean
  calendar: HealthzCalendarState
  eventCount: number
  latencyMs: number
  checkedAt: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    return res.status(405).json({ error: '不支援的請求方法' })
  }

  // 限流：健康檢查也是公開端點，避免被拿來當免費的 Google API 代理打爆配額
  const limit = await consumeRateLimit(
    `healthz:${getClientIp(req)}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS
  )
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds))
    return res.status(429).json({ error: '請求過於頻繁，請稍後再試' })
  }

  const startedAt = Date.now()
  let configSource: ConfigSource = 'default'
  let configDegraded = false
  let calendar: HealthzCalendarState = 'error'
  let eventCount = 0

  try {
    // skipCache：健康檢查要反映「現在」讀不讀得到設定，不能吃 10 秒快取
    const meta = await readAppConfigMeta({ skipCache: true })
    configSource = meta.source
    configDegraded = meta.degraded

    // 只探測「今天」（台北時區）這一天：範圍最小、延遲最低。
    // 註：fetchRawCalendarEvents 沒有 maxResults 參數可調（共用模組不改動），
    // 因此這裡以「單日」作為查詢上限，避免健康檢查本身變成大量資料查詢。
    const range = taipeiDayRange(todayInTaipei())
    const events = await fetchRawCalendarEvents({
      timeMin: range.timeMin,
      timeMax: range.timeMax,
    })
    eventCount = events.length
    calendar = 'ok'
  } catch (error) {
    // 憑證失效、日曆權限不足、CALENDAR_ID 未設定等都會走到這裡。
    // 細節只留在 server log，回應不得帶出 error message。
    calendar = 'error'
    eventCount = 0
    console.error('[healthz] Google Calendar 探測失敗:', error)
  }

  const ok = calendar === 'ok' && !configDegraded
  const body: HealthzResponse = {
    ok,
    configSource,
    configDegraded,
    calendar,
    eventCount,
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
  }

  return res.status(ok ? 200 : 503).json(body)
}
