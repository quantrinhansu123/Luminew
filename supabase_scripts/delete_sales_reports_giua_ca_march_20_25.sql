-- =============================================================================
-- Xóa bảng sales_reports trong khoảng ngày 20/3–25/3 (cùng năm) nếu:
--   • shift = "Giữa ca"  HOẶC
--   • team = "Hà Nội"
-- Chạy từng khối trong Supabase → SQL Editor
-- ⚠️ Không hoàn tác — chạy SELECT/COUNT trước khi DELETE
-- =============================================================================

-- Đổi năm ở các khối dưới nếu cần (ví dụ 2025):
-- Năm mặc định: 2026

-- BƯỚC 1 — Xem các dòng sẽ xóa:
SELECT id, date, shift, team, name
FROM public.sales_reports
WHERE date >= DATE '2026-03-20'
  AND date <= DATE '2026-03-25'
  AND (
    trim(coalesce(shift, '')) = 'Giữa ca'
    OR trim(coalesce(team, '')) = 'Hà Nội'
  )
ORDER BY date, team, id;


-- BƯỚC 2 — Đếm:
SELECT COUNT(*) AS so_dong_se_xoa
FROM public.sales_reports
WHERE date >= DATE '2026-03-20'
  AND date <= DATE '2026-03-25'
  AND (
    trim(coalesce(shift, '')) = 'Giữa ca'
    OR trim(coalesce(team, '')) = 'Hà Nội'
  );


-- BƯỚC 3 — XÓA:
DELETE FROM public.sales_reports
WHERE date >= DATE '2026-03-20'
  AND date <= DATE '2026-03-25'
  AND (
    trim(coalesce(shift, '')) = 'Giữa ca'
    OR trim(coalesce(team, '')) = 'Hà Nội'
  );


-- BƯỚC 4 — Kiểm tra (uncomment):
-- SELECT COUNT(*) FROM public.sales_reports
-- WHERE date BETWEEN DATE '2026-03-20' AND DATE '2026-03-25'
--   AND (
--     trim(coalesce(shift, '')) = 'Giữa ca'
--     OR trim(coalesce(team, '')) = 'Hà Nội'
--   );
