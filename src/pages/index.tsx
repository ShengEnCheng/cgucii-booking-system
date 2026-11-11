import type { NextPage, GetServerSideProps } from 'next'
import Head from 'next/head'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import toast, { Toaster } from 'react-hot-toast'
import BookingForm from '@/components/BookingForm'
import { spaces } from '@/data/spaces'
import type { Space } from '@/types'
import { getAccentColor } from '@/data/colors'
import {
  resolveDisabledSpaceIds,
  spaceDisplayImage,
  spaceDisplayName,
  type AppConfig,
  type SpaceOverride,
} from '@/utils/configSchema'

// 行事曆含 FullCalendar（約 180KB），用 dynamic 讓首屏先出骨架
const Calendar = dynamic(() => import('@/components/Calendar'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[500px] flex items-center justify-center text-sm text-slate-500">
      行事曆載入中...
    </div>
  ),
})

type AppConfigState = {
  logoPath: string
  disabledSpaceIds: string[]
  spaceOverrides: Record<string, SpaceOverride>
  hideDisabled: boolean
  formFields: Record<string, { show?: boolean; required?: boolean; label?: string }>
}

interface IndexProps {
  initialConfig: AppConfigState
  configDegraded: boolean
}

const Home: NextPage<IndexProps> = ({ initialConfig, configDegraded }) => {
  const [activeSpaceId, setActiveSpaceId] = useState<string | undefined>(undefined)
  const [bookingSpace, setBookingSpace] = useState<Space | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined)
  const [config, setConfig] = useState<AppConfigState>(initialConfig)
  const [isConfigDegraded, setIsConfigDegraded] = useState(configDegraded)
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const modalRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  // 取得最新設定（SSR 已有初始值，這裡只是為了不用重新整理就能套用後台變更）
  useEffect(() => {
    let cancelled = false
    fetch('/api/public-config')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data || data.degraded) return
        setConfig({
          logoPath: data.logoPath || '/images/my-logo.svg',
          disabledSpaceIds: Array.isArray(data.disabledSpaceIds)
            ? data.disabledSpaceIds.map(String)
            : [],
          spaceOverrides: data.spaceOverrides || {},
          hideDisabled: data.hideDisabled !== false,
          formFields: data.formFields || {},
        })
        setIsConfigDegraded(false)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const disabledIdSet = useMemo(
    () => new Set(config.disabledSpaceIds.map(String)),
    [config.disabledSpaceIds]
  )

  const isSpaceDisabled = useCallback(
    (spaceId: string) => disabledIdSet.has(String(spaceId)),
    [disabledIdSet]
  )

  const displaySpaces = useMemo(
    () =>
      spaces
        .map((space) => ({
          ...space,
          name: spaceDisplayName(space, config),
          image: spaceDisplayImage(space, config),
        }))
        .filter((space) => !config.hideDisabled || !isSpaceDisabled(space.id)),
    [config, isSpaceDisabled]
  )

  // 若目前篩選的場地被停用／隱藏，自動清掉，避免日曆被過濾成空白卻無法取消
  useEffect(() => {
    if (!activeSpaceId) return
    if (!displaySpaces.some((space) => space.id === activeSpaceId)) {
      setActiveSpaceId(undefined)
    }
  }, [activeSpaceId, displaySpaces])

  const activeSpace = displaySpaces.find((space) => space.id === activeSpaceId)
  const availableCount = displaySpaces.filter((space) => !isSpaceDisabled(space.id)).length

  const closeBooking = useCallback(() => {
    setBookingSpace(null)
    setSelectedDate(undefined)
  }, [])

  const handleDateClick = useCallback(
    (dateStr: string) => {
      const target =
        displaySpaces.find((space) => space.id === activeSpaceId && !isSpaceDisabled(space.id)) ||
        displaySpaces.find((space) => !isSpaceDisabled(space.id))

      if (!target) {
        toast.error('目前沒有開放的場地，請聯繫育成中心')
        return
      }
      if (!activeSpaceId) {
        // 沒有先選場地時不要默默代入第一個場地，先請使用者挑選
        toast('請先選擇要預約的場地，再點選日期', { icon: 'ℹ️' })
        return
      }

      setSelectedDate(dateStr)
      setBookingSpace(target)
    },
    [activeSpaceId, displaySpaces, isSpaceDisabled]
  )

  const handleCalendarStatus = useCallback(
    ({ error }: { loading: boolean; error: string | null }) => {
      setCalendarError(error)
    },
    []
  )

  // Modal：鎖定背景、Esc 關閉、開啟時聚焦、關閉後歸還焦點
  useEffect(() => {
    if (!bookingSpace) return

    lastFocusedRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeBooking()
        return
      }
      if (event.key !== 'Tab' || !modalRef.current) return

      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      lastFocusedRef.current?.focus?.()
    }
  }, [bookingSpace, closeBooking])

  const connectionHealthy = !calendarError && !isConfigDegraded

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

      {/* 行動裝置可捲動、桌機固定滿版 */}
      <div className="min-h-dvh md:h-dvh flex flex-col md:overflow-hidden bg-slate-100">
        {/* ── 頂部導覽列 ── */}
        <header
          className="h-16 flex-shrink-0 shadow-md z-20 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #091a3e 0%, #0f2c69 50%, #1d4ed8 100%)' }}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(circle at 80% 40%, rgba(147, 197, 253, 0.25) 0%, transparent 60%)',
            }}
          />

          <div className="relative h-full flex items-center justify-between px-4 sm:px-6 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-white/95 px-2.5 py-1 rounded-lg shadow-sm flex items-center justify-center flex-shrink-0">
                <Image
                  src={config.logoPath}
                  alt="長庚大學 Logo"
                  width={150}
                  height={28}
                  unoptimized
                  priority
                  className="object-contain"
                  style={{ width: 'auto', height: '24px' }}
                />
              </div>

              <div className="h-7 w-px bg-white/20 hidden sm:block flex-shrink-0" />

              <div className="min-w-0">
                <p className="text-blue-200/90 text-[10px] sm:text-[11px] font-semibold tracking-widest uppercase leading-none mb-0.5 truncate">
                  長庚大學技術合作處
                </p>
                <h1 className="text-white text-sm sm:text-lg font-extrabold tracking-wide leading-tight truncate">
                  創新育成中心 空間預約系統
                </h1>
              </div>
            </div>

            <div
              className="hidden sm:flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/15 text-xs text-white/90 shadow-sm flex-shrink-0"
              title={connectionHealthy ? 'Google 日曆連線正常' : '連線異常，請稍後再試或聯繫管理員'}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    connectionHealthy ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    connectionHealthy ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              </span>
              <span className="font-medium">
                {connectionHealthy ? 'Google 日曆連線正常' : '連線異常，顯示可能非最新'}
              </span>
            </div>
          </div>

          <div
            className="absolute bottom-0 left-0 right-0 h-[2px]"
            style={{
              background:
                'linear-gradient(90deg, transparent 5%, #60a5fa 30%, #93c5fd 50%, #60a5fa 70%, transparent 95%)',
            }}
          />
        </header>

        {/* ── 主體：桌機左右分割、手機單欄 ── */}
        <div className="flex flex-1 md:overflow-hidden">
          {/* 左欄：場地列表（手機隱藏，改由上方 chips 選場地） */}
          <aside className="hidden md:flex w-72 xl:w-80 bg-white border-r border-slate-200/90 flex-col flex-shrink-0 overflow-hidden shadow-sm z-10">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-3.5 bg-blue-600 rounded-full" />
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  可預約場地
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                共 {availableCount} 間開放
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {displaySpaces.map((space) => {
                const disabled = isSpaceDisabled(space.id)
                const accent = getAccentColor(space.colorId)
                const isActive = activeSpaceId === space.id

                return (
                  <div
                    key={space.id}
                    className={`group relative rounded-2xl overflow-hidden border transition-all duration-200 ${
                      disabled
                        ? 'opacity-60 border-slate-200 bg-slate-50'
                        : isActive
                          ? 'border-blue-500 bg-blue-50/40 shadow-md ring-2 ring-blue-500/20'
                          : 'border-slate-200/80 bg-white hover:border-blue-300 hover:shadow-md'
                    }`}
                  >
                    <div className="relative h-28 w-full overflow-hidden bg-slate-200">
                      <Image
                        src={space.image}
                        alt={space.name}
                        fill
                        placeholder={space.blurDataURL ? 'blur' : 'empty'}
                        blurDataURL={space.blurDataURL}
                        className={`object-cover transition-transform duration-500 ${
                          !disabled ? 'group-hover:scale-105' : ''
                        }`}
                        sizes="(max-width: 1280px) 288px, 320px"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-transparent" />

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

                      <div className="absolute top-2.5 right-2.5">
                        <span className="text-[11px] font-semibold bg-black/50 text-white backdrop-blur-sm px-2 py-0.5 rounded-full shadow">
                          👥 最多 {space.capacity} 人
                        </span>
                      </div>

                      <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
                        <p className="text-white font-bold text-sm tracking-wide drop-shadow-sm truncate">
                          {space.name}
                        </p>
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="flex flex-wrap gap-1 mb-3">
                        {space.features.slice(0, 3).map((feature) => (
                          <span
                            key={feature}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => {
                            if (disabled) return
                            setActiveSpaceId(isActive ? undefined : space.id)
                          }}
                          disabled={disabled}
                          className={`text-[11px] font-medium rounded-md px-2 py-1 transition-colors ${
                            disabled
                              ? 'text-slate-400 cursor-not-allowed'
                              : 'text-slate-500 hover:text-blue-700 hover:bg-blue-50'
                          }`}
                        >
                          {isActive ? '已啟用日曆過濾' : '點選過濾日曆'}
                        </button>

                        {!disabled && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDate(undefined)
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

            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/80 flex-shrink-0">
              <p className="text-[11px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
                <span className="text-blue-500 font-bold">💡</span>
                <span>點卡片可篩選日曆；點「預約」或日曆日期即可申請借用。</span>
              </p>
            </div>
          </aside>

          {/* 右欄：行事曆 */}
          <main className="flex-1 flex flex-col md:overflow-hidden bg-slate-50/50 min-w-0">
            <div className="px-4 sm:px-6 py-3 border-b border-slate-200/80 bg-white flex flex-wrap items-center justify-between gap-3 flex-shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline">
                  場地檢視：
                </span>

                <button
                  type="button"
                  onClick={() => setActiveSpaceId(undefined)}
                  aria-pressed={activeSpaceId === undefined}
                  className={`text-xs px-3 py-1 rounded-full font-semibold transition-all ${
                    activeSpaceId === undefined
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                  }`}
                >
                  全部場地
                </button>

                {/* 手機版沒有左側場地卡，選好場地後在這裡提供明確的預約入口 */}
                {activeSpace && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(undefined)
                      setBookingSpace(activeSpace)
                    }}
                    className="md:hidden text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 px-3.5 py-1.5 rounded-full shadow-sm transition-all"
                  >
                    預約 {activeSpace.name} →
                  </button>
                )}

                {displaySpaces.map((space) => {
                  const accent = getAccentColor(space.colorId)
                  const isSelected = activeSpaceId === space.id
                  const disabled = isSpaceDisabled(space.id)
                  return (
                    <button
                      key={space.id}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={disabled}
                      onClick={() => setActiveSpaceId(isSelected ? undefined : space.id)}
                      className={`text-xs px-3 py-1 rounded-full font-semibold transition-all flex items-center gap-1.5 border ${
                        isSelected
                          ? 'border-slate-800 bg-slate-800 text-white shadow-sm'
                          : disabled
                            ? 'border-slate-200 bg-slate-100 text-slate-400'
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

              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                {activeSpace ? (
                  <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 font-medium">
                    <span>目前篩選：</span>
                    <strong className="font-bold">{activeSpace.name}</strong>
                    <button
                      type="button"
                      onClick={() => setActiveSpaceId(undefined)}
                      className="ml-1 text-slate-400 hover:text-slate-600"
                      aria-label="清除場地篩選"
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

            <div className="flex-1 md:overflow-y-auto p-3 sm:p-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-3 sm:p-4 min-h-full">
                <Calendar
                  selectedSpaceId={activeSpaceId}
                  spaceOverrides={config.spaceOverrides}
                  refreshKey={refreshKey}
                  onDateClick={handleDateClick}
                  onStatusChange={handleCalendarStatus}
                />
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* ── 預約 Modal ── */}
      {bookingSpace && (
        <div
          className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeBooking()
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-modal-title"
            className="bg-white rounded-3xl max-w-4xl w-full max-h-[92dvh] overflow-hidden flex flex-col shadow-2xl border border-slate-100 ring-1 ring-black/5"
          >
            <div
              className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 bg-white"
              style={{ borderLeftWidth: 6, borderLeftColor: getAccentColor(bookingSpace.colorId) }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: getAccentColor(bookingSpace.colorId) }}
                />
                <div className="min-w-0">
                  <h2
                    id="booking-modal-title"
                    className="font-bold text-slate-800 text-base sm:text-xl leading-tight truncate"
                  >
                    預約 {bookingSpace.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                    請填寫以下資訊以完成 Google 日曆空間預約登記
                  </p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeBooking}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all flex-shrink-0"
                aria-label="關閉預約視窗"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
              {/* 場地詳情：手機隱藏，避免把表單擠出畫面 */}
              <div className="hidden md:block md:w-[36%] bg-slate-50 border-r border-slate-100 overflow-y-auto flex-shrink-0">
                <div className="relative h-44 w-full bg-slate-200">
                  <Image
                    src={bookingSpace.image}
                    alt={bookingSpace.name}
                    fill
                    placeholder={bookingSpace.blurDataURL ? 'blur' : 'empty'}
                    blurDataURL={bookingSpace.blurDataURL}
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

                  <div className="mb-5">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      場地配備
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {bookingSpace.features.map((feature) => (
                        <span
                          key={feature}
                          className="text-xs px-2.5 py-1 bg-white text-slate-700 rounded-lg border border-slate-200/90 font-medium shadow-sm"
                        >
                          ✓ {feature}
                        </span>
                      ))}
                    </div>
                  </div>

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

              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 bg-white">
                <BookingForm
                  space={bookingSpace}
                  initialDate={selectedDate}
                  formFields={config.formFields}
                  onClose={closeBooking}
                  onSuccess={() => setRefreshKey((key) => key + 1)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export const getServerSideProps: GetServerSideProps<IndexProps> = async () => {
  // 動態匯入：readAppConfig 會用到 fs / @vercel/kv，不能進 client bundle
  const { readAppConfigMeta } = await import('@/utils/appConfig')
  const { resolveDisabledSpaceIds } = await import('@/utils/configSchema')

  const { config, degraded } = await readAppConfigMeta()

  return {
    props: {
      initialConfig: {
        logoPath: config.logoPath,
        disabledSpaceIds: resolveDisabledSpaceIds(config),
        spaceOverrides: config.spaceOverrides,
        hideDisabled: config.hideDisabled,
        formFields: config.formFields,
      },
      configDegraded: degraded,
    },
  }
}

export default Home
