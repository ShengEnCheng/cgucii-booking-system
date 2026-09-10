import { useEffect, useState, useMemo, useRef, memo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import zhTwLocale from '@fullcalendar/core/locales/zh-tw';
import { getSpaceKeywords, isEventForSpace } from '@/utils/availabilityUtils';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  description?: string;
  location?: string;
}

interface CalendarProps {
  selectedSpaceId?: string;
  onDateClick?: (dateStr: string) => void;
}

const Calendar = memo(function Calendar({ selectedSpaceId, onDateClick }: CalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true); // 初始載入遮罩
  const [fetching, setFetching] = useState(false); // 切換月份 background fetch bar
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const rangeRef = useRef<{ start: string; end: string } | null>(null);
  const [config, setConfig] = useState<{
    spaceOverrides?: Record<string, { name?: string }>;
    disabledSpaceIds?: string[];
  }>({});

  useEffect(() => {
    fetch('/api/public-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setConfig({
            spaceOverrides: data.spaceOverrides || {},
            disabledSpaceIds: data.disabledSpaceIds || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  const fetchRange = async (startISO: string, endISO: string, isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      else setFetching(true);
      const res = await fetch(`/api/calendar-events?start=${startISO}&end=${endISO}&t=${Date.now()}`);
      if (!res.ok) throw new Error('獲取行事曆事件失敗');
      const data = await res.json();
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '獲取行事曆事件失敗');
    } finally {
      if (isInitial) setLoading(false);
      else setFetching(false);
    }
  };

  useEffect(() => {
    if (range) {
      fetchRange(range.start, range.end, events.length === 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // 依 selectedSpaceId 與別名關鍵字過濾事件
  const filteredEvents = useMemo(() => {
    if (!selectedSpaceId) return events;
    const keywords = getSpaceKeywords(selectedSpaceId, config.spaceOverrides);
    return events.filter((ev) => isEventForSpace(ev, keywords));
  }, [selectedSpaceId, events, config.spaceOverrides]);

  const toHM = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const toContrast = (hex: string) => {
    const h = hex.replace('#', '');
    if (h.length !== 6) return '#111827';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#111827' : '#FFFFFF';
  };

  return (
    <div className="relative min-h-[500px]">
      {/* 切換月份時的細長 loading bar */}
      {fetching && (
        <div className="absolute top-0 left-0 right-0 h-1 z-30 overflow-hidden rounded">
          <div className="h-full bg-blue-500 animate-pulse w-full" />
        </div>
      )}

      {/* 初始載入半透明遮罩（不阻斷 FullCalendar 掛載與 datesSet 觸發）*/}
      {loading && (
        <div className="absolute inset-0 bg-white/75 z-20 flex flex-col justify-center items-center backdrop-blur-[1px] rounded-xl transition-opacity">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-2" />
          <p className="text-sm font-medium text-slate-600">正在載入行事曆事件...</p>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        eventDisplay="block"
        selectable={!!onDateClick}
        dateClick={onDateClick ? (arg: any) => onDateClick(arg.dateStr) : undefined}
        datesSet={(arg: any) => {
          const newStart = arg.start.toISOString();
          const newEnd = arg.end.toISOString();
          if (rangeRef.current?.start === newStart && rangeRef.current?.end === newEnd) return;
          rangeRef.current = { start: newStart, end: newEnd };
          setRange({ start: newStart, end: newEnd });
        }}
        eventContent={(arg: any) => {
          const title = arg.event.title || '';
          const s = arg.event.start;
          const e = arg.event.end;
          const desc = String((arg.event.extendedProps as any)?.description || '');
          const m = desc.match(/申請者：\s*([^\n]+)/);
          const applicant = m ? m[1].trim() : '';
          const isMonth = arg.view.type === 'dayGridMonth';

          if (!s || !e || arg.event.allDay) {
            return { html: `<div class="ev-title">${title}</div>` };
          }
          if (isMonth) {
            return {
              html: `<div class="ev-title">${title}</div><div class="ev-time-line">🕒 ${toHM(s)}–${toHM(e)}</div>`,
            };
          }
          const sub = applicant ? `<div class="ev-subtitle">👤 ${applicant}</div>` : '';
          return {
            html: `<div class="ev-title">${title}</div>${sub}<div class="ev-meta"><span class="ev-badge">🕒 ${toHM(s)}–${toHM(e)}</span></div>`,
          };
        }}
        eventDidMount={(arg: any) => {
          const evColor =
            (arg.event as any).backgroundColor ||
            (arg.event.extendedProps as any)?.color ||
            '';
          if (evColor) {
            (arg.el as HTMLElement).style.backgroundColor = evColor;
            (arg.el as HTMLElement).style.borderColor = evColor;
            (arg.el as HTMLElement).style.color = toContrast(evColor);
          }
          const s = arg.event.start;
          const e = arg.event.end;
          const title = arg.event.title || '';
          arg.el.setAttribute('title', s && e ? `${title}\n${toHM(s)}–${toHM(e)}` : title);
        }}
        events={filteredEvents}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
        slotMinTime="08:00:00"
        slotMaxTime="22:00:00"
        allDaySlot={false}
        height="auto"
        locales={[zhTwLocale]}
        locale="zh-tw"
        buttonText={{ today: '今天', month: '月', week: '週', day: '日' }}
      />
    </div>
  );
});

export default Calendar;
