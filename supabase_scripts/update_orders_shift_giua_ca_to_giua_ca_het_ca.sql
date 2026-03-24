-- =============================================================================
-- Bảng orders, cột shift: đổi giá trị chỉ là "Giữa ca" → "Giữa ca,Hết ca"
-- Chạy từng khối trong Supabase → SQL Editor
-- =============================================================================

-- BƯỚC 1 — Xem các giá trị shift liên quan:
SELECT DISTINCT shift
FROM orders
WHERE shift IS NOT NULL AND trim(shift::text) <> ''
ORDER BY 1;


-- BƯỚC 2 — Đếm dòng sẽ đổi (chỉ ô đúng bằng "Giữa ca" sau khi trim):
SELECT COUNT(*) AS so_dong_se_doi
FROM orders
WHERE trim(coalesce(shift, '')) = 'Giữa ca';


-- BƯỚC 3 — UPDATE:
UPDATE orders
SET shift = 'Giữa ca,Hết ca'
WHERE trim(coalesce(shift, '')) = 'Giữa ca';


-- BƯỚC 4 — Kiểm tra sau (uncomment):
-- SELECT DISTINCT shift FROM orders WHERE shift ILIKE '%Giữa%' ORDER BY 1;


-- =============================================================================
-- Bảng detail_reports, cột ca: đổi "Giữa ca" → "Giữa ca,Hết ca" (cùng logic orders.shift)
-- Chạy sau phần orders nếu cần đồng bộ cả hai bảng.
-- =============================================================================

-- DR-1 — Xem các giá trị ca hiện có:
SELECT DISTINCT ca
FROM detail_reports
WHERE ca IS NOT NULL AND trim(ca::text) <> ''
ORDER BY 1;

-- Nếu lỗi "column ca does not exist" (cột là "Ca" có chữ hoa), dùng thay DR-1–DR-3:
-- SELECT DISTINCT "Ca" FROM detail_reports WHERE "Ca" IS NOT NULL AND trim("Ca"::text) <> '' ORDER BY 1;


-- DR-2 — Đếm dòng sẽ đổi:
SELECT COUNT(*) AS so_dong_se_doi_detail_reports
FROM detail_reports
WHERE trim(coalesce(ca, '')) = 'Giữa ca';


-- DR-3 — UPDATE:
UPDATE detail_reports
SET ca = 'Giữa ca,Hết ca'
WHERE trim(coalesce(ca, '')) = 'Giữa ca';

-- Bản dùng cột "Ca" (nếu DR-2/DR-3 lỗi cột):
-- SELECT COUNT(*) FROM detail_reports WHERE trim(coalesce("Ca", '')) = 'Giữa ca';
-- UPDATE detail_reports SET "Ca" = 'Giữa ca,Hết ca' WHERE trim(coalesce("Ca", '')) = 'Giữa ca';


-- DR-4 — Kiểm tra sau (uncomment):
-- SELECT DISTINCT ca FROM detail_reports WHERE ca ILIKE '%Giữa%' ORDER BY 1;
-- hoặc: SELECT DISTINCT "Ca" FROM detail_reports WHERE "Ca" ILIKE '%Giữa%' ORDER BY 1;
