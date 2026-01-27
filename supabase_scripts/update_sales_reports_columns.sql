-- =====================================================
-- Cập nhật bảng sales_reports để khớp hoàn toàn với External API
-- =====================================================

ALTER TABLE public.sales_reports 
ADD COLUMN IF NOT EXISTS id_mess TEXT,
ADD COLUMN IF NOT EXISTS id_response TEXT,
ADD COLUMN IF NOT EXISTS status TEXT, -- Trạng thái
ADD COLUMN IF NOT EXISTS id_ns TEXT,  -- ID Nhân sự

ADD COLUMN IF NOT EXISTS new_customer INTEGER DEFAULT 0, -- Khách mới
ADD COLUMN IF NOT EXISTS old_customer INTEGER DEFAULT 0, -- Khách cũ
ADD COLUMN IF NOT EXISTS cross_sale INTEGER DEFAULT 0,   -- Bán chéo

ADD COLUMN IF NOT EXISTS customer_classification TEXT;   -- Phân loại KH

-- Indexes cho các cột mới nếu cần
CREATE INDEX IF NOT EXISTS idx_sales_reports_id_ns ON public.sales_reports(id_ns);

SELECT 'Đã cập nhật bảng sales_reports với đầy đủ cột!' as message;
