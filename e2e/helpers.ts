import { expect, type Page } from '@playwright/test'

/** 台北時區往後 n 天的 YYYY-MM-DD */
export function futureDate(daysAhead = 30): string {
  const target = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target)
}

/** 桌面版從側欄卡片開表單；手機版先選場地 chips，再用行動版 CTA 開表單 */
export async function openBookingDialog(page: Page) {
  const aside = page.locator('aside')
  if (await aside.isVisible()) {
    const bookButton = page.getByRole('button', { name: /^預約/ }).first()
    await expect(bookButton).toBeVisible({ timeout: 20_000 })
    await bookButton.click()
  } else {
    const chip = page.getByRole('button', { name: /C01會議室/ }).first()
    await expect(chip).toBeVisible({ timeout: 20_000 })
    await chip.click()
    const mobileCta = page.getByRole('button', { name: /^預約 C01會議室/ })
    await expect(mobileCta).toBeVisible()
    await mobileCta.click()
  }

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

export type MockOptions = {
  submitStatus?: number
  submitBody?: Record<string, unknown>
  availabilityStatus?: number
  availabilityBody?: Record<string, unknown>
}

/**
 * 攔截所有後端 API，讓 E2E 不依賴真實 Google 憑證。
 * 回傳取得已送出 request body 與 calendar-events 呼叫次數的方法。
 */
export async function mockBackend(page: Page, options: MockOptions = {}) {
  const state: {
    submitBody: Record<string, unknown> | null
    calendarCalls: number
  } = { submitBody: null, calendarCalls: 0 }

  await page.route('**/api/public-config', (route) =>
    route.fulfill({
      status: 200,
      json: {
        logoPath: '/images/my-logo.svg',
        // 與正式設定一致：1/2/5 停用、hideDisabled 開啟，第一個可用場地就是 C01
        disabledSpaceIds: ['1', '2', '5'],
        spaceOverrides: { '3': { name: 'C01會議室' }, '4': { name: 'C02會議室' } },
        hideDisabled: true,
        formFields: {},
        eventFilters: { spacesOnly: true, allowKeywords: [], ignoreKeywords: [] },
        useGoogleColors: true,
        degraded: false,
      },
    })
  )

  await page.route('**/api/calendar-events*', (route) => {
    state.calendarCalls += 1
    return route.fulfill({ status: 200, json: [] })
  })

  await page.route('**/api/check-availability*', (route) =>
    route.fulfill({
      status: options.availabilityStatus ?? 200,
      json: options.availabilityBody ?? {
        available: true,
        checkedAt: new Date().toISOString(),
      },
    })
  )

  await page.route('**/api/submit-booking', async (route) => {
    state.submitBody = route.request().postDataJSON()
    await route.fulfill({
      status: options.submitStatus ?? 200,
      json: options.submitBody ?? { message: '預約成功' },
    })
  })

  return state
}

/** 填入表單必填欄位並選好時段 */
export async function fillBookingForm(
  dialog: ReturnType<Page['getByRole']>,
  options: { date?: string; startTime?: string; endTime?: string } = {}
) {
  await dialog.locator('#name').fill('王小明')
  await dialog.locator('#phone').fill('0912345678')
  await dialog.locator('#email').fill('ming@example.com')
  await dialog.locator('#participants').fill('3')
  await dialog.locator('#department').selectOption('育成廠商')
  await dialog.locator('#date').fill(options.date ?? futureDate(30))
  await dialog.locator('#startTime').selectOption(options.startTime ?? '10:00')
  await dialog.locator('#endTime').selectOption(options.endTime ?? '12:00')
}
