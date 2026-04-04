-- Đổi giá trị cột team trong public.sales_reports:
--   CSKH- Lý  →  CSKH-HN
-- (kèm biến thể CSKH-Lý không có khoảng sau dấu -)
--
-- Chạy phần SELECT trước để kiểm tra số dòng; sau đó BEGIN … UPDATE … COMMIT.

-- 1) Xem trước
SELECT id, team, trim(both from team::text) AS team_trimmed
FROM public.sales_reports
WHERE trim(both from team::text) IN ('CSKH- Lý', 'CSKH-Lý');

-- 2) Đếm
-- SELECT COUNT(*) FROM public.sales_reports
-- WHERE trim(both from team::text) IN ('CSKH- Lý', 'CSKH-Lý');

-- 3) Cập nhật
BEGIN;

UPDATE public.sales_reports
SET team = 'CSKH-HN'
WHERE trim(both from team::text) IN ('CSKH- Lý', 'CSKH-Lý');

COMMIT;

-- 4) Kiểm tra sau
-- SELECT id, team FROM public.sales_reports WHERE team = 'CSKH-HN' ORDER BY id DESC LIMIT 50;
