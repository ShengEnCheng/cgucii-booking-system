import fs from 'fs'
import path from 'path'

// 後台可編輯設定的存放邏輯。
//
// 在 Vercel 這類 serverless 平台上，專案檔案系統在執行階段是唯讀的，
// 直接寫入 src/config/app-config.json 不會真正保存（也不會跨執行環境共用）。
// 因此正式環境改用 Vercel KV 儲存；本機開發（沒有設定 KV_REST_API_URL /
// KV_REST_API_TOKEN 時）則維持寫入本地 JSON 檔案，方便直接開發測試。

export type AppConfig = {
  logoPath: string
  disabledSpaceIds: string[]
  disabledSpaceNames: string[]
  spaceOverrides: Record<string, { name?: string; image?: string }>
  hideDisabled: boolean
  formFields: Record<string, { show?: boolean; required?: boolean; label?: string }>
  eventFilters: { spacesOnly?: boolean; allowKeywords?: string[]; ignoreKeywords?: string[] }
  googleCalendarId: string
  useGoogleColors: boolean
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  logoPath: '/images/my-logo.svg',
  disabledSpaceIds: [],
  disabledSpaceNames: [],
  spaceOverrides: {},
  hideDisabled: false,
  formFields: {},
  eventFilters: { spacesOnly: false, allowKeywords: [], ignoreKeywords: [] },
  googleCalendarId: '',
  useGoogleColors: true,
}

const KV_KEY = 'app-config'
const localConfigPath = path.join(process.cwd(), 'src', 'config', 'app-config.json')

function hasKv() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

export async function readAppConfig(): Promise<AppConfig> {
  if (hasKv()) {
    try {
      const { kv } = await import('@vercel/kv')
      const cfg = await kv.get<Partial<AppConfig>>(KV_KEY)
      return cfg ? { ...DEFAULT_APP_CONFIG, ...cfg } : DEFAULT_APP_CONFIG
    } catch (e) {
      console.error('讀取 Vercel KV 設定失敗，改用預設值:', e)
      return DEFAULT_APP_CONFIG
    }
  }

  try {
    const content = fs.readFileSync(localConfigPath, 'utf8')
    return { ...DEFAULT_APP_CONFIG, ...JSON.parse(content) }
  } catch {
    return DEFAULT_APP_CONFIG
  }
}

export async function writeAppConfig(cfg: AppConfig): Promise<void> {
  if (hasKv()) {
    const { kv } = await import('@vercel/kv')
    await kv.set(KV_KEY, cfg)
    return
  }

  fs.writeFileSync(localConfigPath, JSON.stringify(cfg, null, 2), 'utf8')
}
