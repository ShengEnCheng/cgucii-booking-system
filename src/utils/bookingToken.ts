// 取消預約用的簽章 token。
//
// 使用者預約成功後會拿到一組 `payload.signature` 形式的不透明字串（放在取消連結裡），
// 伺服器不需要資料庫就能驗證「這筆取消請求確實是當初預約成功時發出的」。
// 簽章金鑰優先讀 BOOKING_TOKEN_SECRET；未設定時以服務帳戶憑證推導（不會寫進程式碼）。

import crypto from 'crypto'

export type CancelTokenPayload = {
  eventId: string
  spaceId: string
  expiresAt: number
}

/** 取消連結有效期（天） */
export const CANCEL_TOKEN_TTL_DAYS = 30

let warnedFallback = false

function getSigningSecret(): string {
  const explicit = process.env.BOOKING_TOKEN_SECRET
  if (explicit && explicit.trim().length >= 16) {
    return explicit.trim()
  }

  const credentials = process.env.GOOGLE_CREDENTIALS
  if (!credentials) {
    throw new Error('缺少 BOOKING_TOKEN_SECRET 或 GOOGLE_CREDENTIALS，無法簽發取消連結')
  }

  if (!warnedFallback) {
    warnedFallback = true
    console.warn(
      '[bookingToken] 未設定 BOOKING_TOKEN_SECRET，暫時以服務帳戶憑證推導簽章金鑰；' +
        '建議在環境變數設定獨立的 BOOKING_TOKEN_SECRET（輪替憑證會使舊取消連結失效）'
    )
  }

  return crypto.createHash('sha256').update(`booking-cancel:${credentials}`).digest('hex')
}

export function createCancelToken(
  eventId: string,
  spaceId: string,
  now: number = Date.now()
): string {
  const payload: CancelTokenPayload = {
    eventId: String(eventId),
    spaceId: String(spaceId),
    expiresAt: now + CANCEL_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = crypto.createHmac('sha256', getSigningSecret()).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyCancelToken(
  token: string | undefined | null,
  now: number = Date.now()
): CancelTokenPayload | null {
  try {
    const [body, signature] = String(token || '').split('.')
    if (!body || !signature) return null

    const expected = crypto
      .createHmac('sha256', getSigningSecret())
      .update(body)
      .digest('base64url')

    const providedBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expected)
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return null
    }

    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CancelTokenPayload
    if (!parsed?.eventId || !parsed?.spaceId || typeof parsed.expiresAt !== 'number') {
      return null
    }
    if (parsed.expiresAt < now) return null

    return parsed
  } catch {
    return null
  }
}

/** 由請求推導站台 origin（Vercel 會在 x-forwarded-proto/host 帶正確值） */
export function resolveOrigin(headers: Record<string, string | string[] | undefined>): string {
  const protoHeader = headers['x-forwarded-proto']
  const hostHeader = headers['x-forwarded-host'] || headers['host']
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || 'https'
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader

  if (!host) return process.env.NEXT_PUBLIC_SITE_URL || ''
  return `${proto}://${host}`
}

export function buildCancelUrl(origin: string, token: string): string {
  const base = origin ? origin.replace(/\/+$/, '') : ''
  const path = `/cancel?token=${encodeURIComponent(token)}`
  return base ? `${base}${path}` : path
}
