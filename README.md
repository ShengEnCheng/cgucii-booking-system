# 長庚大學創新育成中心空間預約系統

## 專案簡介

這是一個為長庚大學創新育成中心開發的空間預約系統，提供簡單直觀的預約界面，整合 Google Calendar 進行空間管理。

## 功能特點

- 即時查看空間可用狀態
- 線上預約系統
- Google Calendar 整合
- 響應式設計，支援各種裝置
- Netlify 部署支援

## 環境設置

本專案需要以下環境變量：

1. `GOOGLE_CREDENTIALS`: Google Calendar API 服務帳戶認證
2. `CALENDAR_ID`: Google Calendar ID

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

## Netlify 部署

本專案已經配置好了 Netlify 部署所需的文件，可以直接部署到 Netlify。

詳細的部署步驟請參考 [NETLIFY_DEPLOYMENT.md](./NETLIFY_DEPLOYMENT.md) 文件。

### 測試構建

在部署到 Netlify 之前，您可以先在本地測試構建過程：

```bash
# 執行測試構建腳本
$ ./build-netlify.sh
```