import type { NextApiRequest, NextApiResponse } from 'next'
import { google } from 'googleapis'
import { JWT } from 'google-auth-library'
import { readAppConfig } from '@/utils/appConfig'

type Health = {
  env: {
    hasGOOGLE_CREDENTIALS: boolean
    credentialsParsed: boolean
    clientEmail?: string
  }
  calendarId: {
    value?: string
    from: 'config' | 'env' | 'none'
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
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const health: Health = {
    env: {
      hasGOOGLE_CREDENTIALS: !!process.env.GOOGLE_CREDENTIALS,
      credentialsParsed: false
    },
    calendarId: { from: 'none' },
    auth: { ok: false }
  }

  let calendarId = process.env.CALENDAR_ID || ''

  try {
    const cfg = await readAppConfig()
    if (cfg.googleCalendarId && typeof cfg.googleCalendarId === 'string' && cfg.googleCalendarId.trim()) {
      calendarId = cfg.googleCalendarId.trim()
      health.calendarId = { value: calendarId, from: 'config' }
    } else {
      health.calendarId = { value: calendarId || undefined, from: calendarId ? 'env' : 'none' }
    }
  } catch {
    health.calendarId = { value: calendarId || undefined, from: calendarId ? 'env' : 'none' }
  }

  let credentials: any = {}
  try {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}')
    health.env.credentialsParsed = true
    health.env.clientEmail = credentials.client_email
  } catch (e: any) {
    health.env.credentialsParsed = false
  }

  try {
    const privateKey: string = (credentials.private_key || '').includes('\\n')
      ? (credentials.private_key || '').replace(/\\n/g, '\n')
      : (credentials.private_key || '')

    const auth = new JWT({
      email: credentials.client_email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    })
    await auth.authorize()
    health.auth.ok = true

    if (calendarId) {
      const calendar = google.calendar({ version: 'v3', auth })
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()
      try {
        const response = await calendar.events.list({
          calendarId,
          timeMin: startOfMonth,
          timeMax: endOfMonth,
          singleEvents: true,
          orderBy: 'startTime'
        })
        const items = response.data.items || []
        health.eventsProbe = {
          ok: true,
          count: items.length,
          sampleTitles: items.slice(0, 5).map((e) => e.summary || '無標題')
        }
      } catch (err: any) {
        health.eventsProbe = { ok: false, error: err?.message || 'events.list failed' }
      }
    }
  } catch (e: any) {
    health.auth.ok = false
    health.auth.error = e?.message || 'authorize failed'
  }

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json(health)
}
