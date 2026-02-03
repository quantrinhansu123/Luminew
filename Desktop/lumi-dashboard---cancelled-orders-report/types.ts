
export interface LumiOrder {
  "Mã Đơn": string;
  "Ngày": string;
  "Sản phẩm": string;
  "Mặt hàng": string;
  "Thị trường": string;
  "Khu vực": string;
  "Nhân viên": string;
  "Team": string;
  "Trạng thái": string;
  "Lý do hủy": string;
  "Doanh số": number;
  "Số lượng": number;
}

export interface DashboardFilters {
  startDate: string;
  endDate: string;
  product: string;
  market: string;
  staff: string;
  team: string;
}

export interface Stats {
  totalOrders: number;
  totalRevenue: number;
  cancelledCount: number;
  cancelledRevenue: number;
  cancellationRate: number;
}
