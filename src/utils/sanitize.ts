// 使用者輸入的清理工具。
//
// 這裡的字串最終會寫進 Google Calendar 的 summary / description，並由
// /api/calendar-events 回傳給前端渲染。前端已經改用 textContent/JSX 不再組 HTML，
// 但後端仍必須在「寫入」與「輸出」兩端都清一次，避免任何一端被誤用時直接變成 XSS。

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const HTML_TAG = /<[^>]*>/g
const ANGLE_BRACKETS = /[<>]/g

/** 移除 HTML 標籤、控制字元，壓縮空白並截斷長度。 */
export function sanitizeText(input: unknown, maxLength = 200): string {
  if (input === null || input === undefined) return ''
  const cleaned = String(input)
    .replace(HTML_TAG, ' ')
    .replace(CONTROL_CHARS, '')
    .replace(ANGLE_BRACKETS, '')
    .replace(/\s+/g, ' ')
    .trim()
  return maxLength > 0 ? cleaned.slice(0, maxLength) : cleaned
}

/** HTML escape：輸出到 HTML 內容或屬性時使用。 */
export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 保留換行的清理（用途欄位是多人多行的說明） */
export function sanitizeMultiline(input: unknown, maxLength = 500): string {
  if (input === null || input === undefined) return ''
  const cleaned = String(input)
    .replace(HTML_TAG, ' ')
    .replace(CONTROL_CHARS, '')
    .replace(ANGLE_BRACKETS, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return maxLength > 0 ? cleaned.slice(0, maxLength) : cleaned
}

/** 從我們自己寫入的 description 取回某個欄位（例：申請者、電話、Email、用途） */
export function extractDescriptionField(
  description: string | null | undefined,
  label: string,
  maxLength = 200
): string {
  if (!description) return ''
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}[：:]\\s*([^\\n\\r]*)`).exec(String(description))
  return match ? sanitizeText(match[1], maxLength) : ''
}

/** 從 description 取回申請人姓名（給公開端點回傳脫敏後的欄位用） */
export function extractApplicant(description?: string | null): string {
  return extractDescriptionField(description, '申請者', 60)
}
