import { useEffect, useMemo, useState, memo } from 'react'
import toast from 'react-hot-toast'
import type { Space } from '@/types'
import {
  BOOKING_RULES,
  FIELD_LIMITS,
  generateEndTimeOptions,
  generateTimeOptions,
  todayInTaipei,
} from '@/config/bookingRules'

type AvailabilityState = 'idle' | 'checking' | 'available' | 'busy' | 'unknown'

interface BookingFormProps {
  space: Space
  initialDate?: string
  formFields?: Record<string, { show?: boolean; required?: boolean; label?: string }>
  onClose: () => void
  onSuccess?: () => void
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
  onSuccess,
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
  const [availability, setAvailability] = useState<AvailabilityState>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    cancelUrl?: string
    spaceName?: string
    date?: string
    startTime?: string
    endTime?: string
  } | null>(null)

  const timeOptions = useMemo(() => generateTimeOptions(), [])
  const endTimeOptions = useMemo(() => generateEndTimeOptions(formData.startTime), [formData.startTime])
  const todayStr = useMemo(() => todayInTaipei(), [])

  useEffect(() => {
    if (initialDate) {
      setFormData((prev) => ({ ...prev, date: initialDate }))
    }
  }, [initialDate])

  const getFieldConfig = (key: string, defaultLabel: string, defaultRequired: boolean) => {
    const config = formFields?.[key]
    const show = config?.show !== undefined ? config.show : true
    const required = config?.required !== undefined ? config.required : defaultRequired
    const label = config?.label || defaultLabel
    return { show, required, label }
  }

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

  const participantsValue = Number(formData.participants)
  const participantsTooMany =
    formData.participants !== '' &&
    Number.isFinite(participantsValue) &&
    participantsValue > space.capacity

  // 即時查詢可用性（AbortController 消除競態）
  useEffect(() => {
    if (!formData.date || !formData.startTime || !formData.endTime) {
      setAvailability('idle')
      return
    }
    if (formData.endTime <= formData.startTime) {
      setAvailability('idle')
      return
    }

    const controller = new AbortController()
    setAvailability('checking')

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        spaceId: space.id,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
      })

      fetch(`/api/check-availability?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          // 非 2xx 代表「無法確認」，不能誤判成「已被預約」而禁用送出
          if (!response.ok) {
            setAvailability('unknown')
            return null
          }
          return response.json()
        })
        .then((data) => {
          if (!data) return
          setAvailability(data.available ? 'available' : 'busy')
        })
        .catch((error) => {
          if ((error as Error)?.name === 'AbortError') return
          setAvailability('unknown')
        })
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [formData.date, formData.startTime, formData.endTime, space.id])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitError(null)

    if (availability === 'checking') {
      setSubmitError('正在確認時段是否可用，請稍候再送出')
      return
    }
    if (availability === 'busy') {
      setSubmitError('此時段已被預約，請更換時段')
      return
    }
    if (participantsTooMany) {
      setSubmitError(`此場地最多容納 ${space.capacity} 人`)
      return
    }

    setIsSubmitting(true)
    const loadingToast = toast.loading('正在提交預約...')

    try {
      const response = await fetch('/api/submit-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          spaceId: space.id,
          spaceName: space.name,
          unit: formData.department,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error((data as { error?: string }).error || '預約失敗，請稍後再試')
      }

      toast.success('預約成功！已排入 Google 日曆', { id: loadingToast, duration: 4000 })
      onSuccess?.()
      setSuccess({
        cancelUrl: typeof data?.cancelUrl === 'string' ? data.cancelUrl : undefined,
        spaceName: typeof data?.spaceName === 'string' ? data.spaceName : space.name,
        date: typeof data?.date === 'string' ? data.date : formData.date,
        startTime: typeof data?.startTime === 'string' ? data.startTime : formData.startTime,
        endTime: typeof data?.endTime === 'string' ? data.endTime : formData.endTime,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '預約失敗，請稍後再試'
      setSubmitError(message)
      toast.error(message, { id: loadingToast })
    } finally {
      setIsSubmitting(false)
    }
  }

  const set =
    (field: keyof typeof formData) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setSubmitError(null)
      setFormData((prev) => ({ ...prev, [field]: event.target.value }))
    }

  const inputCls =
    'w-full border border-slate-200/90 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50/50 ' +
    'hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 ' +
    'disabled:bg-slate-100 disabled:text-slate-400 transition-all placeholder-slate-400 shadow-sm'

  const labelCls = 'block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5'
  const disabled = isSubmitting
  const submitDisabled = isSubmitting || availability === 'checking' || availability === 'busy' || participantsTooMany

  const availabilityView = () => {
    if (!formData.date || !formData.startTime || !formData.endTime) return null

    if (availability === 'checking') {
      return {
        tone: 'blue',
        icon: '',
        text: '正在確認此時段是否可用...',
      }
    }
    if (availability === 'available') {
      return { tone: 'emerald', icon: '✅', text: '此時段目前開放借用，無其他預約衝堂。' }
    }
    if (availability === 'busy') {
      return { tone: 'rose', icon: '⚠️', text: '此時段已被預約佔用，請重新挑選其他日期或時間。' }
    }
    if (availability === 'unknown') {
      return {
        tone: 'amber',
        icon: 'ℹ️',
        text: '暫時無法確認時段狀態，仍可送出；系統會在送出時再次檢查。',
      }
    }
    return null
  }

  const availabilityInfo = availabilityView()

  const toneClasses: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50/80 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
  }

  if (success) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-sm font-bold text-emerald-900 mb-1">✅ 預約成功，已排入 Google 日曆</p>
          <p className="text-xs text-emerald-800/90 leading-relaxed">
            {success.spaceName}｜{success.date}｜{success.startTime} - {success.endTime}
          </p>
        </div>

        {success.cancelUrl ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <p className="text-xs font-bold text-slate-700">需要取消嗎？請保留這個連結</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              取消連結自預約日起 30 天內有效，且僅能在活動開始前使用。若已設定通知信，
              同一條連結也會寄到您的電子郵件。
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                value={success.cancelUrl}
                aria-label="取消預約連結"
                className="flex-1 min-w-0 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-600"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(success.cancelUrl as string)
                    .then(() => toast.success('已複製取消連結'))
                    .catch(() => toast.error('複製失敗，請手動選取'))
                }}
                className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors"
              >
                複製連結
              </button>
            </div>
            <a
              href={success.cancelUrl}
              className="inline-block text-xs font-semibold text-rose-600 hover:text-rose-700 underline underline-offset-2"
            >
              前往取消頁面
            </a>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 leading-relaxed">
            如需取消，請聯繫育成中心窗口；系統未取得取消連結。
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-900 text-white transition-colors"
        >
          完成
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7" noValidate={false}>
      {submitError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          {submitError}
        </div>
      )}

      {/* ── Section 1：申請人資訊 ── */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shadow-sm">
            1
          </span>
          <h3 className="text-sm font-bold text-slate-800 tracking-wide">申請單位與人員資訊</h3>
        </div>

        <div className="space-y-4 bg-slate-50/40 p-4 rounded-2xl border border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fieldDepartment.show && (
              <div>
                <label className={labelCls} htmlFor="department">
                  {fieldDepartment.label}{' '}
                  {fieldDepartment.required && <span className="text-rose-500">*</span>}
                </label>
                <select
                  id="department"
                  required={fieldDepartment.required}
                  className={inputCls}
                  value={formData.department}
                  onChange={set('department')}
                  disabled={disabled}
                >
                  <option value="">請選擇單位類別</option>
                  {DEPARTMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {fieldDepartmentName.show && (
              <div>
                <label className={labelCls} htmlFor="departmentName">
                  {fieldDepartmentName.label}{' '}
                  {fieldDepartmentName.required && <span className="text-rose-500">*</span>}
                </label>
                <input
                  id="departmentName"
                  type="text"
                  required={fieldDepartmentName.required}
                  maxLength={FIELD_LIMITS.departmentName}
                  className={inputCls}
                  value={formData.departmentName}
                  onChange={set('departmentName')}
                  placeholder="公司或系所完整名稱"
                  disabled={disabled}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fieldName.show && (
              <div>
                <label className={labelCls} htmlFor="name">
                  {fieldName.label}{' '}
                  {fieldName.required && <span className="text-rose-500">*</span>}
                </label>
                <input
                  id="name"
                  required={fieldName.required}
                  type="text"
                  maxLength={FIELD_LIMITS.name}
                  className={inputCls}
                  value={formData.name}
                  onChange={set('name')}
                  placeholder="申請人完整姓名"
                  disabled={disabled}
                />
              </div>
            )}

            {fieldPhone.show && (
              <div>
                <label className={labelCls} htmlFor="phone">
                  {fieldPhone.label}{' '}
                  {fieldPhone.required && <span className="text-rose-500">*</span>}
                </label>
                <input
                  id="phone"
                  required={fieldPhone.required}
                  type="tel"
                  maxLength={FIELD_LIMITS.phone}
                  className={inputCls}
                  value={formData.phone}
                  onChange={set('phone')}
                  placeholder="例：0912-345-678 或 分機"
                  disabled={disabled}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fieldEmail.show && (
              <div>
                <label className={labelCls} htmlFor="email">
                  {fieldEmail.label}{' '}
                  {fieldEmail.required && <span className="text-rose-500">*</span>}
                </label>
                <input
                  id="email"
                  required={fieldEmail.required}
                  type="email"
                  maxLength={FIELD_LIMITS.email}
                  className={inputCls}
                  value={formData.email}
                  onChange={set('email')}
                  placeholder="name@example.com"
                  disabled={disabled}
                />
              </div>
            )}

            {fieldParticipants.show && (
              <div>
                <label className={labelCls} htmlFor="participants">
                  {fieldParticipants.label}{' '}
                  {fieldParticipants.required && <span className="text-rose-500">*</span>}
                </label>
                <input
                  id="participants"
                  required={fieldParticipants.required}
                  type="number"
                  min="1"
                  max={space.capacity}
                  inputMode="numeric"
                  aria-invalid={participantsTooMany}
                  aria-describedby="participants-hint"
                  className={`${inputCls} ${participantsTooMany ? 'border-rose-400 focus:border-rose-500' : ''}`}
                  value={formData.participants}
                  onChange={set('participants')}
                  placeholder={`1–${space.capacity} 人`}
                  disabled={disabled}
                />
                <p
                  id="participants-hint"
                  className={`text-[11px] mt-1 ${participantsTooMany ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}
                >
                  {participantsTooMany
                    ? `超過容量上限，此場地最多容納 ${space.capacity} 人`
                    : `※ 此場地法定最多容納 ${space.capacity} 人`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 2：預約時間 ── */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shadow-sm">
            2
          </span>
          <h3 className="text-sm font-bold text-slate-800 tracking-wide">預約日期與時段</h3>
        </div>

        <div className="space-y-4 bg-slate-50/40 p-4 rounded-2xl border border-slate-100">
          {fieldDate.show && (
            <div>
              <label className={labelCls} htmlFor="date">
                {fieldDate.label}{' '}
                {fieldDate.required && <span className="text-rose-500">*</span>}
              </label>
              <input
                id="date"
                required={fieldDate.required}
                type="date"
                className={inputCls}
                value={formData.date}
                min={todayStr}
                onChange={set('date')}
                disabled={disabled}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {fieldStartTime.show && (
              <div>
                <label className={labelCls} htmlFor="startTime">
                  {fieldStartTime.label}{' '}
                  {fieldStartTime.required && <span className="text-rose-500">*</span>}
                </label>
                <select
                  id="startTime"
                  required={fieldStartTime.required}
                  className={inputCls}
                  value={formData.startTime}
                  onChange={(event) => {
                    setSubmitError(null)
                    setFormData((prev) => ({
                      ...prev,
                      startTime: event.target.value,
                      endTime: '',
                    }))
                  }}
                  disabled={disabled}
                >
                  <option value="">請選擇起始時間</option>
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {fieldEndTime.show && (
              <div>
                <label className={labelCls} htmlFor="endTime">
                  {fieldEndTime.label}{' '}
                  {fieldEndTime.required && <span className="text-rose-500">*</span>}
                </label>
                <select
                  id="endTime"
                  required={fieldEndTime.required}
                  className={inputCls}
                  value={formData.endTime}
                  onChange={set('endTime')}
                  disabled={disabled || !formData.startTime}
                >
                  <option value="">
                    {formData.startTime ? '請選擇結束時間' : '請先選擇開始時間'}
                  </option>
                  {endTimeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500">
            開放時段：每日 08:00–22:00，每次 {BOOKING_RULES.minDurationMinutes / 60}–
            {BOOKING_RULES.maxDurationMinutes / 60} 小時，最多可預約 {BOOKING_RULES.maxDaysAhead} 天內。
          </p>

          {/* 可用性狀態（aria-live 讓螢幕閱讀器也能得知結果） */}
          <div role="status" aria-live="polite">
            {availabilityInfo && (
              <div
                className={`flex items-center gap-2.5 text-xs sm:text-sm px-4 py-3 rounded-xl border font-medium ${toneClasses[availabilityInfo.tone]}`}
              >
                {availabilityInfo.tone === 'blue' ? (
                  <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <span className="text-base leading-none">{availabilityInfo.icon}</span>
                )}
                <span>{availabilityInfo.text}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3：使用目的（選填）── */}
      {fieldPurpose.show && (
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs flex items-center justify-center font-bold">
              3
            </span>
            <h3 className="text-sm font-bold text-slate-800 tracking-wide">{fieldPurpose.label}</h3>
            {!fieldPurpose.required && (
              <span className="text-xs text-slate-400 font-normal">（非必填）</span>
            )}
          </div>

          <textarea
            id="purpose"
            required={fieldPurpose.required}
            maxLength={FIELD_LIMITS.purpose}
            className={`${inputCls} resize-none`}
            rows={3}
            value={formData.purpose}
            onChange={set('purpose')}
            placeholder="請簡述預計借用目的，例如：產學合作討論、進駐企業季會、團隊技術研討..."
            disabled={disabled}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={submitDisabled}
        className={`w-full py-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-md ${
          submitDisabled
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:via-indigo-700 hover:to-blue-800 text-white shadow-blue-500/25 active:scale-[0.99] hover:shadow-lg'
        }`}
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
