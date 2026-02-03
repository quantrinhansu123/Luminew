-- ⚠️ CẢNH BÁO: Lệnh này sẽ xóa SẠCH dữ liệu trong bảng báo cáo sale.
-- Không thể khôi phục sau khi chạy.

TRUNCATE TABLE sales_reports;

-- Nếu lệnh trên báo lỗi quyền (Permission denied), hãy thử lệnh dưới:
-- DELETE FROM sales_reports WHERE true;
