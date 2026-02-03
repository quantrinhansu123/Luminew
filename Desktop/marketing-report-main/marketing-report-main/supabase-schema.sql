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

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS check_result TEXT;       -- Kết quả Check
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vandon_note TEXT;        -- Ghi chú của VĐ
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_name_1 TEXT;        -- Tên mặt hàng 1
ALTER TABLE   COLUMN IF NOT EXISTS item_qty_1 TEXT;         -- Số lượng mặt hàng 1
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_name_2 TEXT;        -- Tên mặt hàng 2
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_qty_2 TEXT;         -- Số lượng mặt hàng 2
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gift_item TEXT;          -- Quà tặng
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gift_item TEXT;          -- Quà tặng
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gift_qty TEXT;           -- Số lượng quà kèm

-- Các cột bổ sung đợt 2 (Full khớp giao diện)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_status_nb TEXT; -- Trạng thái giao hàng NB (Tách riêng)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_currency TEXT;   -- Loại tiền thanh toán
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE; -- Thời gian giao dự kiến
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_fee NUMERIC;   -- Phí xử lý đơn đóng hàng-Lưu kho(usd)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS note_caps TEXT;          -- GHI CHÚ (Viết hoa)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accounting_check_date DATE; -- Ngày Kế toán đối soát với FFM lần 2
-- reconciled_amount đã có trong comment dưới, sẽ uncomment hoặc add lại nếu cần đảm bảo
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reconciled_amount NUMERIC; -- Số tiền của đơn hàng đã về TK Cty
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_modified_by TEXT;    -- Người chỉnh sửa cuối cùng

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

-- =====================================================
-- 7. Bảng system_settings - Cấu hình hệ thống (Mới)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
    id TEXT PRIMARY KEY,
    settings JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT
);

-- Bảo mật (RLS)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON public.system_settings FOR ALL USING (true) WITH CHECK (true);

-- ROW MẶC ĐỊNH (Quan trọng: Chạy dòng này để tránh lỗi 404)
INSERT INTO public.system_settings (id, settings)
VALUES ('global_config', '{"theme": "light", "notifications": true}')
ON CONFLICT (id) DO NOTHING;

-- 12. Bảng bill_of_lading_history - Lưu lịch sử thay đổi vận đơn
CREATE TABLE IF NOT EXISTS public.bill_of_lading_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_code TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by TEXT
);

-- Function to log changes to bill_of_lading_history
CREATE OR REPLACE FUNCTION public.log_bill_of_lading_changes()
RETURNS TRIGGER AS $$
DECLARE
  current_user_name TEXT;
BEGIN
  -- Lấy tên người sửa từ cột last_modified_by của bản ghi MỚI
  current_user_name := NEW.last_modified_by;
  
  -- Nếu không tìm thấy, thử lấy từ context hoặc để Unknown
  IF current_user_name IS NULL THEN
     current_user_name := 'Unknown';
  END IF;

  INSERT INTO public.bill_of_lading_history (order_code, old_data, new_data, changed_by)
  VALUES (
    NEW.order_code, 
    to_jsonb(OLD), 
    to_jsonb(NEW), 
    current_user_name
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute the function on update
DROP TRIGGER IF EXISTS on_bill_of_lading_change ON public.orders;
CREATE TRIGGER on_bill_of_lading_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_bill_of_lading_changes();

-- =====================================================
-- 13. Bảng sales_order_logs - Lưu lịch sử thay đổi Sale & Order
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sales_order_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_code TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by TEXT
);

-- Bảo mật
ALTER TABLE public.sales_order_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON public.sales_order_logs FOR ALL USING (true) WITH CHECK (true);

-- Function to log changes to sales_order_logs
CREATE OR REPLACE FUNCTION public.log_sales_order_changes()
RETURNS TRIGGER AS $$
DECLARE
  current_user_name TEXT;
BEGIN
  current_user_name := NEW.last_modified_by;
  IF current_user_name IS NULL THEN
     current_user_name := 'Unknown';
  END IF;

  INSERT INTO public.sales_order_logs (order_code, old_data, new_data, changed_by)
  VALUES (
    NEW.order_code, 
    to_jsonb(OLD), 
    to_jsonb(NEW), 
    current_user_name
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for Sales Order Logs (Separate from Bill of Lading if needed, or shared?)
-- CAUTION: If we have multiple triggers on the same table, they all fire. 
-- Since `orders` is ONE table, splitting logs by "logic" is hard unless we filter columns.
-- For now, we will create a SECOND trigger that looks identical but writes to a different table?
-- That would duplicate logs.
-- BETTER QUERY: Does the user want EXACTLY the same logs but in a different table?
-- OR just a different VIEW of the same logs?
-- The user said: "làm bảng database sales_order_logs ghi log về thay đổi quả phần này"
-- "trong thẻ lịch sử thay đổi sale order"
-- It implies a separate log table, perhaps for separation of concerns or permissioning later.
-- I will implement as requested: separate table, separate trigger (even if redundant for now).

DROP TRIGGER IF EXISTS on_sales_order_change ON public.orders;
CREATE TRIGGER on_sales_order_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_sales_order_changes();

-- =====================================================
-- 14. Bảng marketing_pages - Danh sách Page Marketing
-- =====================================================
CREATE TABLE IF NOT EXISTS public.marketing_pages (
  id TEXT PRIMARY KEY,
  page_name TEXT,
  mkt_staff TEXT,
  product TEXT,
  market TEXT,
  pancake_id TEXT,
  page_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bảo mật
ALTER TABLE public.marketing_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON public.marketing_pages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all read" ON public.marketing_pages FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON public.marketing_pages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.marketing_pages FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON public.marketing_pages FOR DELETE USING (true);

-- =====================================================
-- 15. Bảng cskh_crm_logs - Lưu lịch sử thay đổi CSKH & CRM
-- =====================================================
CREATE TABLE IF NOT EXISTS public.cskh_crm_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_code TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by TEXT
);

-- Bảo mật
ALTER TABLE public.cskh_crm_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON public.cskh_crm_logs FOR ALL USING (true) WITH CHECK (true);

-- Function to log changes to cskh_crm_logs
CREATE OR REPLACE FUNCTION public.log_cskh_crm_changes()
RETURNS TRIGGER AS $$
DECLARE
  current_user_name TEXT;
BEGIN
  current_user_name := NEW.last_modified_by;
  IF current_user_name IS NULL THEN
     current_user_name := 'Unknown';
  END IF;

  INSERT INTO public.cskh_crm_logs (order_code, old_data, new_data, changed_by)
  VALUES (
    NEW.order_code, 
    to_jsonb(OLD), 
    to_jsonb(NEW), 
    current_user_name
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for CSKH CRM Logs
DROP TRIGGER IF EXISTS on_cskh_crm_change ON public.orders;
CREATE TRIGGER on_cskh_crm_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_cskh_crm_changes();
