-- =============================================================================
-- Import CSV vào orders bị lỗi:
--   23505 duplicate key orders_pkey (id đã tồn tại)
--
-- Nguyên nhân: Lần import trước đã chèn một phần (100 dòng / vài batch).
-- CSV import Supabase = INSERT thuần, không UPSERT.
-- =============================================================================

-- 1) Kiểm tra dòng trùng id (ví dụ lỗi vừa gặp)
SELECT id, order_code, order_date, customer_name
FROM public.orders
WHERE id = 'ee65f4ae-7baf-43d9-85c9-49e537821a89';

-- 2) Đếm đơn đã có từ 2026-04-01 (để biết import dở dang bao nhiêu)
SELECT COUNT(*) AS da_co_trong_db
FROM public.orders
WHERE order_date >= DATE '2026-04-01';

-- =============================================================================
-- CÁCH A (khuyên dùng): XÓA khoảng ngày → import lại CSV (giữ cột id trong file)
-- Chạy DELETE trước, rồi import CSV lại (đã bỏ van_don_line_total_vnd, sửa "null").
-- =============================================================================

BEGIN;

DELETE FROM public.orders
WHERE order_date >= DATE '2026-04-01';

COMMIT;

-- Sau đó import CSV lại trên Supabase Table Editor.

-- =============================================================================
-- CÁCH B: Import CSV KHÔNG có cột id (DB tự sinh UUID mới)
-- + order_code UNIQUE: nếu order_code đã có vẫn lỗi → phải xóa dòng cũ trước (Cách A)
-- hoặc dùng script upsert theo order_code (scripts/supplement_orders_from_csv.js)
-- =============================================================================

-- =============================================================================
-- CÁCH C: Chỉ xóa các id trùng (nếu file CSV nhỏ, biết rõ id lỗi)
-- =============================================================================
-- DELETE FROM public.orders WHERE id = 'ee65f4ae-7baf-43d9-85c9-49e537821a89';

-- =============================================================================
-- Checklist CSV trước import:
-- [ ] Xóa cột van_don_line_total_vnd (generated column)
-- [ ] Replace chuỗi "null" → ô trống (cột numeric)
-- [ ] Nếu import lại cùng backup: chạy DELETE (Cách A) trước
-- =============================================================================
