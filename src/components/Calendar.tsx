import { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { spaces } from '../data/spaces';

interface Event {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
}

interface CalendarProps {
  selectedSpaceId?: string;
}

export default function Calendar({ selectedSpaceId }: CalendarProps = {}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  // 當 selectedSpaceId 或 events 變化時，過濾事件
  useEffect(() => {
    if (selectedSpaceId) {
      const space = spaces.find(s => s.id === selectedSpaceId);
      if (space) {
        const filtered = events.filter(event => event.title.includes(space.name));
        setFilteredEvents(filtered);
      }
    } else {
      setFilteredEvents(events);
    }
  }, [selectedSpaceId, events]);

  const fetchEvents = async () => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const response = await fetch(
        `/api/calendar-events?timeMin=${startOfMonth.toISOString()}&timeMax=${endOfMonth.toISOString()}`
      );

      if (!response.ok) {
        throw new Error('獲取行事曆事件失敗');
      }

      const data = await response.json();
      setEvents(data);
      setFilteredEvents(data); // 初始化過濾後的事件
    } catch (err) {
      setError(err instanceof Error ? err.message : '獲取行事曆事件失敗');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  // 空間選擇器
  const renderSpaceFilter = () => {
    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">空間篩選</label>
        <div className="flex flex-wrap gap-2">
          <button
            className={`px-3 py-1 rounded-full text-sm ${!selectedSpaceId ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            onClick={() => window.location.href = '/'}
          >
            全部空間
          </button>
          {spaces.map(space => (
            <button
              key={space.id}
              className={`px-3 py-1 rounded-full text-sm ${selectedSpaceId === space.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              onClick={() => window.location.href = `/?space=${space.id}`}
            >
              {space.name}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">行事曆</h2>

      {renderSpaceFilter()}

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        events={filteredEvents}
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          meridiem: false
        }}
        slotMinTime="08:00:00"
        slotMaxTime="22:00:00"
        allDaySlot={false}
        height="auto"
        locale="zh-tw"
        buttonText={{
          today: '今天',
          month: '月',
          week: '週',
          day: '日',
          list: '列表'
        }}
      />
    </div>
  );
}