import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfigMeta, writeAppConfig } from '@/utils/appConfig'
import { isSafeAssetPath, normalizeAppConfig, type AppConfig } from '@/utils/configSchema'

// 後台設定讀寫（受 middleware 的 Basic Auth 保護）。
// 寫入前一律走 normalizeAppConfig，避免把非法結構存進 KV 造成所有公開 API 崩潰。

function invalidPathFields(config: AppConfig): string[] {
  const invalid: string[] = []
  if (config.logoPath && !isSafeAssetPath(config.logoPath)) invalid.push('網站 LOGO 路徑')
  for (const [spaceId, override] of Object.entries(config.spaceOverrides)) {
    if (override.image && !isSafeAssetPath(override.image)) {
      invalid.push(`場地 #${spaceId} 的圖片路徑`)
    }
  }
  return invalid
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const { config, degraded, source } = await readAppConfigMeta({ skipCache: true })
    return res.status(200).json({ ...config, _meta: { degraded, source } })
  }

  if (req.method === 'POST') {
    try {
      const body = (req.body || {}) as Partial<AppConfig>
      const { config: current } = await readAppConfigMeta({ skipCache: true })

      const merged = normalizeAppConfig({
        ...current,
        ...(body.logoPath !== undefined ? { logoPath: body.logoPath } : {}),
        ...(body.disabledSpaceIds !== undefined
          ? { disabledSpaceIds: body.disabledSpaceIds }
          : {}),
        ...(body.disabledSpaceNames !== undefined
          ? { disabledSpaceNames: body.disabledSpaceNames }
          : {}),
        ...(body.spaceOverrides !== undefined ? { spaceOverrides: body.spaceOverrides } : {}),
        ...(body.hideDisabled !== undefined ? { hideDisabled: body.hideDisabled } : {}),
        ...(body.formFields !== undefined ? { formFields: body.formFields } : {}),
        ...(body.eventFilters !== undefined ? { eventFilters: body.eventFilters } : {}),
        ...(body.googleCalendarId !== undefined
          ? { googleCalendarId: body.googleCalendarId }
          : {}),
        ...(body.useGoogleColors !== undefined
          ? { useGoogleColors: body.useGoogleColors }
          : {}),
      })

      const badPaths = invalidPathFields(merged)
      if (badPaths.length > 0) {
        return res.status(400).json({
          error: `以下設定必須是站內絕對路徑（以 / 開頭）：${badPaths.join('、')}`,
        })
      }

      const saved = await writeAppConfig(merged)
      return res.status(200).json({ ...saved, _meta: { degraded: false, source: 'write' } })
    } catch (error: any) {
      console.error('[admin/config] 儲存設定失敗:', error)
      return res.status(500).json({ error: '儲存設定失敗，請稍後再試' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
