-- =============================================================================
-- XÓA báo cáo năm 2025. KHÔNG THỂ HOÀN TÁC.
-- Phạm vi: từ 2025-01-01 đến trước 2026-01-01
--   - public.sales_reports    → cột date
--   - public.sale_report_hcm  → cột date
--   - public.detail_reports        → cột "Ngày"
--   - public.marketing_report_hcm    → cột "Ngày"
-- =============================================================================


-- ---------- sales_reports ----------

-- 1a) Đếm trước
SELECT COUNT(*) AS se_xoa_sales_reports
FROM public.sales_reports
WHERE "date"::date >= DATE '2025-01-01'
  AND "date"::date < DATE '2026-01-01';

-- (Tuỳ chọn) Phân bố theo tháng
-- SELECT date_trunc('month', "date"::date)::date AS thang, COUNT(*)
-- FROM public.sales_reports
-- WHERE "date"::date >= DATE '2025-01-01' AND "date"::date < DATE '2026-01-01'
-- GROUP BY 1 ORDER BY 1;

-- 2a) Xóa (chạy khi đã chắc số ở bước 1a)
BEGIN;

DELETE FROM public.sales_reports
WHERE "date"::date >= DATE '2025-01-01'
  AND "date"::date < DATE '2026-01-01';

COMMIT;

-- 3a) Kiểm tra sau (kỳ vọng = 0)
-- SELECT COUNT(*) FROM public.sales_reports
-- WHERE "date"::date >= DATE '2025-01-01' AND "date"::date < DATE '2026-01-01';


-- ---------- sale_report_hcm ----------

-- 1b) Đếm trước
SELECT COUNT(*) AS se_xoa_sale_report_hcm
FROM public.sale_report_hcm
WHERE "date"::date >= DATE '2025-01-01'
  AND "date"::date < DATE '2026-01-01';

-- (Tuỳ chọn) Phân bố theo tháng
-- SELECT date_trunc('month', "date"::date)::date AS thang, COUNT(*)
-- FROM public.sale_report_hcm
-- WHERE "date"::date >= DATE '2025-01-01' AND "date"::date < DATE '2026-01-01'
-- GROUP BY 1 ORDER BY 1;

-- 2b) Xóa (chạy khi đã chắc số ở bước 1b)
BEGIN;

DELETE FROM public.sale_report_hcm
WHERE "date"::date >= DATE '2025-01-01'
  AND "date"::date < DATE '2026-01-01';

COMMIT;

-- 3b) Kiểm tra sau (kỳ vọng = 0)
-- SELECT COUNT(*) FROM public.sale_report_hcm
-- WHERE "date"::date >= DATE '2025-01-01' AND "date"::date < DATE '2026-01-01';


-- ---------- detail_reports (cột "Ngày") ----------

-- 1c) Đếm trước
SELECT COUNT(*) AS se_xoa_detail_reports
FROM public.detail_reports
WHERE "Ngày"::date >= DATE '2025-01-01'
  AND "Ngày"::date < DATE '2026-01-01';

-- (Tuỳ chọn) Phân bố theo tháng
-- SELECT date_trunc('month', "Ngày"::date)::date AS thang, COUNT(*)
-- FROM public.detail_reports
-- WHERE "Ngày"::date >= DATE '2025-01-01' AND "Ngày"::date < DATE '2026-01-01'
-- GROUP BY 1 ORDER BY 1;

-- 2c) Xóa (chạy khi đã chắc số ở bước 1c)
BEGIN;

DELETE FROM public.detail_reports
WHERE "Ngày"::date >= DATE '2025-01-01'
  AND "Ngày"::date < DATE '2026-01-01';

COMMIT;

-- 3c) Kiểm tra sau (kỳ vọng = 0)
-- SELECT COUNT(*) FROM public.detail_reports
-- WHERE "Ngày"::date >= DATE '2025-01-01' AND "Ngày"::date < DATE '2026-01-01';


-- ---------- marketing_report_hcm (cột "Ngày") ----------

-- 1d) Đếm trước
SELECT COUNT(*) AS se_xoa_marketing_report_hcm
FROM public.marketing_report_hcm
WHERE "Ngày"::date >= DATE '2025-01-01'
  AND "Ngày"::date < DATE '2026-01-01';

-- (Tuỳ chọn) Phân bố theo tháng
-- SELECT date_trunc('month', "Ngày"::date)::date AS thang, COUNT(*)
-- FROM public.marketing_report_hcm
-- WHERE "Ngày"::date >= DATE '2025-01-01' AND "Ngày"::date < DATE '2026-01-01'
-- GROUP BY 1 ORDER BY 1;

-- 2d) Xóa (chạy khi đã chắc số ở bước 1d)
BEGIN;

DELETE FROM public.marketing_report_hcm
WHERE "Ngày"::date >= DATE '2025-01-01'
  AND "Ngày"::date < DATE '2026-01-01';

COMMIT;

-- 3d) Kiểm tra sau (kỳ vọng = 0)
-- SELECT COUNT(*) FROM public.marketing_report_hcm
-- WHERE "Ngày"::date >= DATE '2025-01-01' AND "Ngày"::date < DATE '2026-01-01';
