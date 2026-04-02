-- Xóa toàn bộ dòng bảng sales_reports (báo cáo Sale) có team = HCM
-- (sau trim, không phân biệt hoa thường). Trong dự án không có bảng tên sale_report;
-- nguồn Sale chính là public.sales_reports. Bảng sale_report_hcm là clone HCM — xem comment cuối.
--
-- Đếm trước (Supabase SQL Editor):
-- SELECT COUNT(*) FROM public.sales_reports
-- WHERE team IS NOT NULL AND trim(team::text) ILIKE 'HCM';

BEGIN;

DELETE FROM public.sales_reports
WHERE team IS NOT NULL
  AND trim(both from team::text) ILIKE 'HCM';

COMMIT;

-- Nếu thật sự cần xóa theo team trên bảng clone HCM (thường toàn bộ là HCM → có thể xóa hết bảng):
-- BEGIN;
-- DELETE FROM public.sale_report_hcm
-- WHERE team IS NOT NULL AND trim(both from team::text) ILIKE 'HCM';
-- COMMIT;
