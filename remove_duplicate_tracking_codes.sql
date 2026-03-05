-- SQL Script to remove duplicate tracking codes from orders table
-- ⚠️ CẢNH BÁO: Script này sẽ XÓA các bản ghi có tracking_code trùng lặp
-- Hành động này KHÔNG THỂ HOÀN TÁC!
-- Chạy script này trong Supabase SQL Editor

-- =====================================================
-- BƯỚC 1: Kiểm tra số lượng tracking_code trùng lặp
-- =====================================================
-- Chạy query này trước để xem có bao nhiêu bản ghi trùng lặp
SELECT 
    tracking_code,
    COUNT(*) as duplicate_count
FROM public.orders
WHERE tracking_code IS NOT NULL 
  AND tracking_code != ''
  AND tracking_code != 'null'
GROUP BY tracking_code
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- =====================================================
-- BƯỚC 2: Xem chi tiết các bản ghi trùng lặp (tùy chọn)
-- =====================================================
-- Uncomment để xem chi tiết các bản ghi sẽ bị xóa
/*
SELECT 
    id,
    order_code,
    tracking_code,
    created_at,
    customer_name,
    customer_phone
FROM public.orders
WHERE tracking_code IN (
    SELECT tracking_code
    FROM public.orders
    WHERE tracking_code IS NOT NULL 
      AND tracking_code != ''
      AND tracking_code != 'null'
    GROUP BY tracking_code
    HAVING COUNT(*) > 1
)
ORDER BY tracking_code, created_at DESC;
*/

-- =====================================================
-- BƯỚC 3: XÓA CÁC BẢN GHI TRÙNG LẶP
-- =====================================================
-- Chọn một trong các phương án dưới đây:

-- PHƯƠNG ÁN 1: Giữ lại bản ghi MỚI NHẤT (created_at lớn nhất) cho mỗi tracking_code
-- Xóa các bản ghi cũ hơn
DELETE FROM public.orders
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY tracking_code 
                ORDER BY created_at DESC, id DESC
            ) as rn
        FROM public.orders
        WHERE tracking_code IS NOT NULL 
          AND tracking_code != ''
          AND tracking_code != 'null'
    ) t
    WHERE t.rn > 1
);

-- PHƯƠNG ÁN 2: Giữ lại bản ghi CŨ NHẤT (created_at nhỏ nhất) cho mỗi tracking_code
-- Xóa các bản ghi mới hơn
-- Uncomment để sử dụng:
/*
DELETE FROM public.orders
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY tracking_code 
                ORDER BY created_at ASC, id ASC
            ) as rn
        FROM public.orders
        WHERE tracking_code IS NOT NULL 
          AND tracking_code != ''
          AND tracking_code != 'null'
    ) t
    WHERE t.rn > 1
);
*/

-- PHƯƠNG ÁN 3: Giữ lại bản ghi có order_code KHÔNG NULL (ưu tiên dữ liệu đầy đủ)
-- Xóa các bản ghi có order_code NULL
-- Uncomment để sử dụng:
/*
DELETE FROM public.orders
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY tracking_code 
                ORDER BY 
                    CASE WHEN order_code IS NOT NULL THEN 0 ELSE 1 END,
                    created_at DESC,
                    id DESC
            ) as rn
        FROM public.orders
        WHERE tracking_code IS NOT NULL 
          AND tracking_code != ''
          AND tracking_code != 'null'
    ) t
    WHERE t.rn > 1
);
*/

-- =====================================================
-- BƯỚC 4: Kiểm tra kết quả sau khi xóa
-- =====================================================
-- Chạy query này sau khi xóa để xác nhận không còn trùng lặp
SELECT 
    tracking_code,
    COUNT(*) as remaining_count
FROM public.orders
WHERE tracking_code IS NOT NULL 
  AND tracking_code != ''
  AND tracking_code != 'null'
GROUP BY tracking_code
HAVING COUNT(*) > 1;

-- Nếu query trên không trả về kết quả nào, nghĩa là đã xóa hết các tracking_code trùng lặp

-- =====================================================
-- BƯỚC 5: Xem tổng số bản ghi còn lại
-- =====================================================
SELECT 
    COUNT(*) as total_orders,
    COUNT(DISTINCT tracking_code) as unique_tracking_codes,
    COUNT(*) - COUNT(DISTINCT tracking_code) as duplicate_count
FROM public.orders
WHERE tracking_code IS NOT NULL 
  AND tracking_code != ''
  AND tracking_code != 'null';
