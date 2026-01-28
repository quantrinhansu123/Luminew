-- ==============================================================================
-- Script mở quyền truy cập bảng detail_reports
-- Chạy script này trong Supabase SQL Editor để cho phép tất cả user xem data
-- ==============================================================================

-- 1. Kiểm tra RLS hiện tại
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'detail_reports';

-- 2. Xóa các policy cũ (nếu có)
DROP POLICY IF EXISTS "Allow all access" ON public.detail_reports;
DROP POLICY IF EXISTS "Allow all read access" ON public.detail_reports;
DROP POLICY IF EXISTS "Matrix View Reports" ON public.detail_reports;
DROP POLICY IF EXISTS "Open Access Reports" ON public.detail_reports;

-- 3. Tạo policy mới cho phép TẤT CẢ user xem (bỏ qua RLS check)
CREATE POLICY "Open Access Reports" ON public.detail_reports
FOR SELECT
USING (true);  -- Cho phép tất cả user xem

-- 4. Cho phép INSERT (nếu cần)
DROP POLICY IF EXISTS "Open Insert Reports" ON public.detail_reports;
CREATE POLICY "Open Insert Reports" ON public.detail_reports
FOR INSERT
WITH CHECK (true);

-- 5. Cho phép UPDATE (nếu cần)
DROP POLICY IF EXISTS "Open Update Reports" ON public.detail_reports;
CREATE POLICY "Open Update Reports" ON public.detail_reports
FOR UPDATE
USING (true)
WITH CHECK (true);

-- 6. Cho phép DELETE (nếu cần - cẩn thận!)
-- DROP POLICY IF EXISTS "Open Delete Reports" ON public.detail_reports;
-- CREATE POLICY "Open Delete Reports" ON public.detail_reports
-- FOR DELETE
-- USING (true);

-- 7. Kiểm tra lại policies sau khi tạo
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'detail_reports';

-- ==============================================================================
-- HOẶC: Nếu muốn TẮT RLS hoàn toàn (không khuyến khích cho production)
-- ==============================================================================
-- ALTER TABLE public.detail_reports DISABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- HOẶC: Nếu muốn giữ RLS nhưng gán permission cho role MKT_MEMBER
-- ==============================================================================

-- Kiểm tra xem role MKT_MEMBER có tồn tại không
SELECT * FROM app_roles WHERE code = 'MKT_MEMBER';

-- Tạo role nếu chưa có
INSERT INTO app_roles (code, name, department, description)
VALUES ('MKT_MEMBER', 'Nhân viên Marketing', 'Marketing', 'Nhân viên Marketing')
ON CONFLICT (code) DO NOTHING;

-- Gán permission MKT_MANUAL cho role MKT_MEMBER
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
VALUES ('MKT_MEMBER', 'MKT_MANUAL', true, false, false, ARRAY['*'])
ON CONFLICT (role_code, page_code) 
DO UPDATE SET 
    can_view = true,
    allowed_columns = ARRAY['*'];

-- Kiểm tra permission đã được gán
SELECT 
    r.code as role_code,
    r.name as role_name,
    p.page_code,
    p.can_view,
    p.can_edit,
    p.can_delete
FROM app_page_permissions p
JOIN app_roles r ON p.role_code = r.code
WHERE p.page_code = 'MKT_MANUAL';
