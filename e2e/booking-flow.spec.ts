import { expect, test } from '@playwright/test'
import { openBookingDialog } from './helpers'

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

test.describe('日曆時間顯示', () => {
  test('事件時間以台北時區顯示，不因時區位移而偏移', async ({ page }) => {
    // 取台北時區當月 15 日的 09:00–10:00，換算成 UTC 後提供給前端（模擬真實 API 輸出）
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date())
    const dateStr = `${parts}-15`
    const start = new Date(`${dateStr}T09:00:00+08:00`)
    const end = new Date(`${dateStr}T10:00:00+08:00`)

    await page.route('**/api/calendar-events*', (route) =>
      route.fulfill({
        status: 200,
        json: [
          {
            id: 'tz-event',
            title: 'C01會議室 - 時區測試',
            start: start.toISOString(),
            end: end.toISOString(),
            color: '#D60000',
            location: 'C01會議室',
            applicant: '',
            spaceId: '3',
          },
        ],
      })
    )

    await page.goto('/')
    const event = page.locator('.fc-event', { hasText: '時區測試' })
    await expect(event).toBeVisible({ timeout: 20_000 })
    await expect(event).toContainText('09:00–10:00')
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
