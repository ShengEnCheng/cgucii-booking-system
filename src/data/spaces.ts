import { Space } from '../types/index';

export const spaces: Space[] = [
  {
    id: '1',
    name: '創新發想基地',
    description: '適合團隊討論和創意發想的空間，配備投影設備和白板',
    capacity: 20,
    image: '/images/space1.jpg',
    price: 500,
    features: ['投影設備', '白板', 'WiFi'],
    colorId: '1' // 薰衣草色
  },
  {
    id: '2',
    name: '共創空間',
    description: '開放式工作空間，適合小組討論和協作',
    capacity: 15,
    image: '/images/space2.jpg',
    price: 400,
    features: ['WiFi', '電源插座', '空調'],
    colorId: '2' // 鼠尾草色
  },
  {
    id: '3',
    name: '小會議室',
    description: '私密會議空間，適合小型會議和討論',
    capacity: 8,
    image: '/images/space3.jpg',
    price: 300,
    features: ['投影設備', 'WiFi', '空調'],
    colorId: '11' // 番茄紅（Tomato）
  },
  {
    id: '4',
    name: '多功能會議室',
    description: '多功能會議空間，可根據需求調整配置',
    capacity: 25,
    image: '/images/space4.jpg',
    price: 600,
    features: ['投影設備', '音響系統', 'WiFi', '空調'],
    colorId: '5' // 香蕉黃（Banana）
  },
  {
    id: '5',
    name: 'DEMO ROOM',
    description: '展示空間，適合產品展示和演示活動',
    capacity: 30,
    image: '/images/space1.jpg',
    price: 800,
    features: ['投影設備', '音響系統', 'WiFi', '空調', '展示櫃'],
    colorId: '5' // 香蕉色
  }
];
