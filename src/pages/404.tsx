import type { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'

const NotFound: NextPage = () => (
  <>
    <Head>
      <title>找不到頁面 | 長庚大學創新育成中心</title>
      <link rel="icon" href="/images/my-logo.svg" />
      <meta name="robots" content="noindex" />
    </Head>
    <div className="min-h-dvh flex items-center justify-center bg-slate-100 p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
        <p className="text-5xl font-black text-blue-600 mb-2">404</p>
        <h1 className="text-lg font-bold text-slate-800 mb-2">找不到這個頁面</h1>
        <p className="text-sm text-slate-500 mb-6">
          請確認網址是否正確，或回到首頁重新預約空間。
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

export default NotFound
