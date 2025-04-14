import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

interface GoogleCredentials {
  private_key: string;
  client_email: string;
  [key: string]: any;
}

// 從環境變數獲取憑證和日曆 ID
let credentials: GoogleCredentials;
try {
  const credentialsStr = process.env.GOOGLE_CALENDAR_CREDENTIALS || '{}';
  credentials = JSON.parse(credentialsStr);
  
  // 修復私鑰格式
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key
      .split('\\n')
      .join('\n')
      .replace(/^"|"$/g, '');
  }

  console.log('Credentials loaded:', {
    hasPrivateKey: !!credentials.private_key,
    privateKeyLength: credentials.private_key?.length,
    clientEmail: credentials.client_email,
  });
} catch (error) {
  console.error('Failed to parse credentials:', error);
  throw new Error('Invalid credentials format');
}

const calendarId = process.env.CALENDAR_ID;

if (!credentials.private_key || !credentials.client_email || !calendarId) {
  throw new Error('Missing required Google Calendar credentials or calendar ID');
}

// 創建 JWT client
const client = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
  ],
});

// 創建 calendar client
const calendar = google.calendar({ version: 'v3', auth: client });

// 測試認證
async function testAuth() {
  try {
    await client.authorize();
    console.log('Authentication successful');
    return true;
  } catch (error) {
    console.error('Authentication failed:', error);
    return false;
  }
}

// 確保已認證
let isAuthenticated = false;
testAuth().then(result => {
  isAuthenticated = result;
});

export async function listEvents() {
  try {
    if (!isAuthenticated) {
      await testAuth();
    }

    console.log('Fetching calendar events...');
    console.log('Using calendar ID:', calendarId);
    console.log('Using client email:', credentials.client_email);

    const now = new Date();
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(now.getMonth() + 1);

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: now.toISOString(),
      timeMax: oneMonthFromNow.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500
    });

    console.log(`Successfully fetched ${response.data.items?.length || 0} events`);
    return response.data.items || [];
  } catch (error: any) {
    console.error('Error fetching calendar events:', {
      message: error.message,
      code: error.code,
      status: error.status,
      calendarId,
      clientEmail: credentials.client_email
    });
    throw error;
  }
}

export async function createCalendarEvent(bookingData: any) {
  try {
    if (!isAuthenticated) {
      await testAuth();
    }

    console.log('Creating calendar event...');
    console.log('Using calendar ID:', calendarId);

    // 格式化日期和時間
    const startDateTime = new Date(`${bookingData.date}T${bookingData.startTime}:00+08:00`);
    const endDateTime = new Date(`${bookingData.date}T${bookingData.endTime}:00+08:00`);

    // 檢查時間是否有效
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      throw new Error('無效的日期或時間格式');
    }

    // 檢查結束時間是否在開始時間之後
    if (endDateTime <= startDateTime) {
      throw new Error('結束時間必須在開始時間之後');
    }

    const event = {
      summary: `空間預約：${bookingData.spaceName}`,
      description: `
        申請者：${bookingData.name}
        聯繫電話：${bookingData.phone}
        Email：${bookingData.email}
        參加人數：${bookingData.participants}
      `,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'Asia/Taipei',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'Asia/Taipei',
      },
      colorId: bookingData.colorId,
    };

    const response = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: event,
    });

    console.log('Successfully created calendar event:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error creating calendar event:', {
      message: error.message,
      code: error.code,
      status: error.status,
    });
    throw error;
  }
}

// 檢查時段是否已被預約
export async function checkAvailability(date: string, startTime: string, endTime: string, spaceName: string) {
  try {
    if (!isAuthenticated) {
      await testAuth();
    }

    console.log('Checking availability...');
    console.log('Using calendar ID:', calendarId);

    const startDateTime = new Date(`${date}T${startTime}:00+08:00`);
    const endDateTime = new Date(`${date}T${endTime}:00+08:00`);

    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      throw new Error('無效的日期或時間格式');
    }

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startDateTime.toISOString(),
      timeMax: endDateTime.toISOString(),
      singleEvents: true,
    });

    // 檢查是否有相同空間的預約
    const hasConflict = response.data.items?.some(event => {
      const eventSummary = event.summary || '';
      return eventSummary.includes(spaceName);
    });

    return !hasConflict;
  } catch (error: any) {
    console.error('Error checking availability:', {
      message: error.message,
      code: error.code,
      status: error.status,
    });
    throw error;
  }
} 