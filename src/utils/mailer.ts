// 預約通知信。
//
// 不引入 SMTP 套件，改用兩種常見的 HTTP 服務：
// 1. Resend（設定 RESEND_API_KEY）
// 2. 自訂 Webhook（設定 MAIL_WEBHOOK_URL，POST JSON 給你的轉寄服務／Google Apps Script）
//
// 沒設定任何 provider 時，寄信會是 no-op（只寫 log），預約流程完全不受影響。
// 這是刻意的設計：寄信失敗永遠不該讓預約失敗。

const REQUEST_TIMEOUT_MS = 8000

/** 取消連結的有效期說明（放在信件內文，避免使用者誤解連結永久有效） */
const CANCEL_LINK_NOTE = '連結自預約日起 30 天內有效，且僅能在活動開始前取消'

export type MailPayload = {
  to: string
  subject: string
  text: string
}

export type MailResult = {
  sent: boolean
  provider?: 'resend' | 'webhook'
  error?: string
  skipped?: boolean
}

export function getMailProvider(): 'resend' | 'webhook' | null {
  if (process.env.RESEND_API_KEY) return 'resend'
  if (process.env.MAIL_WEBHOOK_URL) return 'webhook'
  return null
}

export function isMailerConfigured(): boolean {
  return getMailProvider() !== null
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function sendMail(payload: MailPayload): Promise<MailResult> {
  const to = String(payload.to || '').trim()
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    return { sent: false, skipped: true, error: '收件者 Email 不合法' }
  }

  const provider = getMailProvider()
  if (!provider) {
    console.info(`[mailer] 未設定寄信服務，略過通知信（to=${to}）`)
    return { sent: false, skipped: true }
  }

  try {
    if (provider === 'resend') {
      const response = await postJson(
        'https://api.resend.com/emails',
        {
          from: process.env.MAIL_FROM || 'onboarding@resend.dev',
          to: [to],
          subject: payload.subject,
          text: payload.text,
        },
        { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
      )
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        console.error('[mailer] Resend 寄信失敗:', response.status, detail.slice(0, 300))
        return { sent: false, provider, error: `HTTP ${response.status}` }
      }
      return { sent: true, provider }
    }

    const response = await postJson(process.env.MAIL_WEBHOOK_URL as string, {
      to,
      subject: payload.subject,
      text: payload.text,
    })
    if (!response.ok) {
      console.error('[mailer] Webhook 寄信失敗:', response.status)
      return { sent: false, provider, error: `HTTP ${response.status}` }
    }
    return { sent: true, provider }
  } catch (error: any) {
    console.error('[mailer] 寄信例外:', error?.message || error)
    return { sent: false, provider, error: error?.message || 'unknown' }
  }
}

export function buildBookingConfirmation(params: {
  spaceName: string
  date: string
  startTime: string
  endTime: string
  applicant: string
  cancelUrl: string
}): MailPayload {
  const { spaceName, date, startTime, endTime, applicant, cancelUrl } = params
  return {
    to: '',
    subject: `【空間預約成功】${spaceName} ${date} ${startTime}-${endTime}`,
    text: [
      `${applicant} 您好，`,
      '',
      '您的空間預約已完成，以下為預約資訊：',
      `　場地：${spaceName}`,
      `　日期：${date}`,
      `　時間：${startTime} - ${endTime}`,
      '',
      `如需取消，請開啟以下連結（${CANCEL_LINK_NOTE}）：`,
      cancelUrl,
      '',
      '長庚大學技術合作處 創新育成中心',
    ].join('\n'),
  }
}

export function buildCancellationNotice(params: {
  spaceName: string
  date: string
  startTime: string
  endTime: string
  applicant: string
}): MailPayload {
  const { spaceName, date, startTime, endTime, applicant } = params
  return {
    to: '',
    subject: `【預約已取消】${spaceName} ${date} ${startTime}-${endTime}`,
    text: [
      `${applicant} 您好，`,
      '',
      '您的空間預約已取消，以下為取消的預約資訊：',
      `　場地：${spaceName}`,
      `　日期：${date}`,
      `　時間：${startTime} - ${endTime}`,
      '',
      '如需重新預約，請回到預約系統重新申請。',
      '',
      '長庚大學技術合作處 創新育成中心',
    ].join('\n'),
  }
}
