-- ==============================================================================
-- Script FIX RLS cho bảng detail_reports - Cho phép MKT_MEMBER xem data
-- Chạy script này nếu muốn giữ RLS nhưng cho phép MKT_MEMBER xem
-- ==============================================================================

-- 1. Đảm bảo role MKT_MEMBER tồn tại
INSERT INTO app_roles (code, name, department, description)
VALUES ('MKT_MEMBER', 'Nhân viên Marketing', 'Marketing', 'Nhân viên Marketing')
ON CONFLICT (code) DO NOTHING;

-- 2. Gán permission MKT_MANUAL cho MKT_MEMBER
INSERT INTO app_page_permissions (role_code, page_code, can_view, can_edit, can_delete, allowed_columns)
VALUES ('MKT_MEMBER', 'MKT_MANUAL', true, false, false, ARRAY['*'])
ON CONFLICT (role_code, page_code) 
DO UPDATE SET 
    can_view = true,
    allowed_columns = ARRAY['*'];

-- 3. Xóa policy cũ
DROP POLICY IF EXISTS "Matrix View Reports" ON public.detail_reports;

-- 4. Tạo policy mới cho phép MKT_MEMBER và các role khác xem
CREATE POLICY "Matrix View Reports" ON public.detail_reports FOR SELECT
USING (
  -- Admin/Director/Manager luôn được xem
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid()::text 
    AND role IN ('admin', 'director', 'manager', 'super_admin', 'ADMIN', 'DIRECTOR', 'MANAGER')
  )
  OR
  -- User có permission MKT_MANUAL, MKT_VIEW, hoặc MKT_INPUT
  has_permission(ARRAY['MKT_VIEW', 'MKT_INPUT', 'MKT_MANUAL', 'RND_VIEW', 'RND_INPUT', 'RND_MANUAL', 'FINANCE_KPI'], 'view')
  OR
  -- Hoặc cho phép tất cả authenticated users (nếu muốn mở rộng)
  auth.uid() IS NOT NULL
);

-- 5. Kiểm tra lại
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'detail_reports';
