-- ==============================================================================
-- Script tự động điền tên nhân sự vào cột selected_personnel
-- Chạy script này trong Supabase SQL Editor để tự động điền tên cho tất cả user
-- ==============================================================================

-- 1. Kiểm tra cấu trúc bảng users và cột selected_personnel
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'users'
AND column_name IN ('name', 'username', 'email', 'selected_personnel');

-- 2. Xem dữ liệu hiện tại (trước khi update)
SELECT 
    email,
    name,
    username,
    selected_personnel,
    CASE 
        WHEN selected_personnel IS NULL THEN 'NULL'
        WHEN selected_personnel = '{}' THEN 'EMPTY ARRAY'
        ELSE 'HAS DATA'
    END as current_status
FROM public.users
ORDER BY email
LIMIT 20;

-- 3. Tự động điền tên nhân sự vào selected_personnel
-- Lấy tên từ cột 'name' hoặc 'username', nếu không có thì dùng email
UPDATE public.users
SET selected_personnel = jsonb_build_array(
    COALESCE(
        NULLIF(TRIM(name), ''),
        NULLIF(TRIM(username), ''),
        email
    )
)
WHERE 
    -- Chỉ update những user chưa có selected_personnel hoặc có array rỗng
    (selected_personnel IS NULL 
     OR selected_personnel = '[]'::jsonb
     OR jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) = 0)
    -- Và có ít nhất một trong các trường: name, username, email
    AND (
        (name IS NOT NULL AND TRIM(name) != '') OR
        (username IS NOT NULL AND TRIM(username) != '') OR
        (email IS NOT NULL AND TRIM(email) != '')
    );

-- 4. Kiểm tra kết quả sau khi update
SELECT 
    email,
    name,
    username,
    selected_personnel,
    jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) as personnel_count
FROM public.users
WHERE selected_personnel IS NOT NULL
ORDER BY email
LIMIT 20;

-- 5. Thống kê
SELECT 
    COUNT(*) as total_users,
    COUNT(selected_personnel) as users_with_personnel,
    COUNT(*) FILTER (WHERE selected_personnel IS NOT NULL AND jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) > 0) as users_with_data,
    COUNT(*) FILTER (WHERE selected_personnel IS NULL OR jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) = 0) as users_without_data
FROM public.users;

-- ==============================================================================
-- HOẶC: Nếu muốn điền cho TẤT CẢ user (kể cả đã có data) - CẨN THẬN!
-- ==============================================================================
-- UPDATE public.users
-- SET selected_personnel = jsonb_build_array(
--     COALESCE(
--         NULLIF(TRIM(name), ''),
--         NULLIF(TRIM(username), ''),
--         email
--     )
-- )
-- WHERE (
--     (name IS NOT NULL AND TRIM(name) != '') OR
--     (username IS NOT NULL AND TRIM(username) != '') OR
--     (email IS NOT NULL AND TRIM(email) != '')
-- );

-- ==============================================================================
-- HOẶC: Nếu muốn điền từ bảng human_resources (nếu có mapping)
-- ==============================================================================
-- UPDATE public.users u
-- SET selected_personnel = jsonb_build_array(COALESCE(hr."Họ Và Tên", u.name, u.username, u.email))
-- FROM public.human_resources hr
-- WHERE u.email = hr.email
--   AND (u.selected_personnel IS NULL OR u.selected_personnel = '[]'::jsonb)
--   AND hr."Họ Và Tên" IS NOT NULL
--   AND TRIM(hr."Họ Và Tên") != '';
