import type { NextPage } from 'next'
import Head from 'next/head'
import { useState, useEffect } from 'react'
import BookingForm from '../components/BookingForm'
import { spaces } from '../data/spaces'
import Image from 'next/image'
import { Space } from '@/types'
import Calendar from '@/components/Calendar'
import Link from 'next/link'
import { useRouter } from 'next/router'

const Home: NextPage = () => {
  const router = useRouter();
  const { space: spaceId } = router.query;

  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null)
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | undefined>(undefined);

  // 當 URL 參數變化時更新選擇的空間
  useEffect(() => {
    if (spaceId && typeof spaceId === 'string') {
      setSelectedSpaceId(spaceId);
    } else {
      setSelectedSpaceId(undefined);
    }
  }, [spaceId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <Head>
        <title>長庚大學技術合作處創新育成中心 - 空間預約系統</title>
        <meta name="description" content="長庚大學技術合作處創新育成中心空間預約系統" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* 導航欄 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-shrink-0">
              <img
                src="/images/logo.png"
                alt="長庚大學 LOGO"
                className="h-10 w-auto"
              />
            </div>
            <div className="flex-grow flex justify-center">
              <h1 className="text-2xl font-semibold text-gray-900">
                技術合作處創新育成中心
              </h1>
            </div>
            <div className="flex-shrink-0 w-10">
              {/* 這是一個空的 div，用來平衡布局 */}
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {/* 標題區域 */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            空間預約系統
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            歡迎使用創新育成中心空間預約系統，請選擇您想要預約的場所並填寫相關資料。
          </p>
        </div>

        {/* 行事曆區域 */}
        <div className="mb-12">
          <Calendar selectedSpaceId={selectedSpaceId} />
        </div>

        {/* 租賃空間列表 */}
        <div className="grid grid-cols-1 gap-8">
          {/* 第一行：2個空間 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {spaces.slice(0, 2).map((space) => (
              <div
                key={space.id}
                className="bg-white rounded-lg shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-300"
                onClick={() => setSelectedSpace(space)}
              >
                <div className="relative h-48">
                  <Image
                    src={space.image}
                    alt={space.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-xl font-semibold mb-2">{space.name}</h3>
                  <p className="text-gray-600 mb-4">{space.description}</p>
                  <div className="flex justify-end">
                    <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
                      立即預約
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 第二行：3個空間 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {spaces.slice(2).map((space) => (
              <div
                key={space.id}
                className="bg-white rounded-lg shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-300"
                onClick={() => setSelectedSpace(space)}
              >
                <div className="relative h-48">
                  <Image
                    src={space.image}
                    alt={space.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-xl font-semibold mb-2">{space.name}</h3>
                  <p className="text-gray-600 mb-4">{space.description}</p>
                  <div className="flex justify-end">
                    <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
                      立即預約
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 預約表單對話框 */}
        {selectedSpace && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    預約 {selectedSpace.name}
                  </h2>
                  <button
                    onClick={() => setSelectedSpace(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <BookingForm
                  space={selectedSpace}
                  onClose={() => setSelectedSpace(null)}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default Home