import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfig } from '@/utils/appConfig'

// 公開端點：給預約首頁 / 行事曆使用的顯示設定（logo、暫停的場地、名稱覆寫等），
// 內容都不是機密資料，任何要來預約的人都需要讀得到，因此不加密碼保護。
// 若要「修改」設定，仍然要透過受保護的 /api/admin/config。
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const cfg = await readAppConfig()
  return res.status(200).json({
    logoPath: cfg.logoPath,
    disabledSpaceIds: cfg.disabledSpaceIds,
    disabledSpaceNames: cfg.disabledSpaceNames,
    spaceOverrides: cfg.spaceOverrides,
    hideDisabled: cfg.hideDisabled,
    formFields: cfg.formFields,
    eventFilters: cfg.eventFilters,
    useGoogleColors: cfg.useGoogleColors,
  })
}
