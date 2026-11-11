import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { Toaster } from 'react-hot-toast'

type Preview = {
  ok: boolean
  reason?: 'invalid_token' | 'not_found' | 'space_mismatch' | 'started'
  spaceName?: string
  date?: string
  startTime?: string
  endTime?: string
  applicant?: string
  canCancel?: boolean
}

type PageState = 'loading' | 'ready' | 'cancelled' | 'blocked' | 'invalid' | 'error'

const REASON_TEXT: Record<string, string> = {
  invalid_token: '這個取消連結無效或已過期（有效期 30 天）。',
  not_found: '這筆預約已經不存在，可能已被取消。',
  space_mismatch: '連結與預約資料不一致，請聯繫育成中心協助處理。',
  started: '預約已經開始或結束，無法線上取消，請聯繫育成中心。',
}

export default function CancelPage() {
  const router = useRouter()
  const [state, setState] = useState<PageState>('loading')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reason, setReason] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{
    spaceName?: string
    date?: string
    startTime?: string
    endTime?: string
    applicant?: string
  } | null>(null)

  const token = typeof router.query.token === 'string' ? router.query.token : ''

  useEffect(() => {
    if (!router.isReady) return
    if (!token) {
      setState('invalid')
      setReason('缺少取消參數，請確認是否使用了完整的取消連結。')
      return
    }

    let cancelled = false
    fetch(`/api/cancel-booking?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as Preview & { error?: string }
        if (cancelled) return

        if (!response.ok || !data.ok) {
          if (response.status === 404 || data.reason === 'not_found') {
            setState('invalid')
            setReason(REASON_TEXT.not_found)
            return
          }
          setState('invalid')
          setReason(REASON_TEXT[String(data.reason)] || '無法讀取這筆預約，請聯繫育成中心。')
          return
        }

        setPreview(data)
        setState(data.canCancel === false ? 'blocked' : 'ready')
        if (data.canCancel === false) setReason(REASON_TEXT.started)
      })
      .catch(() => {
        if (!cancelled) {
          setState('error')
          setReason('連線失敗，請稍後再試。')
        }
      })

    return () => {
      cancelled = true
    }
  }, [router.isReady, token])

  const handleCancel = async () => {
    if (!token) return
    setSubmitting(true)
    try {
      const response = await fetch('/api/cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.ok) {
        setState('blocked')
        setReason(
          data.reason === 'started'
            ? REASON_TEXT.started
            : (data as { error?: string }).error || '取消失敗，請稍後再試或聯繫育成中心。'
        )
        return
      }

      setDone(data)
      setState('cancelled')
    } catch {
      setState('error')
      setReason('連線失敗，請稍後再試。')
    } finally {
      setSubmitting(false)
    }
  }

  const summary: Partial<Preview> = preview || done || {}

  return (
    <>
      <Head>
        <title>取消預約 | 長庚大學創新育成中心</title>
        <meta name="description" content="取消長庚大學創新育成中心的空間預約" />
        <link rel="icon" href="/images/my-logo.svg" />
        <meta name="robots" content="noindex" />
      </Head>

      <Toaster position="top-center" />

      <div className="min-h-dvh bg-slate-100 flex flex-col">
        <header
          className="h-16 flex-shrink-0 shadow-md flex items-center px-4 sm:px-6"
          style={{ background: 'linear-gradient(135deg, #091a3e 0%, #0f2c69 50%, #1d4ed8 100%)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="bg-white/95 rounded px-2 py-1 inline-flex">
              <Image
                src="/images/my-logo.svg"
                alt="長庚大學 Logo"
                width={120}
                height={22}
                unoptimized
                style={{ width: 'auto', height: '22px' }}
              />
            </span>
            <div className="min-w-0">
              <p className="text-blue-200/90 text-[10px] font-semibold tracking-widest uppercase leading-none mb-0.5">
                長庚大學技術合作處
              </p>
              <h1 className="text-white text-sm sm:text-base font-extrabold tracking-wide leading-tight truncate">
                創新育成中心 空間預約系統
              </h1>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">取消預約</h2>
              <p className="text-xs text-slate-500 mt-1">
                請確認以下預約資訊，送出後將立即刪除 Google 日曆上的預約。
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {state === 'loading' && (
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  正在讀取預約資訊...
                </div>
              )}

              {(state === 'ready' || state === 'blocked' || state === 'cancelled') && (
                <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <dt className="text-slate-500">場地</dt>
                    <dd className="font-bold text-slate-800">{summary.spaceName || '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <dt className="text-slate-500">日期</dt>
                    <dd className="font-semibold text-slate-800">{summary.date || '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <dt className="text-slate-500">時間</dt>
                    <dd className="font-semibold text-slate-800">
                      {summary.startTime || '—'} – {summary.endTime || '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <dt className="text-slate-500">申請人</dt>
                    <dd className="font-semibold text-slate-800">{summary.applicant || '—'}</dd>
                  </div>
                </dl>
              )}

              {state === 'cancelled' && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  ✅ 已成功取消這筆預約，Google 日曆上的時段已釋出。
                  {preview?.applicant ? '若系統已設定通知信，取消通知將寄到申請人信箱。' : ''}
                </div>
              )}

              {(state === 'invalid' || state === 'blocked' || state === 'error') && (
                <div
                  role="alert"
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    state === 'blocked'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {reason || '無法處理這筆取消請求。'}
                </div>
              )}

              {state === 'ready' && (
                <p className="text-xs text-slate-500 leading-relaxed">
                  提醒：取消後此時段將立即開放給其他人預約，無法復原。
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Link
                href="/"
                className="text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 px-4 py-2.5 rounded-xl text-center"
              >
                返回預約首頁
              </Link>

              {state === 'ready' && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={submitting}
                  className="text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-[0.99] disabled:bg-slate-300 disabled:text-slate-500 px-5 py-2.5 rounded-xl transition-all"
                >
                  {submitting ? '正在取消...' : '確認取消預約'}
                </button>
              )}

              {state === 'cancelled' && (
                <Link
                  href="/"
                  className="text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-xl text-center"
                >
                  重新預約
                </Link>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}

// 必須是 SSR：middleware 依請求產生 CSP nonce。
export async function getServerSideProps() {
  return { props: {} }
}
