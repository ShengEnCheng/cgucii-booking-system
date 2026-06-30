import { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

interface GoogleCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// ─── 同進程 Race Condition 防護 ────────────────────────────────────────────
// key: `${spaceName}|${date}`，同場地同天同時只允許一個請求進行 check-then-insert
const _bookingLocks = new Set<string>();

function spaceKeywords(spaceName: string): string[] {
  const lower = spaceName.toLowerCase();
  const kws = [lower];
  if (lower.includes('小會議室')) kws.push('c01', 'c01會議室');
  if (lower.includes('多功能會議室')) kws.push('c02', 'c02會議室', '中型c02會議室');
  return kws;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      name,
      phone,
      email,
      participants,
      date,
      startTime,
      endTime,
      unit,
      department,
      departmentName,
      spaceName,
      colorId,
      purpose,
    } = req.body;

    // ── 1. 禁用場地檢查 ──────────────────────────────────────────────────
    try {
      const fs = await import('fs');
      const path = await import('path');
      const p = path.join(process.cwd(), 'src', 'config', 'app-config.json');
      let disabledNames = new Set<string>();
      let disabledIds = new Set<string>();
      try {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (Array.isArray(cfg.disabledSpaceNames)) disabledNames = new Set(cfg.disabledSpaceNames.map(String));
        if (Array.isArray(cfg.disabledSpaceIds))   disabledIds   = new Set(cfg.disabledSpaceIds.map(String));
      } catch {}
      if (disabledNames.has(spaceName)) return res.status(403).json({ error: '此空間暫停預約' });
      try {
        const { spaces } = await import('@/data/spaces');
        const matched = spaces.find((s: any) => s.name === spaceName);
        if (matched && disabledIds.has(matched.id)) return res.status(403).json({ error: '此空間暫停預約' });
      } catch {}
    } catch {}

    // ── 2. Google 憑證 ───────────────────────────────────────────────────
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}') as GoogleCredentials;
    if (!credentials.client_email || !credentials.private_key) {
      return res.status(500).json({ error: 'Google credentials are missing or invalid' });
    }
    const privateKey = credentials.private_key.replace(/\\n/g, '\n');
    const auth = new JWT({
      email: credentials.client_email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: credentials.client_email,
      keyId: credentials.private_key_id,
    });

    // ── 3. Calendar ID（env var 優先，回落到 app-config.json）────────────
    let calendarId: string | undefined = process.env.CALENDAR_ID;
    try {
      const fs = await import('fs');
      const path = await import('path');
      const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'config', 'app-config.json'), 'utf8'));
      if (cfg.googleCalendarId && typeof cfg.googleCalendarId === 'string' && cfg.googleCalendarId.trim()) {
        calendarId = cfg.googleCalendarId.trim();
      }
    } catch {}
    if (!calendarId) return res.status(500).json({ error: 'Calendar ID is missing' });

    const calendar = google.calendar({ version: 'v3', auth });

    // ── 4. In-memory lock（同進程防 Race Condition）──────────────────────
    const lockKey = `${spaceName}|${date}`;
    if (_bookingLocks.has(lockKey)) {
      return res.status(429).json({ error: '系統正在處理此場地的預約，請稍候數秒後再送出' });
    }
    _bookingLocks.add(lockKey);

    try {
      // ── 5. 插入前可用性查核（Pre-check）────────────────────────────────
      const startOfDay = new Date(`${date}T00:00:00+08:00`).toISOString();
      const endOfDay   = new Date(`${date}T23:59:59+08:00`).toISOString();
      const dayList = await calendar.events.list({
        calendarId,
        timeMin: startOfDay,
        timeMax: endOfDay,
        singleEvents: true,
        orderBy: 'startTime',
      });
      const eventsForDay = (dayList.data.items || []).map(ev => ({
        id:    ev.id,
        title: ev.summary || '',
        start: ev.start?.dateTime || ev.start?.date || '',
        end:   ev.end?.dateTime   || ev.end?.date   || '',
      }));

      const { checkSpaceAvailability } = await import('@/utils/availabilityUtils');
      if (!checkSpaceAvailability(eventsForDay as any[], spaceName, date, startTime, endTime)) {
        return res.status(409).json({ error: '選擇的時段已被預約，請選擇其他時段' });
      }

      // ── 6. 建立 Google Calendar 事件 ────────────────────────────────────
      const eventBody = {
        summary: `${spaceName} - ${department}${departmentName ? ` - ${departmentName}` : ''}`,
        description: [
          `申請者：${name}`,
          `電話：${phone}`,
          `Email：${email}`,
          `參加人數：${participants}人`,
          `申請單位：${department}${departmentName ? ` / ${departmentName}` : ''}`,
          purpose ? `用途：${purpose}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: `${date}T${startTime}:00`, timeZone: 'Asia/Taipei' },
        end:   { dateTime: `${date}T${endTime}:00`,   timeZone: 'Asia/Taipei' },
        colorId,
      };

      const inserted = await calendar.events.insert({ calendarId, requestBody: eventBody });
      const newEventId = inserted.data.id;

      // ── 7. 插入後衝突驗證（Post-check，針對跨進程/Serverless Race）──────
      // 查詢該空間在同時段是否有其他重疊事件
      const verifyMin = new Date(`${date}T${startTime}:00+08:00`).toISOString();
      const verifyMax = new Date(`${date}T${endTime}:00+08:00`).toISOString();
      const verifyList = await calendar.events.list({
        calendarId,
        timeMin: verifyMin,
        timeMax: verifyMax,
        singleEvents: true,
      });
      const kws = spaceKeywords(spaceName);
      const conflicts = (verifyList.data.items || []).filter(ev => {
        if (ev.id === newEventId) return false;          // 排除自己
        const title = String(ev.summary || '').toLowerCase();
        return kws.some(k => title.includes(k));         // 同場地才算衝突
      });

      if (conflicts.length > 0) {
        // 有衝突：刪掉剛剛插入的事件，回傳 409
        try { await calendar.events.delete({ calendarId, eventId: newEventId! }); } catch {}
        return res.status(409).json({ error: '選擇的時段已被預約（另一位使用者同時送出），請選擇其他時段' });
      }

      return res.status(200).json({ message: '預約成功', eventId: newEventId });

    } finally {
      // 無論成功或失敗都釋放 lock
      _bookingLocks.delete(lockKey);
    }

  } catch (error) {
    console.error('預約失敗:', error);
    return res.status(500).json({
      error: '預約失敗',
      details: error instanceof Error ? error.message : '未知錯誤',
    });
  }
}
