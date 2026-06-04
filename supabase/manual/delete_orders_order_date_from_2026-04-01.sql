-- =============================================================================
-- XÓA đơn public.orders theo cột order_date >= 2026-04-01 (CHỈ bảng orders).
-- Khớp filter UI. KHÔNG THỂ HOÀN TÁC.
-- =============================================================================

-- Đổi ngày cắt nếu cần:
-- DATE '2026-04-01'

-- 1) Đếm trước
SELECT COUNT(*) AS se_xoa
FROM public.orders
WHERE order_date >= DATE '2026-04-01';

-- 2) Xóa (chạy khi đã chắc số ở bước 1)
BEGIN;

DELETE FROM public.orders
WHERE order_date >= DATE '2026-04-01';

COMMIT;

-- 3) Kiểm tra sau (kỳ vọng = 0)
-- SELECT COUNT(*) FROM public.orders WHERE order_date >= DATE '2026-04-01';
