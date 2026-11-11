import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import zhTwLocale from '@fullcalendar/core/locales/zh-tw'
import { getSpaceKeywords, isEventForSpace } from '@/utils/availabilityUtils'
import { getContrastColor } from '@/data/colors'
import { BOOKING_RULES, BUSINESS_HOURS, todayInTaipei, addDaysInTaipei } from '@/config/bookingRules'
import type { SpaceOverride } from '@/utils/configSchema'

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  color?: string
  location?: string
  /** 由後端脫敏後提供，前端不再自行解析 description */
  applicant?: string
  spaceId?: string | null
}

interface CalendarProps {
  selectedSpaceId?: string
  spaceOverrides?: Record<string, SpaceOverride>
  /** 預約成功後遞增，用來強制重抓目前範圍 */
  refreshKey?: number
  onDateClick?: (dateStr: string) => void
  onStatusChange?: (status: { loading: boolean; error: string | null }) => void
}

const taipeiTimeFormatter = new Intl.DateTimeFormat('zh-TW', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Taipei',
})

function formatTaipeiTime(date?: Date | null): string {
  if (!date) return ''
  return taipeiTimeFormatter.format(date)
}

/** 事件內容全部用 textContent 組 DOM，不使用 html 字串（避免 stored XSS）。 */
function buildEventDom(options: {
  title: string
  timeLine: string
  applicant?: string
  compact: boolean
}): HTMLElement | null {
  if (typeof document === 'undefined') return null

  const wrapper = document.createElement('div')

  const titleEl = document.createElement('div')
  titleEl.className = 'ev-title'
  titleEl.textContent = options.title
  wrapper.appendChild(titleEl)

  if (options.compact) {
    const timeEl = document.createElement('div')
    timeEl.className = 'ev-time-line'
    timeEl.textContent = `🕒 ${options.timeLine}`
    wrapper.appendChild(timeEl)
    return wrapper
  }

  if (options.applicant) {
    const applicantEl = document.createElement('div')
    applicantEl.className = 'ev-subtitle'
    applicantEl.textContent = `👤 ${options.applicant}`
    wrapper.appendChild(applicantEl)
  }

  const meta = document.createElement('div')
  meta.className = 'ev-meta'
  const badge = document.createElement('span')
  badge.className = 'ev-badge'
  badge.textContent = `🕒 ${options.timeLine}`
  meta.appendChild(badge)
  wrapper.appendChild(meta)

  return wrapper
}

const Calendar = memo(function Calendar({
  selectedSpaceId,
  spaceOverrides = {},
  refreshKey = 0,
  onDateClick,
  onStatusChange,
}: CalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<{ start: string; end: string } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const rangeRef = useRef<{ start: string; end: string } | null>(null)
  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    onStatusChange?.({ loading: loading || fetching, error })
  }, [loading, fetching, error, onStatusChange])

  const fetchRange = useCallback(async (startISO: string, endISO: string, isInitial = false) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      if (isInitial) setLoading(true)
      else setFetching(true)

      const url = `/api/calendar-events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error('獲取行事曆事件失敗')
      const data = (await response.json()) as CalendarEvent[]

      // 只有最後一次請求的回應可以覆寫畫面，避免快速換月時舊資料蓋掉新資料
      if (requestIdRef.current !== requestId) return

      setEvents(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      if (requestIdRef.current !== requestId) return
      setError(err instanceof Error ? err.message : '獲取行事曆事件失敗')
    } finally {
      if (requestIdRef.current === requestId) {
        if (isInitial) setLoading(false)
        else setFetching(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!range) return
    fetchRange(range.start, range.end, events.length === 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, refreshKey, reloadToken])

  useEffect(() => () => abortRef.current?.abort(), [])

  // 依 selectedSpaceId 過濾事件（別名關鍵字在本地比對，不需再打一次 API）
  const filteredEvents = useMemo(() => {
    if (!selectedSpaceId) return events
    const keywords = getSpaceKeywords(selectedSpaceId, spaceOverrides)
    return events.filter((event) =>
      isEventForSpace(event, keywords, selectedSpaceId) ||
      (event.spaceId ? String(event.spaceId) === String(selectedSpaceId) : false)
    )
  }, [selectedSpaceId, events, spaceOverrides])

  const validRangeStart = useMemo(() => todayInTaipei(), [])
  const validRangeEnd = useMemo(
    () => addDaysInTaipei(validRangeStart, BOOKING_RULES.maxDaysAhead),
    [validRangeStart]
  )

  return (
    <div className="relative min-h-[500px]">
      {fetching && (
        <div className="absolute top-0 left-0 right-0 h-1 z-30 overflow-hidden rounded">
          <div className="h-full bg-blue-500 animate-pulse w-full" />
        </div>
      )}

      {/* 只遮住日曆下方區域，避免擋住 FullCalendar 的 datesSet 觸發 */}
      {loading && (
        <div className="absolute inset-0 bg-white/75 z-20 flex flex-col justify-center items-center backdrop-blur-[1px] rounded-xl">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-2" />
          <p className="text-sm font-medium text-slate-600">正在載入行事曆事件...</p>
        </div>
      )}

      {/* 錯誤訊息用浮動卡片覆蓋在日曆上方：不佔用版面高度，避免出現錯誤時造成 CLS */}
      {error && (
        <div
          role="alert"
          className="absolute top-2 left-2 right-2 sm:left-auto sm:right-2 sm:max-w-sm z-30 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-lg text-sm flex items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            className="flex-shrink-0 text-xs font-bold bg-white border border-red-200 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100"
          >
            重新載入
          </button>
        </div>
      )}

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        timeZone="Asia/Taipei"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        eventDisplay="block"
        // 關閉日號與表頭的無 href 錨點（FullCalendar 預設會產生 <a> 但沒有 href，
        // 會讓 Lighthouse 的 crawlable-anchors 與鍵盤操作判定扣分）
        navLinks={false}
        selectable={Boolean(onDateClick)}
        dateClick={
          onDateClick
            ? (arg: any) => {
                // 週/日檢視的 dateStr 會帶時間（例如 2026-11-12T10:30:00+08:00），
                // 只取日期部分，否則 <input type="date"> 會變空白、API 也會回 400
                const dateStr = String(arg.dateStr || '').slice(0, 10)
                if (dateStr) onDateClick(dateStr)
              }
            : undefined
        }
        validRange={{ start: validRangeStart, end: addDaysInTaipei(validRangeEnd, 1) }}
        datesSet={(arg: any) => {
          const newStart = arg.start.toISOString()
          const newEnd = arg.end.toISOString()
          if (rangeRef.current?.start === newStart && rangeRef.current?.end === newEnd) return
          rangeRef.current = { start: newStart, end: newEnd }
          setRange({ start: newStart, end: newEnd })
        }}
        eventContent={(arg: any) => {
          const extended = (arg.event.extendedProps || {}) as {
            applicant?: string
            color?: string
          }
          const timeLine = `${formatTaipeiTime(arg.event.start)}–${formatTaipeiTime(arg.event.end)}`

          if (!arg.event.start || !arg.event.end || arg.event.allDay) {
            const dom = buildEventDom({
              title: arg.event.title || '',
              timeLine,
              compact: true,
            })
            return dom ? { domNodes: [dom] } : { html: '' }
          }

          const dom = buildEventDom({
            title: arg.event.title || '',
            timeLine,
            applicant: extended.applicant,
            compact: arg.view.type === 'dayGridMonth',
          })
          return dom ? { domNodes: [dom] } : { html: '' }
        }}
        eventDidMount={(arg: any) => {
          const extended = (arg.event.extendedProps || {}) as { color?: string }
          const eventColor = extended.color
          if (eventColor) {
            const element = arg.el as HTMLElement
            element.style.backgroundColor = eventColor
            element.style.borderColor = eventColor
            element.style.color = getContrastColor(eventColor)
          }
          const start = arg.event.start
          const end = arg.event.end
          const timeText = start && end ? `${formatTaipeiTime(start)}–${formatTaipeiTime(end)}` : ''
          arg.el.setAttribute(
            'title',
            timeText ? `${arg.event.title}\n${timeText}` : arg.event.title || ''
          )
        }}
        events={filteredEvents}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false, hour12: false }}
        slotMinTime={`${BUSINESS_HOURS.open}:00`}
        slotMaxTime={`${BUSINESS_HOURS.close}:00`}
        slotDuration={`00:${String(BOOKING_RULES.slotMinutes).padStart(2, '0')}:00`}
        allDaySlot={false}
        height="auto"
        locales={[zhTwLocale]}
        locale="zh-tw"
        buttonText={{ today: '今天', month: '月', week: '週', day: '日' }}
      />
    </div>
  )
})

export default Calendar
