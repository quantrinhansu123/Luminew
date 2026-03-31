-- Tạo các bảng HCM với cấu trúc giống bảng gốc.
-- - order_code_hcm  ~= orders
-- - mkt_report_hcm  ~= detail_reports
-- - sale_report_hcm ~= sales_reports
--
-- Lưu ý:
-- - Dùng LIKE ... INCLUDING ALL để sao chép toàn bộ cột/default/constraint/index.
-- - Tên bảng dùng snake_case (Postgres chuẩn, tránh tên có dấu gạch ngang).

DO $$
BEGIN
  IF to_regclass('public.order_code_hcm') IS NULL THEN
    EXECUTE 'CREATE TABLE public.order_code_hcm (LIKE public.orders INCLUDING ALL)';
    EXECUTE 'COMMENT ON TABLE public.order_code_hcm IS ''Clone cấu trúc từ public.orders cho dữ liệu HCM.''';
  END IF;

  IF to_regclass('public.mkt_report_hcm') IS NULL THEN
    EXECUTE 'CREATE TABLE public.mkt_report_hcm (LIKE public.detail_reports INCLUDING ALL)';
    EXECUTE 'COMMENT ON TABLE public.mkt_report_hcm IS ''Clone cấu trúc từ public.detail_reports cho dữ liệu HCM.''';
  END IF;

  IF to_regclass('public.sale_report_hcm') IS NULL THEN
    EXECUTE 'CREATE TABLE public.sale_report_hcm (LIKE public.sales_reports INCLUDING ALL)';
    EXECUTE 'COMMENT ON TABLE public.sale_report_hcm IS ''Clone cấu trúc từ public.sales_reports cho dữ liệu HCM.''';
  END IF;
END $$;

