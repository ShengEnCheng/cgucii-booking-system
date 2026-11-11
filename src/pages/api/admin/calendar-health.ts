import type { NextApiRequest, NextApiResponse } from 'next'
import { google } from 'googleapis'
import { readAppConfigMeta } from '@/utils/appConfig'
import { getGoogleAuth, CALENDAR_READ_SCOPE } from '@/utils/googleCalendarService'
import { taipeiMonthRange } from '@/config/bookingRules'

type Health = {
  healthy: boolean
  env: {
    hasGOOGLE_CREDENTIALS: boolean
    credentialsParsed: boolean
    clientEmail?: string
  }
  calendarId: {
    value?: string
    from: 'config' | 'env' | 'none'
  }
  config: {
    degraded: boolean
    source: string
  }
  auth: {
    ok: boolean
    error?: string
  }
  eventsProbe?: {
    ok: boolean
    count?: number
    sampleTitles?: string[]
    error?: string
    range?: { start: string; end: string }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const health: Health = {
    healthy: false,
    env: {
      hasGOOGLE_CREDENTIALS: false,
      credentialsParsed: false,
    },
    calendarId: { from: 'none' },
    config: { degraded: false, source: 'unknown' },
    auth: { ok: false },
  }

  const { config, degraded, source } = await readAppConfigMeta({ skipCache: true })
  health.config = { degraded, source }

  let calendarId = ''
  if (config.googleCalendarId && config.googleCalendarId.trim()) {
    calendarId = config.googleCalendarId.trim()
    health.calendarId = { value: calendarId, from: 'config' }
  } else if (process.env.CALENDAR_ID && process.env.CALENDAR_ID.trim()) {
    calendarId = process.env.CALENDAR_ID.trim()
    health.calendarId = { value: calendarId, from: 'env' }
  }

  const envCredentials = process.env.GOOGLE_CREDENTIALS
  health.env.hasGOOGLE_CREDENTIALS = Boolean(envCredentials)
  if (envCredentials) {
    try {
      const parsed = JSON.parse(envCredentials)
      health.env.credentialsParsed = Boolean(parsed?.client_email && parsed?.private_key)
      health.env.clientEmail = parsed?.client_email
    } catch {
      health.env.credentialsParsed = false
    }
  }

  try {
    // 與正式booking流程共用同一組 auth 快取，健康檢查才有代表性
    const auth = await getGoogleAuth([CALENDAR_READ_SCOPE])
    health.auth.ok = true

    if (calendarId) {
      const calendar = google.calendar({ version: 'v3', auth })
      const range = taipeiMonthRange()
      try {
        const response = await calendar.events.list({
          calendarId,
          timeMin: new Date(`${range.start}T00:00:00+08:00`).toISOString(),
          timeMax: new Date(`${range.end}T23:59:59+08:00`).toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 100,
          fields: 'items(id,summary,start)',
        })
        const items = response.data.items || []
        health.eventsProbe = {
          ok: true,
          count: items.length,
          sampleTitles: items.slice(0, 5).map((event) => event.summary || '無標題'),
          range,
        }
      } catch (error: any) {
        health.eventsProbe = {
          ok: false,
          error: error?.message || 'events.list failed',
          range,
        }
      }
    }
  } catch (error: any) {
    health.auth.ok = false
    health.auth.error = error?.message || 'authorize failed'
  }

  health.healthy =
    health.env.credentialsParsed && health.auth.ok && health.eventsProbe?.ok === true

  // 監控用：/api/admin/calendar-health?strict=1  unhealthy 時回 503
  const strict = req.query.strict === '1' || req.query.strict === 'true'
  res.setHeader('Cache-Control', 'no-store')
  return res.status(strict && !health.healthy ? 503 : 200).json(health)
}
