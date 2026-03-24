-- =============================================================================
-- Đổi Team liên quan "Hà Nội" → HN-MKT trong detail_reports
-- Chạy từng khối trong Supabase → SQL Editor
-- Cột trong DB: "Team" (quoted) — không phải team
-- =============================================================================

-- BƯỚC 1 — Xem giá trị Team hiện có:
SELECT DISTINCT "Team"
FROM detail_reports
WHERE "Team" IS NOT NULL AND trim("Team"::text) <> ''
ORDER BY 1;

-- (Nếu bảng của bạn dùng snake_case `team` thay vì "Team", dùng khối sau thay BƯỚC 1–3:)
-- SELECT DISTINCT team FROM detail_reports WHERE team IS NOT NULL AND trim(team::text) <> '' ORDER BY 1;


-- BƯỚC 2 — Đếm dòng sẽ đổi:
SELECT COUNT(*) AS so_dong_se_doi
FROM detail_reports
WHERE "Team" IS NOT NULL
  AND (
    lower(trim("Team"::text)) IN ('hà nội', 'ha noi', 'hanoi')
    OR trim("Team"::text) = 'Hà Nội'
    OR trim("Team"::text) ILIKE 'ha noi'
    OR trim("Team"::text) ILIKE 'hanoi'
  );


-- BƯỚC 3 — UPDATE:
UPDATE detail_reports
SET "Team" = 'HN-MKT'
WHERE "Team" IS NOT NULL
  AND (
    lower(trim("Team"::text)) IN ('hà nội', 'ha noi', 'hanoi')
    OR trim("Team"::text) = 'Hà Nội'
    OR trim("Team"::text) ILIKE 'ha noi'
    OR trim("Team"::text) ILIKE 'hanoi'
  );


-- BƯỚC 4 — Kiểm tra sau khi chạy:
-- SELECT DISTINCT "Team" FROM detail_reports WHERE "Team" ILIKE '%HN%' OR "Team" ILIKE '%hà%' ORDER BY 1;
