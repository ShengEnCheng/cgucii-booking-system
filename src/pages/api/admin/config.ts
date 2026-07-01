import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfig, writeAppConfig, DEFAULT_APP_CONFIG } from '@/utils/appConfig'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const cfg = await readAppConfig()
    return res.status(200).json(cfg)
  }
  if (req.method === 'POST') {
    const body = req.body || {}
    const cfg = await readAppConfig()
    const logoPath = typeof body.logoPath === 'string' ? body.logoPath : cfg.logoPath
    const disabledSpaceIds = Array.isArray(body.disabledSpaceIds) ? body.disabledSpaceIds.map(String) : cfg.disabledSpaceIds
    const disabledSpaceNames = Array.isArray(body.disabledSpaceNames) ? body.disabledSpaceNames.map(String) : cfg.disabledSpaceNames
    const spaceOverrides = body.spaceOverrides && typeof body.spaceOverrides === 'object' ? body.spaceOverrides : (cfg.spaceOverrides || {})
    const hideDisabled = typeof body.hideDisabled === 'boolean' ? body.hideDisabled : !!cfg.hideDisabled
    const formFields = body.formFields && typeof body.formFields === 'object' ? body.formFields : (cfg.formFields || {})
    const eventFilters = body.eventFilters && typeof body.eventFilters === 'object' ? body.eventFilters : (cfg.eventFilters || DEFAULT_APP_CONFIG.eventFilters)
    const googleCalendarId = typeof body.googleCalendarId === 'string' ? body.googleCalendarId : (cfg.googleCalendarId || '')
    const useGoogleColors = typeof body.useGoogleColors === 'boolean' ? body.useGoogleColors : (typeof cfg.useGoogleColors === 'boolean' ? cfg.useGoogleColors : true)
    const updated = { logoPath, disabledSpaceIds, disabledSpaceNames, spaceOverrides, hideDisabled, formFields, eventFilters, googleCalendarId, useGoogleColors }
    await writeAppConfig(updated)
    return res.status(200).json(updated)
  }
  return res.status(405).json({ error: 'Method not allowed' })
}
