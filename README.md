# 長庚大學創新育成中心空間預約系統

## 專案簡介

這是一個為長庚大學創新育成中心開發的空間預約系統，提供簡單直觀的預約界面，整合 Google Calendar 進行空間管理。

## 功能特點

- 即時查看空間可用狀態
- 線上預約系統
- Google Calendar 整合
- 響應式設計，支援各種裝置
- Vercel 部署支援
- 後台管理頁面（`/admin`，需 Basic Auth 登入）

## 環境設置

本專案需要以下環境變量：

1. `GOOGLE_CREDENTIALS`: Google Calendar API 服務帳戶認證
2. `CALENDAR_ID`: Google Calendar ID
3. `ADMIN_USERNAME` / `ADMIN_PASSWORD`: `/admin` 後台的 Basic Auth 帳號密碼（必填，未設定時後台會直接拒絕存取）
4. `KV_REST_API_URL` / `KV_REST_API_TOKEN`：正式環境（Vercel）用來儲存後台設定，透過 Vercel KV 提供，本機開發可留空

### 本地開發設置

1. 複製 `.env.local.example` 到 `.env.local`
2. 填入所需的環境變量
3. 確保 `.env.local` 和任何認證文件已添加到 .gitignore

⚠️ 警告：永遠不要提交認證文件或環境變量到版本控制系統！

## Google Calendar API 設置

請參考 [GOOGLE_CALENDAR_SETUP.md](./GOOGLE_CALENDAR_SETUP.md) 文件中的詳細說明。

## 安裝與運行

```bash
# 安裝依賴
$ npm install

# 開發模式運行
$ npm run dev

# 產品模式構建
$ npm run build
$ npm run start
```

## Vercel 部署

本專案已連結至 Vercel 專案（見 `.vercel/project.json`），可直接用 GitHub 整合或 Vercel CLI 部署，Vercel 會自動偵測 Next.js 專案設定，不需要額外的 `vercel.json`。

### 部署步驟

1. 到 [Vercel](https://vercel.com/) 匯入這個 GitHub repo（或在專案目錄執行 `vercel --prod`）。
2. 在 Vercel 專案的 Settings → Environment Variables 加入：
   - `GOOGLE_CREDENTIALS`
   - `CALENDAR_ID`
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD`
3. 到 Vercel 專案的 Storage 分頁建立一個 KV database 並連結到本專案，`KV_REST_API_URL` / `KV_REST_API_TOKEN` 會自動注入，不需手動設定。若略過此步驟，`/admin` 後台的設定變更在正式環境將無法保存。
4. 部署完成後，用 `/api/admin/calendar-health` 端點確認 Google Calendar 憑證與連線正常。
5. 之後每次 push 到 main 分支，Vercel 會自動重新部署。

### 後台管理

`/admin` 頁面需要 HTTP Basic Auth 才能進入，帳號密碼即 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。
# cgucii-booking-system
