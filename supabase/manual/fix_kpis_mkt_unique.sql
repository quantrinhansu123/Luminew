-- Thêm unique để upsert ON CONFLICT hoạt động
-- (bảng hiện có product/market nhưng thiếu UNIQUE)

ALTER TABLE public.kpis_mkt
  DROP CONSTRAINT IF EXISTS kpis_mkt_report_date_employee_unique;

ALTER TABLE public.kpis_mkt
  DROP CONSTRAINT IF EXISTS kpis_mkt_date_nv_product_market_unique;

-- Xóa trùng trước khi add unique (giữ dòng mới nhất theo updated_at)
DELETE FROM public.kpis_mkt a
USING public.kpis_mkt b
WHERE a.ctid < b.ctid
  AND a.report_date = b.report_date
  AND a.employee_name = b.employee_name
  AND COALESCE(a.product, '') = COALESCE(b.product, '')
  AND COALESCE(a.market, '') = COALESCE(b.market, '');

ALTER TABLE public.kpis_mkt
  ADD CONSTRAINT kpis_mkt_date_nv_product_market_unique
  UNIQUE (report_date, employee_name, product, market);
