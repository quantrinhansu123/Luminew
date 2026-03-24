-- Xóa toàn bộ dữ liệu bảng sales_reports (Báo cáo Sale)
-- ⚠️ Không thể hoàn tác — chỉ chạy khi chắc chắn (Supabase SQL Editor)

BEGIN;

TRUNCATE TABLE public.sales_reports RESTART IDENTITY;

COMMIT;

-- Nếu TRUNCATE báo lỗi FK: dùng
-- DELETE FROM public.sales_reports;

-- Kiểm tra
SELECT COUNT(*) AS remaining_sales_reports FROM public.sales_reports;
