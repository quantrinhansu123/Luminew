-- =====================================================
-- Tạo bảng cskh_reports - Báo Cáo CSKH Thủ Công
-- =====================================================
-- Xóa bảng cũ nếu đã tồn tại để đảm bảo cấu trúc mới nhất
DROP TABLE IF EXISTS public.cskh_reports;

CREATE TABLE public.cskh_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Thông tin nhân viên
  name TEXT NOT NULL,           -- Tên
  email TEXT,                   -- Email
  team TEXT,                    -- Team
  
  -- Thông tin báo cáo
  report_date DATE NOT NULL,    -- Ngày báo cáo (đổi từ date -> report_date để tránh lỗi từ khóa)
  shift TEXT,                   -- Ca
  product TEXT,                 -- Sản phẩm
  market TEXT,                  -- Thị trường
  
  -- Số liệu báo cáo
  mess_count INTEGER DEFAULT 0,              -- Số Mess/Cmt tiếp nhận
  response_count INTEGER DEFAULT 0,          -- Phản hồi
  order_count INTEGER DEFAULT 0,             -- Số đơn chốt được
  revenue_mess NUMERIC DEFAULT 0,            -- Doanh số chốt được
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cskh_reports_date ON public.cskh_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_cskh_reports_email ON public.cskh_reports(email);
CREATE INDEX IF NOT EXISTS idx_cskh_reports_name ON public.cskh_reports(name);

-- RLS
ALTER TABLE public.cskh_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON public.cskh_reports;
CREATE POLICY "Allow all access" ON public.cskh_reports 
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_cskh_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cskh_reports_updated_at_trigger ON public.cskh_reports;
CREATE TRIGGER cskh_reports_updated_at_trigger
  BEFORE UPDATE ON public.cskh_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_cskh_reports_updated_at();

SELECT 'Bảng cskh_reports đã được tạo lại thành công với cột report_date!' as message;
