-- =====================================================
-- Script để xóa cột revenue_after_cancel_actual khỏi bảng sales_reports
-- =====================================================

-- 1. Xóa cột revenue_after_cancel_actual
ALTER TABLE public.sales_reports 
DROP COLUMN IF EXISTS revenue_after_cancel_actual;

-- 2. Kiểm tra kết quả
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'sales_reports'
  AND column_name LIKE '%cancel%'
ORDER BY column_name;

SELECT 'Cột revenue_after_cancel_actual đã được xóa khỏi bảng sales_reports!' as message;
