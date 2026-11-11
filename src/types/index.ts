export interface Space {
  id: string;
  name: string;
  description: string;
  image: string;
  capacity: number;
  price: number;
  features: string[];
  colorId?: string; // Google Calendar 顏色 ID
  disabled?: boolean;
}

export interface BookingFormData {
  name: string;
  email: string;
  phone: string;
  /** 申請單位類別（選單值） */
  department: string;
  /** 單位／公司／系所完整名稱 */
  departmentName: string;
  date: string;
  startTime: string;
  endTime: string;
  /** 預估參加人數（表單以字串保存，送出前才轉數字） */
  participants: string;
  purpose: string;
}

