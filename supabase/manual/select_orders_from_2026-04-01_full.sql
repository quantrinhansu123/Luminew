-- =============================================================================
-- Lấy FULL đơn orders từ 2026-04-01 (không bị cap 100 dòng của SQL Editor).
--
-- Supabase SQL Editor tự thêm LIMIT 100 nếu query không có LIMIT.
-- Cách 1: Chạy COUNT trước để biết tổng thật trong DB.
-- Cách 2: Query dưới có LIMIT lớn → lấy hết (hoặc tắt "Auto limit" trong Settings SQL Editor).
-- Cách 3: Sau khi chạy → nút Download CSV (góc kết quả) để export full.
-- =============================================================================

-- Tổng số dòng thật (không bị giới hạn UI)
SELECT COUNT(*) AS tong_don_tu_2026_04_01
FROM public.orders
WHERE order_date >= DATE '2026-04-01';

SELECT COUNT(*) AS tong_ca_bang_orders
FROM public.orders;

-- Phân bố theo ngày (kiểm tra import đủ chưa)
SELECT order_date, COUNT(*) AS so_don
FROM public.orders
WHERE order_date >= DATE '2026-04-01'
GROUP BY order_date
ORDER BY order_date;

-- FULL: tăng LIMIT nếu COUNT > 100000
SELECT *
FROM public.orders
WHERE order_date >= DATE '2026-04-01'
ORDER BY order_date, order_code
LIMIT 100000;
