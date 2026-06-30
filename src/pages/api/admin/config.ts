import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

const configPath = path.join(process.cwd(), 'src', 'config', 'app-config.json')

function readConfig() {
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(content)
  } catch {
    return { logoPath: '/images/logo.png', disabledSpaceIds: [], disabledSpaceNames: [], spaceOverrides: {}, hideDisabled: false, formFields: {}, eventFilters: { spacesOnly: false, allowKeywords: [], ignoreKeywords: [] }, googleCalendarId: '', useGoogleColors: true }
  }
}

function writeConfig(cfg: any) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8')
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const cfg = readConfig()
    return res.status(200).json(cfg)
  }
  if (req.method === 'POST') {
    const body = req.body || {}
    const cfg = readConfig()
    const logoPath = typeof body.logoPath === 'string' ? body.logoPath : cfg.logoPath
    const disabledSpaceIds = Array.isArray(body.disabledSpaceIds) ? body.disabledSpaceIds.map(String) : cfg.disabledSpaceIds
    const disabledSpaceNames = Array.isArray(body.disabledSpaceNames) ? body.disabledSpaceNames.map(String) : cfg.disabledSpaceNames
    const spaceOverrides = body.spaceOverrides && typeof body.spaceOverrides === 'object' ? body.spaceOverrides : (cfg.spaceOverrides || {})
    const hideDisabled = typeof body.hideDisabled === 'boolean' ? body.hideDisabled : !!cfg.hideDisabled
    const formFields = body.formFields && typeof body.formFields === 'object' ? body.formFields : (cfg.formFields || {})
    const eventFilters = body.eventFilters && typeof body.eventFilters === 'object' ? body.eventFilters : (cfg.eventFilters || { spacesOnly: false, allowKeywords: [], ignoreKeywords: [] })
    const googleCalendarId = typeof body.googleCalendarId === 'string' ? body.googleCalendarId : (cfg.googleCalendarId || '')
    const useGoogleColors = typeof body.useGoogleColors === 'boolean' ? body.useGoogleColors : (typeof cfg.useGoogleColors === 'boolean' ? cfg.useGoogleColors : true)
    const updated = { logoPath, disabledSpaceIds, disabledSpaceNames, spaceOverrides, hideDisabled, formFields, eventFilters, googleCalendarId, useGoogleColors }
    writeConfig(updated)
    return res.status(200).json(updated)
  }
  return res.status(405).json({ error: 'Method not allowed' })
}
