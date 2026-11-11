import { beforeEach, describe, expect, it, vi } from 'vitest'

const kvStore = { value: null as any }
const kvSetCalls: any[] = []

vi.mock('@/utils/kv', () => ({
  hasKv: () => true,
  kvGetJson: async () => kvStore.value,
  kvSet: async (key: string, value: unknown) => {
    kvSetCalls.push({ key, value })
    kvStore.value = value
    return true
  },
}))

async function importFresh() {
  vi.resetModules()
  return import('@/utils/appConfig')
}

describe('KV 設定讀取', () => {
  beforeEach(() => {
    kvStore.value = null
    kvSetCalls.length = 0
  })

  it('KV 有設定時直接採用並標記來源為 kv', async () => {
    kvStore.value = {
      logoPath: '/images/my-logo.svg',
      disabledSpaceIds: ['4'],
      disabledSpaceNames: [],
      spaceOverrides: {},
      hideDisabled: true,
      formFields: {},
      eventFilters: { spacesOnly: true },
      googleCalendarId: '',
      useGoogleColors: true,
    }
    const { readAppConfigMeta } = await importFresh()
    const result = await readAppConfigMeta({ skipCache: true })

    expect(result.source).toBe('kv')
    expect(result.config.disabledSpaceIds).toEqual(['4'])
    expect(kvSetCalls).toHaveLength(0)
  })

  it('KV 為空時以 repo 設定初始化並寫回，避免場地全部變開放', async () => {
    const { readAppConfigMeta } = await importFresh()
    const result = await readAppConfigMeta({ skipCache: true })

    expect(result.source).toBe('kv')
    expect(result.degraded).toBe(false)
    // repo 內設定的停用場地與自訂名稱必須保留
    expect(result.config.disabledSpaceIds).toEqual(expect.arrayContaining(['1', '2', '5']))
    expect(result.config.spaceOverrides['3']?.name).toBe('C01會議室')

    // 且應該把初始值寫進 KV，後台才有正確的基準
    expect(kvSetCalls).toHaveLength(1)
    expect(kvSetCalls[0].key).toBe('app-config')
    expect(kvSetCalls[0].value.disabledSpaceIds).toEqual(expect.arrayContaining(['1', '2', '5']))
  })
})
