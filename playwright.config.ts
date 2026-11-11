import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  // 用 production build 跑 E2E：不受 dev 模式 Fast Refresh 造成的重載與編譯時序影響，
  // 也更接近實際部署（含正式 CSP）。建置時間較長，因此拉高 webServer timeout。
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: BASE_URL,
    timeout: 300_000,
    // 一律自己啟動：重複使用殘留的伺服器容易在兩次執行之間被關閉，導致連線被拒
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 1000 },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      // iPhone 13 預設會指定 WebKit；這裡改用 Chromium 模擬同樣尺寸，CI 不必額外安裝 WebKit
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
})
