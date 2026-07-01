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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 解析 Google 憑證
    console.log('GOOGLE_CREDENTIALS available:', !!process.env.GOOGLE_CREDENTIALS);

    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}') as GoogleCredentials;
      console.log('Credentials parsed successfully');
    } catch (parseError) {
      console.error('Error parsing Google credentials:', parseError);
      return res.status(500).json({
        error: 'Error parsing Google credentials',
        details: parseError instanceof Error ? parseError.message : 'Unknown parsing error'
      });
    }

    if (!credentials.client_email || !credentials.private_key) {
      console.error('Google credentials are missing or invalid');
      return res.status(500).json({
        error: 'Google credentials are missing or invalid',
        credentialsCheck: {
          hasClientEmail: !!credentials.client_email,
          hasPrivateKey: !!credentials.private_key
        }
      });
    }

    // 確保 private_key 中的換行符正確
    console.log('Private key length before processing:', credentials.private_key.length);

    // 先將所有 \n 替換為真正的換行符
    let privateKey = credentials.private_key;
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    // 建立 JWT 客戶端
    // 注意：這裡故意不設定 subject。subject 是拿來做 Google Workspace
    // 網域授權（domain-wide delegation）模擬「特定使用者」身份用的，
    // 這個專案只是把日曆直接共用給服務帳戶（見 GOOGLE_CALENDAR_SETUP.md），
    // 沒有、也不需要設定網域授權；多帶 subject 反而會被 Google 判定
    // 「invalid_grant: Invalid JWT Signature」而整個認證失敗。
    let auth: JWT;
    try {
      auth = new JWT({
        email: credentials.client_email,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      });
      await auth.authorize();
      console.log('Google Calendar 認證成功');
    } catch (authError) {
      console.error('Google API 認證失敗:', authError);
      return res.status(500).json({
        error: 'Google API 認證失敗',
        details: authError instanceof Error ? authError.message : '未知認證錯誤'
      });
    }

    // 獲取日曆 ID
    console.log('Checking for CALENDAR_ID');
    let calendarId = process.env.CALENDAR_ID;
    console.log('CALENDAR_ID available:', !!calendarId);
    try {
      const fs = await import('fs')
      const path = await import('path')
      const p = path.join(process.cwd(), 'src', 'config', 'app-config.json')
      try {
        const raw = fs.readFileSync(p, 'utf8')
        const cfg = JSON.parse(raw)
        if (cfg.googleCalendarId && typeof cfg.googleCalendarId === 'string' && cfg.googleCalendarId.trim()) {
          calendarId = cfg.googleCalendarId.trim()
        }
      } catch {}
    } catch {}
    if (!calendarId) {
      console.error('Calendar ID is missing')
      return res.status(500).json({ error: 'Calendar ID is missing' })
    }

    // 獲取時間範圍（同時支援 start/end 與 timeMin/timeMax）
    const { start, end, timeMin: qTimeMin, timeMax: qTimeMax } = req.query as Record<string, string | string[] | undefined>;
    const rawMin = (Array.isArray(qTimeMin) ? qTimeMin[0] : qTimeMin) || (Array.isArray(start) ? start[0] : start);
    const rawMax = (Array.isArray(qTimeMax) ? qTimeMax[0] : qTimeMax) || (Array.isArray(end) ? end[0] : end);
    const timeMin = rawMin ? new Date(rawMin).toISOString() : new Date(new Date().setDate(1)).toISOString();
    const timeMax = rawMax ? new Date(rawMax).toISOString() : new Date(new Date(new Date().setMonth(new Date().getMonth() + 1)).setDate(0)).toISOString();

    console.log('準備獲取行事曆事件:', {
      calendarId,
      timeMin,
      timeMax,
      clientEmail: credentials.client_email
    });

    // 創建日曆 API 客戶端
    const calendar = google.calendar({ version: 'v3', auth });

    // 獲取事件
    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    let events = response.data.items?.map(event => ({
      id: event.id,
      title: event.summary || '無標題',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      color: getColorHex(event.colorId || undefined),
      description: event.description || '',
      location: event.location || '',
    })) || [];

    try {
      const fs = await import('fs')
      const path = await import('path')
      const p = path.join(process.cwd(), 'src', 'config', 'app-config.json')
      let filters: any = {}
      let overrides: Record<string, { name?: string }> = {}
      let useGoogleColors = true
      try {
        const raw = fs.readFileSync(p, 'utf8')
        const cfg = JSON.parse(raw)
        filters = cfg.eventFilters || {}
        overrides = cfg.spaceOverrides || {}
        useGoogleColors = typeof cfg.useGoogleColors === 'boolean' ? cfg.useGoogleColors : true
      } catch {}
      const names: string[] = require('@/data/spaces').spaces.map((s: any) => {
        const o = overrides[s.id] || {}
        const base = [s.name, o.name].filter(Boolean)
        const aliases: string[] = []
        if (s.id === '3') {
          aliases.push('C01', 'C01會議室')
        }
        if (s.id === '4') {
          aliases.push('C02', 'C02會議室', '中型C02會議室')
        }
        return base.concat(aliases)
      }).flat().map((n: any) => String(n).toLowerCase())
      const allow: string[] = Array.isArray(filters.allowKeywords) ? (filters.allowKeywords as any[]).map((kw: any) => String(kw).toLowerCase()) : []
      const ignore: string[] = Array.isArray(filters.ignoreKeywords) ? (filters.ignoreKeywords as any[]).map((kw: any) => String(kw).toLowerCase()) : []
      const spacesOnly = !!filters.spacesOnly
      events = events.filter(ev => {
        const t = String(ev.title || '').toLowerCase()
        if (ignore.some(k => t.includes(k))) return false
        if (allow.length > 0 && allow.some(k => t.includes(k))) return true
        if (spacesOnly) return names.some(n => t.includes(n))
        return true
      })
      if (!useGoogleColors) {
        events = events.map(ev => {
          const t = String(ev.title || '').toLowerCase()
          if (t.includes('c01') || t.includes('c01會議室')) {
            return { ...ev, color: '#D60000' }
          }
          if (t.includes('c02') || t.includes('c02會議室') || t.includes('中型c02會議室')) {
            return { ...ev, color: '#F6C026' }
          }
          return ev
        })
      }
    } catch {}

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.status(200).json(events);
  } catch (error) {
    console.error('獲取行事曆事件失敗:', error);

    // 更詳細的錯誤信息
    let errorDetails = '未知錯誤';
    let errorCode = '';

    if (error instanceof Error) {
      errorDetails = error.message;
      // @ts-ignore
      if (error.code) {
        // @ts-ignore
        errorCode = error.code;
      }

      // 如果是 Google API 錯誤，可能有更多信息
      // @ts-ignore
      if (error.errors && Array.isArray(error.errors)) {
        // @ts-ignore
        errorDetails = error.errors.map(e => e.message).join(', ');
      }
    }

    return res.status(500).json({
      error: '獲取行事曆事件失敗',
      details: errorDetails,
      code: errorCode,
      stack: process.env.NODE_ENV !== 'production' ? (error instanceof Error ? error.stack : '') : undefined
    });
  }
}

// 將 Google Calendar 顏色 ID 轉換為十六進制顏色代碼
function getColorHex(colorId: string | undefined): string {
  const colorMap: { [key: string]: string } = {
    '1': '#7986CB', // 薰衣草
    '2': '#33B679', // 鼠尾草
    '3': '#8E24AA', // 葡萄
    '4': '#E67C73', // 紅
    '5': '#F6C026', // 香蕉
    '6': '#F5511D', // 南瓜
    '7': '#039BE5', // 孔雀
    '8': '#616161', // 石墨
    '9': '#3F51B5', // 藍莓
    '10': '#0B8043', // 羅勒
    '11': '#D60000', // 番茄
    '12': '#E91E63', // 火烈鳥
    '13': '#F57F17', // 芒果
    '14': '#7CB342', // 鱷梨
    '15': '#1DE9B6', // 薄荷
    '16': '#FF1744', // 櫻桃
    '17': '#D500F9', // 葡萄柚
    '18': '#FFD600', // 香蕉
    '19': '#00C853', // 羅勒
    '20': '#FF3D00', // 番茄
    '21': '#304FFE', // 藍莓
    '22': '#00BFA5', // 薄荷
    '23': '#FF1744', // 櫻桃
    '24': '#D500F9', // 葡萄柚
  };
  return colorMap[colorId || '1'] || '#7986CB';
}
