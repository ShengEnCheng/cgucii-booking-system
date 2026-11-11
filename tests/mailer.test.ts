import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMailProvider, sendMail, buildBookingConfirmation } from '@/utils/mailer'

const fetchMock = vi.fn()

describe('mailer', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_WEBHOOK_URL
    delete process.env.MAIL_FROM
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_WEBHOOK_URL
  })

  it('未設定任何寄信服務時優雅略過', async () => {
    expect(getMailProvider()).toBeNull()
    const result = await sendMail({ to: 'a@b.com', subject: 's', text: 't' })
    expect(result.sent).toBe(false)
    expect(result.skipped).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Email 格式不合法時不寄送', async () => {
    process.env.RESEND_API_KEY = 're_test'
    const result = await sendMail({ to: 'not-an-email', subject: 's', text: 't' })
    expect(result.sent).toBe(false)
    expect(result.skipped).toBe(true)
  })

  it('使用 Resend 寄送並帶上金鑰與寄件者', async () => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.MAIL_FROM = 'booking@example.edu'
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' })

    const result = await sendMail({ to: 'user@example.com', subject: '主旨', text: '內容' })
    expect(result.sent).toBe(true)
    expect(result.provider).toBe('resend')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
    const body = JSON.parse(String(init.body))
    expect(body.to).toEqual(['user@example.com'])
    expect(body.from).toBe('booking@example.edu')
  })

  it('Resend 回非 2xx 時回報失敗但不拋錯', async () => {
    process.env.RESEND_API_KEY = 're_test'
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'bad' })
    const result = await sendMail({ to: 'user@example.com', subject: 's', text: 't' })
    expect(result.sent).toBe(false)
    expect(result.error).toContain('422')
  })

  it('設定 Webhook 時改走 Webhook', async () => {
    process.env.MAIL_WEBHOOK_URL = 'https://hook.example.com/mail'
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' })
    const result = await sendMail({ to: 'user@example.com', subject: 's', text: 't' })
    expect(result.provider).toBe('webhook')
    expect(fetchMock.mock.calls[0][0]).toBe('https://hook.example.com/mail')
  })

  it('網路例外時回報失敗但不拋錯', async () => {
    process.env.RESEND_API_KEY = 're_test'
    fetchMock.mockRejectedValue(new Error('network down'))
    const result = await sendMail({ to: 'user@example.com', subject: 's', text: 't' })
    expect(result.sent).toBe(false)
    expect(result.error).toContain('network down')
  })

  it('確認信內容包含取消連結與預約資訊', () => {
    const mail = buildBookingConfirmation({
      spaceName: 'C01會議室',
      date: '2026-12-15',
      startTime: '10:00',
      endTime: '12:00',
      applicant: '王小明',
      cancelUrl: 'https://x.edu/cancel?token=abc',
    })
    expect(mail.subject).toContain('C01會議室')
    expect(mail.text).toContain('2026-12-15')
    expect(mail.text).toContain('10:00 - 12:00')
    expect(mail.text).toContain('https://x.edu/cancel?token=abc')
    expect(mail.text).toContain('王小明')
  })
})
