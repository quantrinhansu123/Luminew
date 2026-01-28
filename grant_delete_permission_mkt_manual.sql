-- ==============================================================================
-- Script cấp quyền DELETE cho MKT_MANUAL và RND_MANUAL
-- Cho phép các role có thể xóa báo cáo từng dòng
-- ==============================================================================

-- 1. Kiểm tra các permission hiện tại
SELECT 
    role_code,
    page_code,
    can_view,
    can_edit,
    can_delete
FROM public.app_page_permissions
WHERE page_code IN ('MKT_MANUAL', 'RND_MANUAL')
ORDER BY role_code, page_code;

-- 2. Cập nhật quyền DELETE cho các role có quyền VIEW MKT_MANUAL hoặc RND_MANUAL
-- (Có thể điều chỉnh danh sách role_code theo nhu cầu)

-- Cấp quyền DELETE cho MKT_MANUAL
UPDATE public.app_page_permissions
SET can_delete = true
WHERE page_code = 'MKT_MANUAL'
  AND can_view = true
  AND (can_delete IS NULL OR can_delete = false);

-- Cấp quyền DELETE cho RND_MANUAL
UPDATE public.app_page_permissions
SET can_delete = true
WHERE page_code = 'RND_MANUAL'
  AND can_view = true
  AND (can_delete IS NULL OR can_delete = false);

-- 3. Nếu chưa có permission record, tạo mới cho các role phổ biến
-- (Điều chỉnh danh sách role_code theo nhu cầu thực tế)

-- Tạo permission MKT_MANUAL cho các role nếu chưa có
INSERT INTO public.app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
SELECT DISTINCT 
    role_code,
    'MKT_MANUAL',
    true,
    true,
    true,
    ARRAY['*']::text[]
FROM public.app_page_permissions
WHERE page_code = 'MKT_INPUT' -- Lấy từ role có quyền MKT_INPUT
  AND NOT EXISTS (
    SELECT 1 FROM public.app_page_permissions
    WHERE role_code = app_page_permissions.role_code
      AND page_code = 'MKT_MANUAL'
  );

-- Tạo permission RND_MANUAL cho các role nếu chưa có
INSERT INTO public.app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
SELECT DISTINCT 
    role_code,
    'RND_MANUAL',
    true,
    true,
    true,
    ARRAY['*']::text[]
FROM public.app_page_permissions
WHERE page_code = 'RND_INPUT' -- Lấy từ role có quyền RND_INPUT
  AND NOT EXISTS (
    SELECT 1 FROM public.app_page_permissions
    WHERE role_code = app_page_permissions.role_code
      AND page_code = 'RND_MANUAL'
  );

-- 4. Kiểm tra lại kết quả
SELECT 
    role_code,
    page_code,
    can_view,
    can_edit,
    can_delete,
    allowed_columns
FROM public.app_page_permissions
WHERE page_code IN ('MKT_MANUAL', 'RND_MANUAL')
ORDER BY role_code, page_code;

-- ==============================================================================
-- Lưu ý:
-- 1. Script này sẽ cấp quyền DELETE cho tất cả role đã có quyền VIEW
-- 2. Nếu muốn giới hạn chỉ một số role cụ thể, hãy thêm điều kiện WHERE role_code IN (...)
-- 3. Đảm bảo đã chạy fix_detail_reports_delete_permission.sql để cấu hình RLS
-- ==============================================================================
