// 顏色定義的單一來源：前台標籤、日曆事件、後端事件轉換全部從這裡取，
// 避免同一個場地在側欄與日曆上出現兩種不同的顏色。

/** Google Calendar colorId → 十六進位色碼 */
export const GOOGLE_COLOR_HEX: Record<string, string> = {
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
}

export const DEFAULT_EVENT_COLOR = GOOGLE_COLOR_HEX['1']
export const SPACE_FALLBACK_COLOR = '#2563eb'

export function getColorHex(colorId?: string | null): string {
  if (!colorId) return DEFAULT_EVENT_COLOR
  return GOOGLE_COLOR_HEX[String(colorId)] || DEFAULT_EVENT_COLOR
}

/** 場地在 UI 上的強調色（找不到時用品牌藍） */
export function getAccentColor(colorId?: string | null): string {
  if (!colorId) return SPACE_FALLBACK_COLOR
  return GOOGLE_COLOR_HEX[String(colorId)] || SPACE_FALLBACK_COLOR
}

/** 依背景色決定可讀的前景文字色 */
export function getContrastColor(hex: string): string {
  const value = String(hex || '').replace('#', '')
  if (value.length !== 6) return '#111827'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#111827' : '#FFFFFF'
}
