import { expect, test } from '@playwright/test'

/** 桌面版從側欄卡片開表單；手機版先選場地 chips，再用行動版 CTA 開表單 */
async function openBookingDialog(page: import('@playwright/test').Page) {
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

test.describe('首頁與預約表單', () => {
  test('首頁載入場地與日曆', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '創新育成中心 空間預約系統' })).toBeVisible()
    // 兩個開放中的場地（C01 / C02）應出現在篩選 chips
    await expect(page.getByRole('button', { name: '全部場地' })).toBeVisible()
    await expect(page.getByRole('button', { name: /C01會議室/ }).first()).toBeVisible()
    // 日曆以 dynamic import 載入
    await expect(page.locator('.fc')).toBeVisible({ timeout: 20_000 })
  })

  test('點擊預約開啟對話框，Esc 可關閉', async ({ page }) => {
    await page.goto('/')
    const dialog = await openBookingDialog(page)
    await expect(dialog).toHaveAttribute('aria-modal', 'true')

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('必填欄位未填時不會送出（原生驗證）', async ({ page }) => {
    await page.goto('/')
    const dialog = await openBookingDialog(page)

    await dialog.getByRole('button', { name: /確認送出預約申請/ }).click()
    // 仍停留在表單，且姓名欄位被標記為 required
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('#name')).toHaveAttribute('required', '')
  })

  test('時段選擇只提供營業時間內的選項', async ({ page }) => {
    await page.goto('/')
    const dialog = await openBookingDialog(page)
    const startOptions = await dialog.locator('#startTime option').allTextContents()
    expect(startOptions).toContain('08:00')
    expect(startOptions).toContain('21:00')
    expect(startOptions).not.toContain('07:00')
    expect(startOptions).not.toContain('22:00')
  })
})

test.describe('公開 API', () => {
  test('public-config 不含個資相關欄位', async ({ request }) => {
    const response = await request.get('/api/public-config')
    expect(response.status()).toBe(200)
    const body = await response.text()
    expect(body).not.toContain('申請者')
    expect(body).not.toContain('private_key')

    const json = JSON.parse(body) as {
      spaces: unknown[]
      disabledSpaceIds: string[]
      degraded: boolean
    }
    expect(Array.isArray(json.spaces)).toBe(true)
    expect(Array.isArray(json.disabledSpaceIds)).toBe(true)
    expect(typeof json.degraded).toBe('boolean')
  })

  test('calendar-events 失敗時不洩漏內部細節', async ({ request }) => {
    const response = await request.get('/api/calendar-events?start=2026-12-01&end=2026-12-07')
    const body = await response.text()
    expect(body).not.toContain('private_key')
    expect(body).not.toContain('client_email')
    expect(body).not.toContain('stack')
    expect(body).not.toContain('details')
  })

  test('submit-booking 擋下不存在的日期與非營業時間', async ({ request }) => {
    const invalidDate = await request.post('/api/submit-booking', {
      data: {
        spaceId: '3',
        date: '2026-02-30',
        startTime: '10:00',
        endTime: '12:00',
        name: '測試',
        phone: '0912345678',
        email: 'test@example.com',
        department: '育成廠商',
        participants: '2',
      },
    })
    expect(invalidDate.status()).toBe(400)
    expect(await invalidDate.text()).toContain('日期')

    const outsideHours = await request.post('/api/submit-booking', {
      data: {
        spaceId: '3',
        date: '2030-01-02',
        startTime: '02:00',
        endTime: '04:00',
        name: '測試',
        phone: '0912345678',
        email: 'test@example.com',
        department: '育成廠商',
        participants: '2',
      },
    })
    expect(outsideHours.status()).toBe(400)
  })

  test('calendar-events 擋下過大的查詢範圍', async ({ request }) => {
    const response = await request.get(
      '/api/calendar-events?start=2020-01-01&end=2030-01-01'
    )
    expect(response.status()).toBe(400)
  })
})

test.describe('行動版版面', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 768, '僅在行動版尺寸執行')

  test('側欄隱藏、chips 可見、無水平溢出', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('aside')).toBeHidden()
    await expect(page.getByRole('button', { name: '全部場地' })).toBeVisible()

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    )
    expect(hasHorizontalOverflow).toBe(false)
  })
})
