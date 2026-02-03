-- =====================================================
-- Cập nhật bảng sales_reports - Bổ sung các cột thiếu từ Firebase F3
-- =====================================================

-- 1. Bổ sung các cột chỉ số khách hàng và bán chéo
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS customer_old INTEGER DEFAULT 0; -- Khách cũ
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS customer_new INTEGER DEFAULT 0; -- Khách mới
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS cross_sale INTEGER DEFAULT 0;   -- Bán chéo

-- 2. Bổ sung cột trạng thái và ID nhân sự
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS status TEXT;          -- Trạng thái (VD: Đã gửi)
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS id_ns TEXT;           -- id_NS (Mã nhân sự)

-- 3. Bổ sung các ID liên kết (nếu cần thiết cho đồng bộ)
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS id_feedback TEXT;     -- id_phản_hồi
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS id_mess_count TEXT;   -- id_số_mess

-- 4. Đảm bảo các cột số liệu khác đã tồn tại (Check lại cho chắc chắn)
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS mess_count INTEGER DEFAULT 0;      -- Số_Mess
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0;  -- Phản_hồi
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;     -- Đơn Mess (hoặc Số đơn)
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS revenue_mess NUMERIC DEFAULT 0;    -- Doanh_số_Mess

ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS order_cancel_count INTEGER DEFAULT 0; -- Số_đơn_Hoàn_huỷ
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS revenue_cancel NUMERIC DEFAULT 0;     -- Doanh_số_hoàn_huỷ

ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS order_success_count INTEGER DEFAULT 0; -- Số_đơn_thành_công
ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS revenue_success NUMERIC DEFAULT 0;     -- Doanh_số_thành_công

ALTER TABLE public.sales_reports ADD COLUMN IF NOT EXISTS revenue_go NUMERIC DEFAULT 0;          -- Doanh_số_đi

-- =====================================================
-- Hoàn thành
-- =====================================================
SELECT 'Đã cập nhật bảng sales_reports đầy đủ các cột từ Firebase!' as message;
