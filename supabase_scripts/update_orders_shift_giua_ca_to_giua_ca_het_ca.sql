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
-- Bảng detail_reports, cột ca: đổi "Giữa ca,Hết ca" → "Giữa ca"
-- (Chỉ các ô đúng bằng chuỗi đó sau trim; không đụng "Giữa ca" đơn.)
-- =============================================================================

-- DR-1 — Xem các giá trị ca liên quan:
SELECT DISTINCT ca
FROM detail_reports
WHERE ca IS NOT NULL AND trim(ca::text) <> ''
ORDER BY 1;

-- Nếu lỗi "column ca does not exist" (cột là "Ca"), dùng thay DR-1–DR-3:
-- SELECT DISTINCT "Ca" FROM detail_reports WHERE "Ca" IS NOT NULL AND trim("Ca"::text) <> '' ORDER BY 1;


-- DR-2 — Đếm dòng sẽ đổi (đúng bằng "Giữa ca,Hết ca" sau trim):
SELECT COUNT(*) AS so_dong_se_doi_detail_reports
FROM detail_reports
WHERE trim(coalesce(ca, '')) = 'Giữa ca,Hết ca';


-- DR-3 — UPDATE:
UPDATE detail_reports
SET ca = 'Giữa ca'
WHERE trim(coalesce(ca, '')) = 'Giữa ca,Hết ca';

-- Bản dùng cột "Ca" (nếu DR-2/DR-3 lỗi cột):
-- SELECT COUNT(*) FROM detail_reports WHERE trim(coalesce("Ca", '')) = 'Giữa ca,Hết ca';
-- UPDATE detail_reports SET "Ca" = 'Giữa ca' WHERE trim(coalesce("Ca", '')) = 'Giữa ca,Hết ca';


-- DR-4 — Kiểm tra sau (uncomment):
-- SELECT DISTINCT ca FROM detail_reports WHERE ca ILIKE '%Giữa%' OR ca ILIKE '%Hết%' ORDER BY 1;
-- hoặc: SELECT DISTINCT "Ca" FROM detail_reports WHERE "Ca" ILIKE '%Giữa%' ORDER BY 1;


-- (Tuỳ chọn) Nếu có biến thể "Giữa ca, Hết ca" (có space sau dấu phẩy), chuẩn hóa rồi đổi:
-- UPDATE detail_reports
-- SET ca = 'Giữa ca'
-- WHERE trim(regexp_replace(coalesce(ca::text, ''), '\s*,\s*', ',', 'g')) = 'Giữa ca,Hết ca';
