-- =====================================================
-- Script kiểm tra dữ liệu trong bảng sales_reports
-- Kiểm tra xem có dữ liệu từ ngày 01/01/2026 đến 28/01/2026 không
-- =====================================================

-- 1. Kiểm tra số lượng records theo từng ngày
SELECT 
    sr.date::DATE as "Ngày",
    COUNT(*) as "Số lượng báo cáo",
    COUNT(DISTINCT sr.name) as "Số lượng nhân viên",
    MIN(sr.date) as "Ngày đầu tiên",
    MAX(sr.date) as "Ngày cuối cùng"
FROM public.sales_reports sr
WHERE sr.date::DATE >= '2026-01-01'::DATE
  AND sr.date::DATE <= '2026-01-28'::DATE
GROUP BY sr.date::DATE
ORDER BY sr.date::DATE ASC;

-- 2. Kiểm tra ngày đầu tiên và ngày cuối cùng trong database
SELECT 
    MIN(sr.date::DATE) as "Ngày đầu tiên trong database",
    MAX(sr.date::DATE) as "Ngày cuối cùng trong database",
    COUNT(*) as "Tổng số records",
    COUNT(DISTINCT sr.date::DATE) as "Số ngày có dữ liệu"
FROM public.sales_reports sr;

-- 3. Kiểm tra các ngày trong khoảng 01/01/2026 đến 28/01/2026
SELECT 
    date_series::DATE as "Ngày trong khoảng",
    COUNT(sr.id) as "Số lượng báo cáo",
    CASE 
        WHEN COUNT(sr.id) > 0 THEN 'Có dữ liệu'
        ELSE 'Không có dữ liệu'
    END as "Trạng thái"
FROM generate_series('2026-01-01'::DATE, '2026-01-28'::DATE, '1 day'::INTERVAL) as date_series
LEFT JOIN public.sales_reports sr ON sr.date::DATE = date_series::DATE
GROUP BY date_series::DATE
ORDER BY date_series::DATE ASC;

-- 4. Kiểm tra RPC function có hoạt động đúng không
SELECT * FROM get_sales_analytics('2026-01-01'::DATE, '2026-01-28'::DATE)
LIMIT 10;

-- 5. Kiểm tra số lượng records trả về từ RPC function
SELECT 
    COUNT(*) as "Tổng số records",
    COUNT(DISTINCT "Ngày") as "Số ngày",
    MIN("Ngày") as "Ngày đầu tiên",
    MAX("Ngày") as "Ngày cuối cùng"
FROM get_sales_analytics('2026-01-01'::DATE, '2026-01-28'::DATE);
