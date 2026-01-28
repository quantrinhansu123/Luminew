-- =====================================================
-- Script đảm bảo cột phone (customer_phone) trong bảng orders
-- có kiểu dữ liệu TEXT
-- =====================================================

-- 1. Kiểm tra kiểu dữ liệu hiện tại của cột customer_phone
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name = 'customer_phone';

-- 2. Nếu cột chưa tồn tại, tạo mới với kiểu TEXT
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- 3. Nếu cột đã tồn tại nhưng không phải TEXT, chuyển đổi sang TEXT
-- Lưu ý: Nếu cột đang là NUMERIC hoặc INTEGER, sẽ convert sang TEXT
DO $$
BEGIN
    -- Kiểm tra kiểu dữ liệu hiện tại
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'orders' 
          AND column_name = 'customer_phone'
          AND data_type != 'text'
    ) THEN
        -- Chuyển đổi sang TEXT
        ALTER TABLE public.orders 
        ALTER COLUMN customer_phone TYPE TEXT USING customer_phone::TEXT;
        
        RAISE NOTICE 'Đã chuyển đổi cột customer_phone sang TEXT';
    ELSE
        RAISE NOTICE 'Cột customer_phone đã là TEXT hoặc không tồn tại';
    END IF;
END $$;

-- 4. Kiểm tra lại kiểu dữ liệu sau khi chuyển đổi
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name = 'customer_phone';

-- 5. Kiểm tra một số giá trị mẫu để đảm bảo dữ liệu không bị mất
SELECT 
    COUNT(*) as tong_so_don,
    COUNT(customer_phone) as so_don_co_phone,
    COUNT(*) - COUNT(customer_phone) as so_don_khong_co_phone,
    MIN(LENGTH(customer_phone)) as do_dai_min,
    MAX(LENGTH(customer_phone)) as do_dai_max
FROM public.orders
WHERE customer_phone IS NOT NULL;

-- 6. Hiển thị một số mẫu giá trị phone
SELECT 
    customer_phone,
    LENGTH(customer_phone) as do_dai,
    pg_typeof(customer_phone) as kieu_du_lieu
FROM public.orders
WHERE customer_phone IS NOT NULL
LIMIT 10;

-- =====================================================
-- Lưu ý:
-- 1. Script này sẽ đảm bảo cột customer_phone có kiểu TEXT
-- 2. Nếu cột đang là NUMERIC/INTEGER, sẽ được chuyển đổi sang TEXT
-- 3. Dữ liệu hiện có sẽ được giữ nguyên (chỉ chuyển đổi kiểu)
-- 4. Cột TEXT cho phép lưu số điện thoại với các ký tự đặc biệt
--    như +, -, dấu cách, dấu ngoặc đơn, v.v.
-- =====================================================
