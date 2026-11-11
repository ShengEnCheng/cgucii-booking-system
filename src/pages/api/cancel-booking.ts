import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfig } from '@/utils/appConfig'
import { findSpaceByNameOrId, spaceDisplayName } from '@/utils/configSchema'
import { getCalendarClient, getEffectiveCalendarId } from '@/utils/googleCalendarService'
import { getEventSpaceId } from '@/utils/availabilityUtils'
import { verifyCancelToken, type CancelTokenPayload } from '@/utils/bookingToken'
import type { AppConfig } from '@/utils/configSchema'
import { buildCancellationNotice, sendMail } from '@/utils/mailer'
import { extractApplicant, extractDescriptionField } from '@/utils/sanitize'
import { consumeRateLimit, getClientIp } from '@/utils/rateLimit'

// 使用者自助取消預約。
// GET  ?token=...  預覽（顯示場地與時段，讓使用者確認後再取消）
// POST { token }   實際取消（刪除 Google Calendar 事件並寄出取消通知）

type CancelPreview = {
  ok: boolean
  reason?: 'invalid_token' | 'not_found' | 'space_mismatch' | 'started'
  spaceName?: string
  date?: string
  startTime?: string
  endTime?: string
  applicant?: string
  canCancel?: boolean
}

const taipeiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const taipeiTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Taipei',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function describeEvent(event: any, appConfig: Awaited<ReturnType<typeof readAppConfig>>) {
  const startRaw = event?.start?.dateTime || event?.start?.date || ''
  const endRaw = event?.end?.dateTime || event?.end?.date || ''
  const start = startRaw ? new Date(startRaw) : null
  const end = endRaw ? new Date(endRaw) : null

  const markerSpaceId = getEventSpaceId(event)
  const space =
    findSpaceByNameOrId(markerSpaceId || '', appConfig) ||
    findSpaceByNameOrId(event?.location || '', appConfig)

  return {
    spaceName: space ? spaceDisplayName(space, appConfig) : '',
    date: start && !Number.isNaN(start.getTime()) ? taipeiDateFormatter.format(start) : '',
    startTime: start && !Number.isNaN(start.getTime()) ? taipeiTimeFormatter.format(start) : '',
    endTime: end && !Number.isNaN(end.getTime()) ? taipeiTimeFormatter.format(end) : '',
    startDate: start,
    applicant: extractApplicant(event?.description),
    email: extractDescriptionField(event?.description, 'Email', 120),
  }
}

type LoadedEvent = {
  payload: CancelTokenPayload | null
  event: any | null
  appConfig: AppConfig | null
  calendarId: string | null
}

async function loadEvent(token: string): Promise<LoadedEvent> {
  const payload = verifyCancelToken(token)
  if (!payload) {
    return { payload: null, event: null, appConfig: null, calendarId: null }
  }

  const appConfig = await readAppConfig()
  const calendarId = await getEffectiveCalendarId(appConfig)
  const calendar = await getCalendarClient()

  try {
    const response = await calendar.events.get({ calendarId, eventId: payload.eventId })
    return { payload, event: response.data, appConfig, calendarId }
  } catch (error: any) {
    if (error?.code === 404 || error?.response?.status === 404) {
      return { payload, event: null, appConfig, calendarId }
    }
    throw error
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  const limit = await consumeRateLimit(
    `cancel:${getClientIp(req)}`,
    10,
    60 * 1000
  )
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds))
    return res.status(429).json({ error: '操作過於頻繁，請稍後再試' })
  }

  const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : ''
  const tokenFromBody = typeof req.body?.token === 'string' ? req.body.token : ''
  const token = tokenFromBody || tokenFromQuery

  if (!token) {
    return res.status(400).json({ error: '缺少取消連結參數' })
  }

  try {
    const loaded = await loadEvent(token)

    if (!loaded.payload) {
      const preview: CancelPreview = { ok: false, reason: 'invalid_token' }
      return res.status(req.method === 'GET' ? 410 : 400).json(preview)
    }

    const { event, payload } = loaded
    if (!event) {
      const preview: CancelPreview = { ok: false, reason: 'not_found' }
      return res.status(404).json(preview)
    }

    // 縱深防禦：token 內的場地必須與事件本身的結構化標記一致
    const markerSpaceId = getEventSpaceId(event)
    if (markerSpaceId && payload.spaceId && markerSpaceId !== payload.spaceId) {
      return res.status(400).json({ ok: false, reason: 'space_mismatch' })
    }

    const appConfig = loaded.appConfig ?? (await readAppConfig())
    const calendarId = loaded.calendarId
    const info = describeEvent(event, appConfig)
    const started = info.startDate ? info.startDate.getTime() <= Date.now() : false

    if (req.method === 'GET') {
      const preview: CancelPreview = {
        ok: true,
        spaceName: info.spaceName,
        date: info.date,
        startTime: info.startTime,
        endTime: info.endTime,
        applicant: info.applicant,
        canCancel: !started,
        reason: started ? 'started' : undefined,
      }
      return res.status(200).json(preview)
    }

    if (req.method === 'POST') {
      if (started) {
        return res.status(409).json({ ok: false, reason: 'started', error: '已開始的預約無法取消' })
      }

      if (!calendarId) throw new Error('Calendar ID 未設定')
      const calendar = await getCalendarClient()
      await calendar.events.delete({ calendarId, eventId: payload.eventId })

      // 取消通知信（寄信失敗不影響取消結果）
      if (info.email) {
        const notice = buildCancellationNotice({
          spaceName: info.spaceName,
          date: info.date,
          startTime: info.startTime,
          endTime: info.endTime,
          applicant: info.applicant || '您好',
        })
        await sendMail({ ...notice, to: info.email })
      }

      return res.status(200).json({
        ok: true,
        spaceName: info.spaceName,
        date: info.date,
        startTime: info.startTime,
        endTime: info.endTime,
      })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('[cancel-booking] 取消失敗:', error)
    return res.status(500).json({ error: '取消失敗，請稍後再試或聯繫育成中心' })
  }
}
