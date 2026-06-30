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
  department: string;
  departmentName: string;
  startTime: string;
  endTime: string;
  unit: string;
  purpose: string;
  attendees: number;
} 
