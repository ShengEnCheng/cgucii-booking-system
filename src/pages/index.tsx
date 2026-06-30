import type { NextPage } from 'next'
import Head from 'next/head'
import { useState, useEffect, useCallback } from 'react'
import BookingForm from '../components/BookingForm'
import { spaces } from '../data/spaces'
import Image from 'next/image'
import { Space } from '@/types'
import Calendar from '@/components/Calendar'
import { Toaster } from 'react-hot-toast'

// Google Calendar 顏色對照
const SPACE_COLORS: Record<string, string> = {
  '1': '#7986CB',
  '2': '#33B679',
  '5': '#F6C026',
  '8': '#616161',
  '11': '#D60000',
}
function getAccentColor(colorId?: string): string {
  return SPACE_COLORS[colorId || ''] || '#3b82f6'
}

const Home: NextPage = () => {
  // 行事曆篩選用的 active space
  const [activeSpaceId, setActiveSpaceId] = useState<string | undefined>(undefined)
  // 預約 modal 的目標場地
  const [bookingSpace, setBookingSpace] = useState<Space | null>(null)

  const [config, setConfig] = useState<{
    logoPath: string
    disabledSpaceIds: string[]
    spaceOverrides: Record<string, { name?: string; image?: string }>
    hideDisabled: boolean
  }>({
    logoPath: process.env.NEXT_PUBLIC_LOGO_PATH || '/images/my-logo.svg',
    disabledSpaceIds: [],
    spaceOverrides: {},
    hideDisabled: false,
  })

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return
        setConfig({
          logoPath: typeof data.logoPath === 'string' ? data.logoPath : '/images/logo.png',
          disabledSpaceIds: Array.isArray(data.disabledSpaceIds) ? data.disabledSpaceIds.map(String) : [],
          spaceOverrides: typeof data.spaceOverrides === 'object' ? data.spaceOverrides : {},
          hideDisabled: !!data.hideDisabled,
        })
      })
      .catch(() => {})
  }, [])

  const disabledIdSet = new Set(config.disabledSpaceIds)
  const displaySpaces = spaces
    .map(s => {
      const o = config.spaceOverrides[s.id] || {}
      return { ...s, name: o.name ?? s.name, image: o.image ?? s.image }
    })
    .filter(s => !config.hideDisabled || !disabledIdSet.has(s.id))

  const activeSpace = displaySpaces.find(s => s.id === activeSpaceId)

  // useCallback 穩定引用，避免 Calendar（memo 元件）因函式重建而重渲染
  const handleDateClick = useCallback((dateStr: string) => {
    setActiveSpaceId(prev => {
      // 利用 functional update 取得最新 activeSpaceId
      const space = displaySpaces.find(s => s.id === prev);
      if (space && !disabledIdSet.has(space.id)) {
        setBookingSpace(space);
      }
      return prev; // activeSpaceId 不變
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: { fontSize: '14px', padding: '12px 16px' },
          success: { style: { background: '#10B981', color: '#fff' } },
          error: { style: { background: '#EF4444', color: '#fff' } },
        }}
      />
      <Head>
        <title>創新育成中心 空間預約系統</title>
        <meta name="description" content="長庚大學技術合作處創新育成中心空間預約系統" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* ── 整體：固定高度，不捲動 ── */}
      <div className="h-screen flex flex-col overflow-hidden bg-slate-100">

        {/* ── 頂部導覽列 ── */}
        <header
          className="h-16 flex-shrink-0 shadow-lg z-10 relative overflow-hidden"
          style={{ background: 'linear-gradient(120deg, #0f2558 0%, #1a4bb5 60%, #2563eb 100%)' }}
        >
          {/* 背景光暈（增加層次感）*/}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 75% 50%, rgba(255,255,255,0.08) 0%, transparent 65%)' }}
          />

          <div className="relative h-full flex items-center px-6 gap-4">
            {/* Logo（772×146 寬長條形，維持比例顯示）*/}
            <Image
              src={config.logoPath}
              alt="長庚大學 Logo"
              width={160}
              height={30}
              unoptimized
              priority
              className="flex-shrink-0 object-contain"
              style={{ width: 'auto', height: '30px' }}
            />

            {/* 垂直分隔線 */}
            <div className="h-8 w-px bg-white/25 flex-shrink-0" />

            {/* 中文標題區 */}
            <div className="flex-1">
              <p className="text-blue-200 text-[11px] font-medium tracking-widest uppercase leading-none mb-0.5">
                長庚大學技術合作處
              </p>
              <h1 className="text-white text-base font-bold tracking-wide leading-tight">
                創新育成中心 空間預約系統
              </h1>
            </div>

            {/* 右側英文副標（寬螢幕才顯示）*/}
            <div className="hidden lg:flex flex-col items-end flex-shrink-0">
              <p className="text-white/50 text-[10px] tracking-widest uppercase">Chang Gung University</p>
              <p className="text-white/70 text-xs tracking-wide">Innovation Incubation Center</p>
            </div>
          </div>

          {/* 底部強調線 */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[2px]"
            style={{ background: 'linear-gradient(90deg, transparent, #60a5fa, #a5f3fc, #60a5fa, transparent)' }}
          />
        </header>

        {/* ── 主體：左右分割 ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── 左欄：場地列表 ── */}
          <aside className="w-64 xl:w-72 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 overflow-hidden">

            {/* 左欄 header */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">可預約場地</p>
            </div>

            {/* 場地列表 */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {displaySpaces.map(space => {
                const disabled = disabledIdSet.has(space.id)
                const accent = getAccentColor(space.colorId)
                const isActive = activeSpaceId === space.id

                return (
                  <div
                    key={space.id}
                    className={`transition-all duration-150 ${
                      disabled ? 'opacity-50 cursor-default' : 'cursor-pointer'
                    }`}
                    style={{ borderLeft: `3px solid ${isActive ? accent : 'transparent'}` }}
                    onClick={() => { if (!disabled) setActiveSpaceId(isActive ? undefined : space.id) }}
                  >
                    {/* 全寬照片 */}
                    <div className="relative h-24 overflow-hidden">
                      <Image
                        src={space.image}
                        alt={space.name}
                        fill
                        className={`object-cover transition-transform duration-300 ${!disabled && !isActive ? 'group-hover:scale-105' : ''}`}
                        sizes="(max-width: 1280px) 256px, 288px"
                      />
                      {/* 漸層遮罩（方便看文字）*/}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      {/* 色點 */}
                      <span
                        className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-white shadow"
                        style={{ backgroundColor: accent }}
                      />
                      {disabled && (
                        <span className="absolute top-2 left-2 text-xs bg-black/60 text-white px-2 py-0.5 rounded-full">
                          暫停使用
                        </span>
                      )}
                      {isActive && (
                        <span className="absolute top-2 left-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
                          篩選中
                        </span>
                      )}
                    </div>

                    {/* 資訊列 */}
                    <div className={`flex items-center gap-2 px-3 py-2 ${isActive ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{space.name}</p>
                        <p className="text-xs text-slate-500 truncate">最多 {space.capacity} 人 &middot; {space.features[0]}</p>
                      </div>
                      {!disabled && (
                        <button
                          onClick={e => { e.stopPropagation(); setBookingSpace(space) }}
                          className="flex-shrink-0 text-xs font-medium bg-blue-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
                        >
                          預約
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 左欄底部提示 */}
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0">
              <p className="text-xs text-slate-400 leading-relaxed">
                點選場地可篩選行事曆
              </p>
            </div>
          </aside>

          {/* ── 右欄：行事曆 ── */}
          <main className="flex-1 flex flex-col overflow-hidden bg-white">

            {/* 行事曆頂部狀態列（固定，不隨行事曆捲動）*/}
            <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-3 flex-shrink-0 min-h-[44px]">
              {activeSpace ? (
                <>
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getAccentColor(activeSpace.colorId) }}
                  />
                  <span className="text-sm text-slate-600">
                    僅顯示：<strong className="text-slate-800">{activeSpace.name}</strong> 的預約
                  </span>
                  <button
                    onClick={() => setActiveSpaceId(undefined)}
                    className="ml-1 text-xs text-slate-400 hover:text-slate-600 border border-slate-200 hover:border-slate-400 px-2 py-0.5 rounded transition-colors"
                  >
                    顯示全部 ✕
                  </button>
                </>
              ) : (
                <span className="text-sm text-slate-400">顯示全部場地預約 &middot; 點選左側場地可篩選</span>
              )}
            </div>

            {/* FullCalendar（可捲動區域）*/}
            <div className="flex-1 overflow-y-auto p-4">
              <Calendar
                selectedSpaceId={activeSpaceId}
                onDateClick={handleDateClick}
              />
            </div>
          </main>
        </div>
      </div>

      {/* ── 預約 Modal ── */}
      {bookingSpace && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setBookingSpace(null) }}
        >
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">

            {/* Modal 頂部 */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b border-slate-100"
              style={{ borderLeftWidth: 4, borderLeftColor: getAccentColor(bookingSpace.colorId) }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getAccentColor(bookingSpace.colorId) }}
                />
                <h2 className="font-semibold text-slate-800 text-lg">預約 {bookingSpace.name}</h2>
              </div>
              <button
                onClick={() => setBookingSpace(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                aria-label="關閉"
              >
                ✕
              </button>
            </div>

            {/* Modal 主體 */}
            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

              {/* 左：場地資訊 */}
              <div className="md:w-[38%] bg-slate-50 border-r border-slate-100 overflow-y-auto flex-shrink-0">
                <div className="relative h-40">
                  <Image
                    src={bookingSpace.image}
                    alt={bookingSpace.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 38vw"
                  />
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-slate-800 mb-1">{bookingSpace.name}</h3>
                  <p className="text-slate-500 text-sm mb-4 leading-relaxed">{bookingSpace.description}</p>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white rounded-lg p-3 border border-slate-100 text-center">
                      <p className="text-slate-400 text-xs mb-0.5">容納人數</p>
                      <p className="font-bold text-slate-700 text-2xl leading-none">{bookingSpace.capacity}</p>
                      <p className="text-slate-400 text-xs mt-0.5">人</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-slate-100 text-center">
                      <p className="text-slate-400 text-xs mb-0.5">配備設施</p>
                      <p className="font-bold text-slate-700 text-2xl leading-none">{bookingSpace.features.length}</p>
                      <p className="text-slate-400 text-xs mt-0.5">項</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {bookingSpace.features.map(f => (
                      <span
                        key={f}
                        className="text-xs px-2.5 py-1 bg-white text-slate-600 rounded-full border border-slate-200"
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">注意事項</p>
                    <ul className="text-xs text-slate-500 space-y-1.5 leading-relaxed">
                      <li className="flex gap-1.5"><span className="text-blue-400 flex-shrink-0">›</span>預約即時成立，請確認時段後再送出</li>
                      <li className="flex gap-1.5"><span className="text-blue-400 flex-shrink-0">›</span>使用完畢請保持場地整潔</li>
                      <li className="flex gap-1.5"><span className="text-blue-400 flex-shrink-0">›</span>如需取消請提前告知育成中心</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 右：預約表單 */}
              <div className="md:w-[62%] overflow-y-auto p-6">
                <BookingForm
                  space={bookingSpace}
                  onClose={() => setBookingSpace(null)}
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
