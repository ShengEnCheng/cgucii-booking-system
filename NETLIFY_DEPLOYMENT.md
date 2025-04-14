# Netlify 部署指南

本文檔提供了如何將預約系統部署到 Netlify 的詳細步驟。

## 前置準備

1. 確保您已經有一個 [Netlify](https://www.netlify.com/) 帳戶
2. 確保您的 Google Calendar API 已經設置好（參考 [GOOGLE_CALENDAR_SETUP.md](./GOOGLE_CALENDAR_SETUP.md)）

## 部署步驟

### 1. 連接到 GitHub 儲存庫

1. 登入您的 Netlify 帳戶
2. 點擊 "New site from Git" 按鈕
3. 選擇 "GitHub" 作為您的 Git 提供者
4. 授權 Netlify 訪問您的 GitHub 帳戶
5. 選擇包含預約系統的儲存庫

### 2. 配置構建設置

在 Netlify 部署設置頁面上：

- **Build command**: `npm run build`
- **Publish directory**: `.next`

### 3. 設置環境變量

1. 在部署設置頁面上，展開 "Advanced build settings"
2. 點擊 "New variable" 按鈕
3. 添加以下環境變量：

   - `GOOGLE_CREDENTIALS`: 您的 Google Calendar API 服務帳戶憑證（JSON 格式，單行）
   - `CALENDAR_ID`: 您的 Google Calendar ID（通常是電子郵件地址）

   注意：確保 `GOOGLE_CREDENTIALS` 是單行的 JSON 字符串，沒有換行符。

### 4. 部署網站

1. 點擊 "Deploy site" 按鈕
2. 等待部署完成
3. 部署完成後，Netlify 將提供一個預設的網址（例如：`https://your-site-name.netlify.app`）

## 自定義域名（可選）

如果您想使用自定義域名：

1. 在 Netlify 儀表板中，選擇您的網站
2. 點擊 "Domain settings"
3. 點擊 "Add custom domain"
4. 按照指示設置您的自定義域名

## 故障排除

如果您在部署過程中遇到問題：

1. 檢查 Netlify 的構建日誌以獲取錯誤信息
2. 確保所有環境變量都已正確設置
3. 確保 `netlify.toml` 文件存在於項目根目錄中
4. 確保 Google Calendar API 憑證有效且具有正確的權限

## 更新網站

每當您推送更改到 GitHub 儲存庫的主分支時，Netlify 將自動重新部署您的網站。
