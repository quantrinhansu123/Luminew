-- ⚠️ CẢNH BÁO: Lệnh này sẽ xóa SẠCH dữ liệu trong bảng orders.
-- Không thể khôi phục sau khi chạy.
-- Hãy backup dữ liệu trước khi chạy script này!

-- Kiểm tra số lượng records trước khi xóa
SELECT COUNT(*) as total_orders_before FROM public.orders;

-- Xóa tất cả dữ liệu trong bảng orders
-- Cách 1: TRUNCATE (nhanh hơn, reset auto-increment nếu có)
TRUNCATE TABLE public.orders CASCADE;

-- Nếu lệnh TRUNCATE báo lỗi quyền (Permission denied), hãy thử lệnh DELETE:
-- DELETE FROM public.orders;

-- Kiểm tra số lượng records sau khi xóa
SELECT COUNT(*) as total_orders_after FROM public.orders;

-- Lưu ý:
-- - TRUNCATE sẽ xóa nhanh hơn DELETE
-- - TRUNCATE không thể rollback trong transaction
-- - CASCADE sẽ xóa cả các bảng phụ thuộc (nếu có foreign key)
-- - Nếu chỉ muốn xóa dữ liệu mà giữ lại cấu trúc bảng, dùng TRUNCATE
-- - Nếu muốn có thể rollback, dùng DELETE FROM public.orders;
