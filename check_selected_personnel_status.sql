-- ==============================================================================
-- Script kiểm tra trạng thái selected_personnel của tất cả user
-- Chạy script này để xem user nào đã có/h chưa có selected_personnel
-- ==============================================================================

-- 1. Tổng quan
SELECT 
    COUNT(*) as total_users,
    COUNT(selected_personnel) as users_with_personnel_column,
    COUNT(*) FILTER (WHERE selected_personnel IS NULL) as null_personnel,
    COUNT(*) FILTER (WHERE selected_personnel = '[]'::jsonb) as empty_array,
    COUNT(*) FILTER (WHERE selected_personnel IS NOT NULL AND jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) > 0) as has_data,
    COUNT(*) FILTER (WHERE selected_personnel IS NOT NULL AND jsonb_typeof(selected_personnel) != 'array') as invalid_type
FROM public.users;

-- 2. Chi tiết từng user
SELECT 
    email,
    name,
    username,
    role,
    department,
    team,
    selected_personnel,
    jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) as personnel_count,
    CASE 
        WHEN selected_personnel IS NULL THEN '❌ NULL'
        WHEN selected_personnel = '[]'::jsonb THEN '⚠️ EMPTY'
        WHEN jsonb_typeof(selected_personnel) != 'array' THEN '⚠️ INVALID TYPE'
        WHEN jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) = 0 THEN '⚠️ ZERO LENGTH'
        ELSE '✅ OK (' || jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) || ' names)'
    END as status,
    CASE 
        WHEN selected_personnel IS NOT NULL AND jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) > 0 
        THEN selected_personnel->>0
        ELSE NULL
    END as first_personnel_name
FROM public.users
ORDER BY 
    CASE 
        WHEN selected_personnel IS NULL THEN 1
        WHEN selected_personnel = '[]'::jsonb THEN 2
        WHEN jsonb_typeof(selected_personnel) != 'array' THEN 3
        ELSE 4
    END,
    email;

-- 3. So sánh với human_resources
SELECT 
    u.email,
    u.name as user_name,
    hr."Họ Và Tên" as hr_name,
    u.selected_personnel,
    CASE 
        WHEN hr."Họ Và Tên" IS NOT NULL AND u.selected_personnel IS NOT NULL 
             AND jsonb_array_length(COALESCE(u.selected_personnel, '[]'::jsonb)) > 0
             AND u.selected_personnel->>0 = hr."Họ Và Tên" THEN '✅ KHỚP'
        WHEN hr."Họ Và Tên" IS NOT NULL AND u.selected_personnel IS NOT NULL 
             AND jsonb_array_length(COALESCE(u.selected_personnel, '[]'::jsonb)) > 0
             AND u.selected_personnel->>0 != hr."Họ Và Tên" THEN '⚠️ KHÔNG KHỚP'
        WHEN hr."Họ Và Tên" IS NOT NULL AND (u.selected_personnel IS NULL OR jsonb_array_length(COALESCE(u.selected_personnel, '[]'::jsonb)) = 0) THEN '❌ CHƯA ĐIỀN'
        WHEN hr."Họ Và Tên" IS NULL THEN 'ℹ️ KHÔNG CÓ TRONG HR'
        ELSE '❓ UNKNOWN'
    END as comparison
FROM public.users u
LEFT JOIN public.human_resources hr ON LOWER(TRIM(u.email)) = LOWER(TRIM(hr.email))
ORDER BY 
    CASE 
        WHEN hr."Họ Và Tên" IS NOT NULL AND (u.selected_personnel IS NULL OR jsonb_array_length(COALESCE(u.selected_personnel, '[]'::jsonb)) = 0) THEN 1
        WHEN hr."Họ Và Tên" IS NOT NULL AND u.selected_personnel->>0 != hr."Họ Và Tên" THEN 2
        ELSE 3
    END,
    u.email;
