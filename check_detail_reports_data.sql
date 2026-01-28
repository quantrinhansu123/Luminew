-- ==============================================================================
-- Script kiểm tra dữ liệu trong bảng detail_reports
-- ==============================================================================

-- 1. Kiểm tra số lượng records
SELECT COUNT(*) as total_records FROM public.detail_reports;

-- 2. Kiểm tra số lượng records theo department
SELECT 
    COALESCE(department, 'NULL') as department,
    COUNT(*) as count
FROM public.detail_reports
GROUP BY department
ORDER BY department;

-- 3. Xem 10 records đầu tiên
SELECT 
    id,
    "Tên",
    "Ngày",
    "Team",
    department,
    "Sản_phẩm",
    "Thị_trường",
    "Số đơn",
    "Doanh số"
FROM public.detail_reports
ORDER BY "Ngày" DESC
LIMIT 10;

-- 4. Kiểm tra khoảng thời gian có data
SELECT 
    MIN("Ngày") as earliest_date,
    MAX("Ngày") as latest_date,
    COUNT(DISTINCT "Ngày") as unique_dates
FROM public.detail_reports;

-- 5. Kiểm tra RLS policies
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'detail_reports';

-- 6. Kiểm tra xem RLS có được bật không
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'detail_reports';
