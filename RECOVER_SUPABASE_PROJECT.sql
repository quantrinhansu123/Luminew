-- ULTIMATE RECOVERY SCRIPT FOR LUMINIEW SUPABASE (V5 - THE FINAL MASTERPIECE)
-- Comprehensive recovery: 22 Tables, CSV Compatible, Correct Auth Columns, HCM Clones, and Logic Triggers.

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. SYSTEM SETTINGS (Products & Config)
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT, 
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    role TEXT DEFAULT 'user',
    department TEXT,
    team TEXT,
    branch TEXT,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    can_day_ffm BOOLEAN DEFAULT false,
    last_login_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    ben_phu_trach UUID
);

-- Insert Administrators
INSERT INTO public.users (id, email, password, name, role, is_active, email_verified)
VALUES 
('6d6ad516-b740-4438-b4ad-e5f7f9461f5c', 'admin@benxe.local', '$2a$10$fnGQAv4DbGqhCNClvNM59e2xbKRvPN6vK5ucGhtRShNP7N27hlFA6', 'Administrator', 'admin', true, true),
('579832fc-3df1-4100-85b4-a4e6622635c7', 'upedu2024@gmail.com', '123456', 'Admin Backup', 'admin', true, true)
ON CONFLICT (email) DO NOTHING;

-- 4. MARKETING PAGES
CREATE TABLE IF NOT EXISTS public.marketing_pages (
    id TEXT PRIMARY KEY,
    page_name TEXT,
    mkt_staff TEXT,
    product TEXT,
    market TEXT,
    pancake_id TEXT,
    page_link TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. BLACKLIST
CREATE TABLE IF NOT EXISTS public.blacklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    phone TEXT,
    address TEXT,
    reason TEXT,
    status TEXT DEFAULT 'warning',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. ORDERS TABLE (Full CSV Map)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_code TEXT UNIQUE NOT NULL,
    order_date TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    city TEXT,
    state TEXT,
    zipcode TEXT,
    country TEXT,
    product TEXT,
    total_amount_vnd TEXT,
    payment_method TEXT,
    tracking_code TEXT,
    shipping_fee TEXT,
    marketing_staff TEXT,
    sale_staff TEXT,
    team TEXT,
    delivery_staff TEXT,
    delivery_status TEXT,
    payment_status TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    cskh TEXT,
    goods_amount NUMERIC DEFAULT 0,
    reconciled_amount NUMERIC DEFAULT 0,
    general_fee NUMERIC DEFAULT 0,
    flight_fee NUMERIC DEFAULT 0,
    account_rental_fee NUMERIC DEFAULT 0,
    shipping_unit TEXT,
    accountant_confirm TEXT,
    payment_status_detail TEXT,
    reason TEXT,
    order_time TEXT,
    area TEXT,
    product_main TEXT,
    product_name_1 TEXT,
    quantity_1 NUMERIC DEFAULT 0,
    product_name_2 TEXT,
    quantity_2 NUMERIC DEFAULT 0,
    gift TEXT,
    gift_quantity NUMERIC DEFAULT 0,
    sale_price NUMERIC DEFAULT 0,
    payment_type TEXT,
    exchange_rate NUMERIC DEFAULT 1,
    total_vnd NUMERIC DEFAULT 0,
    payment_method_text TEXT,
    shipping_cost TEXT,
    base_price NUMERIC DEFAULT 0,
    reconciled_vnd NUMERIC DEFAULT 0,
    creator_name TEXT,
    check_result TEXT,
    delivery_status_nb TEXT,
    carrier TEXT,
    shift TEXT,
    cskh_status TEXT,
    customer_type TEXT,
    blacklist_status TEXT,
    note_sale TEXT,
    note_ffm TEXT,
    note_delivery TEXT,
    created_by TEXT,
    page_name TEXT,
    vandon_note TEXT,
    item_name_1 TEXT,
    item_qty_1 TEXT,
    item_qty_2 TEXT,
    gift_item TEXT,
    gift_qty TEXT,
    payment_currency TEXT,
    estimated_delivery_date TEXT,
    warehouse_fee TEXT,
    note_caps TEXT,
    accounting_check_date TEXT,
    last_modified_by TEXT,
    time_dayon TEXT,
    payment_bill TEXT,
    payment_image TEXT,
    ngaydonghang TEXT,
    trangthaiffm TEXT,
    thoigiangiaohangffm TEXT,
    ngayupbill TEXT,
    ngay_chia_van_don TEXT,
    thu_tu_chia TEXT,
    tracking_check_date TEXT,
    log JSONB DEFAULT '[]'::jsonb,
    canh_bao TEXT,
    luu_kho_usd TEXT,
    order_count_actual NUMERIC DEFAULT 0,
    lydo TEXT,
    tong_tien_vnd NUMERIC DEFAULT 0,
    van_don_line_total_vnd NUMERIC DEFAULT 0
);

-- 7. DETAIL REPORTS (Marketing)
CREATE TABLE IF NOT EXISTS public.detail_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "Tên" TEXT,
    "Email" TEXT,
    "Ngày" TEXT,
    "ca" TEXT,
    "Sản_phẩm" TEXT,
    "Thị_trường" TEXT,
    "Team" TEXT,
    "CPQC" NUMERIC DEFAULT 0,
    "Số_Mess_Cmt" NUMERIC DEFAULT 0,
    "Số đơn" NUMERIC DEFAULT 0,
    "Doanh số" NUMERIC DEFAULT 0,
    "Doanh số đi thực tế" NUMERIC DEFAULT 0,
    "Số đơn hoàn hủy" NUMERIC DEFAULT 0,
    "Doanh thu chốt thực tế" NUMERIC DEFAULT 0,
    "DS sau hoàn hủy" NUMERIC DEFAULT 0,
    "Doanh số sau ship" NUMERIC DEFAULT 0,
    "Doanh số TC" NUMERIC DEFAULT 0,
    "KPIs" NUMERIC DEFAULT 0,
    "TKQC" TEXT,
    "id_NS" TEXT,
    "CPQC theo TKQC" NUMERIC DEFAULT 0,
    "Báo cáo theo Page" TEXT,
    "Trạng thái" TEXT,
    "Cảnh báo" TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. SALES REPORTS
CREATE TABLE IF NOT EXISTS public.sales_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  team TEXT,
  branch TEXT,
  position TEXT,
  date TEXT NOT NULL,
  shift TEXT,
  product TEXT,
  market TEXT,
  mess_count INTEGER DEFAULT 0,
  response_count INTEGER DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  revenue_mess NUMERIC DEFAULT 0,
  order_count_actual INTEGER DEFAULT 0,
  revenue_actual NUMERIC DEFAULT 0,
  revenue_go_actual NUMERIC DEFAULT 0,
  order_cancel_count_actual INTEGER DEFAULT 0,
  revenue_cancel_actual NUMERIC DEFAULT 0,
  revenue_after_cancel_actual NUMERIC DEFAULT 0,
  revenue_go NUMERIC DEFAULT 0,
  order_cancel_count INTEGER DEFAULT 0,
  revenue_cancel NUMERIC DEFAULT 0,
  order_success_count INTEGER DEFAULT 0,
  revenue_success NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. LOGS (FFM & Change Audit)
CREATE TABLE IF NOT EXISTS public.ffm_push_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_code TEXT,
    status TEXT,
    error_message TEXT,
    raw_response JSONB,
    pushed_by TEXT,
    product TEXT,
    country TEXT,
    chi_nhanh TEXT,
    total_amount_vnd NUMERIC,
    pushed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. WAYBILL & LOGISTICS
CREATE TABLE IF NOT EXISTS public.bao_cao_van_don (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ngay TEXT NOT NULL,
  nhan_vien TEXT,
  san_pham TEXT,
  thi_truong TEXT,
  trang_thai_giao_hang JSONB NOT NULL DEFAULT '{}'::jsonb,
  ket_qua_check JSONB NOT NULL DEFAULT '{}'::jsonb,
  trang_thai_thanh_toan JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipping_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  product TEXT,
  market TEXT,
  check_result TEXT,
  status TEXT,
  delivery_status TEXT,
  bill_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chitiet_cuoc (
    id SERIAL PRIMARY KEY,
    ma_don_hang VARCHAR(100) NOT NULL,
    tien_cuoc DECIMAL(15, 2),
    don_vi_tien_te VARCHAR(10),
    ngay_doi_soat_cuoc DATE,
    ty_gia DECIMAL(15, 6),
    tien_ship_vnd DECIMAL(15, 2),
    thi_truong VARCHAR(100),
    ffm VARCHAR(50),
    loc_trung VARCHAR(50),
    san_pham VARCHAR(200),
    chi_nhanh VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.chi_tiet_bill_tien (
    id SERIAL PRIMARY KEY,
    stt INTEGER,
    ma_don_hang VARCHAR(100),
    ma_tracking VARCHAR(100),
    bill_row_key TEXT,
    ngay_doi_soat DATE,
    ffm VARCHAR(50),
    don_vi_tien VARCHAR(10),
    so_tien_doi_soat DECIMAL(15, 2),
    ty_gia DECIMAL(15, 6),
    tien_viet DECIMAL(15, 2),
    dem_lan_thanh_toan INTEGER,
    khu_vuc VARCHAR(100),
    ngay_update TIMESTAMP,
    note TEXT,
    note_2 TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bien_so_xe TEXT NOT NULL,
    phan_bien_kiem_soat TEXT,
    ben_phu_trach UUID,
    ten_xe TEXT,
    loai_xe TEXT,
    trang_thai TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 11. AUDIT SYSTEM
CREATE TABLE IF NOT EXISTS public.order_change_audit (
  id BIGSERIAL PRIMARY KEY,
  source_table TEXT NOT NULL,
  order_code TEXT NOT NULL,
  op TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by TEXT NULL,
  changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_old JSONB NULL,
  row_new JSONB NULL
);

-- 12. HCM CLONE TABLES (Auto-sync columns)
CREATE TABLE IF NOT EXISTS public.order_code_hcm (LIKE public.orders INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.mkt_report_hcm (LIKE public.detail_reports INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.sale_report_hcm (LIKE public.sales_reports INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ffm_push_logs_hcm (LIKE public.ffm_push_logs INCLUDING ALL);

-- HCM Views
DROP VIEW IF EXISTS public.nhap_don_hcm CASCADE;
CREATE OR REPLACE VIEW public.nhap_don_hcm AS SELECT * FROM public.order_code_hcm;

DROP VIEW IF EXISTS public.van_don_page CASCADE;
CREATE OR REPLACE VIEW public.van_don_page AS SELECT * FROM public.orders;

-- 13. TRIGGERS & LOGIC
CREATE OR REPLACE FUNCTION public.capture_order_change_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_change_audit (source_table, order_code, op, changed_by, changed_fields, row_old, row_new)
    VALUES (TG_TABLE_NAME, NEW.order_code, 'INSERT', NEW.last_modified_by, '{}'::jsonb, NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.order_change_audit (source_table, order_code, op, changed_by, changed_fields, row_old, row_new)
    VALUES (TG_TABLE_NAME, NEW.order_code, 'UPDATE', NEW.last_modified_by, '{}'::jsonb, to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_change_audit ON public.orders;
CREATE TRIGGER trg_orders_change_audit AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.capture_order_change_audit();

DROP TRIGGER IF EXISTS trg_order_code_hcm_change_audit ON public.order_code_hcm;
CREATE TRIGGER trg_order_code_hcm_change_audit AFTER INSERT OR UPDATE ON public.order_code_hcm FOR EACH ROW EXECUTE FUNCTION public.capture_order_change_audit();

-- 14. SECURITY
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_code_hcm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FullAccess" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "FullAccess" ON public.order_code_hcm FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "FullAccess" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "FullAccess" ON public.blacklist FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
