-- =====================================================
-- Gán permission CSKH_VIEW cho CSKH users
-- =====================================================

-- 1. Đảm bảo permission CSKH_VIEW có trong app_page_permissions cho role CSKH
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
VALUES
    ('cskh', 'CSKH_VIEW', true, false, false, ARRAY['*'])
ON CONFLICT (role_code, page_code) 
DO UPDATE SET
    can_view = EXCLUDED.can_view,
    can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete,
    allowed_columns = EXCLUDED.allowed_columns,
    updated_at = NOW();

-- 2. Đảm bảo Admin và Super Admin cũng có quyền này
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
VALUES
    ('admin', 'CSKH_VIEW', true, true, true, ARRAY['*']),
    ('super_admin', 'CSKH_VIEW', true, true, true, ARRAY['*'])
ON CONFLICT (role_code, page_code) 
DO UPDATE SET
    can_view = EXCLUDED.can_view,
    can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete,
    allowed_columns = EXCLUDED.allowed_columns,
    updated_at = NOW();

-- 3. Kiểm tra và gán role 'cskh' cho các users có department = 'CSKH' nhưng chưa có role
UPDATE users
SET role = 'cskh'
WHERE (department = 'CSKH' OR department = 'cskh')
  AND (role IS NULL OR role = '' OR role NOT IN ('cskh', 'admin', 'super_admin'));

-- 4. Kiểm tra kết quả permissions
SELECT 
    role_code,
    page_code,
    can_view,
    can_edit,
    can_delete,
    allowed_columns
FROM app_page_permissions
WHERE page_code = 'CSKH_VIEW'
ORDER BY role_code;

-- 5. Kiểm tra users CSKH và role của họ
SELECT 
    email,
    name,
    role,
    department,
    CASE 
        WHEN role = 'cskh' THEN '✅ Có role CSKH'
        WHEN role IN ('admin', 'super_admin') THEN '✅ Admin/Super Admin'
        ELSE '⚠️ Chưa có role CSKH'
    END as status
FROM users
WHERE department = 'CSKH' OR department = 'cskh'
ORDER BY role, email;

-- Thông báo hoàn thành
SELECT '✅ Đã gán permission CSKH_VIEW cho CSKH users!' as message;
