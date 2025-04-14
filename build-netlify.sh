#!/bin/bash

# 測試 Netlify 部署的構建腳本

echo "開始測試 Netlify 構建..."

# 安裝依賴
echo "安裝依賴..."
npm install

# 構建項目
echo "構建項目..."
npm run build

# 檢查構建結果
if [ -d ".next" ]; then
  echo "構建成功！.next 目錄已創建。"
  echo "您現在可以將此項目部署到 Netlify。"
  echo "請參考 NETLIFY_DEPLOYMENT.md 文件獲取詳細說明。"
else
  echo "構建失敗！請檢查錯誤信息。"
  exit 1
fi
