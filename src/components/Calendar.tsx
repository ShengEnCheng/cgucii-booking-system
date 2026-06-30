import { useEffect, useState, useMemo, useRef, memo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { spaces } from '../data/spaces';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
}

interface CalendarProps {
  selectedSpaceId?: string;
  onDateClick?: (dateStr: string) => void;
}

const Calendar = memo(function Calendar({ selectedSpaceId, onDateClick }: CalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);     // 初始 loading
  const [fetching, setFetching] = useState(false);  // 切換月份的 background fetch
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const rangeRef = useRef<{ start: string; end: string } | null>(null); // 防止重複 fetch
  const [config, setConfig] = useState<{
    spaceOverrides?: Record<string, { name?: string }>;
    disabledSpaceIds?: string[];
  }>({});

  useEffect(() => {
    if (!range) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
      setRange({ start: startOfMonth, end: endOfMonth });
    }
  }, []);

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setConfig({ spaceOverrides: data.spaceOverrides || {}, disabledSpaceIds: data.disabledSpaceIds || [] });
      })
      .catch(() => {});
  }, []);

  const fetchRange = async (startISO: string, endISO: string, isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      else setFetching(true);
      const res = await fetch(`/api/calendar-events?start=${startISO}&end=${endISO}&t=${Date.now()}`);
      if (!res.ok) throw new Error('獲取行事曆事件失敗');
      setEvents(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : '獲取行事曆事件失敗');
    } finally {
      if (isInitial) setLoading(false);
      else setFetching(false);
    }
  };

  useEffect(() => {
    if (range) fetchRange(range.start, range.end, events.length === 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // 依 selectedSpaceId 過濾事件
  const filteredEvents = useMemo(() => {
    if (!selectedSpaceId) return events;
    const space = spaces.find(s => s.id === selectedSpaceId);
    if (!space) return events;
    const overrideName = (config.spaceOverrides || {})[space.id]?.name;
    const keywords = [space.name.toLowerCase()];
    if (overrideName) keywords.push(overrideName.toLowerCase());
    if (space.id === '3') keywords.push('c01', 'c01會議室');
    if (space.id === '4') keywords.push('c02', 'c02會議室', '中型c02會議室');
    return events.filter(ev => {
      const t = String(ev.title || '').toLowerCase();
      return keywords.some(k => t.includes(k));
    });
  }, [selectedSpaceId, events, config]);

  // 只有真正的初始載入才顯示全屏 spinner（避免切換月份閃爍）
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

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
    <div className="relative">
      {/* 切換月份時的細長 loading bar（不遮蓋行事曆）*/}
      {fetching && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-10 overflow-hidden rounded">
          <div className="h-full bg-blue-500 animate-pulse w-full" />
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
      dateClick={onDateClick ? (arg) => onDateClick(arg.dateStr) : undefined}
      datesSet={(arg) => {
        const newStart = arg.start.toISOString();
        const newEnd = arg.end.toISOString();
        // 防止 FullCalendar 重複觸發相同 range 導致無限 fetch
        if (rangeRef.current?.start === newStart && rangeRef.current?.end === newEnd) return;
        rangeRef.current = { start: newStart, end: newEnd };
        setRange({ start: newStart, end: newEnd });
      }}
      eventContent={(arg) => {
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
            html: `<div class="ev-title">${title}</div><div class="ev-time-line">${toHM(s)}–${toHM(e)}</div>`,
          };
        }
        const sub = applicant ? `<div class="ev-subtitle">申請者：${applicant}</div>` : '';
        return {
          html: `<div class="ev-title">${title}</div>${sub}<div class="ev-meta"><span class="ev-badge">${toHM(s)}–${toHM(e)}</span></div>`,
        };
      }}
      eventDidMount={(arg) => {
        const evColor = (arg.event as any).backgroundColor || (arg.event.extendedProps as any)?.color || '';
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
      locale="zh-tw"
      buttonText={{ today: '今天', month: '月', week: '週', day: '日' }}
    />
    </div>
  );
});

export default Calendar;
