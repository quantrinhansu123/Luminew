-- =====================================================
-- Tạo bảng sales_reports - Báo Cáo Sale
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sales_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Thông tin nhân viên
  name TEXT NOT NULL,           -- Tên
  email TEXT,                   -- Email
  team TEXT,                    -- Team
  branch TEXT,                  -- Chi nhánh
  position TEXT,                -- Chức vụ
  
  -- Thông tin báo cáo
  date DATE NOT NULL,           -- Ngày
  shift TEXT,                   -- Ca
  product TEXT,                 -- Sản phẩm
  market TEXT,                  -- Thị trường
  
  -- Số liệu báo cáo (theo tên cột từ Google Sheets)
  mess_count INTEGER DEFAULT 0,              -- Số Mess
  response_count INTEGER DEFAULT 0,          -- Phản hồi
  order_count INTEGER DEFAULT 0,             -- Đơn Mess
  revenue_mess NUMERIC DEFAULT 0,            -- Doanh số Mess
  
  -- Số liệu thực tế
  order_count_actual INTEGER DEFAULT 0,      -- Số đơn thực tế
  revenue_actual NUMERIC DEFAULT 0,          -- Doanh thu chốt thực tế
  revenue_go_actual NUMERIC DEFAULT 0,       -- Doanh số đi thực tế
  order_cancel_count_actual INTEGER DEFAULT 0,   -- Số đơn hoàn hủy thực tế
  revenue_cancel_actual NUMERIC DEFAULT 0,       -- Doanh số hoàn hủy thực tế
  revenue_after_cancel_actual NUMERIC DEFAULT 0, -- Doanh số sau hoàn hủy thực tế
  
  -- Số liệu khác (nếu có từ Google Sheets)
  revenue_go NUMERIC DEFAULT 0,              -- Doanh số đi
  order_cancel_count INTEGER DEFAULT 0,      -- Số đơn Hoàn huỷ
  revenue_cancel NUMERIC DEFAULT 0,          -- Doanh số hoàn huỷ
  order_success_count INTEGER DEFAULT 0,     -- Số đơn thành công
  revenue_success NUMERIC DEFAULT 0,         -- Doanh số thành công
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- =====================================================
-- Indexes để tăng hiệu suất truy vấn
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sales_reports_date ON public.sales_reports(date);
CREATE INDEX IF NOT EXISTS idx_sales_reports_email ON public.sales_reports(email);
CREATE INDEX IF NOT EXISTS idx_sales_reports_team ON public.sales_reports(team);
CREATE INDEX IF NOT EXISTS idx_sales_reports_name ON public.sales_reports(name);
CREATE INDEX IF NOT EXISTS idx_sales_reports_branch ON public.sales_reports(branch);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================
ALTER TABLE public.sales_reports ENABLE ROW LEVEL SECURITY;

-- Drop policy nếu đã tồn tại, sau đó tạo mới
DROP POLICY IF EXISTS "Allow all access" ON public.sales_reports;

-- Policy cho phép tất cả thao tác (development mode)
CREATE POLICY "Allow all access" ON public.sales_reports 
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- Trigger tự động cập nhật updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_sales_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_reports_updated_at_trigger ON public.sales_reports;
CREATE TRIGGER sales_reports_updated_at_trigger
  BEFORE UPDATE ON public.sales_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_sales_reports_updated_at();

-- =====================================================
-- Hoàn thành!
-- =====================================================
SELECT 'Bảng sales_reports đã được tạo thành công!' as message;
