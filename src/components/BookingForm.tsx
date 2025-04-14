import { useState, useEffect } from 'react';
import { Space } from '../types';
import { generateTimeOptions, formatTime } from '../utils/timeUtils';
import { checkSpaceAvailability } from '../utils/availabilityUtils';

interface BookingFormProps {
  space: Space;
  onClose: () => void;
}

const unitOptions = [
  { value: 'administrative', label: '行政單位' },
  { value: 'department', label: '系所' },
  { value: 'incubator', label: '育成廠商' },
  { value: 'club', label: '社團' },
];

export default function BookingForm({ space, onClose }: BookingFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    participants: '',
    date: '',
    startTime: '',
    endTime: '',
    unit: '',
    department: '',
    departmentName: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  const timeOptions = generateTimeOptions();

  // 獲取行事曆事件
  useEffect(() => {
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
      } catch (err) {
        console.error('獲取行事曆事件失敗:', err);
      }
    };

    fetchEvents();
  }, []);

  // 檢查空間可用性
  useEffect(() => {
    const checkAvailability = async () => {
      if (formData.date && formData.startTime && formData.endTime) {
        setIsCheckingAvailability(true);
        setIsAvailable(null);

        try {
          const available = checkSpaceAvailability(
            events,
            space.name,
            formData.date,
            formData.startTime,
            formData.endTime
          );

          setIsAvailable(available);
        } catch (err) {
          console.error('檢查空間可用性失敗:', err);
          setIsAvailable(null);
        } finally {
          setIsCheckingAvailability(false);
        }
      }
    };

    checkAvailability();
  }, [formData.date, formData.startTime, formData.endTime, events, space.name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    // 檢查空間是否可用
    if (isAvailable === false) {
      setError('選擇的時段已被預約，請選擇其他時段');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/submit-booking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          spaceName: space.name,
          startTime: formatTime(formData.startTime),
          endTime: formatTime(formData.endTime),
          colorId: space.colorId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '預約失敗');
      }

      setSuccess(true);
      // 重置表單
      setFormData({
        name: '',
        phone: '',
        email: '',
        participants: '',
        date: '',
        startTime: '',
        endTime: '',
        unit: '',
        department: '',
        departmentName: '',
      });

      // 成功後延遲關閉表單
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('提交錯誤:', error);
      setError(error instanceof Error ? error.message : '預約失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg">
          預約成功！我們會盡快與您聯繫確認。
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label className="form-label">申請單位</label>
          <select
            required
            className="input-field"
            value={formData.department}
            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            disabled={isSubmitting}
          >
            <option value="">請選擇申請單位</option>
            <option value="醫學院">醫學院</option>
            <option value="工學院">工學院</option>
            <option value="管理學院">管理學院</option>
            <option value="其他">其他</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="form-label">單位名稱</label>
          <input
            type="text"
            value={formData.departmentName}
            onChange={(e) => setFormData({ ...formData, departmentName: e.target.value })}
            className="input-field"
            placeholder="請輸入單位名稱"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="form-label">申請者姓名</label>
          <input
            type="text"
            required
            className="input-field"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            placeholder="請輸入姓名"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="form-label">聯繫電話</label>
          <input
            type="tel"
            required
            className="input-field"
            value={formData.phone}
            onChange={(e) => setFormData({...formData, phone: e.target.value})}
            placeholder="請輸入電話號碼"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="form-label">Email</label>
          <input
            type="email"
            required
            className="input-field"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            placeholder="請輸入電子郵件"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="form-label">預估參加人數</label>
          <input
            type="number"
            required
            min="1"
            max={space.capacity}
            className="input-field"
            value={formData.participants}
            onChange={(e) => setFormData({...formData, participants: e.target.value})}
            placeholder={`1-${space.capacity}人`}
            disabled={isSubmitting}
          />
          <p className="text-sm text-gray-500 mt-1">最大容量：{space.capacity}人</p>
        </div>

        <div className="md:col-span-2">
          <label className="form-label">借用日期</label>
          <input
            type="date"
            required
            min={new Date().toISOString().split('T')[0]}
            className="input-field w-full"
            value={formData.date}
            onChange={(e) => setFormData({...formData, date: e.target.value})}
            disabled={isSubmitting}
          />
        </div>

        <div className="md:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="form-label">起始時間</label>
              <select
                required
                className="input-field"
                value={formData.startTime}
                onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                disabled={isSubmitting}
              >
                <option value="">請選擇時間</option>
                {timeOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">結束時間</label>
              <select
                required
                className="input-field"
                value={formData.endTime}
                onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                disabled={isSubmitting}
              >
                <option value="">請選擇時間</option>
                {timeOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 空間可用性提示 */}
          {formData.date && formData.startTime && formData.endTime && (
            <div className="mt-2">
              {isCheckingAvailability ? (
                <p className="text-gray-500">正在檢查空間可用性...</p>
              ) : isAvailable === true ? (
                <p className="text-green-600">✔️ 此時段可預約</p>
              ) : isAvailable === false ? (
                <p className="text-red-600">❌ 此時段已被預約，請選擇其他時段</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="pt-4">
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? '提交中...' : '提交預約'}
        </button>
      </div>
    </form>
  );
}