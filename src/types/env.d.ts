declare namespace NodeJS {
  interface ProcessEnv {
    GOOGLE_CREDENTIALS?: string;
    CALENDAR_ID?: string;
    ADMIN_USERNAME?: string;
    ADMIN_PASSWORD?: string;
    KV_REST_API_URL?: string;
    KV_REST_API_TOKEN?: string;
    NEXT_PUBLIC_LOGO_PATH?: string;
  }
}