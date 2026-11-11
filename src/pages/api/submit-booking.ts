import type { NextApiRequest, NextApiResponse } from 'next'
import { readAppConfig } from '@/utils/appConfig'
import {
  buildDisabledIdSet,
  findSpaceByNameOrId,
  spaceDisplayName,
} from '@/utils/configSchema'
import {
  buildSpaceMarker,
  checkSpaceAvailability,
  getSpaceKeywords,
  isEventForSpace,
} from '@/utils/availabilityUtils'
import {
  acquireKvLock,
  createLockToken,
  deleteCalendarEvent,
  fetchRawCalendarEvents,
  getCalendarClient,
  getEffectiveCalendarId,
  LockUnavailableError,
  releaseKvLock,
  releaseLocalLock,
  reserveLocalLock,
} from '@/utils/googleCalendarService'
import {
  EMAIL_PATTERN,
  FIELD_LIMITS,
  PHONE_PATTERN,
  taipeiDayRange,
  validateBookingWindow,
} from '@/config/bookingRules'
import { sanitizeMultiline, sanitizeText } from '@/utils/sanitize'
import { consumeRateLimit, getClientIp } from '@/utils/rateLimit'
import { buildCancelUrl, createCancelToken, resolveOrigin } from '@/utils/bookingToken'
import { buildBookingConfirmation, sendMail } from '@/utils/mailer'

// 限制 request body 大小，避免有人用超大 payload 灌爆 Google API
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '16kb',
    },
  },
}

const RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 }
const LOCK_TTL_SECONDS = 60

/** 哪些欄位預設必填（後台可逐欄覆寫） */
const DEFAULT_REQUIRED_FIELDS = ['name', 'phone', 'email', 'participants', 'department']

function isFieldRequired(
  formFields: Record<string, { show?: boolean; required?: boolean }>,
  key: string
): boolean {
  const field = formFields[key]
  if (field?.show === false) return false
  if (typeof field?.required === 'boolean') return field.required
  return DEFAULT_REQUIRED_FIELDS.includes(key)
}

function errorResponse(res: NextApiResponse, status: number, message: string, errorId: string) {
  return res.status(status).json({ error: message, errorId })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const errorId = Math.random().toString(36).slice(2, 10)

  // ── 0. 限流 ─────────────────────────────────────────────────────────────
  const ip = getClientIp(req)
  const limit = await consumeRateLimit(`booking:${ip}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs)
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds))
    return res.status(429).json({ error: '送出過於頻繁，請稍後再試' })
  }

  try {
    const body = (req.body || {}) as Record<string, unknown>

    // ── 1. 場地解析（一律由伺服器決定，不信任前端送來的名稱） ──────────────
    const appConfig = await readAppConfig()
    const spaceRef = sanitizeText(body.spaceId || body.spaceName, 80)
    const matchedSpace = findSpaceByNameOrId(spaceRef, appConfig)
    if (!matchedSpace) {
      return res.status(400).json({ error: '無效的預約空間' })
    }

    const disabledIds = buildDisabledIdSet(appConfig)
    if (disabledIds.has(String(matchedSpace.id))) {
      return res.status(403).json({ error: '此空間暫停預約' })
    }

    const spaceName = spaceDisplayName(matchedSpace, appConfig)

    // ── 2. 欄位驗證與清理 ──────────────────────────────────────────────────
    const name = sanitizeText(body.name, FIELD_LIMITS.name)
    const phone = sanitizeText(body.phone, FIELD_LIMITS.phone)
    const email = sanitizeText(body.email, FIELD_LIMITS.email)
    const unit = sanitizeText(body.unit ?? body.department, FIELD_LIMITS.unit)
    const departmentName = sanitizeText(body.departmentName, FIELD_LIMITS.departmentName)
    const purpose = sanitizeMultiline(body.purpose, FIELD_LIMITS.purpose)
    const rawParticipants = body.participants

    const requiredErrors: string[] = []
    if (isFieldRequired(appConfig.formFields, 'name') && !name) requiredErrors.push('申請人姓名')
    if (isFieldRequired(appConfig.formFields, 'phone') && !phone) requiredErrors.push('聯繫電話')
    if (isFieldRequired(appConfig.formFields, 'email') && !email) requiredErrors.push('電子郵件')
    if (isFieldRequired(appConfig.formFields, 'department') && !unit) requiredErrors.push('申請單位')
    if (isFieldRequired(appConfig.formFields, 'participants') && (rawParticipants === undefined || rawParticipants === '')) {
      requiredErrors.push('預估參加人數')
    }
    if (requiredErrors.length > 0) {
      return res.status(400).json({ error: `請填寫：${requiredErrors.join('、')}` })
    }

    if (email && !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: '電子郵件格式不正確' })
    }
    if (phone && !PHONE_PATTERN.test(phone)) {
      return res.status(400).json({ error: '聯繫電話格式不正確' })
    }

    let participants = 0
    if (rawParticipants !== undefined && rawParticipants !== '') {
      const parsed = Number(rawParticipants)
      if (!Number.isInteger(parsed) || parsed < 1) {
        return res.status(400).json({ error: '參加人數不正確' })
      }
      if (parsed > matchedSpace.capacity) {
        return res.status(400).json({
          error: `此場地最多容納 ${matchedSpace.capacity} 人`,
        })
      }
      participants = parsed
    }

    // ── 3. 時段驗證（格式／真實日期／營業時間／時長／範圍） ──────────────────
    const windowResult = validateBookingWindow({
      date: String(body.date || ''),
      startTime: String(body.startTime || ''),
      endTime: String(body.endTime || ''),
    })
    if (!windowResult.ok) {
      return res.status(400).json({ error: windowResult.error })
    }

    const date = String(body.date)
    const startTime = String(body.startTime)
    const endTime = String(body.endTime)

    // ── 4. 日曆與鎖 ────────────────────────────────────────────────────────
    const calendarId = await getEffectiveCalendarId(appConfig)
    const lockKey = `${matchedSpace.id}|${date}|${startTime}-${endTime}`
    const lockToken = createLockToken()

    // 先同步佔位，再去做任何 await（避免 check → await → add 的競態）
    if (!reserveLocalLock(lockKey, lockToken)) {
      res.setHeader('Retry-After', '3')
      return res.status(429).json({ error: '此場地此時段正在處理中，請稍候幾秒再送出' })
    }

    try {
      const kvLocked = await acquireKvLock(lockKey, lockToken, LOCK_TTL_SECONDS)
      if (!kvLocked) {
        res.setHeader('Retry-After', '3')
        return res.status(429).json({ error: '此場地此時段正在處理中，請稍候幾秒再送出' })
      }

      const calendar = await getCalendarClient([
        'https://www.googleapis.com/auth/calendar',
      ])

      // ── 5. 插入前可用性查核 ─────────────────────────────────────────────
      const { timeMin, timeMax } = taipeiDayRange(date)
      const rawEvents = await fetchRawCalendarEvents({ calendarId, timeMin, timeMax })

      const isAvailable = checkSpaceAvailability(
        rawEvents,
        spaceName,
        date,
        startTime,
        endTime,
        appConfig.spaceOverrides,
        matchedSpace.id
      )
      if (!isAvailable) {
        return res.status(409).json({ error: '選擇的時段已被預約，請選擇其他時段' })
      }

      // ── 6. 建立事件（所有文字欄位都已清理，並帶結構化場地標記） ───────────
      const departmentDisplay = unit
      const summaryParts = [spaceName, departmentDisplay, departmentName].filter(Boolean)
      const descriptionLines = [
        buildSpaceMarker(matchedSpace.id),
        `申請者：${name || '無'}`,
        `電話：${phone || '無'}`,
        `Email：${email || '無'}`,
        participants ? `參加人數：${participants}人` : '',
        `申請單位：${departmentDisplay || '無'}${departmentName ? ` / ${departmentName}` : ''}`,
        purpose ? `用途：${purpose}` : '',
      ].filter(Boolean)

      let newEventId: string | null = null
      try {
        const inserted = await calendar.events.insert({
          calendarId,
          sendUpdates: 'none',
          requestBody: {
            summary: summaryParts.join(' - ').slice(0, 200),
            location: spaceName,
            description: descriptionLines.join('\n').slice(0, 4000),
            start: { dateTime: `${date}T${startTime}:00`, timeZone: 'Asia/Taipei' },
            end: { dateTime: `${date}T${endTime}:00`, timeZone: 'Asia/Taipei' },
            colorId: matchedSpace.colorId,
            extendedProperties: {
              private: { spaceId: String(matchedSpace.id) },
            },
          },
        })
        newEventId = inserted.data.id || null

        // ── 7. 插入後衝突驗證（處理並發） ───────────────────────────────────
        const keywords = getSpaceKeywords(matchedSpace.id, appConfig.spaceOverrides)
        const verifyList = await calendar.events.list({
          calendarId,
          timeMin: new Date(`${date}T${startTime}:00+08:00`).toISOString(),
          timeMax: new Date(`${date}T${endTime}:00+08:00`).toISOString(),
          singleEvents: true,
          fields: 'items(id,summary,description,location,colorId,start,end,extendedProperties)',
        })

        const conflicts = (verifyList.data.items || []).filter((event) => {
          if (event.id && newEventId && event.id === newEventId) return false
          return isEventForSpace(event, keywords, matchedSpace.id)
        })

        if (conflicts.length > 0) {
          await rollbackEvent(calendarId, newEventId, errorId)
          return res.status(409).json({
            error: '選擇的時段已被預約（另一位使用者同時送出），請選擇其他時段',
          })
        }
      } catch (error: any) {
        // 插入成功但後續步驟失敗 → 一定要補償刪除，避免留下孤兒事件把時段卡死
        await rollbackEvent(calendarId, newEventId, errorId)
        throw error
      }

      // ── 8. 簽發取消連結並寄送通知信 ─────────────────────────────────────
      let cancelUrl = ''
      if (newEventId) {
        const cancelToken = createCancelToken(newEventId, String(matchedSpace.id))
        cancelUrl = buildCancelUrl(resolveOrigin(req.headers), cancelToken)

        if (email) {
          // 寄信失敗不影響預約結果（sendMail 內部已吞掉所有錯誤）
          const mail = buildBookingConfirmation({
            spaceName,
            date,
            startTime,
            endTime,
            applicant: name || '您好',
            cancelUrl,
          })
          await sendMail({ ...mail, to: email })
        }
      }

      return res.status(200).json({
        message: '預約成功',
        spaceName,
        date,
        startTime,
        endTime,
        cancelUrl,
      })
    } finally {
      releaseLocalLock(lockKey, lockToken)
      await releaseKvLock(lockKey, lockToken)
    }
  } catch (error: any) {
    if (error instanceof LockUnavailableError) {
      return res.status(503).json({
        error: '預約服務暫時無法使用，請稍後再試',
        errorId,
      })
    }

    console.error(`[submit-booking] 預約失敗 (${errorId}):`, error)
    // 對外只回通用訊息，細節留在 server log
    return errorResponse(res, 500, '預約失敗，請稍後再試或聯繫育成中心', errorId)
  }
}

async function rollbackEvent(
  calendarId: string,
  eventId: string | null,
  errorId: string
): Promise<void> {
  if (!eventId) return
  try {
    await deleteCalendarEvent(calendarId, eventId)
  } catch (error) {
    console.error(`[submit-booking] 回滾刪除事件失敗 (${errorId}) event=${eventId}:`, error)
  }
}
