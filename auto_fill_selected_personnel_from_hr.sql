-- ==============================================================================
-- Script tự động điền tên nhân sự từ bảng human_resources
-- Sử dụng script này nếu muốn lấy tên từ bảng human_resources (chính xác hơn)
-- ==============================================================================

-- 1. Kiểm tra mapping giữa users và human_resources
SELECT 
    u.email as user_email,
    u.name as user_name,
    u.username,
    hr."Họ Và Tên" as hr_name,
    hr.email as hr_email,
    CASE 
        WHEN hr."Họ Và Tên" IS NOT NULL THEN 'CÓ TÊN TRONG HR'
        WHEN u.name IS NOT NULL THEN 'CÓ TÊN TRONG USERS'
        WHEN u.username IS NOT NULL THEN 'CÓ USERNAME'
        ELSE 'CHỈ CÓ EMAIL'
    END as name_source
FROM public.users u
LEFT JOIN public.human_resources hr ON LOWER(TRIM(u.email)) = LOWER(TRIM(hr.email))
ORDER BY u.email
LIMIT 20;

-- 2. Tự động điền từ human_resources (ưu tiên)
UPDATE public.users u
SET selected_personnel = jsonb_build_array(
    COALESCE(
        NULLIF(TRIM(hr."Họ Và Tên"), ''),
        NULLIF(TRIM(u.name), ''),
        NULLIF(TRIM(u.username), ''),
        u.email
    )
)
FROM public.human_resources hr
WHERE u.email = hr.email
  AND (
      u.selected_personnel IS NULL 
      OR u.selected_personnel = '[]'::jsonb
      OR jsonb_array_length(COALESCE(u.selected_personnel, '[]'::jsonb)) = 0
  )
  AND (
      (hr."Họ Và Tên" IS NOT NULL AND TRIM(hr."Họ Và Tên") != '') OR
      (u.name IS NOT NULL AND TRIM(u.name) != '') OR
      (u.username IS NOT NULL AND TRIM(u.username) != '') OR
      (u.email IS NOT NULL AND TRIM(u.email) != '')
  );

-- 3. Điền cho các user không có trong human_resources
UPDATE public.users u
SET selected_personnel = jsonb_build_array(
    COALESCE(
        NULLIF(TRIM(u.name), ''),
        NULLIF(TRIM(u.username), ''),
        u.email
    )
)
WHERE NOT EXISTS (
    SELECT 1 FROM public.human_resources hr 
    WHERE LOWER(TRIM(hr.email)) = LOWER(TRIM(u.email))
)
AND (
    u.selected_personnel IS NULL 
    OR u.selected_personnel = '[]'::jsonb
    OR jsonb_array_length(COALESCE(u.selected_personnel, '[]'::jsonb)) = 0
)
AND (
    (u.name IS NOT NULL AND TRIM(u.name) != '') OR
    (u.username IS NOT NULL AND TRIM(u.username) != '') OR
    (u.email IS NOT NULL AND TRIM(u.email) != '')
);

-- 4. Kiểm tra kết quả
SELECT 
    u.email,
    u.name as user_name,
    hr."Họ Và Tên" as hr_name,
    u.selected_personnel,
    jsonb_array_length(COALESCE(u.selected_personnel, '[]'::jsonb)) as personnel_count,
    CASE 
        WHEN hr."Họ Và Tên" IS NOT NULL AND u.selected_personnel->>0 = hr."Họ Và Tên" THEN '✅ Từ HR'
        WHEN u.name IS NOT NULL AND u.selected_personnel->>0 = u.name THEN '✅ Từ Users.name'
        WHEN u.username IS NOT NULL AND u.selected_personnel->>0 = u.username THEN '✅ Từ Users.username'
        WHEN u.selected_personnel->>0 = u.email THEN '⚠️ Từ Email'
        ELSE '❓ Khác'
    END as source
FROM public.users u
LEFT JOIN public.human_resources hr ON LOWER(TRIM(u.email)) = LOWER(TRIM(hr.email))
WHERE u.selected_personnel IS NOT NULL
ORDER BY u.email
LIMIT 30;

-- 5. Thống kê tổng hợp
SELECT 
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE selected_personnel IS NOT NULL AND jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) > 0) as users_with_personnel,
    COUNT(*) FILTER (WHERE selected_personnel IS NULL OR jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) = 0) as users_without_personnel,
    COUNT(*) FILTER (
        WHERE selected_personnel IS NOT NULL 
        AND jsonb_array_length(COALESCE(selected_personnel, '[]'::jsonb)) > 0
        AND EXISTS (
            SELECT 1 FROM public.human_resources hr 
            WHERE LOWER(TRIM(hr.email)) = LOWER(TRIM(users.email))
            AND hr."Họ Và Tên" = selected_personnel->>0
        )
    ) as filled_from_hr
FROM public.users;
