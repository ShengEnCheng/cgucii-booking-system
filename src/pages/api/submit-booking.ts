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
    } = req.body;

    // 解析 Google 憑證
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}') as GoogleCredentials;
    
    if (!credentials.client_email || !credentials.private_key) {
      console.error('Google credentials are missing or invalid');
      return res.status(500).json({ error: 'Google credentials are missing or invalid' });
    }

    // 確保 private_key 中的換行符正確
    const privateKey = credentials.private_key.replace(/\\n/g, '\n');

    // 創建 JWT 客戶端
    const auth = new JWT({
      email: credentials.client_email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: credentials.client_email,
      keyId: credentials.private_key_id
    });

    // 獲取日曆 ID
    const calendarId = process.env.CALENDAR_ID;
    if (!calendarId) {
      console.error('Calendar ID is missing');
      return res.status(500).json({ error: 'Calendar ID is missing' });
    }

    // 創建日曆 API 客戶端
    const calendar = google.calendar({ version: 'v3', auth });

    // 準備事件數據
    const event = {
      summary: `${spaceName} - ${department}${departmentName ? ` - ${departmentName}` : ''}`,
      description: `
申請者：${name}
電話：${phone}
Email：${email}
參加人數：${participants}人
申請單位：${unit}
      `.trim(),
      start: {
        dateTime: `${date}T${startTime}:00`,
        timeZone: 'Asia/Taipei',
      },
      end: {
        dateTime: `${date}T${endTime}:00`,
        timeZone: 'Asia/Taipei',
      },
      colorId: colorId,
    };

    // 創建事件
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    return res.status(200).json({
      message: '預約成功',
      eventId: response.data.id,
    });
  } catch (error) {
    console.error('創建行事曆事件失敗:', error);
    return res.status(500).json({
      error: '預約失敗',
      details: error instanceof Error ? error.message : '未知錯誤',
    });
  }
} 