declare namespace NodeJS {
  interface ProcessEnv {
    GOOGLE_CREDENTIALS?: string;
    CALENDAR_ID?: string;
    ADMIN_USERNAME?: string;
    ADMIN_PASSWORD?: string;
    KV_REST_API_URL?: string;
    KV_REST_API_TOKEN?: string;
    NEXT_PUBLIC_LOGO_PATH?: string;
    NEXT_PUBLIC_SITE_URL?: string;
    /** 取消預約連結的 HMAC 簽章金鑰（建議設定，至少 16 字元） */
    BOOKING_TOKEN_SECRET?: string;
    /** 通知信：Resend 或自訂 Webhook，二擇一；皆未設定時不寄信 */
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
    MAIL_WEBHOOK_URL?: string;
  }
}