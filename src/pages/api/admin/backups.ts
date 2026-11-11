import type { NextApiRequest, NextApiResponse } from 'next'
import { isValidDateString } from '@/config/bookingRules'
import { kvGet, kvGetJson } from '@/utils/kv'
import {
  BACKUP_INDEX_LIMIT,
  BACKUP_INDEX_KEY,
  BACKUP_LATEST_KEY,
  type BackupIndexEntry,
} from '@/pages/api/cron/backup'

// 後台備份查詢（受 src/middleware.ts 的 Basic Auth 保護：/api/admin/*）。
//
//   GET /api/admin/backups                     → 列出 backup:index（新的在前）
//   GET /api/admin/backups?download=latest     → 下載最新一份 CSV
//   GET /api/admin/backups?download=YYYY-MM-DD → 下載該日期的 CSV（僅限最新一天）
//
// 為什麼「僅限最新一天」：KV 只保留 backup:latest 這一份 CSV 內容，backup:index
// 只記錄 {date, bytes, count} 中繼資料（刻意不重複存 30 份含個資的 CSV）。
// 因此指定其他日期時回 404 並說明，而不是端出一份日期不對的檔案。
//
// 回應一律 no-store：備份含申請人姓名、電話、Email，不能被任何快取留存。

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function pickQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/** 讀進來的索引只信任形狀正確的項目，避免 KV 內容被寫壞後整個後台壞掉。 */
function readIndexEntries(stored: unknown): BackupIndexEntry[] {
  if (!Array.isArray(stored)) return []
  return stored
    .filter(
      (entry): entry is BackupIndexEntry =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as BackupIndexEntry).date === 'string' &&
        DATE_ONLY.test((entry as BackupIndexEntry).date)
    )
    .slice(0, BACKUP_INDEX_LIMIT)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    return res.status(405).json({ error: '不支援的請求方法' })
  }

  const download = pickQueryValue(req.query.download).trim()

  try {
    const index = readIndexEntries(await kvGetJson<unknown>(BACKUP_INDEX_KEY))

    // 沒有 download 參數：單純列出索引（只有中繼資料，不含個資）
    if (!download) {
      return res.status(200).json(index)
    }

    const isLatest = download.toLowerCase() === 'latest'
    if (!isLatest && (!DATE_ONLY.test(download) || !isValidDateString(download))) {
      return res.status(400).json({ error: '日期格式不正確，請使用 YYYY-MM-DD' })
    }

    const latestDate = index[0]?.date || ''
    if (!latestDate) {
      return res.status(404).json({ error: '目前沒有備份紀錄' })
    }

    const targetDate = isLatest ? latestDate : download
    if (targetDate !== latestDate) {
      return res.status(404).json({
        error: `KV 僅保留最新一份備份內容（${latestDate}），其他日期只有索引紀錄`,
      })
    }

    const csv = await kvGet(BACKUP_LATEST_KEY)
    if (!csv) {
      return res.status(404).json({ error: '找不到備份內容，請確認每日備份是否有成功執行' })
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bookings-backup-${targetDate}.csv"`
    )
    return res.status(200).send(csv)
  } catch (error) {
    console.error('[admin/backups] 讀取備份失敗:', error)
    return res.status(500).json({ error: '讀取備份失敗，請稍後再試' })
  }
}
