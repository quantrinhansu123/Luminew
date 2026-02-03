export interface Order {
  id: number;
  order_code: string;
  customer_id: number;
  customers?: Customer;
  product_group_id?: number;
  product_groups?: ProductGroup;
  description?: string;
  quantity?: number;
  unit?: string;
  specifications?: Record<string, any>;
  unit_price?: number;
  total_amount: number;
  discount?: number;
  tax_amount?: number;
  final_amount: number;
  status: OrderStatus;
  sales_employee_id?: number;
  sales_employees?: SalesEmployee;
  order_date?: string;
  expected_delivery?: string;
  actual_delivery?: string;
  created_at?: string;
  updated_at?: string;
  payments?: Payment[];
}

export interface Customer {
  id: number;
  customer_code: string;
  full_name: string;
  phone: string;
  email?: string;
  address?: string;
  company_name?: string;
}

export interface ProductGroup {
  id: number;
  name: string;
  code: string;
  description?: string;
}

export interface SalesEmployee {
  id: number;
  employee_code: string;
  full_name: string;
  email?: string;
  phone?: string;
}

export interface Payment {
  id: number;
  payment_code: string;
  amount: number;
  payment_method?: string;
  notes?: string;
  status: PaymentStatus;
  paid_at?: string;
  created_at?: string;
}

export enum OrderStatus {
  PENDING = 'pending',
  DESIGNING = 'designing',
  APPROVED = 'approved',
  PRINTING = 'printing',
  COMPLETED = 'completed',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled'
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue'
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'Chờ xử lý',
  [OrderStatus.DESIGNING]: 'Đang thiết kế',
  [OrderStatus.APPROVED]: 'Đã duyệt',
  [OrderStatus.PRINTING]: 'Đang in',
  [OrderStatus.COMPLETED]: 'Hoàn thành',
  [OrderStatus.DELIVERED]: 'Đã giao',
  [OrderStatus.CANCELLED]: 'Đã hủy'
};

// Status transitions - must match backend
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.DESIGNING, OrderStatus.CANCELLED],
  [OrderStatus.DESIGNING]: [OrderStatus.APPROVED, OrderStatus.PENDING, OrderStatus.CANCELLED],
  [OrderStatus.APPROVED]: [OrderStatus.PRINTING, OrderStatus.DESIGNING, OrderStatus.CANCELLED],
  [OrderStatus.PRINTING]: [OrderStatus.COMPLETED, OrderStatus.APPROVED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [OrderStatus.DELIVERED, OrderStatus.PRINTING],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [OrderStatus.PENDING],
};
