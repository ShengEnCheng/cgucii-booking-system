/**
 * 空間可用性檢查工具函數
 */

/**
 * 檢查特定空間在特定時間段是否可用
 * @param events 所有事件列表
 * @param spaceName 空間名稱
 * @param date 日期 (YYYY-MM-DD)
 * @param startTime 開始時間 (HH:MM)
 * @param endTime 結束時間 (HH:MM)
 * @returns 是否可用
 */
export function checkSpaceAvailability(
  events: any[],
  spaceName: string,
  date: string,
  startTime: string,
  endTime: string
): boolean {
  // 將輸入的時間轉換為 Date 對象（明確使用台北時區 +08:00，避免 server 以 UTC 解析）
  const startDateTime = new Date(`${date}T${startTime}:00+08:00`);
  const endDateTime = new Date(`${date}T${endTime}:00+08:00`);

  // 檢查時間是否有效
  if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
    throw new Error('無效的日期或時間格式');
  }

  // 檢查結束時間是否在開始時間之後
  if (endDateTime <= startDateTime) {
    throw new Error('結束時間必須在開始時間之後');
  }

  // 建立別名關鍵字（不分大小寫）
  const keywords: string[] = [spaceName]
  const lowerSpace = spaceName.toLowerCase()
  if (lowerSpace.includes('小會議室')) {
    keywords.push('C01', 'C01會議室')
  }
  if (lowerSpace.includes('多功能會議室')) {
    keywords.push('C02', 'C02會議室', '中型C02會議室')
  }
  const lowers = keywords.map(k => String(k).toLowerCase())
  // 篩選出與指定空間（含別名）相關的事件
  const spaceEvents = events.filter(event => {
    const t = String(event.title || '').toLowerCase()
    return lowers.some(k => t.includes(k))
  });

  // 檢查是否有時間衝突
  const hasConflict = spaceEvents.some(event => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);

    // 檢查時間重疊
    return (
      (startDateTime < eventEnd && endDateTime > eventStart) ||
      (startDateTime.getTime() === eventStart.getTime()) ||
      (endDateTime.getTime() === eventEnd.getTime())
    );
  });

  return !hasConflict;
}

/**
 * 獲取特定日期特定空間的可用時段
 * @param events 所有事件列表
 * @param spaceName 空間名稱
 * @param date 日期 (YYYY-MM-DD)
 * @param timeSlots 時間段列表 (例如: ["08:00", "09:00", ...])
 * @returns 可用時段列表 [{start: "08:00", end: "09:00", available: true}, ...]
 */
export function getAvailableTimeSlots(
  events: any[],
  spaceName: string,
  date: string,
  timeSlots: string[]
): { start: string; end: string; available: boolean }[] {
  // 篩選出與指定空間和日期相關的事件
  const spaceEvents = events.filter(event => {
    const eventDate = new Date(event.start).toISOString().split('T')[0];
    return event.title.includes(spaceName) && eventDate === date;
  });

  // 生成時間段列表
  const availableSlots = [];
  for (let i = 0; i < timeSlots.length - 1; i++) {
    const start = timeSlots[i];
    const end = timeSlots[i + 1];
    
    // 檢查此時間段是否可用
    const available = checkSpaceAvailability(
      spaceEvents,
      spaceName,
      date,
      start,
      end
    );
    
    availableSlots.push({ start, end, available });
  }

  return availableSlots;
}
