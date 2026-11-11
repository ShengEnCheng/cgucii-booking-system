# 長庚大學創新育成中心空間預約系統

以 Next.js（Pages Router）開發的空間預約系統，直接以 Google Calendar 作為預約資料的單一來源：使用者在前台選時段即時確認可用性，送出後直接寫入官方日曆，管理員在 `/admin` 調整場地、表單欄位與事件顯示設定。

## 功能特點

- 即時查看各場地可用狀態（FullCalendar 月／週／日檢視）
- 線上預約、送出前後各做一次衝堂檢查，避免重複預約
- Google Calendar 整合（服務帳戶，時區固定 Asia/Taipei）
- 後台管理頁面（`/admin`，HTTP Basic Auth）：場地開關、名稱／圖片覆寫、表單欄位必填、事件過濾與配色、日曆連線診斷
- 響應式版面：桌機左右分割、手機單欄
- Vercel 部署（Vercel KV 儲存後台設定）

## 環境變數

| 變數 | 必填 | 說明 |
| --- | --- | --- |
| `GOOGLE_CREDENTIALS` | ✅ | Google 服務帳戶 JSON（單行） |
| `CALENDAR_ID` | ✅ | 要寫入的 Google Calendar ID |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | ✅ | `/admin` 的 Basic Auth 帳密；未設定時後台直接回 500 拒絕 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 建議 | Vercel KV，用來保存後台設定與分散式鎖；未設定時本機改寫入 `src/config/app-config.json` |

本機開發：`cp .env.local.example .env.local` 後填入上述值。

## 指令

```bash
npm ci              # 安裝依賴（依 package-lock.json）
npm run dev         # 開發模式
npm run build       # 生產建置
npm start           # 啟動生產伺服器
npm run lint        # ESLint
npm run typecheck   # TypeScript 型別檢查
npm run test        # vitest 單元測試
```

## 專案結構

```
src/
  components/BookingForm.tsx    預約表單（含即時可用性檢查）
  components/Calendar.tsx       FullCalendar 包裝（事件內容以 textContent 組出）
  pages/index.tsx               前台首頁
  pages/admin.tsx               後台設定
  pages/api/submit-booking.ts   建立預約（驗證 → 鎖 → 查核 → 寫入 → 衝突驗證 → 回滾）
  pages/api/check-availability.ts 時段可用性查詢（10 秒快取）
  pages/api/calendar-events.ts  公開事件列表（只回脫敏欄位）
  utils/configSchema.ts         設定型別／正規化／停用場地換算（client-safe）
  utils/appConfig.ts            設定讀寫（Vercel KV 或本地 JSON，server-only）
  utils/bookingRules.ts         營業時間、時長、日期驗證（前後端共用）
  utils/availabilityUtils.ts    場地識別與衝堂判斷
  utils/googleCalendarService.ts Google API、JWT 快取、KV 分散式鎖
  utils/sanitize.ts             輸入清理與 HTML escape
  utils/rateLimit.ts            公開端點限流
tests/                          vitest 單元測試
```

## 設計上的重要約定

1. **事件內容一律用 DOM／textContent 產生**，不可使用 FullCalendar 的 `html` 字串，避免使用者輸入被當成 HTML 執行。
2. **場地識別以結構化標記為準**：寫入時在 description 加上 `[SPACE:<id>]` 與 `extendedProperties.private.spaceId`；舊事件才退回標題／地點關鍵字比對，且不採計「用途」等自由文字欄位。
3. **停用場地只認 id**：名稱形式的舊資料在 `resolveDisabledSpaceIds()` 統一換算成 id，前後端共用同一份判斷。
4. **公開 API 不回傳個資**：`/api/calendar-events` 只回 `id/title/start/end/color/location/applicant/spaceId`，`applicant` 由伺服器擷取並清理，完整 description（含電話、Email）不對外。
5. **預約寫入失敗要能回滾**：insert 之後任何步驟失敗都會嘗試刪除剛建立的事件，避免留下孤兒事件把時段卡死。
6. **設定讀取失敗不得靜默改變行為**：`readAppConfigMeta()` 會回報 `degraded`，`DEFAULT_APP_CONFIG` 不包含任何停用場地。

## 測試與 CI

- `tests/` 覆蓋可用性判斷、預約規則（日期合法性、營業時間、時長）、設定正規化、輸入清理與限流。
- `.github/workflows/ci.yml` 在 push / PR 時依序執行 lint → typecheck → test → build。

## 部署（Vercel）

1. 匯入 GitHub repo，設定上方環境變數。
2. 建立 Vercel KV 並連結專案（未連結時後台設定無法保存）。
3. 部署後用 `/api/admin/calendar-health?strict=1` 確認憑證與日曆連線（健康時 200，異常時 503，適合接 uptime 監控）。

## 安全性須知

- 服務帳戶金鑰**只能**存在於環境變數或 `.env.local`，`.gitignore` 已擋掉常見檔名。
- 若不慎將金鑰提交進版本控制：**先到 Google Cloud 停用／刪除該金鑰並建立新的**，再清理 git 歷史。歷史清理無法撤銷已經被公開複製的金鑰。
- 若要把此 repo 轉為公開，請先確認 `git log --all -- '*.json'` 不含任何憑證內容。
