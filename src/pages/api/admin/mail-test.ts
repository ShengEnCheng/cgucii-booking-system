import type { NextApiRequest, NextApiResponse } from 'next'
import { getMailProvider, isMailerConfigured, sendMail } from '@/utils/mailer'

// 後台寄信自我測試（受 middleware 的 Basic Auth 保護）。
// 用途：設定 RESEND_API_KEY / MAIL_WEBHOOK_URL 之後，不用真的跑一筆預約，
// 就能確認通知信能不能寄出去。
//
//   GET  /api/admin/mail-test           → 回報目前寄信設定狀態（不含金鑰）
//   POST /api/admin/mail-test { to }    → 實際寄一封測試信

type StatusResponse = {
  configured: boolean
  provider: 'resend' | 'webhook' | null
  from: string | null
  hint?: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const provider = getMailProvider()
    const body: StatusResponse = {
      configured: isMailerConfigured(),
      provider,
      from: provider === 'resend' ? process.env.MAIL_FROM || 'onboarding@resend.dev' : null,
    }
    if (!body.configured) {
      body.hint = '尚未設定寄信服務：請在環境變數加入 RESEND_API_KEY（或 MAIL_WEBHOOK_URL）'
    }
    return res.status(200).json(body)
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isMailerConfigured()) {
    return res.status(503).json({
      error: '尚未設定寄信服務，請設定 RESEND_API_KEY（或 MAIL_WEBHOOK_URL）後重新部署',
    })
  }

  const to = String(req.body?.to || process.env.MAIL_TEST_TO || '').trim()
  if (!to) {
    return res.status(400).json({ error: '請在 body 提供 to（收件者 Email），或設定 MAIL_TEST_TO' })
  }

  const result = await sendMail({
    to,
    subject: '【測試】空間預約系統通知信設定成功',
    text: [
      '這是一封測試信。',
      '',
      '如果你收到這封信，代表預約系統的通知信功能已經設定成功：',
      '・預約成功時會寄出確認信（含取消連結）',
      '・取消預約時會寄出取消通知',
      '',
      '長庚大學技術合作處 創新育成中心',
    ].join('\n'),
  })

  if (!result.sent) {
    return res.status(502).json({
      error: '寄信失敗，請確認金鑰與寄件者網域設定',
      provider: result.provider ?? null,
      detail: result.error || null,
    })
  }

  return res.status(200).json({ sent: true, provider: result.provider, to })
}
