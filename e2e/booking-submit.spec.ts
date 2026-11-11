import { expect, test } from '@playwright/test'
import { fillBookingForm, mockBackend, openBookingDialog } from './helpers'

test.describe('完整預約送出流程（後端以攔截模擬）', () => {
  test('送出成功後顯示成功訊息、關閉視窗並刷新日曆', async ({ page }) => {
    const state = await mockBackend(page)
    await page.goto('/')

    const dialog = await openBookingDialog(page)
    await fillBookingForm(dialog)

    // 送單前的日曆載入次數
    const callsBeforeSubmit = state.calendarCalls

    await dialog.getByRole('button', { name: /確認送出預約申請/ }).click()

    await expect(page.getByText('預約成功！已排入 Google 日曆')).toBeVisible({ timeout: 15_000 })

    // 送出內容：帶 spaceId、不帶 colorId（顏色由伺服器決定）
    expect(state.submitBody).not.toBeNull()
    expect(state.submitBody?.spaceId).toBe('3')
    expect(state.submitBody?.colorId).toBeUndefined()
    expect(state.submitBody?.startTime).toBe('10:00')
    expect(state.submitBody?.endTime).toBe('12:00')

    // 成功後會關閉視窗
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 })

    // 成功後會觸發日曆重抓
    await expect
      .poll(() => state.calendarCalls, { timeout: 15_000 })
      .toBeGreaterThan(callsBeforeSubmit)
  })

  test('時段衝突（409）時顯示錯誤並保留表單內容', async ({ page }) => {
    await mockBackend(page, {
      submitStatus: 409,
      submitBody: { error: '選擇的時段已被預約，請選擇其他時段' },
    })
    await page.goto('/')

    const dialog = await openBookingDialog(page)
    await fillBookingForm(dialog)
    await dialog.getByRole('button', { name: /確認送出預約申請/ }).click()

    await expect(dialog.getByRole('alert')).toContainText('選擇的時段已被預約')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('#name')).toHaveValue('王小明')
  })

  test('無法確認可用性（503）時仍可送出', async ({ page }) => {
    await mockBackend(page, {
      availabilityStatus: 503,
      availabilityBody: { error: '暫時無法確認時段狀態，請稍後再試' },
    })
    await page.goto('/')

    const dialog = await openBookingDialog(page)
    await fillBookingForm(dialog)

    await expect(dialog.getByText('暫時無法確認時段狀態')).toBeVisible({ timeout: 10_000 })
    const submit = dialog.getByRole('button', { name: /確認送出預約申請/ })
    await expect(submit).toBeEnabled()

    await submit.click()
    await expect(page.getByText('預約成功！已排入 Google 日曆')).toBeVisible({ timeout: 15_000 })
  })

  test('人數超過場地容量時前端即時阻擋', async ({ page }) => {
    await mockBackend(page)
    await page.goto('/')

    const dialog = await openBookingDialog(page)
    await dialog.locator('#participants').fill('999')

    await expect(dialog.getByText(/超過容量上限/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: /確認送出預約申請/ })).toBeDisabled()
  })
})
