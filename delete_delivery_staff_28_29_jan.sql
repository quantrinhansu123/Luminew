-- =====================================================
-- Script xóa cột NV vận đơn (delivery_staff) 
-- cho các đơn hàng ngày 28/1 và 29/1
-- =====================================================

-- Kiểm tra số lượng đơn hàng sẽ bị ảnh hưởng trước khi xóa
SELECT 
    order_date,
    COUNT(*) as so_don,
    COUNT(delivery_staff) as so_don_co_nv_van_don
FROM public.orders
WHERE order_date IN ('2026-01-28', '2026-01-29')
GROUP BY order_date
ORDER BY order_date;

-- Xóa cột NV vận đơn (set NULL) cho các đơn hàng ngày 28/1 và 29/1
UPDATE public.orders
SET delivery_staff = NULL
WHERE order_date IN ('2026-01-28', '2026-01-29')
  AND delivery_staff IS NOT NULL;

-- Kiểm tra kết quả sau khi xóa
SELECT 
    order_date,
    COUNT(*) as tong_so_don,
    COUNT(delivery_staff) as so_don_con_nv_van_don,
    COUNT(*) - COUNT(delivery_staff) as so_don_da_xoa_nv_van_don
FROM public.orders
WHERE order_date IN ('2026-01-28', '2026-01-29')
GROUP BY order_date
ORDER BY order_date;

-- =====================================================
-- Lưu ý:
-- 1. Script này sẽ set delivery_staff = NULL cho các đơn hàng
--    có order_date là 2026-01-28 hoặc 2026-01-29
-- 2. Chỉ xóa những đơn hàng có delivery_staff IS NOT NULL
-- 3. Nếu muốn xóa cho năm khác, thay đổi năm trong WHERE clause
-- 4. Nếu muốn xóa cho tháng khác, thay đổi tháng trong WHERE clause
-- =====================================================
