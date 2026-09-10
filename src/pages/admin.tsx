import { useEffect, useState } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import Image from 'next/image'
import { spaces } from '@/data/spaces'
import toast, { Toaster } from 'react-hot-toast'

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
  const [activeTab, setActiveTab] = useState<'health' | 'spaces' | 'fields' | 'system'>('health')

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

  const toggleId = (id: string) => {
    setDisabledIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleName = (name: string) => {
    setDisabledNames((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]))
  }

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
        toast.success('設定儲存成功！已即時套用', { id: t })
        checkHealth()
      } else {
        toast.error('儲存失敗，請檢查權限或連線', { id: t })
      }
    } catch (e) {
      toast.error('儲存發生錯誤', { id: t })
    } finally {
      setSaving(false)
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
        <div className="bg-white border-b border-slate-200 shadow-2xs sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-5 flex gap-2 overflow-x-auto py-2">
            {[
              { id: 'health', label: '🩺 Google 日曆連線診斷' },
              { id: 'spaces', label: '🏢 場地與停用管理' },
              { id: 'fields', label: '📝 預約表單欄位' },
              { id: 'system', label: '⚙️ 系統與過濾設定' },
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
                              toggleId(s.id)
                              if (!disabledNames.includes(s.name)) {
                                toggleName(s.name)
                              } else {
                                setDisabledNames(prev => prev.filter(x => x !== s.name))
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
                              className="input-field"
                              value={o.image ?? s.image}
                              onChange={(e) =>
                                setSpaceOverrides((prev) => ({
                                  ...prev,
                                  [s.id]: { ...prev[s.id], image: e.target.value },
                                }))
                              }
                              placeholder={s.image}
                            />
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
        </main>

        {/* ── 底部懸浮儲存列 ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200/90 py-3.5 px-6 z-30 shadow-lg">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="text-xs text-slate-500 hidden sm:block">
              修改設定後請點擊右側按鈕儲存，設定將立即在線上環境生效。
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

