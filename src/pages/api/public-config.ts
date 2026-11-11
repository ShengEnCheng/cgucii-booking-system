import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfigMeta } from '@/utils/appConfig'
import { resolveDisabledSpaceIds, spaceDisplayImage, spaceDisplayName } from '@/utils/configSchema'
import { spaces } from '@/data/spaces'

// 公開端點：前台需要的顯示設定（logo、場地名稱／圖片、停用狀態、表單欄位）。
// 這些都不是機密資料，任何要來預約的人都需要讀得到，因此不加密碼保護；
// 若要「修改」設定仍需透過受保護的 /api/admin/config。

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { config, degraded, source } = await readAppConfigMeta()
  const disabledIds = resolveDisabledSpaceIds(config)

  res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40')
  return res.status(200).json({
    logoPath: config.logoPath,
    // 一律換算成 id，前端不必再自行比對名稱（避免原始名稱／自訂名稱不一致）
    disabledSpaceIds: disabledIds,
    disabledSpaceNames: config.disabledSpaceNames,
    spaceOverrides: config.spaceOverrides,
    hideDisabled: config.hideDisabled,
    formFields: config.formFields,
    eventFilters: config.eventFilters,
    useGoogleColors: config.useGoogleColors,
    // 已套用後台自訂名稱與圖片的完整場地清單，讓前端不需重複實作合併邏輯
    spaces: spaces.map((space) => ({
      id: space.id,
      name: spaceDisplayName(space, config),
      image: spaceDisplayImage(space, config),
      description: space.description,
      capacity: space.capacity,
      features: space.features,
      colorId: space.colorId || null,
    })),
    // true 表示後端讀不到正式設定、目前是安全預設值（前端可據此顯示提示）
    degraded,
    // 設定來源：kv / file / bundled / default（不含任何機密，方便確認 KV 是否生效）
    configSource: source,
  })
}
