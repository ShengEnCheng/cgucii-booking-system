import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import Image from 'next/image'
import { spaces } from '@/data/spaces'
import { isSafeAssetPath, spaceDisplayName } from '@/utils/configSchema'
import { taipeiMonthRange } from '@/config/bookingRules'
import toast, { Toaster } from 'react-hot-toast'

const SNAPSHOT_KEYS = [
  'logoPath',
  'disabledSpaceIds',
  'disabledSpaceNames',
  'spaceOverrides',
  'hideDisabled',
  'formFields',
  'eventFilters',
  'googleCalendarId',
  'useGoogleColors',
] as const

function snapshotOf(source: Record<string, unknown>): string {
  const picked: Record<string, unknown> = {}
  for (const key of SNAPSHOT_KEYS) picked[key] = source[key]
  return JSON.stringify(picked)
}

// 後台預約管理的資料結構。
// 刻意不從 API route 檔匯入型別：該檔案依賴 server-only 的 googleapis，
// 一旦被前端 import 就會把整套 Google SDK 打進瀏覽器 bundle。
type AdminBooking = {
  eventId: string
  spaceId: string
  spaceName: string
  title: string
  applicant: string
  phone: string
  email: string
  participants: string
  unit: string
  departmentName: string
  purpose: string
  start: string
  end: string
  allDay: boolean
}

/** 時間顯示：`2026-11-12T09:00` → `2026-11-12 09:00`；全天事件補上「（全天）」。 */
function formatBookingTime(value: string, allDay: boolean): string {
  if (!value) return '—'
  return allDay ? `${value}（全天）` : value.replace('T', ' ')
}

export default function Admin() {
  const [logoPath, setLogoPath] = useState('')
  const [disabledIds, setDisabledIds] = useState<string[]>([])
  const [disabledNames, setDisabledNames] = useState<string[]>([])
  const [spaceOverrides, setSpaceOverrides] = useState<Record<string, { name?: string; image?: string }>>({})
  const [hideDisabled, setHideDisabled] = useState<boolean>(false)
  const [formFields, setFormFields] = useState<Record<string, { show?: boolean; required?: boolean; label?: string }>>({})
  const [eventFilters, setEventFilters] = useState<{ spacesOnly?: boolean; allowKeywords?: string[]; ignoreKeywords?: string[] }>({ spacesOnly: false, allowKeywords: [], ignoreKeywords: [] })
  const [googleCalendarId, setGoogleCalendarId] = useState<string>('')
  const [useGoogleColors, setUseGoogleColors] = useState<boolean>(true)
  const [saving, setSaving] = useState(false)
  const [configDegraded, setConfigDegraded] = useState(false)
  const [loadedSnapshot, setLoadedSnapshot] = useState('')
  const [activeTab, setActiveTab] = useState<'health' | 'spaces' | 'fields' | 'system' | 'bookings'>('health')

  // 預約管理狀態：日期區間預設為台北時區的當月
  const [bookingRange, setBookingRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const [bookingQuery, setBookingQuery] = useState('')
  const [bookingSpaceId, setBookingSpaceId] = useState('')
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingsLoaded, setBookingsLoaded] = useState(false)
  const [bookingsError, setBookingsError] = useState('')
  const [cancelingEventId, setCancelingEventId] = useState('')

  // 預設日期區間＝台北時區的當月。
  // 刻意放在 effect 內計算而不是 useState 的初始值：/admin 是靜態預渲染頁面，
  // 初始值若在 build 當下就固定，使用者隔月才開頁面會看到上個月。
  useEffect(() => {
    setBookingRange(taipeiMonthRange())
  }, [])

  // 日曆連線診斷狀態
  const [health, setHealth] = useState<any>(null)
  const [checkingHealth, setCheckingHealth] = useState(false)

  const checkHealth = async () => {
    setCheckingHealth(true)
    const t = toast.loading('正在檢測 Google 日曆連線狀態...')
    try {
      const r = await fetch('/api/admin/calendar-health')
      if (r.ok) {
        const data = await r.json()
        setHealth(data)
        if (data.auth?.ok && data.eventsProbe?.ok) {
          toast.success(`連線正常！成功讀取 ${data.eventsProbe.count} 筆事件`, { id: t })
        } else {
          toast.error('連線檢測異常，請檢查憑證或日曆 ID', { id: t })
        }
      } else {
        toast.error('診斷 API 回應錯誤', { id: t })
      }
    } catch (e) {
      toast.error('檢測失敗，請檢查後端服務', { id: t })
    } finally {
      setCheckingHealth(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/admin/config')
        if (r.ok) {
          const data = await r.json()
          setLogoPath(data.logoPath || '/images/my-logo.svg')
          setDisabledIds(Array.isArray(data.disabledSpaceIds) ? data.disabledSpaceIds.map(String) : [])
          setDisabledNames(Array.isArray(data.disabledSpaceNames) ? data.disabledSpaceNames.map(String) : [])
          setSpaceOverrides(typeof data.spaceOverrides === 'object' ? data.spaceOverrides : {})
          setHideDisabled(!!data.hideDisabled)
          setFormFields(typeof data.formFields === 'object' ? data.formFields : {})
          setEventFilters(typeof data.eventFilters === 'object' ? data.eventFilters : { spacesOnly: false, allowKeywords: [], ignoreKeywords: [] })
          setGoogleCalendarId(typeof data.googleCalendarId === 'string' ? data.googleCalendarId : '')
          setUseGoogleColors(typeof data.useGoogleColors === 'boolean' ? data.useGoogleColors : true)
          setConfigDegraded(Boolean(data._meta?.degraded))
          setLoadedSnapshot(snapshotOf(data))
        }
      } catch (err) {
        console.error(err)
      }
    }
    load()
    // 初始背景靜默診斷
    fetch('/api/admin/calendar-health')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setHealth(d) })
      .catch(() => {})
  }, [])

  const currentSnapshot = snapshotOf({
    logoPath,
    disabledSpaceIds: disabledIds,
    disabledSpaceNames: disabledNames,
    spaceOverrides,
    hideDisabled,
    formFields,
    eventFilters,
    googleCalendarId,
    useGoogleColors,
  })

  const hasUnsavedChanges = loadedSnapshot !== '' && currentSnapshot !== loadedSnapshot

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  const save = async () => {
    setSaving(true)
    const t = toast.loading('正在儲存系統設定...')
    try {
      const r = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logoPath,
          disabledSpaceIds: disabledIds,
          disabledSpaceNames: disabledNames,
          spaceOverrides,
          hideDisabled,
          formFields,
          eventFilters,
          googleCalendarId,
          useGoogleColors,
        }),
      })
      if (r.ok) {
        const saved = await r.json().catch(() => null)
        if (saved) {
          setConfigDegraded(Boolean(saved._meta?.degraded))
          setLoadedSnapshot(snapshotOf(saved))
        }
        toast.success('設定儲存成功！已即時套用', { id: t })
        checkHealth()
      } else {
        const data = await r.json().catch(() => ({}))
        toast.error((data as { error?: string }).error || '儲存失敗，請檢查權限或連線', { id: t })
      }
    } catch (e) {
      toast.error('儲存發生錯誤', { id: t })
    } finally {
      setSaving(false)
    }
  }

  // ── 預約管理：查詢／匯出／取消 ────────────────────────────────────────────

  /** 查詢與匯出 CSV 共用同一組條件，避免兩邊條件不一致 */
  const buildBookingParams = useCallback(
    (format: 'json' | 'csv'): string => {
      const params = new URLSearchParams({
        start: bookingRange.start,
        end: bookingRange.end,
      })
      const keyword = bookingQuery.trim()
      if (keyword) params.set('q', keyword)
      if (bookingSpaceId) params.set('spaceId', bookingSpaceId)
      if (format === 'csv') params.set('format', 'csv')
      return params.toString()
    },
    [bookingRange.start, bookingRange.end, bookingQuery, bookingSpaceId]
  )

  const queryBookings = useCallback(async () => {
    setBookingsLoading(true)
    setBookingsError('')
    const t = toast.loading('正在查詢預約資料...')
    try {
      const r = await fetch(`/api/admin/bookings?${buildBookingParams('json')}`)
      const data = await r.json().catch(() => null)
      if (r.ok) {
        const list: AdminBooking[] = Array.isArray(data) ? data : []
        setBookings(list)
        toast.success(
          list.length > 0 ? `查詢完成，共 ${list.length} 筆預約` : '查詢完成，此區間沒有預約',
          { id: t }
        )
      } else {
        const message = (data as { error?: string } | null)?.error || '查詢失敗，請稍後再試'
        setBookings([])
        setBookingsError(message)
        toast.error(message, { id: t })
      }
      setBookingsLoaded(true)
    } catch (e) {
      setBookings([])
      setBookingsLoaded(true)
      setBookingsError('查詢失敗，請檢查網路連線或稍後再試')
      toast.error('查詢失敗，請檢查網路連線或稍後再試', { id: t })
    } finally {
      setBookingsLoading(false)
    }
  }, [buildBookingParams])

  // 第一次切到「預約管理」分頁時自動載入當月資料，省一次點擊
  useEffect(() => {
    if (activeTab === 'bookings' && !bookingsLoaded && !bookingsLoading) {
      queryBookings()
    }
  }, [activeTab, bookingsLoaded, bookingsLoading, queryBookings])

  const exportBookingsCsv = () => {
    // 直接讓瀏覽器下載：同源請求會沿用已通過的 Basic Auth，不必自己處理 headers
    window.location.href = `/api/admin/bookings?${buildBookingParams('csv')}`
  }

  const cancelBooking = async (booking: AdminBooking) => {
    const confirmText = [
      '確定要取消這筆預約嗎？',
      '',
      `時間：${formatBookingTime(booking.start, booking.allDay)}`,
      `場地：${booking.spaceName || '未指定場地'}`,
      `申請人：${booking.applicant || '—'}`,
      '',
      '取消後會直接刪除 Google 日曆上的事件，無法復原。',
    ].join('\n')
    if (!window.confirm(confirmText)) return

    setCancelingEventId(booking.eventId)
    const t = toast.loading('正在取消預約...')
    try {
      const r = await fetch(`/api/admin/bookings?eventId=${encodeURIComponent(booking.eventId)}`, {
        method: 'DELETE',
      })
      const data = await r.json().catch(() => null)
      if (r.ok) {
        toast.success('預約已取消，已同步刪除日曆事件', { id: t })
        // 重新查詢一次，確保畫面與 Google 日曆完全一致
        await queryBookings()
      } else {
        const message = (data as { error?: string } | null)?.error || '取消失敗，請稍後再試'
        toast.error(message, { id: t })
      }
    } catch (e) {
      toast.error('取消失敗，請檢查網路連線或稍後再試', { id: t })
    } finally {
      setCancelingEventId('')
    }
  }

  return (
    <>
      <Head>
        <title>系統後台管理 | 長庚大學創新育成中心</title>
        <link rel="icon" href="/images/my-logo.svg" />
      </Head>

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          style: {
            fontSize: '14px',
            padding: '12px 18px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
          },
        }}
      />

      <div className="min-h-screen bg-slate-100 pb-28">
        {/* ── 頂部 Header ── */}
        <header
          className="shadow-md relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #091a3e 0%, #0f2c69 50%, #1d4ed8 100%)' }}
        >
          <div className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/95 px-3 py-1 rounded-lg shadow-sm flex items-center justify-center">
                <Image
                  src={logoPath || '/images/my-logo.svg'}
                  alt="Logo"
                  width={130}
                  height={24}
                  unoptimized
                  className="object-contain"
                  style={{ width: 'auto', height: '24px' }}
                />
              </div>
              <div className="h-6 w-px bg-white/20 hidden sm:block" />
              <div>
                <span className="text-blue-200 text-[10px] font-bold tracking-widest uppercase block">
                  系統管理控制台
                </span>
                <h1 className="text-white text-lg font-bold">空間預約管理後台</h1>
              </div>
            </div>

            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/25 backdrop-blur-md px-4 py-2 rounded-full transition-all shadow-sm"
            >
              <span>← 返回預約前台</span>
            </Link>
          </div>
        </header>

        {/* ── 導覽標籤列 ── */}
        <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-5 flex gap-2 overflow-x-auto py-2">
            {[
              { id: 'health', label: '🩺 Google 日曆連線診斷' },
              { id: 'spaces', label: '🏢 場地與停用管理' },
              { id: 'fields', label: '📝 預約表單欄位' },
              { id: 'system', label: '⚙️ 系統與過濾設定' },
              { id: 'bookings', label: '📅 預約管理' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`text-xs sm:text-sm font-bold px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 主體內容 ── */}
        <main className="max-w-5xl mx-auto p-5 sm:p-6 space-y-6 mt-2">
          {configDegraded && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <p className="font-bold mb-1">⚠️ 目前讀不到正式設定</p>
              <p className="text-xs leading-relaxed">
                後端回落到安全預設值（未停用任何場地）。請確認 Vercel KV
                連線與環境變數；此狀態下儲存設定可能會覆蓋原有內容，建議先排除問題再儲存。
              </p>
            </div>
          )}
          {/* TAB 1: 日曆診斷與連線 */}
          {activeTab === 'health' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <span>🩺</span> Google 日曆健康度診斷
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      即時驗證服務帳號 JWT 簽章與 Google Calendar API 讀取權限
                    </p>
                  </div>
                  <button
                    onClick={checkHealth}
                    disabled={checkingHealth}
                    className="text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span>{checkingHealth ? '⏳ 檢測中...' : '🔄 重新檢測'}</span>
                  </button>
                </div>

                {health ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80">
                      <p className="text-xs text-slate-500 font-bold mb-1.5 uppercase tracking-wider">
                        服務帳號憑證 (GOOGLE_CREDENTIALS)
                      </p>
                      {health.env?.hasGOOGLE_CREDENTIALS ? (
                        <div className="text-emerald-700 font-bold flex items-start gap-1.5">
                          <span className="text-base leading-none">✅</span>
                          <div>
                            <span>憑證已載入</span>
                            {health.env?.clientEmail && (
                              <span className="text-xs text-slate-600 block mt-1 font-mono font-normal">
                                {health.env.clientEmail}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-rose-600 font-bold flex items-center gap-1.5">
                          <span>❌</span>
                          <span>未設定 GOOGLE_CREDENTIALS 環境變數</span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80">
                      <p className="text-xs text-slate-500 font-bold mb-1.5 uppercase tracking-wider">
                        日曆 ID (CALENDAR_ID)
                      </p>
                      {health.calendarId?.value ? (
                        <div className="text-emerald-700 font-bold flex items-start gap-1.5">
                          <span className="text-base leading-none">✅</span>
                          <div className="min-w-0">
                            <span className="font-mono text-xs block truncate" title={health.calendarId.value}>
                              {health.calendarId.value}
                            </span>
                            <span className="text-[11px] text-slate-500 block mt-1 font-normal">
                              來源: {health.calendarId.from === 'config' ? '後台覆寫設定' : '環境變數'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-rose-600 font-bold flex items-center gap-1.5">
                          <span>❌</span>
                          <span>未設定日曆 ID</span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80">
                      <p className="text-xs text-slate-500 font-bold mb-1.5 uppercase tracking-wider">
                        Google API 授權驗證
                      </p>
                      {health.auth?.ok ? (
                        <div className="text-emerald-700 font-bold flex items-center gap-1.5">
                          <span className="text-base leading-none">✅</span>
                          <span>JWT 授權驗證成功</span>
                        </div>
                      ) : (
                        <div className="text-rose-600 font-bold">
                          <p className="flex items-center gap-1.5">
                            <span>❌</span>
                            <span>授權失敗</span>
                          </p>
                          {health.auth?.error && (
                            <p className="text-xs text-rose-500 mt-1 font-mono font-normal bg-rose-50 p-2 rounded">
                              {health.auth.error}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80">
                      <p className="text-xs text-slate-500 font-bold mb-1.5 uppercase tracking-wider">
                        本月事件讀取測試
                      </p>
                      {health.eventsProbe?.ok ? (
                        <div className="text-emerald-700 font-bold">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base leading-none">✅</span>
                            <span>成功讀取 {health.eventsProbe.count} 筆日曆事件</span>
                          </div>
                          {health.eventsProbe.sampleTitles?.length > 0 && (
                            <span className="text-xs text-slate-500 block font-normal mt-1.5 truncate">
                              近期事件：{health.eventsProbe.sampleTitles.slice(0, 2).join('、')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-amber-700 font-bold flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>{health.eventsProbe?.error || '尚未讀取事件'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    載入診斷狀態中...
                  </div>
                )}
              </div>

              {/* 日曆 ID 自訂設定 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6">
                <h2 className="text-base font-bold text-slate-800 mb-1">Google Calendar ID 自訂覆寫</h2>
                <p className="text-xs text-slate-500 mb-4">
                  若在此設定，將優先於 .env 中的 CALENDAR_ID 生效（適合切換至其他測試日曆）
                </p>
                <input
                  className="input-field"
                  value={googleCalendarId}
                  onChange={(e) => setGoogleCalendarId(e.target.value)}
                  placeholder="例如：your_calendar_id@group.calendar.google.com"
                />
              </div>
            </div>
          )}

          {/* TAB 2: 場地與停用管理 */}
          {activeTab === 'spaces' && (
            <div className="space-y-6">
              {/* 顯示設定開關 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">隱藏暫停預約的空間</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    開啟後，前台預約首頁將完全隱藏已被停用的空間卡片
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideDisabled}
                    onChange={(e) => setHideDisabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* 各場地詳細自訂與停用 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6">
                <h2 className="text-base font-bold text-slate-800 mb-4">場地名稱、圖片與開放狀態</h2>
                <div className="space-y-4 divide-y divide-slate-100">
                  {spaces.map((s) => {
                    const o = spaceOverrides[s.id] || {}
                    const isDisById = disabledIds.includes(s.id)
                    const isDisByName = disabledNames.includes(s.name)
                    const isDisabled = isDisById || isDisByName

                    return (
                      <div key={s.id} className="pt-4 first:pt-0">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-800">
                              場地 #{s.id}：{s.name}
                            </span>
                            {isDisabled && (
                              <span className="text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full">
                                暫停預約中
                              </span>
                            )}
                          </div>

                          {/* 停用切換按鈕 */}
                          <button
                            type="button"
                            onClick={() => {
                              // 一律以 id 為準；同時清掉舊版留下的「名稱停用」資料，
                              // 避免 id / name 兩份狀態互相打架導致場地無法重新開放
                              if (isDisabled) {
                                setDisabledIds(prev => prev.filter(x => x !== s.id))
                                setDisabledNames(prev => prev.filter(x => x !== s.name))
                              } else {
                                setDisabledIds(prev => (prev.includes(s.id) ? prev : [...prev, s.id]))
                              }
                            }}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                              isDisabled
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {isDisabled ? '已停用（點擊重新開放）' : '開放中（點擊停用）'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">自訂顯示名稱</label>
                            <input
                              className="input-field"
                              value={o.name ?? s.name}
                              onChange={(e) =>
                                setSpaceOverrides((prev) => ({
                                  ...prev,
                                  [s.id]: { ...prev[s.id], name: e.target.value },
                                }))
                              }
                              placeholder={s.name}
                            />
                          </div>
                          <div>
                            <label className="form-label">圖片路徑 (public 目錄下)</label>
                            <input
                              className={`input-field ${
                                !isSafeAssetPath(o.image ?? s.image) ? 'border-rose-400' : ''
                              }`}
                              aria-invalid={!isSafeAssetPath(o.image ?? s.image)}
                              aria-describedby={`space-${s.id}-image-hint`}
                              value={o.image ?? s.image}
                              onChange={(e) =>
                                setSpaceOverrides((prev) => ({
                                  ...prev,
                                  [s.id]: { ...prev[s.id], image: e.target.value },
                                }))
                              }
                              placeholder={s.image}
                            />
                            <p
                              id={`space-${s.id}-image-hint`}
                              className="text-[11px] mt-1 text-slate-400"
                            >
                              {isSafeAssetPath(o.image ?? s.image)
                                ? '請使用站內路徑，例如 /images/space3.webp'
                                : '⚠️ 必須是以 / 開頭的站內路徑，外部網址會讓前台圖片載入失敗'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 預約表單設定 */}
          {activeTab === 'fields' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6">
              <h2 className="text-base font-bold text-slate-800 mb-1">預約表單欄位開關與自訂</h2>
              <p className="text-xs text-slate-500 mb-6">
                您可以隨時調整前台預約時使用者需要填寫的欄位、是否必填以及自訂的標籤名稱
              </p>

              <div className="space-y-4 divide-y divide-slate-100">
                {[
                  { key: 'department', label: '申請單位' },
                  { key: 'departmentName', label: '單位名稱' },
                  { key: 'name', label: '申請者姓名' },
                  { key: 'phone', label: '聯繫電話' },
                  { key: 'email', label: 'Email' },
                  { key: 'participants', label: '預估參加人數' },
                  { key: 'date', label: '借用日期' },
                  { key: 'startTime', label: '起始時間' },
                  { key: 'endTime', label: '結束時間' },
                  { key: 'purpose', label: '使用目的' },
                ].map((f) => {
                  const cfg = formFields[f.key] || {}
                  const isShow = cfg.show !== false
                  const isReq = cfg.required !== undefined ? cfg.required : (f.key !== 'purpose' && f.key !== 'departmentName')

                  return (
                    <div key={f.key} className="pt-4 first:pt-0 grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-center">
                      <div className="sm:col-span-3">
                        <span className="font-bold text-sm text-slate-800">{f.label}</span>
                        <span className="text-[11px] text-slate-400 block font-mono">({f.key})</span>
                      </div>

                      <div className="sm:col-span-3 flex items-center gap-4">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isShow}
                            onChange={(e) =>
                              setFormFields((prev) => ({
                                ...prev,
                                [f.key]: { ...prev[f.key], show: e.target.checked },
                              }))
                            }
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span>前台顯示</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isReq}
                            disabled={!isShow}
                            onChange={(e) =>
                              setFormFields((prev) => ({
                                ...prev,
                                [f.key]: { ...prev[f.key], required: e.target.checked },
                              }))
                            }
                            className="rounded text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                          />
                          <span>設為必填</span>
                        </label>
                      </div>

                      <div className="sm:col-span-6">
                        <input
                          className="input-field text-xs py-2"
                          value={cfg.label ?? f.label}
                          onChange={(e) =>
                            setFormFields((prev) => ({
                              ...prev,
                              [f.key]: { ...prev[f.key], label: e.target.value },
                            }))
                          }
                          placeholder={`自訂標籤（預設：${f.label}）`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 4: 系統與過濾設定 */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              {/* LOGO 設定 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6">
                <h2 className="text-base font-bold text-slate-800 mb-1">網站 LOGO 設定</h2>
                <p className="text-xs text-slate-500 mb-4">
                  輸入 public 目錄下的圖片路徑（建議長寬比 5:1 的 SVG 或透明 PNG）
                </p>
                <div className="flex items-center gap-4">
                  <input
                    className="input-field flex-1"
                    value={logoPath}
                    onChange={(e) => setLogoPath(e.target.value)}
                    placeholder="/images/my-logo.svg"
                  />
                  <div className="h-10 px-3 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200 flex-shrink-0">
                    <Image
                      src={logoPath || '/images/my-logo.svg'}
                      alt="預覽"
                      width={100}
                      height={20}
                      unoptimized
                      style={{ width: 'auto', height: '20px' }}
                    />
                  </div>
                </div>
              </div>

              {/* 事件過濾與色彩 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6">
                <h2 className="text-base font-bold text-slate-800 mb-4">日曆事件過濾與色彩</h2>

                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useGoogleColors}
                      onChange={(e) => setUseGoogleColors(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium">沿用 Google 行事曆原生事件標籤顏色</span>
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!eventFilters.spacesOnly}
                      onChange={(e) =>
                        setEventFilters((prev) => ({ ...prev, spacesOnly: e.target.checked }))
                      }
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium">僅顯示包含已註冊空間名稱的行程事件</span>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="form-label">忽略關鍵字（逗號分隔，含此字不顯示）</label>
                      <input
                        className="input-field"
                        value={(eventFilters.ignoreKeywords || []).join(', ')}
                        onChange={(e) =>
                          setEventFilters((prev) => ({
                            ...prev,
                            ignoreKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                          }))
                        }
                        placeholder="例：地板打蠟, 消毒清潔"
                      />
                    </div>
                    <div>
                      <label className="form-label">允許關鍵字（逗號分隔）</label>
                      <input
                        className="input-field"
                        value={(eventFilters.allowKeywords || []).join(', ')}
                        onChange={(e) =>
                          setEventFilters((prev) => ({
                            ...prev,
                            allowKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                          }))
                        }
                        placeholder="例：創新基地, 會議室"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* TAB 5: 預約管理 */}
          {activeTab === 'bookings' && (
            <div className="space-y-6">
              {/* 查詢條件 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6">
                <h2 className="text-base font-bold text-slate-800 mb-1">預約查詢與匯出</h2>
                <p className="text-xs text-slate-500 mb-4">
                  資料即時來自 Google 日曆，單次查詢區間上限 62 天；匯出的 CSV 已帶 UTF-8
                  BOM，可直接用 Excel 開啟
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="form-label">開始日期</label>
                    <input
                      type="date"
                      className="input-field"
                      value={bookingRange.start}
                      onChange={(e) => setBookingRange((prev) => ({ ...prev, start: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">結束日期</label>
                    <input
                      type="date"
                      className="input-field"
                      value={bookingRange.end}
                      onChange={(e) => setBookingRange((prev) => ({ ...prev, end: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">關鍵字</label>
                    <input
                      className="input-field"
                      value={bookingQuery}
                      onChange={(e) => setBookingQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !bookingsLoading) queryBookings()
                      }}
                      placeholder="標題／申請人／單位／用途"
                    />
                  </div>
                  <div>
                    <label className="form-label">場地</label>
                    <select
                      className="input-field"
                      value={bookingSpaceId}
                      onChange={(e) => setBookingSpaceId(e.target.value)}
                    >
                      <option value="">全部場地</option>
                      {spaces.map((space) => (
                        <option key={space.id} value={space.id}>
                          {spaceDisplayName(space, { spaceOverrides })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 mt-4">
                  <button
                    onClick={queryBookings}
                    disabled={bookingsLoading}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
                  >
                    {bookingsLoading ? '⏳ 查詢中...' : '🔍 查詢'}
                  </button>
                  <button
                    onClick={exportBookingsCsv}
                    className="bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 text-sm font-bold px-5 py-2.5 rounded-xl transition-all"
                  >
                    ⬇️ 匯出 CSV
                  </button>
                  {bookingsLoaded && !bookingsLoading && !bookingsError && (
                    <span className="text-xs text-slate-500">共 {bookings.length} 筆</span>
                  )}
                </div>
              </div>

              {/* 查詢結果 */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6">
                <h2 className="text-base font-bold text-slate-800 mb-4">查詢結果</h2>

                {bookingsLoading ? (
                  <div className="py-12 text-center text-sm text-slate-400">
                    ⏳ 正在讀取 Google 日曆資料...
                  </div>
                ) : bookingsError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <p className="text-sm font-bold text-rose-700">⚠️ 查詢失敗</p>
                    <p className="text-xs text-rose-600 mt-1 leading-relaxed">{bookingsError}</p>
                  </div>
                ) : !bookingsLoaded ? (
                  <div className="py-12 text-center text-sm text-slate-400">
                    設定條件後點選「查詢」，即可載入預約資料
                  </div>
                ) : bookings.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400">
                    <p className="font-semibold text-slate-500 mb-1">📭 此區間沒有符合條件的預約</p>
                    <p className="text-xs">試著放寬日期區間，或清除關鍵字／場地條件</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full min-w-[900px] text-sm border-collapse">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 tracking-wider border-b border-slate-200">
                          <th className="py-2.5 pr-3 font-bold whitespace-nowrap">時間</th>
                          <th className="py-2.5 pr-3 font-bold">場地</th>
                          <th className="py-2.5 pr-3 font-bold">申請人</th>
                          <th className="py-2.5 pr-3 font-bold">聯絡方式</th>
                          <th className="py-2.5 pr-3 font-bold whitespace-nowrap">人數</th>
                          <th className="py-2.5 pr-3 font-bold">用途</th>
                          <th className="py-2.5 font-bold whitespace-nowrap">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bookings.map((booking) => (
                          <tr key={booking.eventId} className="align-top hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 pr-3 whitespace-nowrap">
                              <div className="font-semibold text-slate-800">
                                {formatBookingTime(booking.start, booking.allDay)}
                              </div>
                              {booking.end && booking.end !== booking.start && (
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  至 {formatBookingTime(booking.end, booking.allDay)}
                                </div>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              <div className="font-medium text-slate-800">
                                {booking.spaceName || '未指定場地'}
                              </div>
                              <div
                                className="text-[11px] text-slate-400 max-w-[180px] truncate mt-0.5"
                                title={booking.title}
                              >
                                {booking.title}
                              </div>
                            </td>
                            <td className="py-3 pr-3">
                              <div className="font-medium text-slate-800">
                                {booking.applicant || '—'}
                              </div>
                              {(booking.unit || booking.departmentName) && (
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {[booking.unit, booking.departmentName].filter(Boolean).join(' / ')}
                                </div>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              {booking.phone && <div className="text-slate-700">{booking.phone}</div>}
                              {booking.email && (
                                <div className="text-[11px] text-slate-500 break-all mt-0.5">
                                  {booking.email}
                                </div>
                              )}
                              {!booking.phone && !booking.email && (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-3 whitespace-nowrap text-slate-700">
                              {booking.participants ? `${booking.participants} 人` : '—'}
                            </td>
                            <td className="py-3 pr-3">
                              <div
                                className="text-slate-700 line-clamp-2 max-w-[240px]"
                                title={booking.purpose}
                              >
                                {booking.purpose || '—'}
                              </div>
                            </td>
                            <td className="py-3">
                              <button
                                onClick={() => cancelBooking(booking)}
                                disabled={cancelingEventId === booking.eventId}
                                className="text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                              >
                                {cancelingEventId === booking.eventId ? '處理中...' : '取消預約'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* ── 底部懸浮儲存列 ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200/90 py-3.5 px-6 z-30 shadow-lg">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="text-xs text-slate-500 hidden sm:block">
              {hasUnsavedChanges ? (
                <span className="font-semibold text-amber-600">● 有未儲存的變更</span>
              ) : (
                '修改設定後請點擊右側按鈕儲存，設定將立即在線上環境生效。'
              )}
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white text-sm font-bold px-8 py-2.5 rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>儲存設定中...</span>
                </>
              ) : (
                <>
                  <span>💾 儲存所有設定</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// 這個頁面必須是 SSR：middleware 依請求產生 CSP nonce，靜態頁面無法取得。
export async function getServerSideProps() {
  return { props: {} }
}
