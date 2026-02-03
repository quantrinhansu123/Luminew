export interface Store {
  id: string;
  name: string;
  partnerId?: string; // ID đối tác liên kết
  storeType?: 'own' | 'partner'; // Loại cửa hàng: 'own' = của mình, 'partner' = đối tác phụ trách
  personnelIds?: string[]; // Danh sách ID nhân sự phụ trách
}

export interface LiveReport {
  id?: string;
  date: string; // Ngày tháng
  channelId: string; // KÊNH LIVE (Store ID)
  startTime: string; // Thời gian bắt đầu
  endTime: string; // Thời gian kết thúc
  hostName: string; // Hostlive
  duration: string; // Thời gian live (formatted HH:mm or minutes)
  gmv: number; // GMV (Doanh số)
  totalGmv: number; // Tổng GMV (Total transaction)
  adCost: number; // Chi phí quảng cáo

  // New fields
  conversionRate?: number; // 转化率 Tỉ lệ chuyển đổi (%)
  averagePrice?: number; // 平均价格 Giá trung bình
  productClickRate?: number; // 点击率 Tỉ lệ lượt nhấp vào sản phẩm (%)
  ctr?: number; // 进房率 CTR (%)
  gpm?: number; // 直播千次金额 GPM
  orders?: number; // 订单数 Số lượt bán
  viewers?: number; // 场观人数 Số người xem
  totalViews?: number; // 直播观看次数 Số lượt xem
  avgWatchTime?: string; // 平均观看时长 Thời gian xem TB
  productClicks?: number; // 产品点击次数 Lượt nhấp sản phẩm
  newFollowers?: number; // 关注人数 FL mới
  reporter?: string; // NGƯỜI BÁO CÁO
  shift?: 'Sáng' | 'Chiều' | 'Tối'; // Ca làm việc
  customerGroup?: string; // Nhóm khách hàng
  source?: string; // Nguồn tới
  salesPerson?: string; // Nhân viên sale
  callCount?: number; // Lần gọi
  status?: string; // Trạng thái
}

export interface Personnel {
  id?: string;
  fullName: string; // hovaten
  department: string; // phongban
  position: string; // vitri
  phoneNumber: string; // sdt
  email?: string; // email login
  password?: string; // password login
  role?: 'admin' | 'user' | 'partner'; // role
  baseSalary?: number; // Lương cứng (mặc định)
  monthlyKPITarget?: number; // Mục tiêu KPI theo tháng mặc định (doanh số)
  monthlySalary?: Record<string, number>; // Lương cứng theo từng tháng (key: YYYY-MM, value: lương)
  monthlyKPI?: Record<string, number>; // KPI theo từng tháng (key: YYYY-MM, value: KPI target)
  weeklyKPI?: Record<string, number>; // KPI theo từng tuần (key: YYYY-WW, value: KPI target)
  allowedMenuIds?: string[]; // Danh sách menu items mà nhân sự này có thể xem (override menu-level permissions)
}

export interface KPIAssignment {
  id?: string;
  personnelId: string;
  personnelName: string;
  periodType: 'month' | 'week'; // Loại kỳ: tháng hoặc tuần
  periodKey: string; // YYYY-MM cho tháng, YYYY-WW cho tuần
  kpiTarget: number; // Mục tiêu KPI
  assignedAt?: string; // Ngày giao
  assignedBy?: string; // Người giao
  notes?: string; // Ghi chú
}

export interface AdShiftData {
  id: string;
  date: string;
  shift: 'Sáng' | 'Chiều' | 'Tối';
  storeId: string;
  gmv: number;
  adCost: number;
  orders: number;
  viewCount: number;
}

export interface HostRevenue {
  id: string;
  name: string;
  storeId: string;
  revenue: Record<string, number>;
}

export interface VideoMetric {
  id: string;
  title: string; // 视频名称
  storeId: string;
  platform: 'TikTok' | 'Facebook' | 'Shopee';
  uploadDate: string; // 发布时间 (YYYY-MM-DD hoặc YYYY-MM-DD HH:mm)
  uploadTime?: string; // Giờ phút upload (HH:mm) - tách riêng để dễ xử lý
  duration?: string; // 时长 (ví dụ: "37s", "2m30s")
  views: number; // 观看人次
  personInCharge: string; // NGƯỜI PHỤ TRÁCH / 负责人
  sales: number; // GMV
  directGMV?: number; // 直接 GMV
  orders?: number; // 成交件数
  clickRate?: number; // 点击率 (%)
  watchRate?: number; // 完播率 (%)
  newFollowers?: number; // 新增粉丝数
  productId?: string; // 商品 ID
  host?: string; // HOST / 主播配合
}

export interface VideoConfigItem {
  id: string;
  category: string;
  format?: string;
  formula: string;
  sourceType: 'manual' | 'excel' | 'formula';
}

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
}

export enum ReportType {
  DASHBOARD = 'dashboard',
  LIVE_ADS = 'live_ads',
  VIDEO_PARAM = 'video_param',
  STORE_MGR = 'store_mgr',
  PERSONNEL = 'personnel',
  CPQC = 'cpqc',
  SALARY_REPORT = 'salary_report',
  PARTNER = 'partner',
}

export interface CPQCData {
  id: string;
  date: string;
  shift: 'Sáng' | 'Chiều' | 'Tối';
  storeId: string;
  hostName: string;
  adCost: number; // Chi phí QC
  gmv: number;
  orders: number;
  conversionRate: number; // Tỉ lệ chuyển đổi
  roi: number; // ROI
}

export interface StoreOverview {
  storeId: string;
  storeName: string;
  totalGMV: number;
  totalAdCost: number;
  totalOrders: number;
  totalViews: number;
  roi: number;
  conversionRate: number;
  reportCount: number;
}

export interface Partner {
  id?: string;
  name: string; // Tên đối tác
  code?: string; // Mã đối tác (tự động tạo)
  type: 'Supplier' | 'Service' | 'Platform' | 'Other' | '代运营' | '合伙'; // Loại đối tác
  contactPerson: string; // Người liên hệ
  phoneNumber: string; // Số điện thoại
  email?: string; // Email (dùng làm tài khoản)
  password?: string; // Mật khẩu (tự động tạo)
  address?: string; // Địa chỉ
  storeIds?: string[]; // Danh sách ID cửa hàng liên kết
  notes?: string; // Ghi chú
  status: 'Active' | 'Inactive'; // Trạng thái
  createdAt?: string; // Ngày tạo
  updatedAt?: string; // Ngày cập nhật
}

export type UserRole = 'admin' | 'partner' | 'employee'; // Admin, Đối tác, Nhân viên

export interface MenuPermission {
  menuId: string; // ID của menu item
  allowedRoles: UserRole[]; // Danh sách role được phép truy cập
  allowedDepartments?: string[]; // Danh sách phòng ban được phép truy cập (cho employee)
}