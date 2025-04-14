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
  // 將輸入的時間轉換為 Date 對象
  const startDateTime = new Date(`${date}T${startTime}:00`);
  const endDateTime = new Date(`${date}T${endTime}:00`);

  // 檢查時間是否有效
  if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
    throw new Error('無效的日期或時間格式');
  }

  // 檢查結束時間是否在開始時間之後
  if (endDateTime <= startDateTime) {
    throw new Error('結束時間必須在開始時間之後');
  }

  // 篩選出與指定空間相關的事件
  const spaceEvents = events.filter(event => {
    return event.title.includes(spaceName);
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
