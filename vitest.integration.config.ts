import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// 整合測試會打真實的 Google Calendar / Redis，因此與單元測試分開跑：
//   npm run test:integration
// 需要 .env.local（或 CI secrets）提供 GOOGLE_CREDENTIALS / CALENDAR_ID；
// 由 npm script 以 node --env-file-if-exists=.env.local 載入，避免測試內自行解析 env。
// 寫入測試另外需要「專用的測試日曆」INTEGRATION_TEST_CALENDAR_ID。
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
