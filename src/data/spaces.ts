import { Space } from '../types/index'

// 圖片統一使用 webp（原 jpg 已轉檔並移除，總大小由約 1.4MB 降至約 180KB）。
// blurDataURL 是 16px 寬的極小預覽圖（約 150 bytes），讓圖片載入前有顏色過渡。
export const spaces: Space[] = [
  {
    id: '1',
    name: '創新發想基地',
    description: '適合團隊討論和創意發想的空間，配備投影設備和白板',
    capacity: 20,
    image: '/images/space1.webp',
    blurDataURL:
      'data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAADwAQCdASoQAAgAA4BaJZQAAuspHJS/eAAA/uboW3lvezMsMB4R3q1oJMQMwR3k7U1FtydGnik/N7mnrInJpxjqoTAhUvklAAA=',
    price: 500,
    features: ['投影設備', '白板', 'WiFi'],
    colorId: '1', // 薰衣草色
  },
  {
    id: '2',
    name: '共創空間',
    description: '開放式工作空間，適合小組討論和協作',
    capacity: 15,
    image: '/images/space2.webp',
    blurDataURL:
      'data:image/webp;base64,UklGRlgAAABXRUJQVlA4IEwAAADQAQCdASoQAAkAA4BaJQBOgB9DqjVl8ADyp4S6fpRgDKjALjocz8FD1zZdSdclS4JaBSZzl8+P4FMTE97pDX16k01/R7SXlAXGUiAA',
    price: 400,
    features: ['WiFi', '電源插座', '空調'],
    colorId: '2', // 鼠尾草色
  },
  {
    id: '3',
    name: '小會議室',
    description: '私密會議空間，適合小型會議和討論',
    capacity: 8,
    image: '/images/space3.webp',
    blurDataURL:
      'data:image/webp;base64,UklGRmAAAABXRUJQVlA4IFQAAAAQAgCdASoQAAkAA4BaJQBOgCMCSUuSig8AAP7T5NQcUNDQDd403zbDeoOLs0Y4orRZFWnr1YEmUcggsQt3vU98YbxEy2NpW8Gr6gnDvK6USc5rsAA=',
    price: 300,
    features: ['投影設備', 'WiFi', '空調'],
    colorId: '11', // 番茄紅（Tomato）
  },
  {
    id: '4',
    name: '多功能會議室',
    description: '多功能會議空間，可根據需求調整配置',
    capacity: 25,
    image: '/images/space4.webp',
    blurDataURL:
      'data:image/webp;base64,UklGRkgAAABXRUJQVlA4IDwAAADQAQCdASoQAAkAA4BaJaQAAp2XLLnVaADhOOf9Sr+b7EBo5y8xZPxeeYIZAFTBDc0r1AZjfKV0FbAAAAA=',
    price: 600,
    features: ['投影設備', '音響系統', 'WiFi', '空調'],
    colorId: '5', // 香蕉黃（Banana）
  },
  {
    id: '5',
    name: 'DEMO ROOM',
    description: '展示空間，適合產品展示和演示活動',
    capacity: 30,
    image: '/images/space1.webp',
    blurDataURL:
      'data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAADwAQCdASoQAAgAA4BaJZQAAuspHJS/eAAA/uboW3lvezMsMB4R3q1oJMQMwR3k7U1FtydGnik/N7mnrInJpxjqoTAhUvklAAA=',
    price: 800,
    features: ['投影設備', '音響系統', 'WiFi', '空調', '展示櫃'],
    colorId: '17', // 葡萄柚
  },
]
