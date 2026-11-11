import type { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'

const ServerError: NextPage = () => (
  <>
    <Head>
      <title>系統暫時無法使用 | 長庚大學創新育成中心</title>
      <link rel="icon" href="/images/my-logo.svg" />
      <meta name="robots" content="noindex" />
    </Head>
    <div className="min-h-dvh flex items-center justify-center bg-slate-100 p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
        <p className="text-5xl font-black text-rose-600 mb-2">500</p>
        <h1 className="text-lg font-bold text-slate-800 mb-2">系統暫時無法使用</h1>
        <p className="text-sm text-slate-500 mb-6">
          請稍後重新整理；若持續發生，請聯繫育成中心窗口。
        </p>
        <Link
          href="/"
          className="inline-block text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-xl"
        >
          回到預約首頁
        </Link>
      </div>
    </div>
  </>
)

export default ServerError
