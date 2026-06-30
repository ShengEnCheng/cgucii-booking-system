import { useState, useEffect, useMemo, memo } from 'react'
import { Space } from '../types/index'
import { generateTimeOptions, formatTime } from '../utils/timeUtils'
import toast from 'react-hot-toast'

interface BookingFormProps {
  space: Space
  onClose: () => void
}

const DEPARTMENT_OPTIONS = [
  { value: '育成廠商', label: '育成廠商（進駐企業）' },
  { value: '行政單位', label: '行政單位' },
  { value: '醫學院', label: '醫學院' },
  { value: '工學院', label: '工學院' },
  { value: '管理學院', label: '管理學院' },
  { value: '其他', label: '其他' },
]

const BookingForm = memo(function BookingForm({ space, onClose }: BookingFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    participants: '',
    date: '',
    startTime: '',
    endTime: '',
    department: '',
    departmentName: '',
    purpose: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false)
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)

  const timeOptions = useMemo(() => generateTimeOptions(), [])

  // 結束時間只顯示大於起始時間的選項
  const endTimeOptions = useMemo(() => {
    if (!formData.startTime) return timeOptions
    return timeOptions.filter(t => t > formData.startTime)
  }, [timeOptions, formData.startTime])

  // 即時呼叫後端 check-availability API
  useEffect(() => {
    if (!formData.date || !formData.startTime || !formData.endTime) {
      setIsAvailable(null)
      return
    }
    if (formData.endTime <= formData.startTime) {
      setIsAvailable(null)
      return
    }

    setIsCheckingAvailability(true)
    setIsAvailable(null)

    const params = new URLSearchParams({
      spaceName: space.name,
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
    })

    fetch(`/api/admin/check-availability?${params}`)
      .then(r => r.json())
      .then(data => setIsAvailable(!!data.available))
      .catch(() => setIsAvailable(null))
      .finally(() => setIsCheckingAvailability(false))
  }, [formData.date, formData.startTime, formData.endTime, space.name])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isAvailable === false) {
      toast.error('此時段已被預約，請更換時段')
      return
    }
    setIsSubmitting(true)
    const loading = toast.loading('正在提交預約...')
    try {
      const res = await fetch('/api/submit-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          spaceName: space.name,
          startTime: formatTime(formData.startTime),
          endTime: formatTime(formData.endTime),
          colorId: space.colorId,
          unit: formData.department,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || '預約失敗')
      toast.success('預約成功！', { id: loading, duration: 4000 })
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '預約失敗，請稍後再試'
      toast.error(msg, { id: loading })
    } finally {
      setIsSubmitting(false)
    }
  }

  const set =
    (field: keyof typeof formData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setFormData(prev => ({ ...prev, [field]: e.target.value }))

  const inputCls =
    'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 bg-white ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ' +
    'disabled:bg-slate-50 disabled:text-slate-400 transition-colors placeholder-slate-400'

  const labelCls = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* ── Section 1：申請人資訊 ── */}
      <div>
        <div className="flex items-center gap-2 mb-5">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold flex-shrink-0">
            1
          </span>
          <h3 className="text-sm font-semibold text-slate-700">申請人資訊</h3>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>申請單位 <span className="text-red-400">*</span></label>
              <select
                required
                className={inputCls}
                value={formData.department}
                onChange={set('department')}
                disabled={isSubmitting}
              >
                <option value="">請選擇</option>
                {DEPARTMENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>單位名稱</label>
              <input
                type="text"
                className={inputCls}
                value={formData.departmentName}
                onChange={set('departmentName')}
                placeholder="公司或單位名稱"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>申請人姓名 <span className="text-red-400">*</span></label>
              <input
                required
                type="text"
                className={inputCls}
                value={formData.name}
                onChange={set('name')}
                placeholder="姓名"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className={labelCls}>聯繫電話 <span className="text-red-400">*</span></label>
              <input
                required
                type="tel"
                className={inputCls}
                value={formData.phone}
                onChange={set('phone')}
                placeholder="電話號碼"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>電子郵件 <span className="text-red-400">*</span></label>
              <input
                required
                type="email"
                className={inputCls}
                value={formData.email}
                onChange={set('email')}
                placeholder="email@example.com"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className={labelCls}>預估參加人數 <span className="text-red-400">*</span></label>
              <input
                required
                type="number"
                min="1"
                max={space.capacity}
                className={inputCls}
                value={formData.participants}
                onChange={set('participants')}
                placeholder={`1–${space.capacity}`}
                disabled={isSubmitting}
              />
              <p className="text-xs text-slate-400 mt-1">此場地最多容納 {space.capacity} 人</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {/* ── Section 2：預約時間 ── */}
      <div>
        <div className="flex items-center gap-2 mb-5">
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold flex-shrink-0">
            2
          </span>
          <h3 className="text-sm font-semibold text-slate-700">預約時間</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>借用日期 <span className="text-red-400">*</span></label>
            <input
              required
              type="date"
              className={inputCls}
              value={formData.date}
              min={new Date().toISOString().split('T')[0]}
              onChange={set('date')}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>開始時間 <span className="text-red-400">*</span></label>
              <select
                required
                className={inputCls}
                value={formData.startTime}
                onChange={e =>
                  setFormData(prev => ({ ...prev, startTime: e.target.value, endTime: '' }))
                }
                disabled={isSubmitting}
              >
                <option value="">請選擇</option>
                {timeOptions.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>結束時間 <span className="text-red-400">*</span></label>
              <select
                required
                className={inputCls}
                value={formData.endTime}
                onChange={set('endTime')}
                disabled={isSubmitting || !formData.startTime}
              >
                <option value="">{formData.startTime ? '請選擇' : '先選開始時間'}</option>
                {endTimeOptions.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 可用性狀態 */}
          {formData.date && formData.startTime && formData.endTime && (
            <div
              className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg border ${
                isCheckingAvailability
                  ? 'bg-slate-50 text-slate-500 border-slate-200'
                  : isAvailable === true
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : isAvailable === false
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              {isCheckingAvailability ? (
                <>
                  <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  查詢時段可用性...
                </>
              ) : isAvailable === true ? (
                <><span className="text-base">✅</span> 此時段可預約</>
              ) : isAvailable === false ? (
                <><span className="text-base">❌</span> 此時段已被預約，請更換時段</>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {/* ── Section 3：使用目的（選填）── */}
      <div>
        <div className="flex items-center gap-2 mb-5">
          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs flex items-center justify-center font-bold flex-shrink-0">
            3
          </span>
          <h3 className="text-sm font-semibold text-slate-700">使用目的</h3>
          <span className="text-xs text-slate-400">（選填）</span>
        </div>

        <textarea
          className={`${inputCls} resize-none`}
          rows={3}
          value={formData.purpose}
          onChange={set('purpose')}
          placeholder="請簡述借用目的，例如：季度會議、產品發表、教育訓練..."
          disabled={isSubmitting}
        />
      </div>

      {/* ── 送出按鈕 ── */}
      <button
        type="submit"
        disabled={isSubmitting || isAvailable === false}
        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
          isSubmitting || isAvailable === false
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 hover:shadow-md'
        }`}
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            提交中...
          </>
        ) : (
          '送出預約申請'
        )}
      </button>
    </form>
  )
})

export default BookingForm
