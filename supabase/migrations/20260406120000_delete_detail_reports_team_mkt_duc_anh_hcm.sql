-- Xóa toàn bộ dòng detail_reports có Team = 'MKT - Đức Anh' hoặc Team = 'HCM'
-- (sau trim, không phân biệt hoa thường).
-- Cột theo schema hiện tại dự án: "Team" (quoted). Nếu DB chỉ có `team`, dùng khối comment ở cuối.
--
-- Nên chạy SELECT đếm trước trong SQL Editor:
-- SELECT COUNT(*) FROM public.detail_reports
-- WHERE "Team" IS NOT NULL
--   AND (
--     trim(both from "Team"::text) ILIKE 'MKT - Đức Anh'
--     OR trim(both from "Team"::text) ILIKE 'HCM'
--   );

BEGIN;

DELETE FROM public.detail_reports
WHERE "Team" IS NOT NULL
  AND (
    trim(both from "Team"::text) ILIKE 'MKT - Đức Anh'
    OR trim(both from "Team"::text) ILIKE 'HCM'
  );

COMMIT;

-- Nếu bảng dùng snake_case `team` thay vì "Team":
-- BEGIN;
-- DELETE FROM public.detail_reports
-- WHERE team IS NOT NULL
--   AND (
--     trim(both from team::text) ILIKE 'MKT - Đức Anh'
--     OR trim(both from team::text) ILIKE 'HCM'
--   );
-- COMMIT;
