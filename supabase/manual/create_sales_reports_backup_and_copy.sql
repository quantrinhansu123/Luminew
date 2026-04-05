-- Chạy toàn bộ trên Supabase SQL Editor (hoặc psql).
-- Lỗi "relation does not exist" = chưa tạo bảng; phải chạy CREATE (đoạn dưới) trước INSERT.
--
-- Nếu cần làm lại bản backup (ghi đè dữ liệu trong backup): bỏ comment 2 dòng TRUNCATE rồi chạy lại.

CREATE TABLE IF NOT EXISTS public.sales_reports_backup (LIKE public.sales_reports INCLUDING ALL);

COMMENT ON TABLE public.sales_reports_backup IS 'Sao lưu từ public.sales_reports (cấu trúc + dữ liệu).';

-- TRUNCATE public.sales_reports_backup RESTART IDENTITY CASCADE;

INSERT INTO public.sales_reports_backup
SELECT * FROM public.sales_reports;
