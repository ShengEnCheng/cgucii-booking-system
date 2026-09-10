import type { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import BookingForm from '../components/BookingForm'
import { spaces } from '../data/spaces'
import Image from 'next/image'
import { Space } from '@/types'
import Calendar from '@/components/Calendar'
import { Toaster } from 'react-hot-toast'

// Google Calendar 顏色對照
const SPACE_COLORS: Record<string, string> = {
  '1': '#7986CB', // 薰衣草藍
  '2': '#33B679', // 鼠尾草綠
  '5': '#F6C026', // 香蕉黃
  '8': '#616161', // 石墨灰
  '11': '#E11D48', // 寶石紅
}
function getAccentColor(colorId?: string): string {
  return SPACE_COLORS[colorId || ''] || '#2563eb'
}

const Home: NextPage = () => {
  // 行事曆篩選用的 active space
  const [activeSpaceId, setActiveSpaceId] = useState<string | undefined>(undefined)
  // 預約 modal 的目標場地
  const [bookingSpace, setBookingSpace] = useState<Space | null>(null)
  // 點選行事曆日期時預填的日期
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined)

  const [config, setConfig] = useState<{
    logoPath: string
    disabledSpaceIds: string[]
    disabledSpaceNames: string[]
    spaceOverrides: Record<string, { name?: string; image?: string }>
    hideDisabled: boolean
    formFields?: Record<string, { show?: boolean; required?: boolean; label?: string }>
  }>({
    logoPath: process.env.NEXT_PUBLIC_LOGO_PATH || '/images/my-logo.svg',
    disabledSpaceIds: [],
    disabledSpaceNames: [],
    spaceOverrides: {},
    hideDisabled: false,
    formFields: {},
  })

  useEffect(() => {
    fetch('/api/public-config')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return
        setConfig({
          logoPath: typeof data.logoPath === 'string' && data.logoPath ? data.logoPath : '/images/my-logo.svg',
          disabledSpaceIds: Array.isArray(data.disabledSpaceIds) ? data.disabledSpaceIds.map(String) : [],
          disabledSpaceNames: Array.isArray(data.disabledSpaceNames) ? data.disabledSpaceNames.map(String) : [],
          spaceOverrides: typeof data.spaceOverrides === 'object' ? data.spaceOverrides : {},
          hideDisabled: !!data.hideDisabled,
          formFields: typeof data.formFields === 'object' ? data.formFields : {},
        })
      })
      .catch(() => {})
  }, [])

  const disabledIdSet = new Set(config.disabledSpaceIds)
  const disabledNameSet = new Set(config.disabledSpaceNames)
  const isSpaceDisabled = (s: { id: string; name: string }) =>
    disabledIdSet.has(s.id) || disabledNameSet.has(s.name)

  const displaySpaces = spaces
    .map(s => {
      const o = config.spaceOverrides[s.id] || {}
      return { ...s, name: o.name ?? s.name, image: o.image ?? s.image }
    })
    .filter(s => !config.hideDisabled || !isSpaceDisabled(s))

  const activeSpace = displaySpaces.find(s => s.id === activeSpaceId)
  const availableCount = displaySpaces.filter(s => !isSpaceDisabled(s)).length

  // 點選行事曆時開啟預約表單並預填選中日期
  const handleDateClick = useCallback((dateStr: string) => {
    setActiveSpaceId(prev => {
      const space =
        displaySpaces.find(s => s.id === prev) ||
        displaySpaces.find(s => !isSpaceDisabled(s))
      if (space && !isSpaceDisabled(space)) {
        setSelectedDate(dateStr)
        setBookingSpace(space)
      }
      return prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySpaces, config.disabledSpaceIds, config.disabledSpaceNames])

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            fontSize: '14px',
            padding: '12px 18px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          },
          success: { style: { background: '#059669', color: '#fff' } },
          error: { style: { background: '#DC2626', color: '#fff' } },
        }}
      />
      <Head>
        <title>創新育成中心 空間預約系統 | 長庚大學技術合作處</title>
        <meta name="description" content="長庚大學技術合作處創新育成中心空間預約系統" />
        <link rel="icon" href="/images/my-logo.svg" />
      </Head>

      {/* ── 整體：固定高度，不捲動 ── */}
      <div className="h-screen flex flex-col overflow-hidden bg-slate-100">

        {/* ── 頂部導覽列 ── */}
        <header
          className="h-16 flex-shrink-0 shadow-md z-20 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #091a3e 0%, #0f2c69 50%, #1d4ed8 100%)' }}
        >
          {/* 背景層次光暈與微光 */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: 'radial-gradient(circle at 80% 40%, rgba(147, 197, 253, 0.25) 0%, transparent 60%)',
            }}
          />

          <div className="relative h-full flex items-center justify-between px-5 sm:px-6 gap-4">
            {/* 左側：Logo 與標題 */}
            <div className="flex items-center gap-4 min-w-0">
              {/* Logo（含白底微光膠囊提升辨識度）*/}
              <div className="bg-white/95 px-3 py-1 rounded-lg shadow-sm flex items-center justify-center flex-shrink-0">
                <Image
                  src={config.logoPath}
                  alt="長庚大學 Logo"
                  width={150}
                  height={28}
                  unoptimized
                  priority
                  className="object-contain"
                  style={{ width: 'auto', height: '26px' }}
                />
              </div>

              {/* 分隔微光線 */}
              <div className="h-7 w-px bg-white/20 hidden sm:block flex-shrink-0" />

              {/* 中文標題區 */}
              <div className="min-w-0">
                <p className="text-blue-200/90 text-[11px] font-semibold tracking-widest uppercase leading-none mb-0.5 truncate">
                  長庚大學技術合作處
                </p>
                <h1 className="text-white text-base sm:text-lg font-extrabold tracking-wide leading-tight truncate">
                  創新育成中心 空間預約系統
                </h1>
              </div>
            </div>

            {/* 右側：狀態徽章與後台按鈕 */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* 系統即時連線標籤（手機上隱藏文字保持清爽）*/}
              <div className="flex items-center gap-2 bg-white/10 hover:bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 text-xs text-white/90 shadow-sm transition-colors">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                </span>
                <span className="hidden md:inline font-medium">Google 日曆即時連線</span>
                <span className="md:hidden font-medium">連線中</span>
              </div>

              {/* 管理員後台連結 */}
              <Link
                href="/admin"
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 active:bg-white/30 border border-white/25 backdrop-blur-md px-3.5 py-1.5 rounded-full transition-all shadow-sm hover:shadow"
                title="前往後台管理系統"
              >
                <svg className="w-3.5 h-3.5 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>後台管理</span>
              </Link>
            </div>
          </div>

          {/* 底部霓虹漸層線 */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[2px]"
            style={{ background: 'linear-gradient(90deg, transparent 5%, #60a5fa 30%, #93c5fd 50%, #60a5fa 70%, transparent 95%)' }}
          />
        </header>

        {/* ── 主體：左右分割 ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── 左欄：場地列表 ── */}
          <aside className="w-72 xl:w-80 bg-white border-r border-slate-200/90 flex flex-col flex-shrink-0 overflow-hidden shadow-sm z-10">

            {/* 左欄標題列 */}
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-3.5 bg-blue-600 rounded-full" />
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">可預約場地</h2>
              </div>
              <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                共 {availableCount} 間開放
              </span>
            </div>

            {/* 場地卡片清單 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {displaySpaces.map(space => {
                const disabled = isSpaceDisabled(space)
                const accent = getAccentColor(space.colorId)
                const isActive = activeSpaceId === space.id

                return (
                  <div
                    key={space.id}
                    className={`group relative rounded-2xl overflow-hidden border transition-all duration-200 ${
                      disabled
                        ? 'opacity-50 border-slate-200 bg-slate-50 cursor-not-allowed'
                        : isActive
                        ? 'border-blue-500 bg-blue-50/40 shadow-md ring-2 ring-blue-500/20'
                        : 'border-slate-200/80 bg-white hover:border-blue-300 hover:shadow-md cursor-pointer'
                    }`}
                    onClick={() => {
                      if (!disabled) setActiveSpaceId(isActive ? undefined : space.id)
                    }}
                  >
                    {/* 照片區 */}
                    <div className="relative h-28 w-full overflow-hidden bg-slate-200">
                      <Image
                        src={space.image}
                        alt={space.name}
                        fill
                        className={`object-cover transition-transform duration-500 ${
                          !disabled ? 'group-hover:scale-105' : ''
                        }`}
                        sizes="(max-width: 1280px) 288px, 320px"
                      />
                      {/* 暗色保護遮罩 */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-transparent" />

                      {/* 左上狀態標籤 */}
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        {disabled ? (
                          <span className="text-[11px] font-semibold bg-slate-800/85 text-white/90 backdrop-blur-sm px-2.5 py-0.5 rounded-full shadow">
                            暫停借用
                          </span>
                        ) : isActive ? (
                          <span className="text-[11px] font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                            <span>✓</span> 篩選中
                          </span>
                        ) : (
                          <span
                            className="text-[11px] font-bold text-white px-2.5 py-0.5 rounded-full shadow-sm flex items-center gap-1.5 backdrop-blur-md"
                            style={{ backgroundColor: `${accent}E6` }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            {space.name}
                          </span>
                        )}
                      </div>

                      {/* 右上容納人數膠囊 */}
                      <div className="absolute top-2.5 right-2.5">
                        <span className="text-[11px] font-semibold bg-black/50 text-white backdrop-blur-sm px-2 py-0.5 rounded-full shadow">
                          👥 最多 {space.capacity} 人
                        </span>
                      </div>

                      {/* 圖片底部空間名稱（對比清晰）*/}
                      <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
                        <p className="text-white font-bold text-sm tracking-wide drop-shadow-sm truncate">
                          {space.name}
                        </p>
                      </div>
                    </div>

                    {/* 卡片下半資訊與動作列 */}
                    <div className="p-3">
                      {/* 設備與特性標籤 */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {space.features.slice(0, 3).map((f) => (
                          <span
                            key={f}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium"
                          >
                            {f}
                          </span>
                        ))}
                      </div>

                      {/* 按鈕與操作提示 */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <span className="text-[11px] text-slate-400 font-medium">
                          {isActive ? '已啟用日曆過濾' : '點選過濾日曆'}
                        </span>

                        {!disabled && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setBookingSpace(space)
                            }}
                            className="text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 px-3.5 py-1.5 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1"
                          >
                            <span>預約</span>
                            <span>→</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 左欄底部提示說明 */}
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/80 flex-shrink-0">
              <p className="text-[11px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
                <span className="text-blue-500 font-bold">💡</span>
                <span>點擊卡片可篩選日曆；點「預約」或「日曆日期」可立即申請借用。</span>
              </p>
            </div>
          </aside>

          {/* ── 右欄：行事曆 ── */}
          <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">

            {/* 行事曆頂部互動篩選列（Legend & Filter Pills）*/}
            <div className="px-6 py-3 border-b border-slate-200/80 bg-white flex flex-wrap items-center justify-between gap-3 flex-shrink-0 shadow-sm z-10">
              {/* 左邊：互動式場地篩選標籤 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">
                  場地檢視：
                </span>

                {/* 全部場地 Chip */}
                <button
                  onClick={() => setActiveSpaceId(undefined)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold transition-all ${
                    activeSpaceId === undefined
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                  }`}
                >
                  全部場地
                </button>

                {/* 各場地標籤 Chip */}
                {displaySpaces.map(space => {
                  const accent = getAccentColor(space.colorId)
                  const isSelected = activeSpaceId === space.id
                  return (
                    <button
                      key={space.id}
                      onClick={() => setActiveSpaceId(isSelected ? undefined : space.id)}
                      className={`text-xs px-3 py-1 rounded-full font-semibold transition-all flex items-center gap-1.5 border ${
                        isSelected
                          ? 'border-slate-800 bg-slate-800 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: accent }}
                      />
                      <span>{space.name}</span>
                    </button>
                  )
                })}
              </div>

              {/* 右邊：當前狀態提示 */}
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                {activeSpace ? (
                  <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 font-medium">
                    <span>目前篩選：</span>
                    <strong className="font-bold">{activeSpace.name}</strong>
                    <button
                      onClick={() => setActiveSpaceId(undefined)}
                      className="ml-1 text-slate-400 hover:text-slate-600"
                      title="清除篩選"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-md">
                    顯示全部場地行事曆
                  </span>
                )}
              </div>
            </div>

            {/* FullCalendar 本體 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 min-h-full">
                <Calendar
                  selectedSpaceId={activeSpaceId}
                  onDateClick={handleDateClick}
                />
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* ── 預約 Modal ── */}
      {bookingSpace && (
        <div
          className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={e => { if (e.target === e.currentTarget) setBookingSpace(null) }}
        >
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100 ring-1 ring-black/5">

            {/* Modal 頂部 Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white"
              style={{ borderLeftWidth: 6, borderLeftColor: getAccentColor(bookingSpace.colorId) }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: getAccentColor(bookingSpace.colorId) }}
                />
                <div>
                  <h2 className="font-bold text-slate-800 text-lg sm:text-xl leading-tight">
                    預約 {bookingSpace.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    請填寫以下資訊以完成 Google 日曆空間預約登記
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBookingSpace(null)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all"
                aria-label="關閉"
              >
                ✕
              </button>
            </div>

            {/* Modal 主體 */}
            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

              {/* 左側：場地詳情面板 */}
              <div className="md:w-[36%] bg-slate-50 border-r border-slate-100 overflow-y-auto flex-shrink-0">
                <div className="relative h-44 w-full bg-slate-200">
                  <Image
                    src={bookingSpace.image}
                    alt={bookingSpace.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 36vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/90 text-slate-800 backdrop-blur-sm shadow-sm">
                      📍 創新育成中心
                    </span>
                    <h3 className="text-white font-bold text-base mt-1 drop-shadow">
                      {bookingSpace.name}
                    </h3>
                  </div>
                </div>

                <div className="p-5">
                  <p className="text-slate-600 text-xs sm:text-sm mb-5 leading-relaxed">
                    {bookingSpace.description}
                  </p>

                  {/* 規格微卡片 */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm text-center">
                      <p className="text-slate-400 text-xs font-medium mb-1">容納人數</p>
                      <p className="font-extrabold text-slate-800 text-2xl leading-none">
                        {bookingSpace.capacity}
                      </p>
                      <p className="text-slate-400 text-[11px] mt-1">人上限</p>
                    </div>
                    <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm text-center">
                      <p className="text-slate-400 text-xs font-medium mb-1">配備設施</p>
                      <p className="font-extrabold text-slate-800 text-2xl leading-none">
                        {bookingSpace.features.length}
                      </p>
                      <p className="text-slate-400 text-[11px] mt-1">項完整配備</p>
                    </div>
                  </div>

                  {/* 設施標籤 */}
                  <div className="mb-5">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      場地配備
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {bookingSpace.features.map(f => (
                        <span
                          key={f}
                          className="text-xs px-2.5 py-1 bg-white text-slate-700 rounded-lg border border-slate-200/90 font-medium shadow-2xs"
                        >
                          ✓ {f}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 借用須知小卡 */}
                  <div className="pt-4 border-t border-slate-200/80">
                    <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3.5">
                      <p className="text-xs font-bold text-blue-900 mb-1.5 flex items-center gap-1.5">
                        <span>📌</span>
                        <span>預約使用須知</span>
                      </p>
                      <ul className="text-xs text-blue-800/90 space-y-1.5 leading-relaxed">
                        <li>• 預約送出後自動排入官方日曆，無需人工審核。</li>
                        <li>• 借用期間請愛惜設備，離場時請關閉電源與空調。</li>
                        <li>• 若需變更或取消，請提早聯繫育成中心窗口。</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 右側：預約表單 */}
              <div className="md:w-[64%] overflow-y-auto p-6 sm:p-8 bg-white">
                <BookingForm
                  space={bookingSpace}
                  initialDate={selectedDate}
                  formFields={config.formFields}
                  onClose={() => { setBookingSpace(null); setSelectedDate(undefined); }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Home
