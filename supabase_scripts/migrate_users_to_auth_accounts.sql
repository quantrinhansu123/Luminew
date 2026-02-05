-- =====================================================
-- MIGRATE DỮ LIỆU TỪ BẢNG users SANG auth_accounts
-- Script này chuyển dữ liệu đăng nhập từ bảng users sang bảng auth_accounts mới
-- =====================================================

-- LƯU Ý: Chạy script create_auth_accounts_table.sql TRƯỚC khi chạy script này!

-- 1. Migrate dữ liệu từ users sang auth_accounts
INSERT INTO public.auth_accounts (
    id,
    username,
    email,
    password_hash,
    user_id,
    status,
    password_changed_at,
    created_at,
    updated_at
)
SELECT 
    gen_random_uuid() as id,  -- Tạo UUID mới cho auth_accounts
    u.username,
    u.email,
    u.password as password_hash,  -- Giả sử password trong users đã được hash
    u.id as user_id,
    CASE 
        WHEN u.role IN ('admin', 'leader', 'user') THEN 'active'
        ELSE 'inactive'
    END as status,
    u.created_at as password_changed_at,  -- Giả sử password được set khi tạo user
    u.created_at,
    u.created_at as updated_at
FROM public.users u
WHERE u.email IS NOT NULL 
  AND u.password IS NOT NULL
  AND u.password != ''  -- Chỉ migrate users có password
  AND NOT EXISTS (
    -- Tránh duplicate nếu đã migrate rồi
    SELECT 1 FROM public.auth_accounts aa 
    WHERE aa.email = u.email OR aa.user_id = u.id
  )
ON CONFLICT (email) DO NOTHING;

-- 2. Verify migration
SELECT 
    'Migration Summary' as info,
    COUNT(*) as total_users_with_password,
    (SELECT COUNT(*) FROM public.auth_accounts) as total_auth_accounts,
    (SELECT COUNT(*) FROM public.auth_accounts WHERE status = 'active') as active_accounts
FROM public.users
WHERE password IS NOT NULL AND password != '';

-- 3. Hiển thị danh sách users chưa được migrate (nếu có)
SELECT 
    u.id,
    u.email,
    u.username,
    u.name,
    CASE 
        WHEN u.password IS NULL OR u.password = '' THEN 'No password'
        WHEN EXISTS (SELECT 1 FROM public.auth_accounts aa WHERE aa.email = u.email) THEN 'Already migrated'
        ELSE 'Ready to migrate'
    END as migration_status
FROM public.users u
WHERE NOT EXISTS (
    SELECT 1 FROM public.auth_accounts aa 
    WHERE aa.email = u.email OR aa.user_id = u.id
)
ORDER BY u.email;

-- =====================================================
-- HOÀN THÀNH!
-- =====================================================
SELECT '✅ Migration hoàn tất!' as message;
SELECT '📝 Kiểm tra kết quả bằng cách query bảng auth_accounts' as note;
