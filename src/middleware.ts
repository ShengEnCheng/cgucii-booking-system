import { NextRequest, NextResponse } from 'next/server'

// 這個 middleware 負責兩件事：
// 1. 為每個「文件請求」產生一次性 nonce，並設定嚴格的 CSP。
//    Next.js 會從回應的 Content-Security-Policy 標頭取出 nonce，套用到它自己的
//    inline script 與 chunk script 上（見 next/dist/server/render.js 的
//    getScriptNonceFromHeader），因此 Pages Router 也能做到 nonce 式 CSP。
//    前提：頁面必須是 SSR（動態渲染），靜態頁面無法拿到每次請求的 nonce。
// 2. 保護 /admin 頁面與 /api/admin/* API：需要 HTTP Basic Auth 才能存取。

export const config = {
  // 排除靜態資源與圖片：這些不需要 CSP，也不必浪費 middleware 執行時間
  matcher: ['/((?!_next/static|_next/image|images/|favicon.ico).*)'],
}

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin", charset="UTF-8"',
    },
  })
}

/** 定時安全比較，避免用時間差慢慢猜出帳號密碼 */
function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  const length = Math.max(left.length, right.length)
  let diff = left.length ^ right.length
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return diff === 0
}

function createNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production'
  // dev 模式的 webpack eval-source-map 與 React Refresh 需要 'unsafe-eval'；
  // HMR 另外需要 ws: 連線。正式環境完全不放行 eval。
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}'`
  const connectSrc = isDev
    ? "connect-src 'self' ws: http://localhost:* http://127.0.0.1:*"
    : "connect-src 'self'"

  return [
    "default-src 'self'",
    scriptSrc,
    // React 的 style prop 與 FullCalendar 會產生行內樣式，style-src 仍需 unsafe-inline
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    connectSrc,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

const ADMIN_PATHS = ['/admin', '/api/admin']

function needsAdminAuth(pathname: string): boolean {
  return ADMIN_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── 後台驗證（fail-closed）──────────────────────────────────────────
  if (needsAdminAuth(pathname)) {
    const expectedUser = process.env.ADMIN_USERNAME
    const expectedPass = process.env.ADMIN_PASSWORD

    if (!expectedUser || !expectedPass) {
      return new NextResponse(
        'Admin auth is not configured. Please set ADMIN_USERNAME and ADMIN_PASSWORD.',
        { status: 500 }
      )
    }

    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return unauthorized()
    }

    let decoded = ''
    try {
      decoded = atob(authHeader.slice('Basic '.length))
    } catch {
      return unauthorized()
    }

    const separatorIndex = decoded.indexOf(':')
    const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : ''
    const pass = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : ''

    if (!constantTimeEqual(user, expectedUser) || !constantTimeEqual(pass, expectedPass)) {
      return unauthorized()
    }
  }

  // ── CSP nonce（只對文件請求產生）───────────────────────────────────
  const acceptsHtml = req.headers.get('accept')?.includes('text/html')
  if (req.method !== 'GET' || !acceptsHtml) {
    return NextResponse.next()
  }

  const nonce = createNonce()
  const csp = buildCsp(nonce)

  // 讓頁面渲染時能取得同一個 nonce（_document 會從回應標頭讀取）
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}
