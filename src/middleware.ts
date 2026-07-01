import { NextRequest, NextResponse } from 'next/server'

// 保護 /admin 頁面與 /api/admin/* API：需要 HTTP Basic Auth 才能存取。
// 帳號密碼透過環境變數 ADMIN_USERNAME / ADMIN_PASSWORD 設定（於 Vercel 專案的
// Environment Variables 中設定，本機開發則放在 .env.local）。

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin", charset="UTF-8"',
    },
  })
}

export function middleware(req: NextRequest) {
  const expectedUser = process.env.ADMIN_USERNAME
  const expectedPass = process.env.ADMIN_PASSWORD

  // 若未設定帳密環境變數，為避免後台在未保護狀態下對外開放，直接拒絕存取。
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

  const base64Credentials = authHeader.slice('Basic '.length)
  let decoded = ''
  try {
    decoded = atob(base64Credentials)
  } catch {
    return unauthorized()
  }

  const separatorIndex = decoded.indexOf(':')
  const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : ''
  const pass = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : ''

  if (user !== expectedUser || pass !== expectedPass) {
    return unauthorized()
  }

  return NextResponse.next()
}
