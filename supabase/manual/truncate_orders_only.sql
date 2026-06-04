-- =============================================================================
-- XÓA TRẮNG toàn bộ dữ liệu bảng public.orders (CHỈ bảng này).
-- Chạy trên Supabase SQL Editor (hoặc psql). KHÔNG THỂ HOÀN TÁC.
--
-- Không xóa: order_code_hcm, sales_reports, detail_reports, order_change_audit, ...
-- =============================================================================

BEGIN;

TRUNCATE TABLE public.orders RESTART IDENTITY;

COMMIT;

-- Kiểm tra sau khi chạy (phải = 0):
-- SELECT COUNT(*) AS so_dong_con_lai FROM public.orders;
