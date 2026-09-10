import { useState, useEffect, useMemo, memo } from 'react'
import { Space } from '../types/index'
import { generateTimeOptions, formatTime } from '../utils/timeUtils'
import toast from 'react-hot-toast'

interface BookingFormProps {
  space: Space
  initialDate?: string
  formFields?: Record<string, { show?: boolean; required?: boolean; label?: string }>
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

const BookingForm = memo(function BookingForm({
  space,
  initialDate,
  formFields,
  onClose,
}: BookingFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    participants: '',
    date: initialDate || '',
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

  // 當地時區的今日日期 (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const d = new Date()
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]
  }, [])

  useEffect(() => {
    if (initialDate) {
      setFormData(prev => ({ ...prev, date: initialDate }))
    }
  }, [initialDate])

  // 取得後台針對各欄位的顯示、必填與標籤設定
  const getFieldConfig = (key: string, defaultLabel: string, defaultRequired: boolean) => {
    const cfg = formFields?.[key]
    const show = cfg?.show !== undefined ? cfg.show : true
    const required = cfg?.required !== undefined ? cfg.required : defaultRequired
    const label = cfg?.label || defaultLabel
    return { show, required, label }
  }

  const fieldUnit = getFieldConfig('unit', '申請單位類別', false)
  const fieldDepartment = getFieldConfig('department', '申請單位', true)
  const fieldDepartmentName = getFieldConfig('departmentName', '單位名稱', false)
  const fieldName = getFieldConfig('name', '申請人姓名', true)
  const fieldPhone = getFieldConfig('phone', '聯繫電話', true)
  const fieldEmail = getFieldConfig('email', '電子郵件', true)
  const fieldParticipants = getFieldConfig('participants', '預估參加人數', true)
  const fieldDate = getFieldConfig('date', '借用日期', true)
  const fieldStartTime = getFieldConfig('startTime', '開始時間', true)
  const fieldEndTime = getFieldConfig('endTime', '結束時間', true)
  const fieldPurpose = getFieldConfig('purpose', '使用目的', false)

  // 結束時間只顯示大於起始時間的選項
  const endTimeOptions = useMemo(() => {
    if (!formData.startTime) return timeOptions
    return timeOptions.filter((t) => t > formData.startTime)
  }, [timeOptions, formData.startTime])

  // 即時呼叫後端 check-availability API，配合 AbortController 消除競態
  useEffect(() => {
    if (!formData.date || !formData.startTime || !formData.endTime) {
      setIsAvailable(null)
      return
    }
    if (formData.endTime <= formData.startTime) {
      setIsAvailable(null)
      return
    }

    const controller = new AbortController()
    setIsCheckingAvailability(true)
    setIsAvailable(null)

    const params = new URLSearchParams({
      spaceName: space.name,
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
    })

    fetch(`/api/check-availability?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setIsAvailable(!!data.available)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setIsAvailable(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsCheckingAvailability(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [formData.date, formData.startTime, formData.endTime, space.name])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isCheckingAvailability) {
      toast.error('正在查詢時段可用性，請稍候')
      return
    }
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
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) =>
      setFormData((prev) => ({ ...prev, [field]: e.target.value }))

  const inputCls =
    'w-full border border-slate-200/90 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50/50 ' +
    'hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 ' +
    'disabled:bg-slate-100 disabled:text-slate-400 transition-all placeholder-slate-400 shadow-2xs'

  const labelCls =
    'block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      {/* ── Section 1：申請人資訊 ── */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shadow-xs">
            1
          </span>
          <h3 className="text-sm font-bold text-slate-800 tracking-wide">申請單位與人員資訊</h3>
        </div>

        <div className="space-y-4 bg-slate-50/40 p-4 rounded-2xl border border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fieldDepartment.show && (
              <div>
                <label className={labelCls}>
                  {fieldDepartment.label}{' '}
                  {fieldDepartment.required && <span className="text-rose-500">*</span>}
                </label>
                <select
                  required={fieldDepartment.required}
                  className={inputCls}
                  value={formData.department}
                  onChange={set('department')}
                  disabled={isSubmitting}
                >
                  <option value="">請選擇單位類別</option>
                  {DEPARTMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {fieldDepartmentName.show && (
              <div>
                <label className={labelCls}>
                  {fieldDepartmentName.label}{' '}
                  {fieldDepartmentName.required && <span className="text-rose-500">*</span>}
                </label>
                <input
                  type="text"
                  required={fieldDepartmentName.required}
                  className={inputCls}
                  value={formData.departmentName}
                  onChange={set('departmentName')}
                  placeholder="公司或系所完整名稱"
                  disabled={isSubmitting}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fieldName.show && (
              <div>
                <label className={labelCls}>
                  {fieldName.label}{' '}
                  {fieldName.required && <span className="text-rose-500">*</span>}
                </label>
                <input
                  required={fieldName.required}
                  type="text"
                  className={inputCls}
                  value={formData.name}
                  onChange={set('name')}
                  placeholder="申請人完整姓名"
                  disabled={isSubmitting}
                />
              </div>
            )}
            {fieldPhone.show && (
              <div>
                <label className={labelCls}>
                  {fieldPhone.label}{' '}
                  {fieldPhone.required && <span className="text-rose-500">*</span>}
                </label>
                <input
                  required={fieldPhone.required}
                  type="tel"
                  className={inputCls}
                  value={formData.phone}
                  onChange={set('phone')}
                  placeholder="例：0912-345-678 或 分機"
                  disabled={isSubmitting}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fieldEmail.show && (
              <div>
                <label className={labelCls}>
                  {fieldEmail.label}{' '}
                  {fieldEmail.required && <span className="text-rose-500">*</span>}
                </label>
                <input
                  required={fieldEmail.required}
                  type="email"
                  className={inputCls}
                  value={formData.email}
                  onChange={set('email')}
                  placeholder="name@example.com"
                  disabled={isSubmitting}
                />
              </div>
            )}
            {fieldParticipants.show && (
              <div>
                <label className={labelCls}>
                  {fieldParticipants.label}{' '}
                  {fieldParticipants.required && <span className="text-rose-500">*</span>}
                </label>
                <input
                  required={fieldParticipants.required}
                  type="number"
                  min="1"
                  max={space.capacity}
                  className={inputCls}
                  value={formData.participants}
                  onChange={set('participants')}
                  placeholder={`1–${space.capacity} 人`}
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  ※ 此場地法定最多容納 {space.capacity} 人
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 2：預約時間 ── */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shadow-xs">
            2
          </span>
          <h3 className="text-sm font-bold text-slate-800 tracking-wide">預約日期與時段</h3>
        </div>

        <div className="space-y-4 bg-slate-50/40 p-4 rounded-2xl border border-slate-100">
          {fieldDate.show && (
            <div>
              <label className={labelCls}>
                {fieldDate.label}{' '}
                {fieldDate.required && <span className="text-rose-500">*</span>}
              </label>
              <input
                required={fieldDate.required}
                type="date"
                className={inputCls}
                value={formData.date}
                min={todayStr}
                onChange={set('date')}
                disabled={isSubmitting}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {fieldStartTime.show && (
              <div>
                <label className={labelCls}>
                  {fieldStartTime.label}{' '}
                  {fieldStartTime.required && <span className="text-rose-500">*</span>}
                </label>
                <select
                  required={fieldStartTime.required}
                  className={inputCls}
                  value={formData.startTime}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      startTime: e.target.value,
                      endTime: '',
                    }))
                  }
                  disabled={isSubmitting}
                >
                  <option value="">請選擇起始時間</option>
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {fieldEndTime.show && (
              <div>
                <label className={labelCls}>
                  {fieldEndTime.label}{' '}
                  {fieldEndTime.required && <span className="text-rose-500">*</span>}
                </label>
                <select
                  required={fieldEndTime.required}
                  className={inputCls}
                  value={formData.endTime}
                  onChange={set('endTime')}
                  disabled={isSubmitting || !formData.startTime}
                >
                  <option value="">
                    {formData.startTime ? '請選擇結束時間' : '請先選擇開始時間'}
                  </option>
                  {endTimeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 可用性動態狀態通知卡片 */}
          {formData.date && formData.startTime && formData.endTime && (
            <div>
              {isCheckingAvailability ? (
                <div className="flex items-center gap-2.5 text-xs sm:text-sm px-4 py-3 rounded-xl border border-blue-200 bg-blue-50/80 text-blue-700 animate-pulse font-medium">
                  <svg
                    className="animate-spin h-4 w-4 flex-shrink-0 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span>正在即時查詢 Google 日曆時段是否衝突...</span>
                </div>
              ) : isAvailable === true ? (
                <div className="flex items-center gap-2.5 text-xs sm:text-sm px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 font-medium shadow-2xs">
                  <span className="text-base leading-none">✅</span>
                  <span>此時段目前開放借用，無其他預約衝堂！</span>
                </div>
              ) : isAvailable === false ? (
                <div className="flex items-center gap-2.5 text-xs sm:text-sm px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 font-medium shadow-2xs">
                  <span className="text-base leading-none">⚠️</span>
                  <span>此時段已被預約佔用，請重新挑選其他日期或時間。</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3：使用目的（選填）── */}
      {fieldPurpose.show && (
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs flex items-center justify-center font-bold">
              3
            </span>
            <h3 className="text-sm font-bold text-slate-800 tracking-wide">
              {fieldPurpose.label}
            </h3>
            {!fieldPurpose.required && (
              <span className="text-xs text-slate-400 font-normal">（非必填）</span>
            )}
          </div>

          <textarea
            required={fieldPurpose.required}
            className={`${inputCls} resize-none`}
            rows={3}
            value={formData.purpose}
            onChange={set('purpose')}
            placeholder="請簡述預計借用目的，例如：產學合作討論、進駐企業季會、團隊技術研討..."
            disabled={isSubmitting}
          />
        </div>
      )}

      {/* ── 送出按鈕 ── */}
      <button
        type="submit"
        disabled={isSubmitting || isCheckingAvailability || isAvailable === false}
        className={`w-full py-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-md ${
          isSubmitting || isCheckingAvailability || isAvailable === false
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:via-indigo-700 hover:to-blue-800 text-white shadow-blue-500/25 active:scale-[0.99] hover:shadow-lg'
        }`}
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>正在建立 Google 日曆預約排程...</span>
          </>
        ) : (
          <>
            <span>確認送出預約申請</span>
            <span>→</span>
          </>
        )}
      </button>
    </form>
  )
})

export default BookingForm
