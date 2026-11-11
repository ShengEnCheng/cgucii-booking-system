const isDev = process.env.NODE_ENV !== 'production'

// 開發模式的 webpack eval-source-map 與 React Refresh 需要 'unsafe-eval'；
// 正式建置不需要，因此只在 dev 放行。HMR 另外需要 ws: 連線。
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'"
const connectSrc = isDev ? "connect-src 'self' ws: http://localhost:* http://127.0.0.1:*" : "connect-src 'self'"

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    // Next.js Pages Router 的 bootstrap script 是 inline 的，因此 script-src 仍需要
    // 'unsafe-inline'；真正的 XSS 防線是程式碼本身（事件內容一律用 textContent）。
    // 這裡的重點是擋掉外部腳本、object 嵌入與 iframe 嵌載。
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      connectSrc,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // 讓 next/image 優化器輸出更小的格式（原始檔已是 webp）
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
