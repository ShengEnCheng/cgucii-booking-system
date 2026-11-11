// 設定的型別、預設值與正規化邏輯。
//
// 這個檔案必須保持「純函式、無 IO」：client 端（首頁、日曆、後台）與 server 端
// 都會匯入它。真正需要 fs / Vercel KV 的讀寫一律放在 appConfig.ts，避免把
// server-only 的模組（fs、@vercel/kv）打進瀏覽器 bundle。

import { spaces } from '@/data/spaces'

export type FormFieldConfig = {
  show?: boolean
  required?: boolean
  label?: string
}

export type SpaceOverride = {
  name?: string
  image?: string
}

export type EventFilters = {
  spacesOnly?: boolean
  allowKeywords?: string[]
  ignoreKeywords?: string[]
}

export type AppConfig = {
  logoPath: string
  disabledSpaceIds: string[]
  disabledSpaceNames: string[]
  spaceOverrides: Record<string, SpaceOverride>
  hideDisabled: boolean
  formFields: Record<string, FormFieldConfig>
  eventFilters: EventFilters
  googleCalendarId: string
  useGoogleColors: boolean
}

/**
 * 安全預設值：刻意「不」包含任何被停用的場地。
 * 若 KV / 檔案讀取失敗而回落到預設值，至少不會讓場地莫名消失或改寫日曆來源。
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  logoPath: '/images/my-logo.svg',
  disabledSpaceIds: [],
  disabledSpaceNames: [],
  spaceOverrides: {},
  hideDisabled: true,
  formFields: {},
  eventFilters: { spacesOnly: true, allowKeywords: [], ignoreKeywords: [], },
  googleCalendarId: '',
  useGoogleColors: true,
}

const MAX_NAME_LENGTH = 80
const MAX_PATH_LENGTH = 500

function trimString(value: unknown, maxLength = MAX_NAME_LENGTH): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function toStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const list = value
    .map((item) => trimString(item, MAX_NAME_LENGTH))
    .filter((item) => item.length > 0)
  return Array.from(new Set(list))
}

function normalizeSpaceOverrides(value: unknown): Record<string, SpaceOverride> {
  const result: Record<string, SpaceOverride> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const entry = raw as Record<string, unknown>
    const normalized: SpaceOverride = {}
    const name = trimString(entry.name)
    if (name) normalized.name = name
    const image = trimString(entry.image, MAX_PATH_LENGTH)
    if (image) normalized.image = image
    if (Object.keys(normalized).length > 0) {
      result[String(key)] = normalized
    }
  }
  return result
}

function normalizeFormFields(value: unknown): Record<string, FormFieldConfig> {
  const result: Record<string, FormFieldConfig> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const entry = raw as Record<string, unknown>
    const normalized: FormFieldConfig = {}
    if (typeof entry.show === 'boolean') normalized.show = entry.show
    if (typeof entry.required === 'boolean') normalized.required = entry.required
    const label = trimString(entry.label, 40)
    if (label) normalized.label = label
    if (Object.keys(normalized).length > 0) {
      result[String(key)] = normalized
    }
  }
  return result
}

function normalizeEventFilters(value: unknown): EventFilters {
  const base: EventFilters = { spacesOnly: true, allowKeywords: [], ignoreKeywords: [] }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base
  const entry = value as Record<string, unknown>
  return {
    spacesOnly: typeof entry.spacesOnly === 'boolean' ? entry.spacesOnly : base.spacesOnly,
    allowKeywords: toStringList(entry.allowKeywords) ?? base.allowKeywords,
    ignoreKeywords: toStringList(entry.ignoreKeywords) ?? base.ignoreKeywords,
  }
}

/** 把任意來源（KV、JSON 檔、API body）的設定正規化成完整且型別正確的 AppConfig。 */
export function normalizeAppConfig(input?: Partial<AppConfig> | null): AppConfig {
  const cfg = (input && typeof input === 'object' ? input : {}) as Partial<AppConfig>

  const logoPath = trimString(cfg.logoPath, MAX_PATH_LENGTH)
  const googleCalendarId = trimString(cfg.googleCalendarId, 200)

  return {
    logoPath: logoPath || DEFAULT_APP_CONFIG.logoPath,
    disabledSpaceIds: toStringList(cfg.disabledSpaceIds) ?? [],
    disabledSpaceNames: toStringList(cfg.disabledSpaceNames) ?? [],
    spaceOverrides: normalizeSpaceOverrides(cfg.spaceOverrides),
    hideDisabled: typeof cfg.hideDisabled === 'boolean' ? cfg.hideDisabled : true,
    formFields: normalizeFormFields(cfg.formFields),
    eventFilters: normalizeEventFilters(cfg.eventFilters),
    googleCalendarId,
    useGoogleColors: typeof cfg.useGoogleColors === 'boolean' ? cfg.useGoogleColors : true,
  }
}

/**
 * 場地是否停用的唯一真相：一律換算成 space id。
 *
 * 資料庫裡可能同時存在「用 id 停用」與「用名稱停用」兩種舊資料，名稱又分
 * 原始名稱與後台自訂名稱。全部在這裡收斂成 id，前後端共用同一份判斷，
 * 才不會出現「前台顯示開放、送出卻被 403」。
 */
export function resolveDisabledSpaceIds(config: AppConfig): string[] {
  const ids = new Set(config.disabledSpaceIds.map((id) => String(id)))
  const names = new Set(
    config.disabledSpaceNames
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  )

  if (names.size > 0) {
    for (const space of spaces) {
      const candidates = [space.name, config.spaceOverrides[space.id]?.name]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => value.trim().toLowerCase())
      if (candidates.some((candidate) => names.has(candidate))) {
        ids.add(String(space.id))
      }
    }
  }

  return Array.from(ids)
}

export function buildDisabledIdSet(config: AppConfig): Set<string> {
  return new Set(resolveDisabledSpaceIds(config))
}

/** 空間在 UI 上的顯示名稱（後台可覆寫）。 */
export function spaceDisplayName(
  space: { id: string; name: string },
  config: Pick<AppConfig, 'spaceOverrides'>
): string {
  const override = config.spaceOverrides[space.id]?.name
  return override && override.trim() ? override.trim() : space.name
}

export function spaceDisplayImage(
  space: { id: string; image: string },
  config: Pick<AppConfig, 'spaceOverrides'>
): string {
  const override = config.spaceOverrides[space.id]?.image
  return override && override.trim() ? override.trim() : space.image
}

/** 舊資料相容：找出某個顯示名稱對應的場地。 */
export function findSpaceByNameOrId(
  nameOrId: string | undefined | null,
  config: Pick<AppConfig, 'spaceOverrides'>
): (typeof spaces)[number] | undefined {
  const raw = typeof nameOrId === 'string' ? nameOrId.trim() : ''
  if (!raw) return undefined
  return spaces.find((space) => {
    if (space.id === raw) return true
    if (space.name === raw) return true
    return spaceDisplayName(space, config) === raw
  })
}

/** 靜態檢查：只允許站內絕對路徑，避免 next/image 因未設 remotePatterns 而整頁崩潰。 */
export function isSafeAssetPath(value: string): boolean {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}
