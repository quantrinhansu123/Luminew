-- =====================================================
-- Tạo bảng shipping_reports - Báo Cáo Vận Đơn
-- =====================================================
CREATE TABLE IF NOT EXISTS public.shipping_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Thông tin cơ bản
  name TEXT NOT NULL,                 -- Họ và tên
  date DATE NOT NULL,                 -- Ngày
  product TEXT,                       -- Sản phẩm
  market TEXT,                        -- Thị trường
  
  -- Trạng thái
  check_result TEXT,                  -- Kết quả check
  status TEXT,                        -- Trạng thái
  delivery_status TEXT,               -- Trạng thái giao hàng
  bill_status TEXT,                   -- Trạng thái bill
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- =====================================================
-- Indexes để tăng hiệu suất truy vấn
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_shipping_reports_date ON public.shipping_reports(date);
CREATE INDEX IF NOT EXISTS idx_shipping_reports_name ON public.shipping_reports(name);
CREATE INDEX IF NOT EXISTS idx_shipping_reports_product ON public.shipping_reports(product);
CREATE INDEX IF NOT EXISTS idx_shipping_reports_market ON public.shipping_reports(market);
CREATE INDEX IF NOT EXISTS idx_shipping_reports_check_result ON public.shipping_reports(check_result);
CREATE INDEX IF NOT EXISTS idx_shipping_reports_status ON public.shipping_reports(status);
CREATE INDEX IF NOT EXISTS idx_shipping_reports_delivery_status ON public.shipping_reports(delivery_status);
CREATE INDEX IF NOT EXISTS idx_shipping_reports_bill_status ON public.shipping_reports(bill_status);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================
ALTER TABLE public.shipping_reports ENABLE ROW LEVEL SECURITY;

-- Drop policy nếu đã tồn tại, sau đó tạo mới
DROP POLICY IF EXISTS "Allow all access" ON public.shipping_reports;

-- Policy cho phép tất cả thao tác (development mode)
CREATE POLICY "Allow all access" ON public.shipping_reports 
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- Trigger tự động cập nhật updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_shipping_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shipping_reports_updated_at_trigger ON public.shipping_reports;
CREATE TRIGGER shipping_reports_updated_at_trigger
  BEFORE UPDATE ON public.shipping_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_shipping_reports_updated_at();

-- =====================================================
-- Hoàn thành!
-- =====================================================
SELECT 'Bảng shipping_reports đã được tạo thành công!' as message;
