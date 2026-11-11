import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'

// 每日備份的單元測試。
//
// 重點：完全不連線 Google Calendar 或真實 KV —— 兩者都在這裡用 mock 取代，
// 因此測試不需要憑證、不會寫到正式資料，也可以在 CI 的無網路環境跑。

const state = vi.hoisted(() => ({
  /** 模擬的 KV 內容（一律存字串，貼近 Upstash REST 的行為） */
  store: new Map<string, string>(),
  /** 模擬的日曆事件 */
  events: [] as any[],
  /** 記錄 fetchRawCalendarEvents 收到的查詢區間 */
  fetchCalls: [] as Array<{ timeMin: string; timeMax: string }>,
  hasKv: true,
}))

vi.mock('@/utils/kv', () => ({
  hasKv: () => state.hasKv,
  kvGet: async (key: string) => state.store.get(key) ?? null,
  kvGetJson: async (key: string) => {
    const raw = state.store.get(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return null
    }
  },
  kvSet: async (key: string, value: unknown) => {
    state.store.set(key, typeof value === 'string' ? value : JSON.stringify(value))
    return true
  },
  kvDel: async (key: string) => {
    state.store.delete(key)
  },
}))

vi.mock('@/utils/googleCalendarService', () => ({
  CALENDAR_READ_SCOPE: 'https://www.googleapis.com/auth/calendar.readonly',
  CALENDAR_WRITE_SCOPE: 'https://www.googleapis.com/auth/calendar',
  fetchRawCalendarEvents: async (options: { timeMin: string; timeMax: string }) => {
    state.fetchCalls.push({ timeMin: options.timeMin, timeMax: options.timeMax })
    return state.events
  },
  getEffectiveCalendarId: async () => 'test-calendar@example.com',
}))

import backupHandler, {
  BACKUP_INDEX_KEY,
  BACKUP_INDEX_LIMIT,
  BACKUP_LATEST_KEY,
  buildBackupCsv,
  isCronAuthorized,
  mergeBackupIndex,
  type BackupBooking,
  type BackupIndexEntry,
} from '@/pages/api/cron/backup'
import backupsHandler from '@/pages/api/admin/backups'

type MockResponse = {
  statusCode: number
  body: any
  headers: Record<string, string>
  setHeader: (name: string, value: number | string | readonly string[]) => MockResponse
  status: (code: number) => MockResponse
  json: (payload: any) => MockResponse
  send: (payload: any) => MockResponse
}

function createRequest(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return { method: 'GET', headers: {}, query: {}, ...overrides } as unknown as NextApiRequest
}

function createResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = String(value)
      return res
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
    send(payload) {
      res.body = payload
      return res
    },
  }
  return res
}

function makeBooking(overrides: Partial<BackupBooking> = {}): BackupBooking {
  return {
    eventId: 'evt-1',
    spaceId: '3',
    spaceName: 'C01會議室',
    title: '團隊討論',
    applicant: '王小明',
    phone: '0912345678',
    email: 'ming@example.com',
    participants: '5',
    unit: '育成中心',
    departmentName: '創新組',
    purpose: '討論',
    start: '2026-11-10T10:00',
    end: '2026-11-10T12:00',
    allDay: false,
    ...overrides,
  }
}

/** 一份「有時間」的預約事件（含完整中繼資料，含逗號與雙引號） */
function timedEvent() {
  return {
    id: 'evt-timed-1',
    summary: '產品討論',
    description: [
      '[SPACE:3]',
      '申請者：王小明',
      '電話：0912345678',
      'Email：ming@example.com',
      '參加人數：5人',
      '申請單位：育成中心 / 創新組',
      '用途：討論,含逗號與"引號"',
    ].join('\n'),
    start: { dateTime: '2026-11-10T10:00:00+08:00' },
    end: { dateTime: '2026-11-10T12:00:00+08:00' },
  }
}

/** 一份全天事件（Google 的 end 不含當天） */
function allDayEvent() {
  return {
    id: 'evt-allday-1',
    summary: '中心活動',
    description: ['[SPACE:4]', '申請者：李四'].join('\n'),
    start: { date: '2026-11-11' },
    end: { date: '2026-11-12' },
  }
}

beforeEach(() => {
  state.store.clear()
  state.events = []
  state.fetchCalls.length = 0
  state.hasKv = true
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('CSV 產生', () => {
  it('開頭有 UTF-8 BOM、以 CRLF 換行，欄位順序與 admin/bookings 相同', () => {
    const csv = buildBackupCsv([makeBooking()])

    // BOM：Excel 開啟中文才不會變亂碼
    expect(csv.charCodeAt(0)).toBe(0xfeff)

    const expectedHeader =
      '\uFEFF開始時間,結束時間,場地,申請人,電話,Email,單位,人數,用途,事件ID'
    expect(csv.split('\r\n')[0]).toBe(expectedHeader)
    expect(csv.split('\r\n')[1]).toBe(
      '2026-11-10 10:00,2026-11-10 12:00,C01會議室,王小明,0912345678,ming@example.com,育成中心,5,討論,evt-1'
    )
    // 結尾也是一個 CRLF（Excel 相容性最好）
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('逗號、雙引號、換行都會被包起來並正確 escape', () => {
    const csv = buildBackupCsv([
      makeBooking({ applicant: '王,小明', purpose: '討論 "重點"\n第二行' }),
    ])

    expect(csv).toContain('"王,小明"')
    expect(csv).toContain('"討論 ""重點""\n第二行"')
    // 內含換行的欄位被引號包住，因此整份 CSV 仍只有「資料列」與「結尾空行」兩段
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('沒有預約時仍輸出只有表頭的 CSV', () => {
    const csv = buildBackupCsv([])
    expect(csv).toBe(
      '\uFEFF開始時間,結束時間,場地,申請人,電話,Email,單位,人數,用途,事件ID\r\n'
    )
  })
})

describe('備份索引', () => {
  function makeEntry(date: string, count = 1): BackupIndexEntry {
    return { date, bytes: count * 100, count }
  }

  it('新的在前，且只保留最近 30 筆', () => {
    const existing = Array.from({ length: BACKUP_INDEX_LIMIT }, (_, index) =>
      // 2026-10-01 ~ 2026-10-30（由舊到新）
      makeEntry(`2026-10-${String(index + 1).padStart(2, '0')}`)
    )

    const merged = mergeBackupIndex(existing, makeEntry('2026-11-12', 3))

    expect(merged).toHaveLength(BACKUP_INDEX_LIMIT)
    expect(merged[0].date).toBe('2026-11-12')
    // 最舊的一筆被擠出去
    expect(merged.some((entry) => entry.date === '2026-10-01')).toBe(false)
    expect(merged[merged.length - 1].date).toBe('2026-10-02')
    // 由新到舊排序
    const dates = merged.map((entry) => entry.date)
    expect([...dates].sort((a, b) => (a < b ? 1 : -1))).toEqual(dates)
  })

  it('同一天重跑只會更新那一筆，不會重複累積', () => {
    const existing = [makeEntry('2026-11-12', 1), makeEntry('2026-11-11', 2)]
    const merged = mergeBackupIndex(existing, makeEntry('2026-11-12', 9))

    expect(merged).toHaveLength(2)
    expect(merged[0]).toEqual({ date: '2026-11-12', bytes: 900, count: 9 })
  })

  it('KV 內容壞掉（非陣列／欄位不合法）時仍能產生乾淨的索引', () => {
    const merged = mergeBackupIndex(
      [{ date: 'not-a-date', bytes: 1, count: 1 }, null, 'x'],
      makeEntry('2026-11-12')
    )
    expect(merged).toEqual([makeEntry('2026-11-12')])
  })
})

describe('Cron 授權', () => {
  it('未設定 CRON_SECRET 時一律拒絕（fail-closed）', async () => {
    vi.stubEnv('CRON_SECRET', '')

    expect(isCronAuthorized(createRequest({ headers: { authorization: 'Bearer anything' } }))).toBe(
      false
    )

    const res = createResponse()
    await backupHandler(
      createRequest({ headers: { authorization: 'Bearer anything' } }),
      res as unknown as NextApiResponse
    )

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ ok: false, error: '未授權' })
    expect(state.fetchCalls).toHaveLength(0)
    expect(state.store.has(BACKUP_LATEST_KEY)).toBe(false)
  })

  it('缺少 Authorization 或 token 錯誤時拒絕', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-secret')

    expect(isCronAuthorized(createRequest())).toBe(false)
    expect(isCronAuthorized(createRequest({ headers: { authorization: 'correct-secret' } }))).toBe(
      false
    )
    expect(
      isCronAuthorized(createRequest({ headers: { authorization: 'Bearer wrong-secret' } }))
    ).toBe(false)

    const res = createResponse()
    await backupHandler(
      createRequest({ headers: { authorization: 'Bearer wrong-secret' } }),
      res as unknown as NextApiResponse
    )
    expect(res.statusCode).toBe(401)
    expect(state.fetchCalls).toHaveLength(0)
  })

  it('secret 正確時才放行，並接受大小寫不同的 Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-secret')

    expect(
      isCronAuthorized(createRequest({ headers: { authorization: 'Bearer correct-secret' } }))
    ).toBe(true)

    state.events = [timedEvent(), allDayEvent()]
    const res = createResponse()
    await backupHandler(
      createRequest({ headers: { authorization: 'bearer correct-secret' } }),
      res as unknown as NextApiResponse
    )

    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe('每日備份端點', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    state.events = [timedEvent(), allDayEvent()]
  })

  it('成功時寫入 backup:latest 與 backup:index 並回傳統計', async () => {
    const res = createResponse()
    await backupHandler(
      createRequest({ headers: { authorization: 'Bearer test-secret' } }),
      res as unknown as NextApiResponse
    )

    expect(res.statusCode).toBe(200)
    const body = res.body as { ok: boolean; date: string; count: number; bytes: number }
    expect(body.ok).toBe(true)
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.count).toBe(2)

    // CSV 內容：BOM + 兩筆資料（場地由 [SPACE:3] / [SPACE:4] 的後台名稱決定）
    const csv = state.store.get(BACKUP_LATEST_KEY) || ''
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('C01會議室')
    expect(csv).toContain('C02會議室')
    // 全天事件的結束日會換算成含當日
    expect(csv).toContain('2026-11-11,2026-11-11,')
    // bytes 是 UTF-8 位元組數，不是字元數
    expect(body.bytes).toBe(Buffer.byteLength(csv, 'utf8'))

    const index = JSON.parse(state.store.get(BACKUP_INDEX_KEY) || '[]') as BackupIndexEntry[]
    expect(index).toHaveLength(1)
    expect(index[0]).toEqual({ date: body.date, bytes: body.bytes, count: 2 })
  })

  it('查詢範圍是包含今天在內往回 62 天', async () => {
    const res = createResponse()
    await backupHandler(
      createRequest({ headers: { authorization: 'Bearer test-secret' } }),
      res as unknown as NextApiResponse
    )

    expect(state.fetchCalls).toHaveLength(1)
    const { timeMin, timeMax } = state.fetchCalls[0]
    const spanDays = (Date.parse(timeMax) - Date.parse(timeMin)) / 86_400_000
    expect(Math.round(spanDays)).toBe(62)
  })

  it('沒有 KV 時回 503，不會產生任何備份', async () => {
    state.hasKv = false
    const res = createResponse()
    await backupHandler(
      createRequest({ headers: { authorization: 'Bearer test-secret' } }),
      res as unknown as NextApiResponse
    )

    expect(res.statusCode).toBe(503)
    expect((res.body as { ok: boolean }).ok).toBe(false)
    expect(state.fetchCalls).toHaveLength(0)
    expect(state.store.size).toBe(0)
  })
})

describe('後台備份列表與下載', () => {
  const latestCsv = '\uFEFF開始時間,結束時間\r\n2026-11-11 10:00,2026-11-11 12:00\r\n'
  const index: BackupIndexEntry[] = [
    { date: '2026-11-12', bytes: Buffer.byteLength(latestCsv, 'utf8'), count: 1 },
    { date: '2026-11-11', bytes: 100, count: 1 },
  ]

  beforeEach(() => {
    state.store.clear()
    state.store.set(BACKUP_LATEST_KEY, latestCsv)
    state.store.set(BACKUP_INDEX_KEY, JSON.stringify(index))
  })

  it('列出索引（新的在前，只有中繼資料）', async () => {
    const res = createResponse()
    await backupsHandler(createRequest(), res as unknown as NextApiResponse)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(index)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('download=latest 回傳 CSV 並附上檔名', async () => {
    const res = createResponse()
    await backupsHandler(
      createRequest({ query: { download: 'latest' } }),
      res as unknown as NextApiResponse
    )

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="bookings-backup-2026-11-12.csv"'
    )
    expect(res.body).toBe(latestCsv)
  })

  it('指定最新日期時可以下載，其他日期回 404（KV 只保留最新一份內容）', async () => {
    const latestRes = createResponse()
    await backupsHandler(
      createRequest({ query: { download: '2026-11-12' } }),
      latestRes as unknown as NextApiResponse
    )
    expect(latestRes.statusCode).toBe(200)

    const oldRes = createResponse()
    await backupsHandler(
      createRequest({ query: { download: '2026-11-11' } }),
      oldRes as unknown as NextApiResponse
    )
    expect(oldRes.statusCode).toBe(404)
    expect((oldRes.body as { error: string }).error).toContain('2026-11-12')
  })

  it('日期格式不正確時回 400', async () => {
    const res = createResponse()
    await backupsHandler(
      createRequest({ query: { download: '2026-13-99' } }),
      res as unknown as NextApiResponse
    )
    expect(res.statusCode).toBe(400)
  })
})
