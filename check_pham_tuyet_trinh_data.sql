-- =====================================================
-- Script kiểm tra dữ liệu "Phạm Tuyết Trinh" từ đầu tháng 1 tới nay
-- =====================================================

-- 1. Kiểm tra trong bảng sales_reports (báo cáo Sale) - từ đầu tháng 1 tới nay
SELECT 
    'sales_reports' as table_name,
    id,
    name as "Tên",
    email,
    team,
    date as "Ngày",
    product as "Sản phẩm",
    market as "Thị trường",
    shift as "Ca",
    order_cancel_count_actual as "Số đơn hoàn hủy thực tế",
    created_at
FROM public.sales_reports
WHERE (LOWER(TRIM(name)) LIKE '%phạm tuyết trinh%'
   OR LOWER(TRIM(name)) LIKE '%pham tuyet trinh%')
  AND date >= '2026-01-01'
  AND date <= CURRENT_DATE
ORDER BY date DESC, name ASC
LIMIT 100;

-- 2. Kiểm tra trong bảng orders (đơn hàng) - các đơn hủy từ đầu tháng 1 tới nay
SELECT 
    'orders' as table_name,
    id,
    order_code as "Mã đơn",
    sale_staff as "Nhân viên Sale",
    order_date as "Ngày lên đơn",
    product as "Sản phẩm",
    country as "Thị trường",
    check_result as "Kết quả Check",
    total_amount_vnd as "Tổng tiền VNĐ",
    created_at
FROM public.orders
WHERE (LOWER(TRIM(sale_staff)) LIKE '%phạm tuyết trinh%'
   OR LOWER(TRIM(sale_staff)) LIKE '%pham tuyet trinh%')
  AND (check_result = 'Hủy' OR check_result = 'Huỷ')
  AND order_date >= '2026-01-01'
  AND order_date <= CURRENT_DATE
ORDER BY order_date DESC, sale_staff ASC
LIMIT 100;

-- 3. Thống kê số lượng từ đầu tháng 1 tới nay
SELECT 
    'Thống kê báo cáo' as type,
    COUNT(*) as "Số lượng",
    MIN(date) as "Ngày đầu tiên",
    MAX(date) as "Ngày cuối cùng"
FROM public.sales_reports
WHERE (LOWER(TRIM(name)) LIKE '%phạm tuyết trinh%'
   OR LOWER(TRIM(name)) LIKE '%pham tuyet trinh%')
  AND date >= '2026-01-01'
  AND date <= CURRENT_DATE

UNION ALL

SELECT 
    'Thống kê đơn hủy' as type,
    COUNT(*) as "Số lượng",
    MIN(order_date) as "Ngày đầu tiên",
    MAX(order_date) as "Ngày cuối cùng"
FROM public.orders
WHERE (LOWER(TRIM(sale_staff)) LIKE '%phạm tuyết trinh%'
   OR LOWER(TRIM(sale_staff)) LIKE '%pham tuyet trinh%')
  AND (check_result = 'Hủy' OR check_result = 'Huỷ')
  AND order_date >= '2026-01-01'
  AND order_date <= CURRENT_DATE;

-- 4. So sánh tên chính xác (sau khi normalize) - từ đầu tháng 1 tới nay
SELECT 
    'So sánh tên' as type,
    LOWER(TRIM(name)) as "Tên trong sales_reports",
    COUNT(*) as "Số báo cáo"
FROM public.sales_reports
WHERE (LOWER(TRIM(name)) LIKE '%phạm tuyết trinh%'
   OR LOWER(TRIM(name)) LIKE '%pham tuyet trinh%')
  AND date >= '2026-01-01'
  AND date <= CURRENT_DATE
GROUP BY LOWER(TRIM(name))
ORDER BY "Số báo cáo" DESC;

SELECT 
    'So sánh tên' as type,
    LOWER(TRIM(sale_staff)) as "Tên trong orders",
    COUNT(*) as "Số đơn hủy"
FROM public.orders
WHERE (LOWER(TRIM(sale_staff)) LIKE '%phạm tuyết trinh%'
   OR LOWER(TRIM(sale_staff)) LIKE '%pham tuyet trinh%')
  AND (check_result = 'Hủy' OR check_result = 'Huỷ')
  AND order_date >= '2026-01-01'
  AND order_date <= CURRENT_DATE
GROUP BY LOWER(TRIM(sale_staff))
ORDER BY "Số đơn hủy" DESC;

-- 5. Kiểm tra match theo từng ngày từ đầu tháng 1 tới nay
SELECT 
    'Match theo ngày' as type,
    sr.name as "Tên báo cáo",
    sr.date as "Ngày báo cáo",
    sr.product as "Sản phẩm báo cáo",
    sr.market as "Thị trường báo cáo",
    COUNT(o.id) as "Số đơn hủy match",
    STRING_AGG(DISTINCT o.order_code, ', ') as "Mã đơn hủy",
    CASE 
        WHEN COUNT(o.id) > 0 THEN 'Có match'
        ELSE 'Không match'
    END as "Trạng thái"
FROM public.sales_reports sr
LEFT JOIN public.orders o ON 
    sr.date = o.order_date
    AND (LOWER(TRIM(sr.name)) = LOWER(TRIM(o.sale_staff))
         OR LOWER(TRIM(sr.name)) LIKE '%' || LOWER(TRIM(o.sale_staff)) || '%'
         OR LOWER(TRIM(o.sale_staff)) LIKE '%' || LOWER(TRIM(sr.name)) || '%')
    AND (o.check_result = 'Hủy' OR o.check_result = 'Huỷ')
WHERE (LOWER(TRIM(sr.name)) LIKE '%phạm tuyết trinh%'
   OR LOWER(TRIM(sr.name)) LIKE '%pham tuyet trinh%')
  AND sr.date >= '2026-01-01'
  AND sr.date <= CURRENT_DATE
GROUP BY sr.id, sr.name, sr.date, sr.product, sr.market
ORDER BY sr.date DESC, sr.name ASC
LIMIT 100;

-- 6. Tổng hợp số đơn hủy theo từng ngày
SELECT 
    'Tổng hợp theo ngày' as type,
    sr.date as "Ngày",
    COUNT(DISTINCT sr.id) as "Số báo cáo",
    COUNT(DISTINCT o.id) as "Tổng số đơn hủy",
    SUM(CASE WHEN o.id IS NOT NULL THEN 1 ELSE 0 END) as "Số báo cáo có đơn hủy",
    SUM(CASE WHEN o.id IS NULL THEN 1 ELSE 0 END) as "Số báo cáo không có đơn hủy"
FROM public.sales_reports sr
LEFT JOIN public.orders o ON 
    sr.date = o.order_date
    AND (LOWER(TRIM(sr.name)) = LOWER(TRIM(o.sale_staff))
         OR LOWER(TRIM(sr.name)) LIKE '%' || LOWER(TRIM(o.sale_staff)) || '%'
         OR LOWER(TRIM(o.sale_staff)) LIKE '%' || LOWER(TRIM(sr.name)) || '%')
    AND (o.check_result = 'Hủy' OR o.check_result = 'Huỷ')
WHERE (LOWER(TRIM(sr.name)) LIKE '%phạm tuyết trinh%'
   OR LOWER(TRIM(sr.name)) LIKE '%pham tuyet trinh%')
  AND sr.date >= '2026-01-01'
  AND sr.date <= CURRENT_DATE
GROUP BY sr.date
ORDER BY sr.date DESC;
