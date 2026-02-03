-- =====================================================
-- Supabase Schema cho MKT Report App
-- Chạy script này trong Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. Bảng users - Quản lý người dùng
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'leader', 'user')),
  team TEXT,
  department TEXT,
  position TEXT,
  branch TEXT,
  shift TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- 2. Bảng human_resources - Dữ liệu nhân sự
CREATE TABLE IF NOT EXISTS public.human_resources (
  id TEXT PRIMARY KEY,
  "Họ Và Tên" TEXT NOT NULL,
  email TEXT,
  "Bộ phận" TEXT,
  "Team" TEXT,
  "Vị trí" TEXT,
  "chi nhánh" TEXT,
  "Ca" TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  "Ngày vào làm" DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- 3. Bảng detail_reports - Báo cáo chi tiết
CREATE TABLE IF NOT EXISTS public.detail_reports (
  id TEXT PRIMARY KEY,
  "Tên" TEXT,
  "Email" TEXT,
  "Ngày" DATE,
  ca TEXT,
  "Sản_phẩm" TEXT,
  "Thị_trường" TEXT,
  "Team" TEXT,
  "CPQC" NUMERIC DEFAULT 0,
  "Số_Mess_Cmt" INTEGER DEFAULT 0,
  "Số đơn" INTEGER DEFAULT 0,
  "Doanh số" NUMERIC DEFAULT 0,
  "DS sau hoàn hủy" NUMERIC DEFAULT 0,
  "Số đơn hoàn hủy" INTEGER DEFAULT 0,
  "Doanh số sau ship" NUMERIC DEFAULT 0,
  "Doanh số TC" NUMERIC DEFAULT 0,
  "KPIs" NUMERIC DEFAULT 0,
  "Số đơn thực tế" INTEGER DEFAULT 0,
  "Doanh thu chốt thực tế" NUMERIC DEFAULT 0,
  "Doanh số hoàn hủy thực tế" NUMERIC DEFAULT 0,
  "Số đơn hoàn hủy thực tế" INTEGER DEFAULT 0,
  "Doanh số sau hoàn hủy thực tế" NUMERIC DEFAULT 0,
  "Doanh số đi thực tế" NUMERIC DEFAULT 0,
  -- Các cột mới bổ sung cho Báo Cáo Marketing
  "TKQC" TEXT,
  "id_NS" TEXT,
  "CPQC theo TKQC" NUMERIC DEFAULT 0,
  "Báo cáo theo Page" TEXT,
  "Trạng thái" TEXT,
  "Cảnh báo" TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bổ sung cột nếu bảng đã tồn tại (Migration)
ALTER TABLE public.detail_reports ADD COLUMN IF NOT EXISTS "TKQC" TEXT;
ALTER TABLE public.detail_reports ADD COLUMN IF NOT EXISTS "id_NS" TEXT;
ALTER TABLE public.detail_reports ADD COLUMN IF NOT EXISTS "CPQC theo TKQC" NUMERIC DEFAULT 0;
ALTER TABLE public.detail_reports ADD COLUMN IF NOT EXISTS "Báo cáo theo Page" TEXT;
ALTER TABLE public.detail_reports ADD COLUMN IF NOT EXISTS "Trạng thái" TEXT;
ALTER TABLE public.detail_reports ADD COLUMN IF NOT EXISTS "Cảnh báo" TEXT;

-- 4. Bảng reports - Báo cáo tổng hợp
CREATE TABLE IF NOT EXISTS public.reports (
  id TEXT PRIMARY KEY,
  email TEXT,
  team TEXT,
  date DATE,
  status TEXT DEFAULT 'pending',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Bảng orders - Đơn hàng (Migrate từ Firebase F3)
-- 1. Tạo bảng Orders với đầy đủ tất cả cột (bao gồm cột bổ sung)
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_code TEXT UNIQUE,  -- Quan trọng: Đã thêm UNIQUE ở đây
  order_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Thông tin khách hàng
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  city TEXT,
  state TEXT,
  zipcode TEXT,
  country TEXT,

  -- Thông tin đơn hàng & sản phẩm
  product TEXT,
  total_amount_vnd NUMERIC,
  payment_method TEXT,
  tracking_code TEXT,
  shipping_fee NUMERIC,

  -- Thông tin nhân viên & team
  marketing_staff TEXT,
  sale_staff TEXT,
  team TEXT,
  delivery_staff TEXT,  -- Mới
  cskh TEXT,            -- Mới

  -- Trạng thái & Ghi chú
  delivery_status TEXT,
  payment_status TEXT,
  note TEXT,
  reason TEXT,          -- Mới
  payment_status_detail TEXT, -- Mới

  -- Các phí và thông tin khác (Mới bổ sung từ F3)
  goods_amount NUMERIC,
  reconciled_amount NUMERIC,
  general_fee NUMERIC,
  flight_fee NUMERIC,
  account_rental_fee NUMERIC,
  cutoff_time TEXT,
  shipping_unit TEXT,
  accountant_confirm TEXT
);

-- 2. Bật Row Level Security (Bảo mật)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 3. Tạo Policy cho phép xem/thêm/sửa/xóa thoải mái (Development)
CREATE POLICY "Allow all access" ON public.orders FOR ALL USING (true) WITH CHECK (true);

-- 4. Tạo Index để tìm kiếm nhanh hơn
CREATE INDEX IF NOT EXISTS idx_orders_order_code ON public.orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_date ON public.orders(order_date);

-- =====================================================
-- Indexes để tăng hiệu suất truy vấn
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_team ON public.users(team);

CREATE INDEX IF NOT EXISTS idx_hr_email ON public.human_resources(email);
CREATE INDEX IF NOT EXISTS idx_hr_team ON public.human_resources("Team");
CREATE INDEX IF NOT EXISTS idx_hr_status ON public.human_resources(status);

CREATE INDEX IF NOT EXISTS idx_detail_reports_email ON public.detail_reports("Email");
CREATE INDEX IF NOT EXISTS idx_detail_reports_date ON public.detail_reports("Ngày");
CREATE INDEX IF NOT EXISTS idx_detail_reports_team ON public.detail_reports("Team");

CREATE INDEX IF NOT EXISTS idx_reports_email ON public.reports(email);
CREATE INDEX IF NOT EXISTS idx_reports_date ON public.reports(date);
CREATE INDEX IF NOT EXISTS idx_reports_team ON public.reports(team);

CREATE INDEX IF NOT EXISTS idx_orders_order_code ON public.orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_marketing_staff ON public.orders(marketing_staff);
CREATE INDEX IF NOT EXISTS idx_orders_sale_staff ON public.orders(sale_staff);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON public.orders(order_date);

-- =====================================================
-- Row Level Security (RLS) - Bảo mật theo hàng
-- =====================================================

-- Bật RLS cho tất cả bảng
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detail_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. Cập nhật bảng orders (Thêm các cột thiếu từ F3)
-- =====================================================
-- Run manually if table already exists
/*
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cskh TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_staff TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS goods_amount NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reconciled_amount NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS general_fee NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS flight_fee NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS account_rental_fee NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cutoff_time TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_unit TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accountant_confirm TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status_detail TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reason TEXT;
*/

-- Policy cho phép đọc tất cả (có thể điều chỉnh sau)
CREATE POLICY "Allow all read access" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow all read access" ON public.human_resources FOR SELECT USING (true);
CREATE POLICY "Allow all read access" ON public.detail_reports FOR SELECT USING (true);
CREATE POLICY "Allow all read access" ON public.reports FOR SELECT USING (true);
CREATE POLICY "Allow all read access" ON public.orders FOR SELECT USING (true);

-- Policy cho phép insert/update/delete với anon key (development)
CREATE POLICY "Allow all insert" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.users FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON public.users FOR DELETE USING (true);

CREATE POLICY "Allow all insert" ON public.human_resources FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.human_resources FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON public.human_resources FOR DELETE USING (true);

CREATE POLICY "Allow all insert" ON public.detail_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.detail_reports FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON public.detail_reports FOR DELETE USING (true);

CREATE POLICY "Allow all insert" ON public.reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.reports FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON public.reports FOR DELETE USING (true);

CREATE POLICY "Allow all insert" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.orders FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON public.orders FOR DELETE USING (true);

-- =====================================================
-- Hoàn thành!
-- =====================================================
SELECT 'Schema đã được tạo thành công!' as message;
