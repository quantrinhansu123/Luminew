-- Bảng backup: cấu trúc y hệt public.sales_reports (cột, default, constraint, index).
-- Không tự copy dữ liệu. Để nạp dữ liệu sau khi tạo bảng, chạy thêm (tùy chọn):
--   INSERT INTO public.sales_reports_backup SELECT * FROM public.sales_reports;

DO $$
BEGIN
  IF to_regclass('public.sales_reports_backup') IS NULL THEN
    EXECUTE 'CREATE TABLE public.sales_reports_backup (LIKE public.sales_reports INCLUDING ALL)';
    EXECUTE 'COMMENT ON TABLE public.sales_reports_backup IS ''Sao lưu cấu trúc (và có thể dữ liệu) từ public.sales_reports.''';
  END IF;
END $$;
